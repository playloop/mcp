import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerGamesTools } from '../../src/tools/games.js'
import { fakeClient, fakeGameDetail, fakeGamesList, fakeCreateGameResponse } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerGamesTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return {
    listGames: tools['list_games'],
    getGame: tools['get_game'],
  }
}

describe('tool: list_games', () => {
  it('registers with the right name and description', () => {
    const { listGames } = setup({})
    expect(listGames).toBeDefined()
    expect(listGames.description).toMatch(/List every game/)
  })

  it('returns the JSON-encoded API response on happy path', async () => {
    const fixture = fakeGamesList()
    const { listGames } = setup({ '/api/v1/games': fixture })
    const out = (await listGames.handler({}, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.games).toHaveLength(2)
    expect(parsed.games[0].slug).toBe('dungeon-crawl')
  })

  it('passes q / sort / order through as query params', async () => {
    const spy = vi.fn((_path: string, query?: unknown) => {
      void query
      return fakeGamesList()
    })
    const { listGames } = setup(spy as unknown as (path: string, query?: unknown) => unknown)
    await listGames.handler({ q: 'dungeon', sort: 'name', order: 'asc' }, {})
    expect(spy).toHaveBeenCalledWith('/api/v1/games', { q: 'dungeon', sort: 'name', order: 'asc' })
  })

  it('accepts only whitelisted sort/order enum values', () => {
    const { listGames } = setup({})
    const schema = listGames.inputSchema
    expect(schema.safeParse({ sort: 'name', order: 'desc' }).success).toBe(true)
    expect(schema.safeParse({ sort: 'bogus' }).success).toBe(false)
    expect(schema.safeParse({ order: 'sideways' }).success).toBe(false)
  })

  it('surfaces API 403 (ingest-key-on-management-route) with requiredScope', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(403, {
        error: 'This endpoint requires a management key.',
        requiredScope: 'management',
      })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerGamesTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['list_games'].handler({}, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(403)
    expect(parsed.requiredScope).toBe('management')
  })
})

describe('tool: get_game', () => {
  it('requires game_id (zod validation)', async () => {
    const { getGame } = setup({})
    // The MCP layer validates inputs against the schema; the handler itself
    // expects a parsed object. We assert the schema rejects empty string by
    // parsing the registered inputSchema directly.
    const schema = getGame.inputSchema
    const ok = schema.safeParse({ game_id: 'dungeon-crawl' })
    expect(ok.success).toBe(true)
    const bad = schema.safeParse({ game_id: '' })
    expect(bad.success).toBe(false)
  })

  it('fetches by slug and returns the detail payload', async () => {
    const fixture = fakeGameDetail()
    const fetchSpy = vi.fn(() => fixture)
    const client = fakeClient(fetchSpy as unknown as (path: string) => unknown)
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerGamesTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_game'].handler({ game_id: 'dungeon-crawl' }, {})) as ToolResult
    expect(out.isError).toBeFalsy()
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/games/dungeon-crawl', undefined)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.game.slug).toBe('dungeon-crawl')
    expect(parsed.counts.sessionCount).toBe(12)
  })

  it('URL-encodes the game_id', async () => {
    const fetchSpy = vi.fn(() => fakeGameDetail())
    const client = fakeClient(fetchSpy as unknown as (path: string) => unknown)
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerGamesTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['get_game'].handler({ game_id: 'foo bar/baz' }, {})
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/games/foo%20bar%2Fbaz', undefined)
  })

  it('surfaces 404 as an error tool result', async () => {
    const client = fakeClient(() => {
      throw new PlayloopApiError(404, { error: 'Game not found' })
    })
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerGamesTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    const out = (await tools['get_game'].handler({ game_id: 'ghost' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(404)
  })
})

describe('tool: create_game', () => {
  function createTool(routes: Record<string, unknown> | ((path: string, body?: unknown) => unknown)) {
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    registerGamesTools(server, fakeClient(routes))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    return tools['create_game']
  }

  it('registers and validates the input schema (name + genre required)', () => {
    const tool = createTool({})
    expect(tool).toBeDefined()
    expect(tool.description).toMatch(/Create a new game/)
    const schema = tool.inputSchema
    expect(schema.safeParse({ name: 'My Game', genre: 'RPG' }).success).toBe(true)
    expect(schema.safeParse({ name: '', genre: 'RPG' }).success).toBe(false)
    expect(schema.safeParse({ name: 'My Game', genre: 'NotAGenre' }).success).toBe(false)
    expect(schema.safeParse({ name: 'My Game' }).success).toBe(false)
  })

  it('POSTs to /api/v1/games and returns { game, ingestKey }', async () => {
    const spy = vi.fn((_path: string, body?: unknown) => {
      void body
      return fakeCreateGameResponse({ slug: 'my-new-game', name: 'My New Game' })
    })
    const tool = createTool(spy as unknown as (path: string, body?: unknown) => unknown)
    const out = (await tool.handler(
      { name: 'My New Game', genre: 'RPG', engine: 'unity' },
      {},
    )) as ToolResult
    expect(out.isError).toBeFalsy()
    expect(spy).toHaveBeenCalledWith('/api/v1/games', {
      name: 'My New Game',
      genre: 'RPG',
      engine: 'unity',
    })
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.game.slug).toBe('my-new-game')
    expect(parsed.ingestKey).toBe('pl_ik_deadbeef')
  })

  it('surfaces a 403 role rejection as an error tool result', async () => {
    const tool = createTool(() => {
      throw new PlayloopApiError(403, {
        error: 'Creating a game requires an admin or owner role in this workspace.',
      })
    })
    const out = (await tool.handler({ name: 'X', genre: 'Action' }, {})) as ToolResult
    expect(out.isError).toBe(true)
    const parsed = JSON.parse(out.content[0]!.text)
    expect(parsed.status).toBe(403)
  })
})
