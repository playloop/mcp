/**
 * Every tool declares readOnlyHint, destructiveHint, idempotentHint and
 * openWorldHint explicitly, and the classification matches what each tool does.
 * Tools are listed over the real MCP protocol, so this checks what a client
 * actually receives.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createPlayloopMcpServer, MCP_WRITE_TOOLS } from '../src/server.js'

/**
 * Tools outside `MCP_WRITE_TOOLS` that still are not read-only.
 * - file_feature_request: records feedback for the Playloop team.
 * - suggest_fixes, get_fix_first: can generate fresh AI analysis, which can
 *   use the workspace's AI credits.
 */
const NON_WRITE_SIDE_EFFECT_TOOLS = ['file_feature_request', 'suggest_fixes', 'get_fix_first']

/** Tools that replace or clear data the user cannot restore through Playloop. */
const DESTRUCTIVE_TOOLS = ['set_game_cover', 'update_game']

/** Non-read tools where a repeat call with the same arguments changes nothing further. */
const IDEMPOTENT_WRITE_TOOLS = [
  'update_game',
  'start_experiment',
  'stop_experiment',
  'pick_experiment_winner',
  'pin_experiment_variant',
  'unpin_experiment_variant',
]

type ListedTool = {
  name: string
  annotations?: {
    readOnlyHint?: unknown
    destructiveHint?: unknown
    idempotentHint?: unknown
    openWorldHint?: unknown
  }
}

async function listTools(readOnly = false): Promise<ListedTool[]> {
  const server = createPlayloopMcpServer({
    apiKey: 'test',
    baseUrl: 'https://example.test',
    fetchImpl: async () => new Response('{}', { status: 200 }),
    readOnly,
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'annotations-test', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const { tools } = await client.listTools()
    return tools as ListedTool[]
  } finally {
    await client.close()
    await server.close()
  }
}

const names = (tools: ListedTool[], pick: (t: ListedTool) => boolean) =>
  tools.filter(pick).map((t) => t.name).sort()

describe('tool annotations', () => {
  it('every listed tool declares all four hints as booleans', async () => {
    const tools = await listTools()
    expect(tools.length).toBeGreaterThan(40)
    for (const tool of tools) {
      const a = tool.annotations
      expect(a, `${tool.name} has no annotations`).toBeDefined()
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect(typeof a?.[hint], `${tool.name}.${hint} must be an explicit boolean`).toBe('boolean')
      }
    }
  })

  it('the non-read-only set is exactly MCP_WRITE_TOOLS plus the named side-effect tools', async () => {
    const tools = await listTools()
    expect(names(tools, (t) => t.annotations?.readOnlyHint === false)).toEqual(
      [...MCP_WRITE_TOOLS, ...NON_WRITE_SIDE_EFFECT_TOOLS].sort(),
    )
  })

  it('only the tools that lose unrecoverable data are destructive', async () => {
    const tools = await listTools()
    expect(names(tools, (t) => t.annotations?.destructiveHint === true)).toEqual(
      [...DESTRUCTIVE_TOOLS].sort(),
    )
  })

  it('reads are idempotent; among the rest only the named updates are', async () => {
    const tools = await listTools()
    for (const tool of tools.filter((t) => t.annotations?.readOnlyHint === true)) {
      expect(tool.annotations?.idempotentHint, `${tool.name} is a read`).toBe(true)
    }
    expect(
      names(tools, (t) => t.annotations?.readOnlyHint === false && t.annotations?.idempotentHint === true),
    ).toEqual([...IDEMPOTENT_WRITE_TOOLS].sort())
  })

  it('no tool reaches outside Playloop', async () => {
    const tools = await listTools()
    expect(names(tools, (t) => t.annotations?.openWorldHint !== false)).toEqual([])
  })

  it('a read-only connection advertises the same annotations as a full one', async () => {
    const byName = (tools: ListedTool[]) =>
      Object.fromEntries(tools.map((t) => [t.name, t.annotations]))
    expect(byName(await listTools(true))).toEqual(byName(await listTools(false)))
  })
})
