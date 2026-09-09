import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerFunnelsTools } from '../../src/tools/funnels.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerFunnelsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { listGameFunnels: tools['list_game_funnels'] }
}

describe('tool: list_game_funnels', () => {
  it('requires game', () => {
    const { listGameFunnels } = setup({})
    expect(listGameFunnels.inputSchema.safeParse({}).success).toBe(false)
    expect(listGameFunnels.inputSchema.safeParse({ game: 'a' }).success).toBe(true)
  })

  it('URL-encodes the game segment and forwards sort/order', async () => {
    const spy = vi.fn(() => ({ game: {}, funnels: [] }))
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerFunnelsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['list_game_funnels'].handler({ game: 'foo/bar', sort: 'name', order: 'asc' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/games/foo%2Fbar/funnels', { sort: 'name', order: 'asc' })
  })

  it('relays the funnels list', async () => {
    const fixture = {
      game: { id: 'g_1', slug: 'dungeon-crawl' },
      funnels: [
        {
          id: 'fnl_1',
          name: 'Onboarding',
          steps: [{ id: 's1', label: 'Start', eventName: 'game_start' }],
          mode: 'ordered',
          scopeMode: 'events',
          conversionWindowMs: null,
          audienceId: null,
          definitionRev: 1,
        },
      ],
    }
    const { listGameFunnels } = setup({ '/api/v1/games/dungeon-crawl/funnels': fixture })
    const out = (await listGameFunnels.handler({ game: 'dungeon-crawl' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.funnels).toHaveLength(1)
    expect(parsed.funnels[0].name).toBe('Onboarding')
  })

  it('relays an API error', async () => {
    const { listGameFunnels } = setup(() => {
      throw new PlayloopApiError(404, { error: 'Game not found' })
    })
    const out = (await listGameFunnels.handler({ game: 'missing' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(404)
  })
})

// ─── write tool ────────────────────────────────────────────────────────

describe('tool: create_funnel', () => {
  const STEPS = [
    { id: 's1', label: 'Start', eventName: 'game_start' },
    { id: 's2', label: 'Done', eventName: 'tutorial_done' },
  ]

  function setupTools(routes: Record<string, unknown> | ((path: string, arg?: unknown) => unknown)) {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(routes)
    registerFunnelsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  }

  it('requires game, name, and 2+ steps', () => {
    const tools = setupTools({})
    const schema = tools['create_funnel'].inputSchema
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ game: 'g', name: 'X', steps: [STEPS[0]] }).success).toBe(false)
    expect(schema.safeParse({ game: 'g', name: 'X', steps: STEPS }).success).toBe(true)
  })

  it('POSTs the body (minus game) to the game-scoped endpoint', async () => {
    const spy = vi.fn(() => ({ funnel: { id: 'fnl_1' } }))
    const tools = setupTools(spy as unknown as (p: string, a?: unknown) => unknown)
    const out = await tools['create_funnel'].handler(
      { game: 'dungeon/crawl', name: 'Onboarding', steps: STEPS, mode: 'ordered' },
      {},
    )
    expect(out.isError).toBeFalsy()
    expect(spy).toHaveBeenCalledWith('/api/v1/games/dungeon%2Fcrawl/funnels', {
      name: 'Onboarding',
      steps: STEPS,
      mode: 'ordered',
    })
  })

  it('surfaces a 403 viewer-role rejection verbatim', async () => {
    const tools = setupTools(() => {
      throw new PlayloopApiError(403, {
        error: 'Creating a funnel requires a member, admin, or owner role in this workspace.',
      })
    })
    const out = await tools['create_funnel'].handler({ game: 'g', name: 'X', steps: STEPS }, {})
    expect(out.isError).toBe(true)
    expect(JSON.parse(out.content[0]!.text).status).toBe(403)
  })
})
