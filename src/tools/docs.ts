/**
 * Docs search tool:
 *
 *   - search_docs → /api/v1/docs/search
 *
 * Semantic search over the Playloop documentation (how to use the platform).
 * Thin bearer-auth wrapper (GET, relay JSON) over the shared docs knowledge
 * base. Returns the top-k most relevant passages with their source, for
 * grounding answers about how Playloop works. Read-only. Client-side typing
 * stays loose (`Record<string, unknown>`), same convention as the other tools.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerDocsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'search_docs',
    {
      title: 'Search Playloop docs',
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
}
