/**
 * Crash read tools:
 *
 *   - list_crashes → /api/v1/games/{id}/crashes/unresolved
 *
 * Thin bearer-auth wrapper (path-encode args, GET, relay JSON) over the
 * unresolved-crash query surface. Management-key scope only, crash bodies
 * carry stack frames + source filenames, so an ingest key can't read them.
 * Client-side typing stays loose (`Record<string, unknown>`) because the
 * agent reads field names, not enforced types.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerCrashesTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_crashes',
    {
      title: 'List unresolved crashes',
      description:
        "List the unresolved crash groups for a game so you can answer 'what's crashing in my game?' Each group is one crash signature with its occurrence count, first/last seen, affected build versions, and platform. Optionally narrow by platform prefix or a from_ms/to_ms report-time window ('crashes today'). Returns `{ crashes }` (newest / most-frequent first, capped at 200).",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        platform: z
          .string()
          .min(1)
          .optional()
          .describe('Case-insensitive platform prefix filter (e.g. "Windows", "Android").'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Max crash groups to return. Default 100, capped at 200.'),
        from_ms: z.number().int().min(0).optional().describe('Only crashes reported at/after this epoch ms.'),
        to_ms: z.number().int().min(0).optional().describe('Only crashes reported before this epoch ms (defaults to now when from_ms is set).'),
      },
    },
    async ({ game, from_ms, to_ms, ...query }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/crashes/unresolved`,
          { ...(query as Record<string, string | number | undefined>), from: from_ms, to: to_ms },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_crash_groups',
    {
      title: 'Get crash groups',
      description:
        "Crashes GROUPED by signature, one row per distinct crash with its occurrence count, affected-session count, first/last seen, affected build versions, and latest message/stack. Answers 'what's the most common crash and how many people hit it?' (the aggregated view; `list_crashes` is the flat unresolved list). Optionally scope to one build. Returns `{ game, groups }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        build: z.string().min(1).optional().describe('Restrict to one build version.'),
      },
    },
    async ({ game, build }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/crashes/groups`,
          build ? { build } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
