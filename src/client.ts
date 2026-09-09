/**
 * PlayloopClient, thin fetch wrapper around `https://playloop.gg/api/v1/*`.
 *
 * - Native `fetch` only (Node 18+, no node-fetch shim).
 * - Bearer auth from the management key passed at construction time.
 * - Retries on 5xx and network errors with capped exponential backoff.
 * - 4xx responses are surfaced as a typed `PlayloopApiError` carrying the
 *   server's full body (including `requiredScope` when the user gave us an
 *   ingest key instead of a management key, the single most-likely
 *   misconfig).
 *
 * The MCP server layer translates these errors into structured tool
 * responses, so per-tool code shouldn't have to catch raw HTTP errors.
 *
 * @remarks `/api/v1/*` is free on every Playloop plan; the only gates are
 * management-key scope (ingest keys get 403) and a 60 req/min per-key rate
 * limit (429). The `suggest_fixes` endpoint is the lone exception that can
 * return 402: on the Free plan its on-demand AI generation needs the user's
 * own AI provider key. All non-2xx responses are surfaced verbatim through
 * `PlayloopApiError`.
 */

import type { ApiErrorBody } from './types.js'

export interface PlayloopClientOptions {
  /** Management key, `pl_mgmt_<hex>`. Required. Ingest keys (`pl_ik_*`) will be rejected by the API with 403. `/api/v1/*` is free on every plan; the only exception is `suggest_fixes`, whose on-demand AI generation needs a BYO AI key on the Free plan (402 otherwise). */
  apiKey: string
  /** Base URL of the Playloop deployment. Defaults to `https://playloop.gg`. */
  baseUrl?: string
  /** Override for tests, allows injecting a fake fetch. */
  fetchImpl?: typeof fetch
  /** Number of retries on 5xx / network errors. Defaults to 2 (3 attempts total). */
  maxRetries?: number
  /** Initial backoff in ms. Doubled per retry, capped at 4000ms. Defaults to 250. */
  retryBaseMs?: number
  /** Per-request timeout in ms. Defaults to 30000. */
  timeoutMs?: number
}

export class PlayloopApiError extends Error {
  public readonly status: number
  public readonly body: ApiErrorBody
  public readonly requiredScope: string | undefined

  constructor(status: number, body: ApiErrorBody) {
    super(body.error || `Playloop API error ${status}`)
    this.name = 'PlayloopApiError'
    this.status = status
    this.body = body
    this.requiredScope = body.requiredScope
  }
}

export class PlayloopNetworkError extends Error {
  public override readonly cause: unknown
  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'PlayloopNetworkError'
    this.cause = cause
  }
}

const DEFAULT_BASE_URL = 'https://playloop.gg'

export class PlayloopClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly maxRetries: number
  private readonly retryBaseMs: number
  private readonly timeoutMs: number

  constructor(opts: PlayloopClientOptions) {
    if (!opts.apiKey || typeof opts.apiKey !== 'string') {
      throw new Error('PlayloopClient: apiKey is required')
    }
    this.apiKey = opts.apiKey
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch)
    this.maxRetries = opts.maxRetries ?? 2
    this.retryBaseMs = opts.retryBaseMs ?? 250
    this.timeoutMs = opts.timeoutMs ?? 30000
  }

  /**
   * GET a JSON resource at `path` (relative to baseUrl). `query` is shallow-encoded
   *, values that are `undefined` or `null` are skipped, everything else is `String()`d.
   */
  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    const url = this.buildUrl(path, query)
    return this.request<T>(url, { method: 'GET' })
  }

  /**
   * POST a JSON body to `path`. NOT retried on network/5xx errors: a create is
   * not idempotent, so a retry after a server-side success would duplicate the
   * resource. The caller gets the first error instead.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path)
    return this.request<T>(url, { method: 'POST', body })
  }

  /**
   * PATCH a JSON body to `path`. Not retried, matching `post`: partial
   * updates are applied as sent, and the caller should see the first error
   * rather than a hidden second attempt.
   */
  async patch<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path)
    return this.request<T>(url, { method: 'PATCH', body })
  }

  /**
   * DELETE with a JSON body. Not retried, same reasoning as `post`: a retry
   * after a server-side success reports 404 for an operation that worked.
   */
  async delete<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path)
    return this.request<T>(url, { method: 'DELETE', body })
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    const u = new URL(this.baseUrl + cleanPath)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue
        u.searchParams.set(k, String(v))
      }
    }
    return u.toString()
  }

  private async request<T>(
    url: string,
    opts: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
  ): Promise<T> {
    // Writes (POST/DELETE) are not retried: a retry after a server-side
    // success duplicates the create or 404s the delete. Only GET retries.
    const maxRetries = opts.method === 'GET' ? this.maxRetries : 0
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), this.timeoutMs)
      try {
        const res = await this.fetchImpl(url, {
          method: opts.method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            'User-Agent': '@playloop/mcp',
            ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
          signal: ac.signal,
        })
        clearTimeout(timer)

        // 5xx → retry path (GET only). Treat as transient.
        if (res.status >= 500) {
          lastErr = new PlayloopNetworkError(`Playloop API ${res.status}`, await safeRead(res))
          if (attempt < maxRetries) {
            await sleep(this.backoff(attempt))
            continue
          }
          throw lastErr
        }

        // 4xx → typed error, do NOT retry.
        if (!res.ok) {
          const body = (await safeReadJson(res)) ?? ({ error: `HTTP ${res.status}` } satisfies ApiErrorBody)
          throw new PlayloopApiError(res.status, body)
        }

        // 2xx → parse and return.
        return (await res.json()) as T
      } catch (err) {
        clearTimeout(timer)
        // PlayloopApiError = 4xx, never retry, rethrow immediately.
        if (err instanceof PlayloopApiError) throw err
        // Any other error: timeout, network, JSON parse, retry if we have budget.
        lastErr = err
        if (attempt < maxRetries) {
          await sleep(this.backoff(attempt))
          continue
        }
        if (err instanceof PlayloopNetworkError) throw err
        throw new PlayloopNetworkError(
          err instanceof Error ? err.message : 'network error',
          err,
        )
      }
    }
    // Unreachable, but TS doesn't know.
    throw lastErr instanceof Error ? lastErr : new PlayloopNetworkError('unknown error', lastErr)
  }

  private backoff(attempt: number): number {
    return Math.min(4000, this.retryBaseMs * 2 ** attempt)
  }
}

async function safeRead(res: Response): Promise<string | null> {
  try {
    return await res.text()
  } catch {
    return null
  }
}

async function safeReadJson(res: Response): Promise<ApiErrorBody | null> {
  try {
    return (await res.json()) as ApiErrorBody
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
