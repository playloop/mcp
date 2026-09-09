/**
 * Tester / feedback tools:
 *
 *   - suggest_fixes            → /api/v1/builds/compare/suggestions
 *   - get_fix_first            → /api/v1/games/{id}/fix-first
 *   - get_tester_journey       → /api/v1/testers/{game}/{deviceId}/journey
 *   - list_tester_archetypes   → /api/v1/testers/{game}/archetypes
 *   - list_game_feedback_forms → /api/v1/games/{id}/prompts (GET)
 *   - create_feedback_form     → /api/v1/games/{id}/prompts (POST)
 *
 * Grouped in one module because they're all thin bearer-auth wrappers
 * around the same shape (path-encode args, call, relay JSON). If any
 * one of them grows real client-side logic, split it into its own
 * file then.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

const ENV_SCHEMA = z
  .string()
  .regex(/^[a-z0-9_-]+$/)
  .optional()

export function registerSuggestFixesTool(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'suggest_fixes',
    {
      title: 'Suggest fixes',
      description:
        "AI-generated prescriptive fix suggestions for friction surfaced in one build OR the diff between two builds. Single-build mode (?build=) targets the build's top friction; compare mode (?a=&b=) targets friction that worsens or emerges between the two builds. Free tier needs a BYO key, returns `{ ok:false, requiresPremium:true }` with status 402 otherwise. Returns `{ ok, mode, game, environment, suggestions, source, emptyInput, … }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        build: z
          .string()
          .min(1)
          .optional()
          .describe('Single-build mode: which build to analyze.'),
        a: z.string().min(1).optional().describe('Compare mode: baseline build version.'),
        b: z.string().min(1).optional().describe('Compare mode: target build version.'),
        env: ENV_SCHEMA,
      },
    },
    async ({ game, build, a, b, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          '/api/v1/builds/compare/suggestions',
          { game, build, a, b, env },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}

export function registerFixFirstTool(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'get_fix_first',
    {
      title: 'What should I fix first',
      description:
        "Whole-game 'what should I fix first?' synthesis. Weighs the game's live signals ACROSS sources, crashes, drop reasons, player-feedback themes, and funnel drop-offs, into ONE prioritized, directional fix list (priority 1 = fix first). Directional, not fabricated: it recommends where to look when a signal is thin and never asserts a cause the data doesn't show. Degrades to a deterministic ranking when the workspace is out of managed-AI credits (never fails). Returns `{ ok, game, environment, fixes, source, notEnoughData, signalCount }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        env: ENV_SCHEMA,
      },
    },
    async ({ game, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/fix-first`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}

export function registerTesterJourneyTool(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'get_tester_journey',
    {
      title: 'Get tester journey',
      description:
        "Return one tester's full session-by-session timeline for a game, chronological entries (oldest first), each with the session metadata, the per-session insights, the most-severe friction summary, and the strongest praise. Includes an engagement-trend classification (`rising`/`flat`/`declining`/`insufficient_data`) reflecting how their engagement shifts across the run of sessions. The `device_id` arg accepts a tester handle OR a device id (handle tried first). Returns `{ journey }` or 404.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        device_id: z
          .string()
          .min(1)
          .describe('Tester handle (preferred) OR persistent device GUID.'),
        env: ENV_SCHEMA,
      },
    },
    async ({ game, device_id, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/testers/${encodeURIComponent(game)}/${encodeURIComponent(device_id)}/journey`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}

export function registerTesterArchetypesTool(
  server: McpServer,
  client: PlayloopClient,
): void {
  server.registerTool(
    'list_tester_archetypes',
    {
      title: 'List tester archetypes',
      description:
        "Group the game's testers into behavior archetypes based on their per-tester narrative summaries. Returns `{ archetypes, testerCount, reason?, modelId? }`. Always returns a result object, empty `archetypes` + populated `reason` (`requires_byo_key` / `insufficient_data` / `api_error`) when clustering couldn't run. Each archetype has an AI-generated label (or `Cluster N` fallback), representative testers (with summary excerpts), common friction tags, and avg session count / playtime minutes.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        env: ENV_SCHEMA,
      },
    },
    async ({ game, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/testers/${encodeURIComponent(game)}/archetypes`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}

export function registerFeedbackFormsTool(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_game_feedback_forms',
    {
      title: 'List game feedback forms',
      description:
        "List the studio-defined Player Feedback forms for a game (the multi-field forms the SDK surfaces in your game via `feedback.submit` / `feedback.open`). Each form has its field definitions (id, label, kind in `rating-1-5`/`short-text`/`yes-no`/`long-text`, required, placeholder, helpText), trigger hint, active flag, and a per-form submission count. Tester-level submission rows are NOT returned here, they live on the session and slot into `get_session`. Use this to answer 'what feedback am I collecting from my testers?' Returns `{ game, prompts }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
      },
    },
    async ({ game }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/prompts`,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'create_feedback_form',
    {
      title: 'Create feedback form',
      description:
        "Create a Player Feedback form for a game (the multi-field forms the SDK surfaces in your game via `feedback.open` / `feedback.submit`). Requires an ADMIN or OWNER role (members/viewers get 403). Give the form a title and 1-20 fields; each field needs a unique id (answers are keyed by it), a label, and a kind (`rating-1-5`, `short-text`, `yes-no`, or `long-text`), with optional required/placeholder/helpText. Optional triggerHint notes where the game should show the form; active defaults to true. Set allowRepeatSubmissions to true only for repeat voluntary notes; the default is false. Returns `{ form }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id or slug.'),
        title: z.string().min(1).max(120).describe('Form title, 1-120 chars.'),
        fields: z
          .array(
            z.object({
              id: z
                .string()
                .min(1)
                .max(40)
                .describe('Stable field id, unique within the form. Answers are keyed by it.'),
              label: z.string().min(1).max(240).describe('The question shown to the tester.'),
              kind: z
                .enum(['rating-1-5', 'short-text', 'yes-no', 'long-text'])
                .describe('Field type.'),
              required: z.boolean().optional().describe('Whether the tester must answer.'),
              placeholder: z.string().max(200).optional().describe('Input placeholder text.'),
              helpText: z.string().max(500).optional().describe('Helper text under the field.'),
            }),
          )
          .min(1)
          .max(20)
          .describe('The form fields, in display order (1-20).'),
        triggerHint: z
          .string()
          .max(100)
          .optional()
          .describe('Optional note on where the game shows this form (e.g. "end of run").'),
        active: z.boolean().optional().describe('Whether the form is live. Defaults to true.'),
        allowRepeatSubmissions: z.boolean().optional().describe('Allow repeat voluntary notes with distinct request IDs. Defaults to false.'),
      },
    },
    async (args) => {
      try {
        const { game, ...body } = args as { game: string } & Record<string, unknown>
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/prompts`,
          body,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
