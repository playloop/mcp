import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerPlaytestersTools } from '../../src/tools/playtesters.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function tools(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  registerPlaytestersTools(server, fakeClient(routes))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
}

function fail(status: number, body: { error: string } & Record<string, unknown> = { error: 'nope' }) {
  return () => {
    throw new PlayloopApiError(status, body)
  }
}

async function run(tool: { handler: (a: unknown, b: unknown) => Promise<unknown> }, args: unknown) {
  return (await tool.handler(args, {})) as ToolResult
}

describe('playtester distribution tools', () => {
  it('all five register', () => {
    const t = tools({})
    for (const name of [
      'list_playtest_batches',
      'get_playtest_batch',
      'list_playtest_keys',
      'list_tester_invites',
      'list_playtest_handles',
    ]) {
      expect(t[name], name).toBeDefined()
    }
  })

  it('list_playtest_batches: happy path + game encoding + 404', async () => {
    const spy = vi.fn(() => ({ game: 'g', batches: [{ id: 'b_1' }] }))
    const out = await run(tools(spy as never)['list_playtest_batches'], {
      game: 'foo bar',
      sort: 'name',
      order: 'asc',
    })
    expect(out.isError).toBeFalsy()
    expect(spy).toHaveBeenCalledWith('/api/v1/batches/foo%20bar', { sort: 'name', order: 'asc' })
    expect(JSON.parse(out.content[0]!.text).batches).toHaveLength(1)

    const err = await run(tools(fail(404))['list_playtest_batches'], { game: 'ghost' })
    expect(err.isError).toBe(true)
    expect(JSON.parse(err.content[0]!.text).status).toBe(404)
  })

  it('get_playtest_batch: encodes both path params + happy path', async () => {
    const spy = vi.fn(() => ({ game: 'g', batch: { id: 'b 1' } }))
    await run(tools(spy as never)['get_playtest_batch'], { game: 'g', batch_id: 'b 1' })
    expect(spy).toHaveBeenCalledWith('/api/v1/batches/g/b%201', undefined)
  })

  it('list_playtest_keys: hits the keys sub-path + surfaces 403', async () => {
    const spy = vi.fn((_p: string, _q?: unknown) => ({ keys: [] }))
    await run(tools(spy as never)['list_playtest_keys'], { game: 'g', batch_id: 'b1' })
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/batches/g/b1/keys')

    const err = await run(
      tools(fail(403, { error: 'management key required', requiredScope: 'management' }))['list_playtest_keys'],
      { game: 'g', batch_id: 'b1' },
    )
    expect(err.isError).toBe(true)
    expect(JSON.parse(err.content[0]!.text).requiredScope).toBe('management')
  })

  it('list_tester_invites: hits the invites sub-path + passes sort through', async () => {
    const spy = vi.fn(() => ({ invites: [] }))
    await run(tools(spy as never)['list_tester_invites'], {
      game: 'g',
      batch_id: 'b1',
      sort: 'redeemed_at',
    })
    expect(spy).toHaveBeenCalledWith('/api/v1/batches/g/b1/invites', { sort: 'redeemed_at' })
  })

  it('list_playtest_handles: hits the handles path + 404', async () => {
    const spy = vi.fn((_p: string, _q?: unknown) => ({ handles: [{ deviceId: 'd_1' }] }))
    const out = await run(tools(spy as never)['list_playtest_handles'], { game: 'g' })
    expect(out.isError).toBeFalsy()
    expect(spy.mock.calls[0]![0]).toBe('/api/v1/handles/g')

    const err = await run(tools(fail(404))['list_playtest_handles'], { game: 'ghost' })
    expect(err.isError).toBe(true)
  })

  it('the batch tools require game (and batch_id where applicable)', () => {
    const t = tools({})
    expect(t['list_playtest_batches'].inputSchema.safeParse({ game: '' }).success).toBe(false)
    expect(t['get_playtest_batch'].inputSchema.safeParse({ game: 'g' }).success).toBe(false)
    expect(t['get_playtest_batch'].inputSchema.safeParse({ game: 'g', batch_id: 'b' }).success).toBe(true)
  })
})
