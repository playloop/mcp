import { describe, expect, it } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  registerWeeklyDigestPrompt,
  weeklyDigestText,
} from '../src/prompts/weekly-digest.js'
import {
  registerBuildComparisonPrompt,
  buildComparisonText,
} from '../src/prompts/build-comparison.js'
import {
  registerFrictionAnalysisPrompt,
  frictionAnalysisText,
} from '../src/prompts/friction-analysis.js'
import {
  registerTesterSpotlightPrompt,
  testerSpotlightText,
} from '../src/prompts/tester-spotlight.js'
import { registerRecipePrompts } from '../src/prompts/recipes.js'
import { PROMPT_RECIPES } from '../src/prompts/recipes.generated.js'
import { createPlayloopMcpServer } from '../src/server.js'

interface PromptResult {
  messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>
}

function setup() {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerWeeklyDigestPrompt(server)
  registerBuildComparisonPrompt(server)
  registerFrictionAnalysisPrompt(server)
  registerTesterSpotlightPrompt(server)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as unknown as { _registeredPrompts: Record<string, any> })._registeredPrompts
}

describe('prompt: weekly_digest', () => {
  it('registers under the expected name', () => {
    const prompts = setup()
    expect(prompts['weekly_digest']).toBeDefined()
    expect(prompts['weekly_digest'].title).toBe('Weekly playtest digest')
  })

  it('returns a single user message with the game interpolated', async () => {
    const prompts = setup()
    const out = (await prompts['weekly_digest'].callback({ game: 'dungeon-crawl' }, {})) as PromptResult
    expect(out.messages).toHaveLength(1)
    expect(out.messages[0]?.role).toBe('user')
    expect(out.messages[0]?.content.type).toBe('text')
    expect(out.messages[0]?.content.text).toContain('dungeon-crawl')
    expect(out.messages[0]?.content.text).toContain('list_sessions')
    expect(out.messages[0]?.content.text).toContain('query_insights')
  })

  it('text helper is exported for direct testing', () => {
    expect(weeklyDigestText('foo')).toContain('foo')
  })
})

describe('prompt: build_comparison', () => {
  it('interpolates both build versions', async () => {
    const prompts = setup()
    const out = (await prompts['build_comparison'].callback(
      { game: 'g', build_a: '0.4.9', build_b: '0.5.0' },
      {},
    )) as PromptResult
    const text = out.messages[0]?.content.text ?? ''
    expect(text).toContain('0.4.9')
    expect(text).toContain('0.5.0')
    expect(text).toContain('compare_builds')
  })

  it('text helper renders with the expected scope', () => {
    expect(buildComparisonText('x', 'a', 'b')).toContain('compare_builds')
  })
})

describe('prompt: friction_analysis', () => {
  it('branches the playbook on scope=game', async () => {
    const prompts = setup()
    const out = (await prompts['friction_analysis'].callback(
      { scope: 'game', id: 'dungeon-crawl' },
      {},
    )) as PromptResult
    const text = out.messages[0]?.content.text ?? ''
    expect(text).toContain('query_insights')
    expect(text).toContain('dungeon-crawl')
  })

  it('branches the playbook on scope=build', async () => {
    const prompts = setup()
    const out = (await prompts['friction_analysis'].callback(
      { scope: 'build', id: 'dungeon-crawl:0.5.0' },
      {},
    )) as PromptResult
    const text = out.messages[0]?.content.text ?? ''
    expect(text).toContain('get_build_summary')
    expect(text).toContain('0.5.0')
  })

  it('branches the playbook on scope=tester', async () => {
    const prompts = setup()
    const out = (await prompts['friction_analysis'].callback(
      { scope: 'tester', id: 'dungeon-crawl:dev_abc' },
      {},
    )) as PromptResult
    const text = out.messages[0]?.content.text ?? ''
    expect(text).toContain('get_tester_summary')
    expect(text).toContain('dev_abc')
  })

  it('rejects invalid scope', () => {
    const prompts = setup()
    const argsSchema = prompts['friction_analysis'].argsSchema
    expect(argsSchema.safeParse({ scope: 'world', id: 'x' }).success).toBe(false)
  })

  it('text helper renders for each scope', () => {
    expect(frictionAnalysisText('game', 'a')).toContain('query_insights')
    expect(frictionAnalysisText('build', 'g:1')).toContain('get_build_summary')
    expect(frictionAnalysisText('tester', 'g:d')).toContain('get_tester_summary')
  })
})

describe('prompt: tester_spotlight', () => {
  it('drives the agent through list_sessions + get_tester_summary', async () => {
    const prompts = setup()
    const out = (await prompts['tester_spotlight'].callback(
      { game: 'dungeon-crawl' },
      {},
    )) as PromptResult
    const text = out.messages[0]?.content.text ?? ''
    expect(text).toContain('list_sessions')
    expect(text).toContain('get_tester_summary')
    expect(text).toContain('dungeon-crawl')
  })

  it('text helper renders', () => {
    expect(testerSpotlightText('foo')).toContain('foo')
  })
})

describe('recipe prompts', () => {
  function recipes() {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerRecipePrompts(server)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (server as unknown as { _registeredPrompts: Record<string, any> })._registeredPrompts
  }

  it('registers one prompt per generated recipe', () => {
    expect(Object.keys(recipes()).sort()).toEqual(PROMPT_RECIPES.map((r) => r.name).sort())
  })

  it('fills the arguments into a single user message', async () => {
    const out = (await recipes()['read_last_build_quits'].callback({ game: 'dungeon-crawl' }, {})) as PromptResult
    expect(out.messages).toHaveLength(1)
    expect(out.messages[0]?.role).toBe('user')
    expect(out.messages[0]?.content.text).toContain('game="dungeon-crawl"')
    expect(out.messages[0]?.content.text).toContain('get_build_drop_reasons')
    expect(out.messages[0]?.content.text).not.toContain('{{')
  })

  it('declares each argument as required', () => {
    const ab = recipes()['set_up_ab_test']
    expect(ab.argsSchema.safeParse({ game: 'g' }).success).toBe(false)
    expect(ab.argsSchema.safeParse({ game: 'g', change: 'a shorter tutorial' }).success).toBe(true)
  })

  it('a recipe with no arguments renders without any', async () => {
    const out = (await recipes()['add_death_tracking'].callback({})) as PromptResult
    expect(out.messages[0]?.content.text).toContain("telemetry.track('player_died'")
  })

  it('every tool a recipe names is a tool this server registers', () => {
    const server = createPlayloopMcpServer({ apiKey: 'k' })
    const tools = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    )
    for (const recipe of PROMPT_RECIPES) {
      for (const tool of recipe.tools) expect(tools, `${recipe.name} names ${tool}`).toContain(tool)
    }
  })
})
