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

export function registerDocsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'search_docs',
    {
      title: 'Search Playloop docs',
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        'Semantic search over the Playloop documentation (how to use the platform, SDKs, dashboard, billing, connections, security). Returns the top-k most relevant passages with their source, for grounding answers about how Playloop works. Read-only. Returns `{ results }`.',
      inputSchema: {
        q: z
          .string()
          .min(1)
          .max(1000)
          .describe('The question or topic to search the docs for.'),
        k: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('How many passages to return. Default 5, max 10.'),
      },
    },
    async (args) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          '/api/v1/docs/search',
          args as Record<string, string | number | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'search_guides',
    {
      title: 'Search Playloop guides',
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      description:
        "Answer 'how do I...' questions from Playloop's public how-to guides and SDK READMEs (wiring the SDK, tracking events, running experiments, reading playtests). Never returns your game data, pricing, or legal pages. Read-only. Returns `{ results }`, each with its source, title, url, and passage.",
      inputSchema: {
        q: z
          .string()
          .min(1)
          .max(1000)
          .describe('The question, for example "how do I track player deaths?".'),
        k: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('How many passages to return. Default 5, max 10.'),
      },
    },
    async (args) => {
      try {
        const data = await client.get<Record<string, unknown>>('/api/v1/docs/search', {
          ...(args as Record<string, string | number | undefined>),
          scope: 'guides',
        })
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
