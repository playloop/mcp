import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerInsightsTools } from '../../src/tools/insights.js'
import { fakeClient, fakeInsights } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerInsightsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { queryInsights: tools['query_insights'] }
}

describe('tool: query_insights', () => {
  it('registers with a descriptive title', () => {
    const { queryInsights } = setup({})
    expect(queryInsights.title).toBe('Query insights')
  })

  it('rejects an invalid type', () => {
    const { queryInsights } = setup({})
    expect(queryInsights.inputSchema.safeParse({ type: 'banana' }).success).toBe(false)
    expect(queryInsights.inputSchema.safeParse({ type: 'stuck-point' }).success).toBe(true)
  })

  it('rejects an invalid sentiment', () => {
    const { queryInsights } = setup({})
    expect(queryInsights.inputSchema.safeParse({ sentiment: 'mid' }).success).toBe(false)
    expect(queryInsights.inputSchema.safeParse({ sentiment: 'positive' }).success).toBe(true)
  })

  it('passes filters through as query params', async () => {
    const spy = vi.fn(() => fakeInsights())
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerInsightsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const args = {
      game: 'dungeon-crawl',
      type: 'stuck-point' as const,
      sentiment: 'negative' as const,
      limit: 10,
    }
    await tools['query_insights'].handler(args, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/insights', args)
  })

  it('returns paginated insights payload', async () => {
    const { queryInsights } = setup({ '/api/v1/insights': fakeInsights() })
    const out = (await queryInsights.handler({}, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.items[0].type).toBe('stuck-point')
  })

  it('surfaces 429 rate-limit with retryAfterMs', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(429, {
        error: 'Rate limit exceeded',
        retryAfterMs: 5_000,
        scope: 'key',
      })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerInsightsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['query_insights'].handler({}, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(429)
    expect(parsed.retryAfterMs).toBe(5_000)
  })
})
