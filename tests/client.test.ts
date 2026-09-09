import { describe, expect, it, vi } from 'vitest'
import { PlayloopClient, PlayloopApiError, PlayloopNetworkError } from '../src/client.js'

function makeResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
}

describe('PlayloopClient, construction', () => {
  it('requires apiKey', () => {
    // @ts-expect-error, intentionally invalid
    expect(() => new PlayloopClient({})).toThrow(/apiKey is required/)
  })

  it('strips trailing slash from baseUrl', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => makeResponse({ ok: true }))
    const c = new PlayloopClient({ apiKey: 'k', baseUrl: 'https://example.com/', fetchImpl })
    await c.get('/api/v1/games')
    expect(fetchImpl).toHaveBeenCalledOnce()
    const url = (fetchImpl.mock.calls[0]?.[0] ?? '') as string
    expect(url).toBe('https://example.com/api/v1/games')
  })

  it('defaults to https://playloop.gg', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => makeResponse({ ok: true }))
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl })
    await c.get('/api/v1/games')
    const url = (fetchImpl.mock.calls[0]?.[0] ?? '') as string
    expect(url.startsWith('https://playloop.gg/')).toBe(true)
  })

  it('attaches Authorization Bearer header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => makeResponse({ ok: true }))
    const c = new PlayloopClient({ apiKey: 'pl_mgmt_secret', fetchImpl })
    await c.get('/api/v1/games')
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer pl_mgmt_secret')
  })

  it('omits undefined/null query params', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => makeResponse({ ok: true }))
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl })
    await c.get('/api/v1/sessions', { game: 'dungeon', build: undefined, env: null, limit: 10 })
    const url = (fetchImpl.mock.calls[0]?.[0] ?? '') as string
    expect(url).toContain('game=dungeon')
    expect(url).toContain('limit=10')
    expect(url).not.toContain('build=')
    expect(url).not.toContain('env=')
  })
})

describe('PlayloopClient, error mapping', () => {
  it('maps 401 missing key to PlayloopApiError', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ error: 'Missing bearer token' }, { status: 401 }),
    )
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 0 })
    await expect(c.get('/api/v1/games')).rejects.toBeInstanceOf(PlayloopApiError)
    try {
      await c.get('/api/v1/games')
    } catch (err) {
      expect((err as PlayloopApiError).status).toBe(401)
      expect((err as PlayloopApiError).message).toMatch(/Missing bearer token/)
    }
  })

  it('preserves requiredScope on 403 (ingest-key-on-management-route)', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse(
        { error: 'This endpoint requires a management key.', requiredScope: 'management' },
        { status: 403 },
      ),
    )
    const c = new PlayloopClient({ apiKey: 'pl_ik_xxx', fetchImpl, maxRetries: 0 })
    try {
      await c.get('/api/v1/games')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PlayloopApiError)
      const e = err as PlayloopApiError
      expect(e.status).toBe(403)
      expect(e.requiredScope).toBe('management')
      expect(e.body.requiredScope).toBe('management')
    }
  })

  it('maps 404 to PlayloopApiError without retry', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ error: 'Game not found' }, { status: 404 }),
    )
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 3 })
    await expect(c.get('/api/v1/games/missing')).rejects.toBeInstanceOf(PlayloopApiError)
    expect(fetchImpl).toHaveBeenCalledTimes(1) // no retry on 4xx
  })

  it('preserves retryAfterMs on 429', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse(
        { error: 'Rate limit exceeded', retryAfterMs: 12_000, scope: 'key' },
        { status: 429 },
      ),
    )
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 0 })
    try {
      await c.get('/api/v1/games')
      expect.unreachable()
    } catch (err) {
      const e = err as PlayloopApiError
      expect(e.status).toBe(429)
      expect(e.body['retryAfterMs']).toBe(12_000)
      expect(e.body['scope']).toBe('key')
    }
  })

  it('falls back to a generic message when 4xx body is unparseable', async () => {
    const fetchImpl = vi.fn(async () => new Response('garbage', { status: 400 }))
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 0 })
    try {
      await c.get('/api/v1/games')
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(PlayloopApiError)
      expect((err as PlayloopApiError).body.error).toBe('HTTP 400')
    }
  })
})

describe('PlayloopClient, retries', () => {
  it('retries on 5xx up to maxRetries', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      if (calls < 3) return makeResponse({ error: 'oops' }, { status: 503 })
      return makeResponse({ ok: true })
    })
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 2, retryBaseMs: 1 })
    const data = await c.get<{ ok: true }>('/api/v1/games')
    expect(data.ok).toBe(true)
    expect(calls).toBe(3)
  })

  it('gives up after maxRetries and throws PlayloopNetworkError', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ error: 'down' }, { status: 502 }))
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 1, retryBaseMs: 1 })
    await expect(c.get('/api/v1/games')).rejects.toBeInstanceOf(PlayloopNetworkError)
    expect(fetchImpl).toHaveBeenCalledTimes(2) // initial + 1 retry
  })

  it('retries on network errors', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls++
      if (calls < 2) throw new TypeError('fetch failed')
      return makeResponse({ ok: true })
    })
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 2, retryBaseMs: 1 })
    const data = await c.get<{ ok: true }>('/api/v1/games')
    expect(data.ok).toBe(true)
    expect(calls).toBe(2)
  })

  it('does NOT retry on 4xx', async () => {
    const fetchImpl = vi.fn(async () =>
      makeResponse({ error: 'nope' }, { status: 400 }),
    )
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 5, retryBaseMs: 1 })
    await expect(c.get('/api/v1/games')).rejects.toBeInstanceOf(PlayloopApiError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('PlayloopClient, post (writes)', () => {
  it('sends method POST + JSON body + Content-Type', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => makeResponse({ game: { id: 'g1' }, ingestKey: 'pl_ingest_x' }, { status: 201 }))
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl })
    const data = await c.post<{ ingestKey: string }>('/api/v1/games', { name: 'G', genre: 'RPG' })
    expect(data.ingestKey).toBe('pl_ingest_x')
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'G', genre: 'RPG' })
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('does NOT retry a POST on 5xx (writes are non-idempotent)', async () => {
    const fetchImpl = vi.fn(async () => makeResponse({ error: 'down' }, { status: 503 }))
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 5, retryBaseMs: 1 })
    await expect(c.post('/api/v1/games', { name: 'G' })).rejects.toBeInstanceOf(PlayloopNetworkError)
    expect(fetchImpl).toHaveBeenCalledTimes(1) // initial only, no retry
  })

  it('does NOT retry a POST on network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const c = new PlayloopClient({ apiKey: 'k', fetchImpl, maxRetries: 5, retryBaseMs: 1 })
    await expect(c.post('/api/v1/games', { name: 'G' })).rejects.toBeInstanceOf(PlayloopNetworkError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
