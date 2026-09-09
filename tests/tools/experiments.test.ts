import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerExperimentsTools } from '../../src/tools/experiments.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerExperimentsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return {
    listGameExperiments: tools['list_game_experiments'],
    getExperimentComparison: tools['get_experiment_comparison'],
  }
}

describe('tool: list_game_experiments', () => {
  it('requires game', () => {
    const { listGameExperiments } = setup({})
    expect(listGameExperiments.inputSchema.safeParse({}).success).toBe(false)
    expect(listGameExperiments.inputSchema.safeParse({ game: 'a' }).success).toBe(true)
  })

  it('URL-encodes the game segment', async () => {
    const spy = vi.fn(() => ({ game: {}, experiments: [] }))
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerExperimentsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['list_game_experiments'].handler({ game: 'foo/bar', sort: 'name', order: 'asc' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/games/foo%2Fbar/experiments', { sort: 'name', order: 'asc' })
  })

  it('relays the experiments list', async () => {
    const fixture = {
      game: { id: 'g_1', slug: 'dungeon-crawl' },
      experiments: [
        {
          id: 'exp_1',
          name: 'Tutorial test',
          status: 'running',
          variants: [{ key: 'control', name: 'Control', allocation: 50 }],
          audienceId: null,
          audienceName: null,
          winnerVariantKey: null,
        },
      ],
    }
    const { listGameExperiments } = setup({
      '/api/v1/games/dungeon-crawl/experiments': fixture,
    })
    const out = (await listGameExperiments.handler({ game: 'dungeon-crawl' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.experiments).toHaveLength(1)
    expect(parsed.experiments[0].status).toBe('running')
  })

  it('surfaces a 403 ingest-key rejection verbatim', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(403, { error: 'requires management scope', requiredScope: 'management' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerExperimentsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['list_game_experiments'].handler({ game: 'g' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(403)
    expect(parsed.requiredScope).toBe('management')
  })
})

describe('tool: get_experiment_comparison', () => {
  it('requires experiment_id', () => {
    const { getExperimentComparison } = setup({})
    expect(getExperimentComparison.inputSchema.safeParse({}).success).toBe(false)
    expect(getExperimentComparison.inputSchema.safeParse({ experiment_id: 'exp_1' }).success).toBe(
      true,
    )
  })

  it('URL-encodes the experiment id segment', async () => {
    const spy = vi.fn(() => ({ comparison: {}, digest: null }))
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerExperimentsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_experiment_comparison'].handler({ experiment_id: 'exp/1' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/experiments/exp%2F1/comparison', undefined)
  })

  it('relays comparison + null digest before generation', async () => {
    const fixture = {
      comparison: { experimentId: 'exp_1', variants: [{ key: 'control', sessionCount: 42 }] },
      digest: null,
    }
    const { getExperimentComparison } = setup({
      '/api/v1/experiments/exp_1/comparison': fixture,
    })
    const out = (await getExperimentComparison.handler({ experiment_id: 'exp_1' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.comparison.variants).toHaveLength(1)
    expect(parsed.digest).toBeNull()
  })

  it('surfaces 404 for an unknown / cross-tenant experiment', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(404, { error: 'Experiment not found' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerExperimentsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_experiment_comparison'].handler(
      { experiment_id: 'exp_missing' },
      {},
    )) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(404)
  })
})

// ─── write tools ───────────────────────────────────────────────────────

function setupAll(routes: Record<string, unknown> | ((path: string, arg?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerExperimentsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
}

const VARIANTS = [
  { key: 'control', name: 'Control', allocation: 50 },
  { key: 'treat', name: 'Treatment', allocation: 50 },
]

describe('tool: create_experiment', () => {
  it('requires game, name, and 2+ variants', () => {
    const tools = setupAll({})
    const schema = tools['create_experiment'].inputSchema
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ game: 'g', name: 'X', variants: [VARIANTS[0]] }).success).toBe(false)
    expect(schema.safeParse({ game: 'g', name: 'X', variants: VARIANTS }).success).toBe(true)
  })

  it('POSTs the body (minus game) to the game-scoped endpoint', async () => {
    const spy = vi.fn(() => ({ experiment: { id: 'exp_1', status: 'draft' } }))
    const tools = setupAll(spy as unknown as (p: string, a?: unknown) => unknown)
    const out = (await tools['create_experiment'].handler(
      { game: 'dungeon/crawl', name: 'X', variants: VARIANTS },
      {},
    )) as ToolResult
    expect(out.isError).toBeFalsy()
    expect(spy).toHaveBeenCalledWith('/api/v1/games/dungeon%2Fcrawl/experiments', {
      name: 'X',
      variants: VARIANTS,
    })
  })

  it('surfaces the 409 normalization handshake verbatim', async () => {
    const tools = setupAll(() => {
      throw new PlayloopApiError(409, {
        error: 'allocations_need_normalization',
        rawSum: 60,
      } as unknown as { error: string })
    })
    const out = (await tools['create_experiment'].handler(
      { game: 'g', name: 'X', variants: VARIANTS },
      {},
    )) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(409)
    expect(parsed.error).toContain('allocations_need_normalization')
  })
})

describe('tool: start_experiment / stop_experiment', () => {
  it('POST to the lifecycle endpoints with an empty body', async () => {
    const spy = vi.fn(() => ({ experiment: { id: 'exp_1', status: 'running' } }))
    const tools = setupAll(spy as unknown as (p: string, a?: unknown) => unknown)
    await tools['start_experiment'].handler({ experiment_id: 'exp/1' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/experiments/exp%2F1/start', {})
    await tools['stop_experiment'].handler({ experiment_id: 'exp_1' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/experiments/exp_1/stop', {})
  })

  it('surfaces a 409 invalid-transition rejection', async () => {
    const tools = setupAll(() => {
      throw new PlayloopApiError(409, { error: 'Experiment is already running.' })
    })
    const out = (await tools['start_experiment'].handler({ experiment_id: 'exp_1' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    expect(JSON.parse(out.content[0]!.text).status).toBe(409)
  })
})

describe('tool: pick_experiment_winner', () => {
  it('maps winner_variant_key → winnerVariantKey and allows null (unset)', async () => {
    const spy = vi.fn(() => ({ experiment: { id: 'exp_1', winnerVariantKey: 'treat' } }))
    const tools = setupAll(spy as unknown as (p: string, a?: unknown) => unknown)
    await tools['pick_experiment_winner'].handler(
      { experiment_id: 'exp_1', winner_variant_key: 'treat' },
      {},
    )
    expect(spy).toHaveBeenCalledWith('/api/v1/experiments/exp_1/pick-winner', {
      winnerVariantKey: 'treat',
    })
    await tools['pick_experiment_winner'].handler(
      { experiment_id: 'exp_1', winner_variant_key: null },
      {},
    )
    expect(spy).toHaveBeenCalledWith('/api/v1/experiments/exp_1/pick-winner', {
      winnerVariantKey: null,
    })
  })

  it('requires winner_variant_key to be present (string or null)', () => {
    const tools = setupAll({})
    const schema = tools['pick_experiment_winner'].inputSchema
    expect(schema.safeParse({ experiment_id: 'exp_1' }).success).toBe(false)
    expect(schema.safeParse({ experiment_id: 'exp_1', winner_variant_key: null }).success).toBe(true)
  })
})
