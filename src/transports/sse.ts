/**
 * SSE transport, local hosted dev mode.
 *
 * This module is for `playloop --transport sse`, useful for
 * testing the server against `mcp inspector` without piping stdio.
 *
 * One connection at a time. The server is reset between connections so
 * each client gets a clean state machine.
 *
 * Non-loopback binds (anything other than 127.0.0.1, ::1, or localhost)
 * REQUIRE a bearer token on both `/sse` and `/messages`. The token comes
 * from `PLAYLOOP_MCP_SSE_TOKEN` if set, otherwise we generate a fresh
 * one at startup and print it to stderr. This closes the LAN-exposure
 * foot-gun where `--host 0.0.0.0` on a coworking-space wifi would let
 * any device on the network borrow the user's management key.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

export interface RunSseOptions {
  port: number
  /** Host to bind to. Defaults to 127.0.0.1 (loopback only, do not expose this to the public internet). */
  host?: string
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function isLoopback(host: string): boolean {
  return LOOPBACK_HOSTS.has(host)
}

/** Constant-time bearer comparison so the token can't be brute-forced byte-by-byte via response timing. */
function bearerMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m && m[1] ? m[1] : null
}

/** Browsers must not reach a loopback server through an unrelated web origin. */
function trustedRequest(req: IncomingMessage, host: string, port: number): boolean {
  const authority = req.headers.host?.toLowerCase()
  if (!authority) return false
  if (isLoopback(host)) {
    const allowed = ['127.0.0.1', 'localhost', '[::1]'].map((name) => `${name}:${port}`)
    if (!allowed.includes(authority)) return false
  }
  try {
    const target = new URL(`http://${authority}`)
    if (target.host !== authority || target.username || target.password) return false
    const origin = req.headers.origin
    if (origin === undefined) return true
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.origin === origin && parsed.host === authority
  } catch {
    return false
  }
}

export async function runSSE(server: McpServer, opts: RunSseOptions): Promise<void> {
  const host = opts.host ?? '127.0.0.1'
  const messagePath = '/messages'
  const ssePath = '/sse'

  // Loopback requests validate Host and Origin; other binds also require bearer auth.
  const requireAuth = !isLoopback(host)
  const authToken = requireAuth
    ? (process.env.PLAYLOOP_MCP_SSE_TOKEN ?? randomBytes(32).toString('hex'))
    : null
  const tokenWasGenerated =
    requireAuth && !process.env.PLAYLOOP_MCP_SSE_TOKEN

  let transport: SSEServerTransport | null = null

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const address = http.address()
      if (!trustedRequest(req, host, typeof address === 'object' && address ? address.port : opts.port)) {
        res.writeHead(403, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Untrusted request origin' }))
        return
      }
      if (
        authToken !== null &&
        (req.method === 'GET' || req.method === 'POST')
      ) {
        const provided = extractBearer(req)
        if (provided === null || !bearerMatches(provided, authToken)) {
          res.writeHead(401, {
            'content-type': 'application/json',
            'www-authenticate': 'Bearer realm="playloop-mcp"',
          })
          res.end(JSON.stringify({ error: 'Bearer token required' }))
          return
        }
      }

      const u = new URL(req.url ?? '/', `http://${req.headers.host}`)
      if (req.method === 'GET' && u.pathname === ssePath) {
        // One connection at a time: a second /sse while one is live must not
        // silently clobber the active transport (it would orphan the first
        // client's session). Reject with 409 instead.
        if (transport !== null) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({ error: 'An SSE session is already active, only one connection at a time' }),
          )
          return
        }
        const nextTransport = new SSEServerTransport(messagePath, res)
        nextTransport.onclose = () => {
          if (transport === nextTransport) transport = null
        }
        transport = nextTransport
        try {
          await server.connect(nextTransport)
        } catch (err) {
          if (transport === nextTransport) transport = null
          throw err
        }
        return
      }
      if (req.method === 'POST' && u.pathname === messagePath) {
        if (!transport) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'No active SSE session, connect to /sse first' }))
          return
        }
        if (u.searchParams.get('sessionId') !== transport.sessionId) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid session' }))
          return
        }
        await transport.handlePostMessage(req, res)
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'transport error'
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' })
      }
      res.end(JSON.stringify({ error: message }))
    }
  })

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(opts.port, host, () => {
      http.removeListener('error', reject)
      resolve()
    })
  })
  // eslint-disable-next-line no-console -- intentional user-facing log on the CLI surface
  console.error(`Playloop MCP listening on http://${host}:${opts.port}${ssePath}`)
  if (requireAuth && authToken !== null) {
    if (tokenWasGenerated) {
      // eslint-disable-next-line no-console -- one-time setup output for the operator
      console.error(
        `\nBearer auth is REQUIRED on this non-loopback bind.\n` +
          `  Token (generated for this process, set PLAYLOOP_MCP_SSE_TOKEN to pin one):\n` +
          `    ${authToken}\n` +
          `  Clients must send: Authorization: Bearer ${authToken}\n`,
      )
    } else {
      // eslint-disable-next-line no-console -- visibility for the operator
      console.error(
        `\nBearer auth REQUIRED on this non-loopback bind (using PLAYLOOP_MCP_SSE_TOKEN).\n`,
      )
    }
  }
  // Block on SIGINT / SIGTERM so the CLI doesn't exit immediately.
  await new Promise<void>((resolve) => {
    const stop = () => {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      void transport?.close()
      http.close(() => resolve())
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
}
