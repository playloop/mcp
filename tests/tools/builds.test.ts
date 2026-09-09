import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBuildsTools } from '../../src/tools/builds.js'
import { fakeClient, fakeBuildSummary } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerBuildsTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return {
    listBuilds: tools['list_builds'],
    getBuildSummary: tools['get_build_summary'],
    compareBuilds: tools['compare_builds'],
  }
}

describe('tool: list_builds', () => {
  it('registers, requires game, and encodes it', async () => {
    const { listBuilds } = setup({})
    expect(listBuilds).toBeDefined()
    expect(listBuilds.inputSchema.safeParse({ game: '' }).success).toBe(false)
    const spy = vi.fn((_p: string, _q?: unknown) => ({ game: { slug: 'g' }, builds: [{ version: '1.5.0' }] }))
    const s2 = new McpServer({ name: 't', version: '0' })
    registerBuildsTools(s2, fakeClient(spy as unknown as (p: string, q?: unknown) => unknown))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (s2 as unknown as { _registeredTools: Record<string, any> })._registeredTools['list_builds']
    const out = (await t.handler({ game: 'foo bar' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/builds/foo%20bar')
    expect(JSON.parse(out.content[0]!.text).builds).toHaveLength(1)
  })

  it('passes env through and surfaces 404', async () => {
    const spy = vi.fn((_p: string, _q?: unknown) => ({ builds: [] }))
    const { listBuilds } = setup(spy as unknown as (p: string, q?: unknown) => unknown)
    await listBuilds.handler({ game: 'g', env: 'production' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/builds/g', { env: 'production' })

    const errServer = setup(() => {
      throw new PlayloopApiError(404, { error: 'Game not found' })
    })
    const out = (await errServer.listBuilds.handler({ game: 'ghost' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    expect(JSON.parse(out.content[0]!.text).status).toBe(404)
  })
})

describe('tool: get_build_summary', () => {
  it('requires game and version', () => {
    const { getBuildSummary } = setup({})
    expect(getBuildSummary.inputSchema.safeParse({}).success).toBe(false)
    expect(getBuildSummary.inputSchema.safeParse({ game: 'a', version: '1' }).success).toBe(true)
  })

  it('URL-encodes the version', async () => {
    const spy = vi.fn(() => fakeBuildSummary('0.5.0'))
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerBuildsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_build_summary'].handler({ game: 'dungeon-crawl', version: '0.5.0-rc1' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/builds/dungeon-crawl/0.5.0-rc1', undefined)
  })

  it('passes env when provided', async () => {
    const spy = vi.fn(() => fakeBuildSummary())
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, q?: unknown) => unknown)
    registerBuildsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_build_summary'].handler({ game: 'x', version: '1', env: 'staging' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/builds/x/1', { env: 'staging' })
  })

  it('returns rollup + summary on happy path', async () => {
    const { getBuildSummary } = setup({
      '/api/v1/builds/dungeon-crawl/0.5.0': fakeBuildSummary('0.5.0'),
    })
    const out = (await getBuildSummary.handler({ game: 'dungeon-crawl', version: '0.5.0' }, {})) as ToolResult
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.rollup.version).toBe('0.5.0')
    expect(parsed.summary).toBeTruthy()
  })
})

describe('tool: compare_builds', () => {
  it('requires both versions', () => {
    const { compareBuilds } = setup({})
    expect(compareBuilds.inputSchema.safeParse({ game: 'a' }).success).toBe(false)
    expect(
      compareBuilds.inputSchema.safeParse({ game: 'a', version_a: '1', version_b: '2' }).success,
    ).toBe(true)
  })

  it('fetches both builds + the friction diff in parallel, returns deltas + friction_diff', async () => {
    const a = fakeBuildSummary('0.4.9')
    a.rollup.sessionCount = 10
    a.rollup.totalPlaytimeMs = 1_000_000
    const b = fakeBuildSummary('0.5.0')
    b.rollup.sessionCount = 15
    b.rollup.totalPlaytimeMs = 2_000_000
    const friction = {
      game: { id: 'g1', slug: 'dungeon-crawl', name: 'Dungeon Crawl' },
      environment: 'all',
      buildA: { version: '0.4.9', testersInBatch: 4, sessionCount: 10, byTag: [] },
      buildB: { version: '0.5.0', testersInBatch: 5, sessionCount: 15, byTag: [] },
      diff: {
        buildA: { version: '0.4.9', testersInBatch: 4, sessionCount: 10 },
        buildB: { version: '0.5.0', testersInBatch: 5, sessionCount: 15 },
        changes: [{ kind: 'got_larger', tag: 'camera', deltaPct: 12 }],
        totals: { resolved: 0, gotSmaller: 0, carriedOver: 0, gotLarger: 1, introduced: 0 },
      },
    }
    const { compareBuilds } = setup({
      '/api/v1/builds/dungeon-crawl/0.4.9': a,
      '/api/v1/builds/dungeon-crawl/0.5.0': b,
      '/api/v1/builds/compare': friction,
    })
    const out = (await compareBuilds.handler(
      { game: 'dungeon-crawl', version_a: '0.4.9', version_b: '0.5.0' },
      {},
    )) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.build_a.rollup.version).toBe('0.4.9')
    expect(parsed.build_b.rollup.version).toBe('0.5.0')
    expect(parsed.deltas.sessionCount).toEqual({ a: 10, b: 15, delta: 5 })
    expect(parsed.deltas.totalPlaytimeMs.delta).toBe(1_000_000)
    expect(parsed.friction_diff.changes[0]).toEqual({
      kind: 'got_larger',
      tag: 'camera',
      deltaPct: 12,
    })
    expect(parsed.friction_build_a.version).toBe('0.4.9')
  })

  it('surfaces a failure if either build fetch errors', async () => {
    const client = fakeClient((path: string) => {
      if (path.endsWith('/0.4.9')) return fakeBuildSummary('0.4.9')
      throw new PlayloopApiError(404, { error: 'Build not found' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerBuildsTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['compare_builds'].handler(
      { game: 'dungeon-crawl', version_a: '0.4.9', version_b: 'ghost' },
      {},
    )) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(404)
  })
})
