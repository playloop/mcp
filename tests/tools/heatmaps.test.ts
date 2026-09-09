import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerHeatmapsTools } from '../../src/tools/heatmaps.js'
import { fakeClient, fakeHeatmap } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerHeatmapsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { getHeatmap: tools['get_heatmap'] }
}

describe('tool: get_heatmap', () => {
  it('requires game', () => {
    const { getHeatmap } = setup({})
    expect(getHeatmap.inputSchema.safeParse({}).success).toBe(false)
    expect(getHeatmap.inputSchema.safeParse({ game: 'a' }).success).toBe(true)
  })

  it('rejects invalid env', () => {
    const { getHeatmap } = setup({})
    expect(getHeatmap.inputSchema.safeParse({ game: 'a', env: 'Production' }).success).toBe(false)
  })

  it('passes build and env through as query params', async () => {
    const spy = vi.fn(() => fakeHeatmap())
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerHeatmapsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_heatmap'].handler(
      { game: 'dungeon-crawl', build: '0.5.0', env: 'production' },
      {},
    )
    expect(spy).toHaveBeenCalledWith('/api/v1/heatmaps/dungeon-crawl', {
      build: '0.5.0',
      env: 'production',
    })
  })

  it('returns the heatmap response with rooms', async () => {
    const { getHeatmap } = setup({ '/api/v1/heatmaps/dungeon-crawl': fakeHeatmap() })
    const out = (await getHeatmap.handler({ game: 'dungeon-crawl' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.rooms).toHaveLength(1)
    expect(parsed.rooms[0].room).toBe('lobby')
  })

  it('surfaces 403 ingest-key-error with requiredScope', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(403, {
        error: 'This endpoint requires a management key.',
        requiredScope: 'management',
      })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerHeatmapsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_heatmap'].handler({ game: 'x' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.requiredScope).toBe('management')
  })
})
