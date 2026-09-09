/**
 * Tool: `get_tester_summary`.
 *
 * Backing route: `/api/v1/testers/{game}/{deviceId}`. Returns per-tester
 * rollup plus their session list and the persisted AI tester summary.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { TesterSummary } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerTestersTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'get_tester_summary',
    {
      title: 'Get tester summary',
      description:
        'Return the rollup for one tester (session count, first/last seen, playtime, geo, last build) plus their sessions and AI summary. Tester identity is a persistent anonymous device GUID. Returns `{ game, rollup, sessions, summary }`.',
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        device_id: z.string().min(1).describe('Persistent anonymous device GUID.'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional(),
      },
    },
    async ({ game, device_id, env }) => {
      try {
        const data = await client.get<TesterSummary>(
          `/api/v1/testers/${encodeURIComponent(game)}/${encodeURIComponent(device_id)}`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
