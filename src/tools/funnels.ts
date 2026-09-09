/**
 * Funnel read tools:
 *
 *   - list_game_funnels → /api/v1/games/{id}/funnels            (definitions)
 *   - get_funnel_result → /api/v1/games/{id}/funnels/{id}/result (computed numbers)
 *   - get_funnel_trend  → /api/v1/games/{id}/funnels/{id}/trend  (this window vs prior + deltas)
 *
 * Thin bearer-auth wrappers (path-encode args, GET, relay JSON). Client-side
 * typing stays loose (`Record<string, unknown>`), same convention as the
 * experiments / tester tools.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

const FUNNEL_STEP = z.object({
  id: z.string().min(1).max(64).describe('Stable step id, unique within the funnel.'),
  label: z.string().min(1).max(80).describe('Human label shown on the funnel chart.'),
  eventName: z
    .string()
    .min(1)
    .max(200)
    .regex(/^\S+$/)
    .describe('Telemetry event name the step matches (no whitespace).'),
  propertyFilter: z
    .object({
      clauses: z
        .array(
          z.object({
            path: z.string().min(1).max(200).describe('Event-property path, e.g. "level" or "meta.zone".'),
            op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']),
            value: z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.union([z.string(), z.number()])),
            ]),
          }),
        )
        .min(1)
        .max(8),
    })
    .optional()
    .describe('Optional per-step event-property filter (all clauses must match).'),
})

export function registerFunnelsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_game_funnels',
    {
      title: 'List game funnels',
      description:
        "List the conversion funnels defined for a game (default most-recently-updated first). Each funnel carries its ordered `steps` (`{ id, label, eventName, propertyFilter? }[]`), the `mode` (`ordered` = steps must fire in sequence / `any-order` = set membership), the `scopeMode` (`events` / `players`), an optional `conversionWindowMs`, the pinned `audienceId` (or null), and `definitionRev` (its current revision). These are the funnel DEFINITIONS, the computed step-by-step conversion numbers are time-scoped and live on the dashboard, not here. Use this to answer 'what funnels are set up for this game?' Returns `{ game, funnels }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        sort: z.enum(['createdAt', 'updatedAt', 'name']).optional().describe('Sort field. Default updatedAt.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
      },
    },
    async ({ game, ...query }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/funnels`,
          query as Record<string, string | number | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_funnel_result',
    {
      title: 'Get funnel result',
      description:
        "The COMPUTED result for one funnel, per-step reach + step-to-step conversion + the biggest drop-off. This is the payoff `list_game_funnels` doesn't give (that returns only definitions). Answers 'where's the drop-off in my funnel?' Optionally scope by build, a time window, or an environment. Returns the funnel result object (steps with reach/conversion + the drop step).",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        funnel_id: z.string().min(1).describe('Funnel id (from list_game_funnels).'),
        build: z.string().min(1).optional().describe('Restrict to one build version.'),
        from_ms: z.number().int().optional().describe('Window start (unix ms).'),
        to_ms: z.number().int().optional().describe('Window end (unix ms).'),
        env: z
          .string()
          .regex(/^[a-z0-9_-]+$/)
          .optional()
          .describe("Restrict to one environment slug (e.g. 'production'); omit for all environments."),
      },
    },
    async ({ game, funnel_id, build, from_ms, to_ms, env }) => {
      try {
        const query: Record<string, string | number | undefined> = { build, fromMs: from_ms, toMs: to_ms, env }
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/funnels/${encodeURIComponent(funnel_id)}/result`,
          query,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_funnel_trend',
    {
      title: 'Get funnel trend',
      description:
        "Has the funnel CHANGED? Runs the funnel for the last N days AND the immediately-prior equal window, returning both windows' per-step results plus deltas, percentage-point change per step and the overall completion change. Answers 'did this week's build move the funnel?' `deltas` is null when either window has no players (no baseline). Returns `{ funnel, windowDays, scope, current, previous, deltas }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        funnel_id: z.string().min(1).describe('Funnel id (from list_game_funnels).'),
        days: z.number().int().min(1).max(90).optional().describe('Window length in days. Default 7.'),
        build: z.string().min(1).optional().describe('Restrict to one build version.'),
        env: z
          .string()
          .regex(/^[a-z0-9_-]+$/)
          .optional()
          .describe("Restrict to one environment slug (e.g. 'production'); omit for all environments."),
      },
    },
    async ({ game, funnel_id, days, build, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/funnels/${encodeURIComponent(funnel_id)}/trend`,
          { days, build, env },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'create_funnel',
    {
      title: 'Create funnel',
      description:
        "Create a conversion funnel for a game. Requires a member, admin, or owner role (viewers get 403). Define 2\u201320 ordered `steps` (each matching one telemetry event, optionally property-filtered), pick the `mode` (`ordered` = steps must fire in sequence, default / `any-order` = set membership) and `scopeMode` (`events` counts event flows, default / `players` counts unique players). Results compute from the game's EXISTING telemetry \u2014 no SDK change needed. Fetch the numbers afterwards with `get_funnel_result`. Returns 201 `{ funnel }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        name: z.string().min(1).max(120).describe('Funnel name.'),
        description: z.string().max(2000).optional().describe('What this funnel tracks.'),
        steps: z
          .array(FUNNEL_STEP)
          .min(2)
          .max(20)
          .describe('2\u201320 ordered steps: `{ id, label, eventName, propertyFilter? }[]`.'),
        mode: z
          .enum(['ordered', 'any-order'])
          .optional()
          .describe('Step-matching mode. Default ordered.'),
        scopeMode: z
          .enum(['events', 'players'])
          .optional()
          .describe('Count event flows or unique players. Default events.'),
        conversionWindowMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Optional max time (ms) from first to last step to count as converted.'),
        audienceId: z
          .string()
          .optional()
          .describe('Optional audience id to pin the funnel to (omit = everyone).'),
      },
    },
    async (args) => {
      const { game, ...body } = args as { game: string } & Record<string, unknown>
      try {
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/funnels`,
          body,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
