import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerEventsTools } from '../../src/tools/events.js'
import { fakeClient, fakeEventStats } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerEventsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { getEventStats: tools['get_event_stats'] }
}

describe('tool: get_event_stats', () => {
  it('requires game', () => {
    const { getEventStats } = setup({})
    expect(getEventStats.inputSchema.safeParse({}).success).toBe(false)
    expect(getEventStats.inputSchema.safeParse({ game: 'a' }).success).toBe(true)
  })

  it('rejects negative `from`', () => {
    const { getEventStats } = setup({})
    expect(getEventStats.inputSchema.safeParse({ game: 'a', from: -1 }).success).toBe(false)
  })

  it('passes filters through as query params', async () => {
    const spy = vi.fn(() => fakeEventStats())
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerEventsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_event_stats'].handler(
      { game: 'dungeon-crawl', build: '0.5.0', from: 100, to: 200 },
      {},
    )
    expect(spy).toHaveBeenCalledWith('/api/v1/events/dungeon-crawl', {
      build: '0.5.0',
      from: 100,
      to: 200,
    })
  })

  it('returns total + byName + top capped at 50', async () => {
    const { getEventStats } = setup({ '/api/v1/events/dungeon-crawl': fakeEventStats() })
    const out = (await getEventStats.handler({ game: 'dungeon-crawl' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.total).toBe(4800)
    expect(parsed.byName.player_pos).toBe(4000)
    expect(parsed.top[0]).toEqual(['player_pos', 4000])
  })

  it('surfaces 500-class errors as tool error', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(503, { error: 'temporarily unavailable' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerEventsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_event_stats'].handler({ game: 'x' }, {})) as ToolResult
    expect(out.isError).toBe(true)
  })
})
