/**
 * Docs search tools:
 *
 *   - search_docs   → /api/v1/docs/search
 *   - search_guides → /api/v1/docs/search?scope=guides
 *
 * Semantic search over the Playloop documentation (how to use the platform).
 * Thin bearer-auth wrapper (GET, relay JSON) over the shared docs knowledge
 * base. Returns the top-k most relevant passages with their source, for
 * grounding answers about how Playloop works. `search_guides` narrows the same
 * search to the public how-to guides and SDK READMEs and always sends the
 * scope itself, so a caller cannot widen it. Read-only. Client-side typing
 * stays loose (`Record<string, unknown>`), same convention as the other tools.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent, READ_ONLY_TOOL_ANNOTATIONS } from './_shared.js'

/** The shared `{ q, k }` input of the two docs-search tools. */
function docsSearchInput(qDescription: string) {
  return {
    q: z.string().min(1).max(1000).describe(qDescription),
    k: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('How many passages to return. Default 5, max 10.'),
  }
}

/**
 * A forced `scope` is written after the caller's args, so a caller can never
 * override it. The guides tool also sends its documented default `k` itself,
 * because the API reads a missing `k` as 1.
 */
function docsSearchHandler(client: PlayloopClient, forced?: { scope: 'guides'; defaultK: number }) {
  return async (args: Record<string, unknown>) => {
    try {
      const data = await client.get<Record<string, unknown>>('/api/v1/docs/search', {
        ...(forced ? { k: forced.defaultK } : {}),
        ...(args as Record<string, string | number | undefined>),
        ...(forced ? { scope: forced.scope } : {}),
      })
      return jsonContent(data)
    } catch (err) {
      return errorContent(err)
    }
  }
}

export function registerDocsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'search_docs',
    {
      title: 'Search Playloop docs',
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        'Semantic search over the Playloop documentation (how to use the platform, SDKs, dashboard, billing, connections, security). Returns the top-k most relevant passages with their source, for grounding answers about how Playloop works. Read-only. Returns `{ results }`.',
      inputSchema: docsSearchInput('The question or topic to search the docs for.'),
    },
    docsSearchHandler(client),
  )

  server.registerTool(
    'search_guides',
    {
      title: 'Search Playloop guides',
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Answer 'how do I...' questions from Playloop's public how-to guides and SDK READMEs (wiring the SDK, tracking events, running experiments, reading playtests). Never returns your game data; the pricing and legal pages stay out. Read-only. Returns `{ results }`, each with its source, title, url, and passage.",
      inputSchema: docsSearchInput('The question, for example "how do I track player deaths?".'),
    },
    docsSearchHandler(client, { scope: 'guides', defaultK: 5 }),
  )
}
