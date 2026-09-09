import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerSessionsTools } from '../../src/tools/sessions.js'
import { fakeClient, fakeSessions, fakeSessionDetail } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerSessionsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return {
    listSessions: tools['list_sessions'],
    getSession: tools['get_session'],
  }
}

describe('tool: list_sessions', () => {
  it('passes all filters through as query params', async () => {
    const spy = vi.fn(() => fakeSessions())
    const { listSessions } = setup(spy as unknown as (p: string, q?: unknown) => unknown)
    const args = {
      game: 'dungeon-crawl',
      build: '0.5.0',
      env: 'production',
      status: 'analyzed' as const,
      source: 'unity-telemetry' as const,
      q: 'stuck',
      from: 1_700_000_000_000,
      to: 1_700_500_000_000,
      limit: 50,
      offset: 10,
    }
    await listSessions.handler(args, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/sessions', args)
  })

  it('rejects invalid env (uppercase) at the schema layer', () => {
    const { listSessions } = setup({})
    const result = listSessions.inputSchema.safeParse({ env: 'Production' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid status enum', () => {
    const { listSessions } = setup({})
    const result = listSessions.inputSchema.safeParse({ status: 'unknown-state' })
    expect(result.success).toBe(false)
  })

  it('accepts an empty filter set (all-undefined)', async () => {
    const { listSessions } = setup({ '/api/v1/sessions': fakeSessions() })
    const out = (await listSessions.handler({}, {})) as ToolResult
    expect(out.isError).toBeFalsy()
  })

  it('caps limit at 100 via schema', () => {
    const { listSessions } = setup({})
    const result = listSessions.inputSchema.safeParse({ limit: 1000 })
    expect(result.success).toBe(false)
  })

  it('returns the paginated payload verbatim', async () => {
    const { listSessions } = setup({ '/api/v1/sessions': fakeSessions() })
    const out = (await listSessions.handler({}, {})) as ToolResult
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].id).toBe('s_1')
    expect(parsed.hasMore).toBe(false)
  })

  it('surfaces 401 as a tool error', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(401, { error: 'Invalid key' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerSessionsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['list_sessions'].handler({}, {})) as ToolResult
    expect(out.isError).toBe(true)
  })
})

describe('tool: get_session', () => {
  it('requires session_id', () => {
    const { getSession } = setup({})
    expect(getSession.inputSchema.safeParse({ session_id: '' }).success).toBe(false)
    expect(getSession.inputSchema.safeParse({ session_id: 'abc' }).success).toBe(true)
  })

  it('fetches by id and returns the joined detail', async () => {
    const spy = vi.fn(() => fakeSessionDetail())
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string) => unknown)
    registerSessionsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_session'].handler({ session_id: 's_1' }, {})) as ToolResult
    expect(spy).toHaveBeenCalledWith('/api/v1/sessions/s_1', undefined)
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.session.id).toBe('s_1')
    expect(parsed.insights).toHaveLength(1)
  })
})
