import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  registerSuggestFixesTool,
  registerTesterJourneyTool,
  registerTesterArchetypesTool,
  registerFeedbackFormsTool,
} from '../../src/tools/tester-feedback.js'
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
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  register(server, fakeClient(routes))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return tools[name]
}

function fail(status: number, body: { error: string } & Record<string, unknown> = { error: 'nope' }) {
  return () => {
    throw new PlayloopApiError(status, body)
  }
}

async function run(t: { handler: (a: unknown, b: unknown) => Promise<unknown> }, args: unknown) {
  return (await t.handler(args, {})) as ToolResult
}

describe('suggest_fixes', () => {
  it('registers and passes all query params through', async () => {
    const spy = vi.fn(() => ({ ok: true, suggestions: [] }))
    const t = tool(registerSuggestFixesTool, 'suggest_fixes', spy as never)
    expect(t).toBeDefined()
    await run(t, { game: 'g', a: '1.0.0', b: '1.1.0', env: 'production' })
    expect(spy).toHaveBeenCalledWith('/api/v1/builds/compare/suggestions', {
      game: 'g',
      build: undefined,
      a: '1.0.0',
      b: '1.1.0',
      env: 'production',
    })
  })

  it('surfaces the Free-tier 402 (requiresPremium)', async () => {
    const t = tool(
      registerSuggestFixesTool,
      'suggest_fixes',
      fail(402, { error: 'premium required', ok: false, requiresPremium: true }),
    )
    const out = await run(t, { game: 'g', build: '1.0.0' })
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(402)
    expect(parsed.requiresPremium).toBe(true)
  })
})

describe('get_tester_journey', () => {
  it('encodes game + device id and returns the payload', async () => {
    const spy = vi.fn(() => ({ journey: [{ event: 'session_start' }] }))
    const t = tool(registerTesterJourneyTool, 'get_tester_journey', spy as never)
    const out = await run(t, { game: 'g', device_id: 'dev 1' })
    expect(out.isError).toBeFalsy()
    expect(spy).toHaveBeenCalledWith('/api/v1/testers/g/dev%201/journey', undefined)
  })

  it('surfaces 404', async () => {
    const t = tool(registerTesterJourneyTool, 'get_tester_journey', fail(404))
    const out = await run(t, { game: 'g', device_id: 'ghost' })
    expect(out.isError).toBe(true)
    expect(JSON.parse(out.content[0]!.text).status).toBe(404)
  })
})

describe('list_tester_archetypes', () => {
  it('hits the archetypes path + happy path', async () => {
    const spy = vi.fn(() => ({ archetypes: [] }))
    const t = tool(registerTesterArchetypesTool, 'list_tester_archetypes', spy as never)
    await run(t, { game: 'g' })
    expect(spy).toHaveBeenCalledWith('/api/v1/testers/g/archetypes', undefined)
  })

  it('surfaces an API error', async () => {
    const t = tool(registerTesterArchetypesTool, 'list_tester_archetypes', fail(500, { error: 'boom' }))
    const out = await run(t, { game: 'g' })
    expect(out.isError).toBe(true)
  })
})

describe('list_game_feedback_forms', () => {
  it('hits the prompts path + happy path', async () => {
    const spy = vi.fn(() => ({ prompts: [{ id: 'ff_1' }] }))
    const t = tool(registerFeedbackFormsTool, 'list_game_feedback_forms', spy as never)
    const out = await run(t, { game: 'g' })
    expect(out.isError).toBeFalsy()
    expect(spy).toHaveBeenCalledWith('/api/v1/games/g/prompts', undefined)
  })

  it('surfaces 404 for a missing game', async () => {
    const t = tool(registerFeedbackFormsTool, 'list_game_feedback_forms', fail(404))
    const out = await run(t, { game: 'ghost' })
    expect(out.isError).toBe(true)
  })
})


describe('create_feedback_form repeat policy', () => {
  it.each([undefined, false, true])('preserves the optional policy %s through schema and POST', async (policy) => {
    const spy = vi.fn(() => ({ form: { id: 'ff_1' } }))
    const t = tool(registerFeedbackFormsTool, 'create_feedback_form', spy)
    const input = {
      game: 'my game', title: 'Notes',
      fields: [{ id: 'note', label: 'Your note', kind: 'long-text' }],
      ...(policy === undefined ? {} : { allowRepeatSubmissions: policy }),
    }
    const parsed = t.inputSchema.parse(input)
    await run(t, parsed)
    const { game, ...body } = input
    expect(spy).toHaveBeenCalledWith('/api/v1/games/my%20game/prompts', body)
  })
})
