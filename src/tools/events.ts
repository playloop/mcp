/**
 * Tool: `get_event_stats`.
 *
 * Backing route: `/api/v1/events/{game}`. Event-name occurrence aggregates
 * across sessions in scope. The `top` list is capped at 50 entries on the
 * API side, so this is safe to call without pagination.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { EventStatsResponse } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerEventsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'get_event_stats',
    {
      title: 'Get event stats',
      description:
        "Sum event-name occurrences across sessions for a game. Returns `{ game, sessionCount, total, byName, top }` where `top` is `[name, count][]` sorted desc (capped at 50).",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        build: z.string().min(1).optional(),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional(),
        from: z.number().int().nonnegative().optional().describe('unix ms, recordedAt >= from.'),
        to: z.number().int().nonnegative().optional().describe('unix ms, recordedAt <= to.'),
      },
    },
    async ({ game, build, env, from, to }) => {
      try {
        const data = await client.get<EventStatsResponse>(
          `/api/v1/events/${encodeURIComponent(game)}`,
          { build, env, from, to },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
