/**
 * Game-level analytics read tools, the "state of my game" surface:
 *
 *   - get_game_summary       → /api/v1/games/{id}/summary
 *   - get_feedback_themes    → /api/v1/games/{id}/feedback-themes
 *   - get_retention          → /api/v1/games/{id}/retention
 *   - get_live_activity      → /api/v1/games/{id}/live
 *   - get_activity           → /api/v1/games/{id}/activity
 *   - get_activity_digest    → /api/v1/games/{id}/activity/digest
 *   - get_metric_trend       → /api/v1/games/{id}/metric-trend
 *   - get_platform_breakdown → /api/v1/games/{id}/breakdown
 *
 * Thin bearer-auth wrappers (path-encode the game, GET, relay JSON). Loose
 * client-side typing, the agent reads field names.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

const ENV = z.string().regex(/^[a-z0-9_-]+$/).optional().describe('Environment scope.')

export function registerGameAnalyticsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'get_usage',
    {
      title: 'Get account usage',
      description:
        "Your account's own usage + plan state (scoped to your management key's workspace): current plan, your managed-AI CREDIT balance (total, included vs purchased, spent this month, a low-balance flag, and when the monthly allowance resets), and storage bytes used. Answers 'how many credits do I have left / am I running low / how much storage am I using?' Returns `{ plan, credits, storage }` (`credits` is null for unlimited accounts).",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonContent(await client.get<Record<string, unknown>>('/api/v1/usage'))
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_feedback_themes',
    {
      title: 'Get feedback themes',
      description:
        "The recurring THEMES clustered from players' written feedback for a game, e.g. 'N testers said the tutorial is confusing'. Each theme carries a distinct-tester count, sentiment, and a short example, plus the count of one-off responses that didn't cohere. Reads the stored rollup only (never triggers AI). Returns `{ game, feedbackThemes }` (feedbackThemes is null if none generated).",
      inputSchema: { game: z.string().min(1).describe('Game id, slug, or exact name.') },
    },
    async ({ game }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/feedback-themes`,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_game_summary',
    {
      title: 'Get game summary',
      description:
        "Return the persisted whole-game AI rollup summary, the 'state of my game in a paragraph.' Reads the stored summary only (null if none generated yet). Returns `{ game, summary }`.",
      inputSchema: { game: z.string().min(1).describe('Game id, slug, or exact name.'), env: ENV },
    },
    async ({ game, env }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/summary`,
            env ? { env } : undefined,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_retention',
    {
      title: 'Get retention',
      description:
        "Cohort-eligible retention (D1/D2/D7/D30) for a game, optionally scoped to one build. Each window is `{ eligible, retained, rate }` (a device is eligible for D-N once its first session is ≥N days old; retained if it returned on/after day N). Call twice with `build` to answer 'did 1.5 improve retention vs 1.4?' Returns `{ game, build, devices, retention }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        build: z.string().min(1).optional().describe('Scope retention to one build version.'),
        env: ENV,
      },
    },
    async ({ game, ...query }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/retention`,
            query as Record<string, string | undefined>,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_live_activity',
    {
      title: 'Get live activity',
      description:
        "A real-time snapshot: how many players are online right now (heartbeat in the last ~2 min) plus the most recent live events (joins / leaves / crashes / feedback / notable events). Answers 'is anyone playing right now?' A poll snapshot, not a stream. Returns `{ game, online, recentEvents }`.",
      inputSchema: { game: z.string().min(1).describe('Game id, slug, or exact name.'), env: ENV },
    },
    async ({ game, env }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/live`,
            env ? { env } : undefined,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_activity',
    {
      title: 'Get activity',
      description:
        "Volume over a window: players + sessions in the last N days vs the prior N days (for a trend), plus peak concurrency and who's online now. Answers 'how many people played this week / are my numbers growing?' Returns `{ game, windowDays, onlineNow, peakConcurrent, current, previous }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        days: z.number().int().min(1).max(90).optional().describe('Window length in days (default 7).'),
        env: ENV,
      },
    },
    async ({ game, ...query }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/activity`,
            query as Record<string, string | number | undefined>,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_activity_digest',
    {
      title: 'Get activity digest',
      description:
        "The one-call 'what happened today / yesterday / this week' digest for a game: sessions in the window, total + median playtime (answers 'how long did they play?'), new vs returning testers, new crashes (count + the top signature), new feedback (count + how many need attention), the most notable insights, and the top drop reason. Prefer this over stitching several tools for 'what happened <period>?' / 'how long did they play <period>?' questions. Pass `window` ('today' | 'yesterday' | 'week', UTC days; default today) or an explicit `from_ms`/`to_ms`. Returns `{ game, window, sessions, playtime: { totalSec, medianSec }, testers, crashes, feedback, notableInsights, topDropReason }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        window: z
          .enum(['today', 'yesterday', 'week'])
          .optional()
          .describe('Preset window (UTC days). Default today. Ignored when from_ms is set.'),
        from_ms: z.number().int().min(0).optional().describe('Window start, epoch ms (overrides the preset).'),
        to_ms: z.number().int().min(0).optional().describe('Window end (exclusive), epoch ms. Defaults to now when from_ms is set.'),
        env: ENV,
      },
    },
    async ({ game, window, from_ms, to_ms, env }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/activity/digest`,
            { window, from: from_ms, to: to_ms, env },
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_metric_trend',
    {
      title: 'Get metric trend (crash + drop rate)',
      description:
        "Have crashes or drop-offs CHANGED? Crash rate (crashes / sessions) and drop rate (sessions where the player quit without finishing / sessions) for the last N days vs the immediately-prior equal window, with percentage-point deltas. Answers 'is my game crashing more this week?' / 'are more players dropping out?' Rates are null for an empty window and deltas null without a baseline. Returns `{ game, windowDays, current, previous, deltas }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        days: z.number().int().min(1).max(90).optional().describe('Window length in days (default 7).'),
        env: ENV,
      },
    },
    async ({ game, ...query }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/metric-trend`,
            query as Record<string, string | number | undefined>,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_platform_breakdown',
    {
      title: 'Get platform / segment breakdown',
      description:
        "Segment a game's sessions by country and by source (SDK/engine), each with session + distinct-device counts, biggest first. Answers 'where are my players from?' and 'what engine are my sessions coming from?' Returns `{ game, totalSessions, byCountry, bySource }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        build: z.string().min(1).optional().describe('Restrict to one build version.'),
        env: ENV,
      },
    },
    async ({ game, ...query }) => {
      try {
        return jsonContent(
          await client.get<Record<string, unknown>>(
            `/api/v1/games/${encodeURIComponent(game)}/breakdown`,
            query as Record<string, string | undefined>,
          ),
        )
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
