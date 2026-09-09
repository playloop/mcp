import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerCrashesTools } from '../../src/tools/crashes.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function fakeUnresolvedCrashes() {
  return {
    crashes: [
      {
        id: 'c_1',
        signature: 'NullReferenceException at Boss.Attack',
        count: 142,
        firstSeen: 1_700_000_000_000,
        lastSeen: 1_700_100_000_000,
        buildVersions: ['1.4.0', '1.5.0'],
        platform: 'Windows',
      },
    ],
  }
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerCrashesTools(server, fakeClient(routes))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return tools['list_crashes']
}

describe('tool: list_crashes', () => {
  it('registers with the right name and description', () => {
    const tool = setup({})
    expect(tool).toBeDefined()
    expect(tool.description).toMatch(/unresolved crash/i)
  })

  it('returns the JSON-encoded API response on happy path', async () => {
    const tool = setup({ '/api/v1/games/dungeon-crawl/crashes/unresolved': fakeUnresolvedCrashes() })
    const out = (await tool.handler({ game: 'dungeon-crawl' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.crashes).toHaveLength(1)
    expect(parsed.crashes[0].count).toBe(142)
  })

  it('passes platform + limit through as query params and URL-encodes the game', async () => {
    const spy = vi.fn((_path: string, query?: unknown) => {
      void query
      return fakeUnresolvedCrashes()
    })
    const tool = setup(spy as unknown as (path: string, query?: unknown) => unknown)
    await tool.handler({ game: 'foo bar', platform: 'Windows', limit: 50 }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/games/foo%20bar/crashes/unresolved', {
      platform: 'Windows',
      limit: 50,
    })
  })

  it('validates the input schema (game required, limit bounded 1..200)', () => {
    const schema = setup({}).inputSchema
    expect(schema.safeParse({ game: 'g' }).success).toBe(true)
    expect(schema.safeParse({ game: '' }).success).toBe(false)
    expect(schema.safeParse({ game: 'g', limit: 250 }).success).toBe(false)
    expect(schema.safeParse({ game: 'g', limit: 0 }).success).toBe(false)
  })

  it('surfaces a 403 ingest-key-on-management-route with requiredScope', async () => {
    const tool = setup(() => {
      throw new PlayloopApiError(403, {
        error: 'This endpoint requires a management key.',
        requiredScope: 'management',
      })
    })
    const out = (await tool.handler({ game: 'g' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(403)
    expect(parsed.requiredScope).toBe('management')
  })

  it('surfaces a 404 as an error tool result', async () => {
    const tool = setup(() => {
      throw new PlayloopApiError(404, { error: 'Game not found' })
    })
    const out = (await tool.handler({ game: 'ghost' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(404)
  })
})
