/**
 * Tools: `list_games`, `get_game`, `create_game`, `set_game_cover`,
 * `update_game`.
 *
 * Backing routes: `/api/v1/games` (GET + POST), `/api/v1/games/{id}`
 * (GET + PATCH), and `/api/v1/games/{id}/cover`, see the Playloop platform
 * repo `app/api/v1/games/*` for the canonical response shapes.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { GamesListResponse, GameDetail, CreateGameResponse } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

// Mirrors the platform repo's lib/games/genres.ts GENRES + actions.ts engines.
const GENRES = [
  'Action',
  'Adventure',
  'Casual',
  'Indie',
  'Massively Multiplayer',
  'Racing',
  'RPG',
  'Simulation',
  'Sports',
  'Strategy',
] as const
const ENGINES = ['unity', 'unreal', 'godot', 'gamemaker', 'other'] as const

export function registerGamesTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_games',
    {
      title: 'List games',
      description:
        'List every game owned by the management-key holder. Read-only. Optional `q` (name/slug substring), `sort`, `order`. Returns `{ games: Game[] }`.',
      inputSchema: {
        q: z.string().min(1).max(200).optional().describe('Case-insensitive substring match on name / slug.'),
        sort: z.enum(['name', 'createdAt']).optional().describe('Sort field. Default createdAt.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
      },
    },
    async (args) => {
      try {
        const data = await client.get<GamesListResponse>(
          '/api/v1/games',
          args as Record<string, string | number | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_game',
    {
      title: 'Get game',
      description:
        "Return one game (by id OR slug) plus session, build, and tester counts. Returns `{ game, counts: { sessionCount, buildCount, testerCount } }`. 404s when the game doesn't exist or belongs to another user.",
      inputSchema: {
        game_id: z
          .string()
          .min(1)
          .describe(
            'Game id, slug, OR exact display name. The route accepts any, slugs are usually more convenient for agents; the exact name is a fallback when only the human name is known.',
          ),
      },
    },
    async ({ game_id }) => {
      try {
        const data = await client.get<GameDetail>(`/api/v1/games/${encodeURIComponent(game_id)}`)
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'create_game',
    {
      title: 'Create game',
      description:
        "Create a new game in the active workspace. Requires an ADMIN or OWNER role (members/viewers get 403). Returns 201 `{ game, ingestKey }`, `ingestKey` is the show-once write-only telemetry key to embed in the SDK (also visible later on the game's Connections page). The URL slug is derived from the name automatically.",
      inputSchema: {
        name: z.string().min(1).max(100).describe('Display name. The slug is derived from this.'),
        genre: z.enum(GENRES).describe(`Primary genre, one of: ${GENRES.join(', ')}.`),
        engine: z.enum(ENGINES).optional().describe('Game engine, if known.'),
        description: z.string().max(2000).optional().describe('Short description of the game.'),
        subgenres: z.array(z.string()).max(20).optional().describe('Optional secondary genres.'),
      },
    },
    async (args) => {
      try {
        const data = await client.post<CreateGameResponse>('/api/v1/games', args)
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'set_game_cover',
    {
      title: 'Set game cover',
      description:
        "Set (or replace) a game's cover image. Requires an ADMIN or OWNER role (members/viewers get 403). Send the raw image bytes base64-encoded (no data: URL prefix), PNG, JPEG, or WebP, 3 MB max before encoding; the declared contentType must match the actual bytes (415 otherwise). Replaces any existing cover. Returns `{ game, coverUrl }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id or slug.'),
        imageBase64: z
          .string()
          .min(1)
          .describe('The image bytes, base64-encoded (no data: URL prefix).'),
        contentType: z
          .enum(['image/png', 'image/jpeg', 'image/webp'])
          .describe('MIME type matching the image bytes.'),
      },
    },
    async (args) => {
      try {
        const { game, ...body } = args as {
          game: string
          imageBase64: string
          contentType: string
        }
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/cover`,
          body,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'update_game',
    {
      title: 'Update game settings',
      description:
        "Update a game's AI/analysis configuration: name, description, genre, subgenres, the AI context prompt, KPI buckets, analysis-tuning knobs, the auto-analyze and feedback-themes toggles, and the heartbeat/summary event names. Partial update: only the fields you send change, and null clears a clearable field. Requires an ADMIN or OWNER role (members/viewers get 403). Slug and engine are fixed at creation. Returns `{ game }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id or slug.'),
        name: z.string().min(1).max(120).optional().describe('Display name, 1-120 chars.'),
        description: z
          .string()
          .max(2000)
          .nullable()
          .optional()
          .describe('Short description, up to 2000 chars. null clears it.'),
        genre: z.enum(GENRES).nullable().optional().describe('Primary genre. null clears it.'),
        subgenres: z
          .array(z.string())
          .nullable()
          .optional()
          .describe('Secondary genres. null clears the list.'),
        aiContext: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Studio-authored context the analyzer weighs when reading this game's sessions. Length is plan-capped server-side. null clears it.",
          ),
        heartbeatEventName: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .describe('Custom heartbeat event name. null restores the default.'),
        summaryEventName: z
          .string()
          .max(200)
          .nullable()
          .optional()
          .describe('Custom run-summary event name. null restores the default.'),
        kpis: z
          .object({
            primary: z.array(z.string()).describe('Primary KPI event names.'),
            secondary: z.array(z.string()).describe('Secondary KPI event names.'),
            ignore: z.array(z.string()).describe('Event names the analysis should ignore.'),
          })
          .nullable()
          .optional()
          .describe('KPI event buckets. null clears them.'),
        analysisTuning: z
          .object({
            profile: z.enum(['executive', 'balanced', 'investigative']).optional(),
            verbosity: z.enum(['executive', 'standard', 'detailed']).optional(),
            recommendations: z.enum(['off', 'light', 'full']).optional(),
            strictness: z.enum(['conservative', 'standard', 'exploratory']).optional(),
            tone: z.enum(['narrative', 'analyst']).optional(),
            segmentMinSessions: z.number().int().optional(),
            segmentSpreadFloorPp: z.number().int().optional(),
            cliffDropFloorPp: z.number().int().optional(),
            cliffPredFreqCeiling: z.number().optional(),
            cliffConditionalFloor: z.number().optional(),
            maxFindings: z.number().int().optional(),
          })
          .nullable()
          .optional()
          .describe(
            'Analysis-tuning knobs; out-of-range numbers are clamped server-side. null resets to defaults.',
          ),
        autoAnalyzeEnabled: z.boolean().optional().describe('Auto-analyze new sessions.'),
        feedbackThemesEnabled: z.boolean().optional().describe('Feedback-themes rollups.'),
      },
    },
    async (args) => {
      try {
        const { game, ...body } = args as { game: string } & Record<string, unknown>
        const data = await client.patch<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}`,
          body,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
