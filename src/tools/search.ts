/**
 * Search tool:
 *
 *   - search_everything → /api/v1/search
 *
 * Full-text search across the account's sessions, games, insights, and events.
 * Thin bearer-auth wrapper (GET, relay JSON).
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerSearchTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'search_everything',
    {
      title: 'Search everything',
      description:
        "Full-text search across your sessions, games, insights, and events (each capped, most-relevant first). Use it to resolve a fuzzy name or find 'the sessions where players mentioned X.' Returns `{ sessions, games, insights, events }`.",
      inputSchema: {
        q: z.string().min(2).describe('Search term (min 2 characters).'),
        limit: z.number().int().min(1).max(25).optional().describe('Per-type result cap (default 8, max 25).'),
      },
    },
    async ({ q, limit }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>('/api/v1/search', { q, limit }),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
