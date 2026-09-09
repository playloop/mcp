import { describe, expect, it } from 'vitest'
import { createPlayloopMcpServer, MCP_WRITE_TOOLS, READ_ONLY_WRITE_MESSAGE } from '../src/server.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTools = (server: unknown) =>
  (server as { _registeredTools: Record<string, any> })._registeredTools
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toolNames = (server: unknown) => Object.keys(getTools(server))

describe('createPlayloopMcpServer', () => {
  it('throws when apiKey is missing', () => {
    // @ts-expect-error, intentionally missing key
    expect(() => createPlayloopMcpServer({})).toThrow(/apiKey is required/)
  })

  it('registers 52 tools across the analytics, distribution, tester/feedback, experiments, crashes, funnels, search, game-analytics, and docs surfaces', () => {
    const server = createPlayloopMcpServer({ apiKey: 'k', baseUrl: 'http://localhost' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const names = Object.keys(tools).sort()
    expect(names).toEqual(
      [
        // Analytics (10) + game writes (create_game, update_game) + list_builds
        'compare_builds',
        'create_game',
        'update_game',
        'get_build_summary',
        'list_builds',
        'get_event_stats',
        'get_game',
        'get_heatmap',
        'get_session',
        'get_tester_summary',
        'list_games',
        'list_sessions',
        'query_insights',
        // Distribution (5)
        'list_playtest_batches',
        'get_playtest_batch',
        'list_playtest_keys',
        'list_tester_invites',
        'list_playtest_handles',
        // Tester / feedback (4)
        'suggest_fixes',
        'get_fix_first',
        'get_tester_journey',
        'list_tester_archetypes',
        'list_game_feedback_forms',
        'create_feedback_form',
        // Experiments (2 reads + 6 writes)
        'list_game_experiments',
        'get_experiment_comparison',
        'create_experiment',
        'set_game_cover',
        'start_experiment',
        'stop_experiment',
        'pick_experiment_winner',
        'pin_experiment_variant',
        'unpin_experiment_variant',
        // Crashes (1)
        'list_crashes',
        // Funnels (1 read + 1 write)
        'list_game_funnels',
        'create_funnel',
        // Docs (1)
        'search_docs',
        // Feedback write (1)
        'file_feature_request',
        // Question-coverage wave: builds/feedback/funnel/search/crash/game-analytics
        'list_feedback_responses',
        'get_build_drop_reasons',
        'get_funnel_result',
        'search_everything',
        'get_crash_groups',
        'get_game_summary',
        'get_feedback_themes',
        'get_retention',
        'get_live_activity',
        'get_activity',
        'get_activity_digest',
        'get_platform_breakdown',
        'get_usage',
        // Trend deltas
        'get_funnel_trend',
        'get_metric_trend',
      ].sort(),
    )
  })

  it('readOnly:true keeps write tools visible but refuses them; reads survive', async () => {
    const full = toolNames(createPlayloopMcpServer({ apiKey: 'k', baseUrl: 'http://localhost' }))
    const tools = getTools(
      createPlayloopMcpServer({ apiKey: 'k', baseUrl: 'http://localhost', readOnly: true }),
    )
    // Same tool list in both modes; only the write handlers differ.
    expect(Object.keys(tools).sort()).toEqual(full.sort())
    // Each write tool refuses with the legible message and never calls the API
    // (no fetch is wired here, so a stub that DID call would throw).
    for (const write of MCP_WRITE_TOOLS) {
      const res = await tools[write].handler({ name: 'x', game: 'g', genre: 'arcade' })
      expect(res.isError, `${write} must refuse in read-only mode`).toBe(true)
      expect(res.content[0].text).toBe(READ_ONLY_WRITE_MESSAGE)
    }
    expect(toolNames({ _registeredTools: tools })).toContain('list_sessions')
    expect(toolNames({ _registeredTools: tools })).toContain('file_feature_request')
  })

  it('registers 4 prompts', () => {
    const server = createPlayloopMcpServer({ apiKey: 'k' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prompts = (server as unknown as { _registeredPrompts: Record<string, any> })._registeredPrompts
    expect(Object.keys(prompts).sort()).toEqual(
      ['build_comparison', 'friction_analysis', 'tester_spotlight', 'weekly_digest'].sort(),
    )
  })

  it('registers 3 resource templates', () => {
    const server = createPlayloopMcpServer({ apiKey: 'k' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (server as unknown as { _registeredResourceTemplates: Record<string, any> })
      ._registeredResourceTemplates
    expect(Object.keys(r).sort()).toEqual(
      ['playloop-build', 'playloop-game', 'playloop-session'].sort(),
    )
  })

  it('uses the supplied server name and version', () => {
    const server = createPlayloopMcpServer({
      apiKey: 'k',
      name: 'custom-name',
      version: '9.9.9',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = (server as unknown as { server: { _serverInfo: { name: string; version: string } } }).server
    expect(internal._serverInfo.name).toBe('custom-name')
    expect(internal._serverInfo.version).toBe('9.9.9')
  })
})
