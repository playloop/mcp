import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTestersTools } from '../../src/tools/testers.js'
import { fakeClient, fakeTesterSummary } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerTestersTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { getTesterSummary: tools['get_tester_summary'] }
}

describe('tool: get_tester_summary', () => {
  it('requires game and device_id', () => {
    const { getTesterSummary } = setup({})
    expect(getTesterSummary.inputSchema.safeParse({ game: 'a' }).success).toBe(false)
    expect(getTesterSummary.inputSchema.safeParse({ game: 'a', device_id: 'd' }).success).toBe(true)
  })

  it('URL-encodes path segments', async () => {
    const spy = vi.fn(() => fakeTesterSummary())
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerTestersTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_tester_summary'].handler({ game: 'foo/bar', device_id: 'd1' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/testers/foo%2Fbar/d1', undefined)
  })

  it('returns rollup + sessions + summary', async () => {
    const fixture = fakeTesterSummary()
    const { getTesterSummary } = setup({
      '/api/v1/testers/dungeon-crawl/dev_abc': fixture,
    })
    const out = (await getTesterSummary.handler(
      { game: 'dungeon-crawl', device_id: 'dev_abc' },
      {},
    )) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.rollup.deviceId).toBe('dev_abc')
    expect(parsed.sessions).toHaveLength(1)
    expect(parsed.summary).toBeTruthy()
  })

  it('surfaces 404 tester-not-found', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(404, { error: 'Tester not found' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerTestersTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_tester_summary'].handler(
      { game: 'dungeon-crawl', device_id: 'ghost' },
      {},
    )) as ToolResult
    expect(out.isError).toBe(true)
  })
})
