/**
 * Tool: `get_heatmap`.
 *
 * Backing route: `/api/v1/heatmaps/{game}`. Per-room density grids built
 * from `player_pos` telemetry events. Capped at top-12 rooms by event
 * volume on the API side.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { HeatmapResponse } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerHeatmapsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'get_heatmap',
    {
      title: 'Get heatmap',
      description:
        "Return per-room player-position density grids for a game, built from `player_pos` telemetry events. Returns `{ game, rooms: [{ room, width, height, grid, eventCount }], eventCount }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        build: z.string().min(1).optional().describe('Optional build filter (matches `metadata.gameVersion`).'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional(),
      },
    },
    async ({ game, build, env }) => {
      try {
        const data = await client.get<HeatmapResponse>(
          `/api/v1/heatmaps/${encodeURIComponent(game)}`,
          { build, env },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
