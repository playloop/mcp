import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerFeedbackTools } from '../../src/tools/feedback.js'
import { registerBuildsTools } from '../../src/tools/builds.js'
import { registerFunnelsTools } from '../../src/tools/funnels.js'
import { registerCrashesTools } from '../../src/tools/crashes.js'
import { registerSearchTools } from '../../src/tools/search.js'
import { registerGameAnalyticsTools } from '../../src/tools/game-analytics.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function tool(
  register: (s: McpServer, c: ReturnType<typeof fakeClient>) => void,
  name: string,
  routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown),
) {
  const server = new McpServer({ name: 't', version: '0' })
  register(server, fakeClient(routes))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as unknown as { _registeredTools: Record<string, any> })._registeredTools[name]
}

const fail = (status: number) => () => {
  throw new PlayloopApiError(status, { error: 'nope' })
}

async function run(t: { handler: (a: unknown, b: unknown) => Promise<unknown> }, args: unknown) {
  return (await t.handler(args, {})) as ToolResult
}

describe('question-coverage tools, endpoints + errors', () => {
  const cases: Array<{
    register: (s: McpServer, c: ReturnType<typeof fakeClient>) => void
    name: string
    args: Record<string, unknown>
    expectedPath: string
  }> = [
    { register: registerFeedbackTools, name: 'list_feedback_responses', args: { game: 'foo bar' }, expectedPath: '/api/v1/feedback/foo%20bar' },
    { register: registerBuildsTools, name: 'get_build_drop_reasons', args: { game: 'g', version: '1.5' }, expectedPath: '/api/v1/builds/g/1.5/drop-reasons' },
    { register: registerFunnelsTools, name: 'get_funnel_result', args: { game: 'g', funnel_id: 'fnl 1' }, expectedPath: '/api/v1/games/g/funnels/fnl%201/result' },
    { register: registerFunnelsTools, name: 'get_funnel_trend', args: { game: 'g', funnel_id: 'fnl 1', days: 7 }, expectedPath: '/api/v1/games/g/funnels/fnl%201/trend' },
    { register: registerSearchTools, name: 'search_everything', args: { q: 'boss' }, expectedPath: '/api/v1/search' },
    { register: registerCrashesTools, name: 'get_crash_groups', args: { game: 'g' }, expectedPath: '/api/v1/games/g/crashes/groups' },
    { register: registerGameAnalyticsTools, name: 'get_game_summary', args: { game: 'g' }, expectedPath: '/api/v1/games/g/summary' },
    { register: registerGameAnalyticsTools, name: 'get_retention', args: { game: 'g', build: '1.5' }, expectedPath: '/api/v1/games/g/retention' },
    { register: registerGameAnalyticsTools, name: 'get_live_activity', args: { game: 'g' }, expectedPath: '/api/v1/games/g/live' },
    { register: registerGameAnalyticsTools, name: 'get_activity', args: { game: 'g', days: 7 }, expectedPath: '/api/v1/games/g/activity' },
    { register: registerGameAnalyticsTools, name: 'get_activity_digest', args: { game: 'g', window: 'today' }, expectedPath: '/api/v1/games/g/activity/digest' },
    { register: registerGameAnalyticsTools, name: 'get_metric_trend', args: { game: 'g', days: 7 }, expectedPath: '/api/v1/games/g/metric-trend' },
    { register: registerGameAnalyticsTools, name: 'get_platform_breakdown', args: { game: 'g' }, expectedPath: '/api/v1/games/g/breakdown' },
  ]

  for (const c of cases) {
    it(`${c.name}: hits ${c.expectedPath} + surfaces 404`, async () => {
      const spy = vi.fn((_p: string, _q?: unknown) => ({ ok: true }))
      const t = tool(c.register, c.name, spy as unknown as (p: string, q?: unknown) => unknown)
      expect(t, c.name).toBeDefined()
      const out = await run(t, c.args)
      expect(out.isError).toBeFalsy()
      expect(spy.mock.calls[0]![0]).toBe(c.expectedPath)

      const errTool = tool(c.register, c.name, fail(404))
      const errOut = await run(errTool, c.args)
      expect(errOut.isError).toBe(true)
      expect(JSON.parse(errOut.content[0]!.text).status).toBe(404)
    })
  }

  it('list_feedback_responses maps attention:true → ?attention=1', async () => {
    const spy = vi.fn((_p: string, _q?: unknown) => ({ submissions: [] }))
    const t = tool(registerFeedbackTools, 'list_feedback_responses', spy as unknown as (p: string, q?: unknown) => unknown)
    await run(t, { game: 'g', attention: true })
    expect(spy.mock.calls[0]![1]).toMatchObject({ attention: '1' })
  })

  it('list_feedback_responses + list_crashes map from_ms/to_ms → ?from/?to', async () => {
    const fbSpy = vi.fn((_p: string, _q?: unknown) => ({ submissions: [] }))
    const fb = tool(registerFeedbackTools, 'list_feedback_responses', fbSpy as unknown as (p: string, q?: unknown) => unknown)
    await run(fb, { game: 'g', from_ms: 100, to_ms: 200 })
    expect(fbSpy.mock.calls[0]![1]).toMatchObject({ from: 100, to: 200 })

    const crSpy = vi.fn((_p: string, _q?: unknown) => ({ crashes: [] }))
    const cr = tool(registerCrashesTools, 'list_crashes', crSpy as unknown as (p: string, q?: unknown) => unknown)
    await run(cr, { game: 'g', from_ms: 100, to_ms: 200 })
    expect(crSpy.mock.calls[0]![0]).toBe('/api/v1/games/g/crashes/unresolved')
    expect(crSpy.mock.calls[0]![1]).toMatchObject({ from: 100, to: 200 })
  })

  it('get_activity_digest maps from_ms/to_ms → ?from/?to and rejects a bad preset at the schema', async () => {
    const spy = vi.fn((_p: string, _q?: unknown) => ({ sessions: 0 }))
    const t = tool(registerGameAnalyticsTools, 'get_activity_digest', spy as unknown as (p: string, q?: unknown) => unknown)
    await run(t, { game: 'g', from_ms: 100, to_ms: 200 })
    expect(spy.mock.calls[0]![1]).toMatchObject({ from: 100, to: 200 })
    expect(t.inputSchema.safeParse({ game: 'g', window: 'fortnight' }).success).toBe(false)
    expect(t.inputSchema.safeParse({ game: 'g', window: 'yesterday' }).success).toBe(true)
  })

  it('search_everything rejects a <2-char query at the schema', () => {
    const t = tool(registerSearchTools, 'search_everything', {})
    expect(t.inputSchema.safeParse({ q: 'a' }).success).toBe(false)
    expect(t.inputSchema.safeParse({ q: 'ab' }).success).toBe(true)
  })

  it('get_usage hits /api/v1/usage + surfaces the 403 role gate verbatim', async () => {
    const spy = vi.fn((_p: string) => ({ plan: 'indie' }))
    const t = tool(registerGameAnalyticsTools, 'get_usage', spy as unknown as (p: string) => unknown)
    const out = await run(t, {})
    expect(out.isError).toBeFalsy()
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/usage')

    const gated = tool(registerGameAnalyticsTools, 'get_usage', () => {
      throw new PlayloopApiError(403, { error: 'admins only', requiredRole: 'admin' })
    })
    const errOut = await run(gated, {})
    expect(errOut.isError).toBe(true)
    const parsed = JSON.parse(errOut.content[0]!.text)
    expect(parsed.status).toBe(403)
    expect(parsed.requiredRole).toBe('admin')
  })
})
