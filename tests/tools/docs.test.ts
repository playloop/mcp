import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDocsTools } from '../../src/tools/docs.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerDocsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { searchDocs: tools['search_docs'] }
}

describe('tool: search_docs', () => {
  it('requires q and bounds k to [1,10]', () => {
    const { searchDocs } = setup({})
    expect(searchDocs.inputSchema.safeParse({}).success).toBe(false)
    expect(searchDocs.inputSchema.safeParse({ q: 'pricing' }).success).toBe(true)
    expect(searchDocs.inputSchema.safeParse({ q: 'x', k: 0 }).success).toBe(false)
    expect(searchDocs.inputSchema.safeParse({ q: 'x', k: 11 }).success).toBe(false)
    expect(searchDocs.inputSchema.safeParse({ q: 'x', k: 5 }).success).toBe(true)
  })

  it('forwards q + k to the docs search endpoint', async () => {
    const spy = vi.fn(() => ({ results: [] }))
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerDocsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['search_docs'].handler({ q: 'how to invite testers', k: 3 }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/docs/search', { q: 'how to invite testers', k: 3 })
  })

  it('relays the results list', async () => {
    const fixture = {
      results: [{ source: 'pricing.md', title: 'Pricing', url: null, content: 'Plans', distance: 0.1 }],
    }
    const { searchDocs } = setup({ '/api/v1/docs/search': fixture })
    const out = (await searchDocs.handler({ q: 'pricing' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.results).toHaveLength(1)
    expect(parsed.results[0].source).toBe('pricing.md')
  })

  it('relays an API error', async () => {
    const { searchDocs } = setup(() => {
      throw new PlayloopApiError(500, { error: 'Search failed' })
    })
    const out = (await searchDocs.handler({ q: 'x' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(500)
  })
})
