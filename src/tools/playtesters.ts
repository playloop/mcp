/**
 * Tools: playtester-distribution surface.
 *
 *   - list_playtest_batches  → /api/v1/batches/{game}
 *   - get_playtest_batch     → /api/v1/batches/{game}/{batchId}
 *   - list_playtest_keys     → /api/v1/batches/{game}/{batchId}/keys
 *   - list_tester_invites    → /api/v1/batches/{game}/{batchId}/invites
 *
 * Read-only by design. The Playloop API DOES support mutations on this
 * surface (mint a batch, generate keys, send invites, revoke a key),
 * but those flows live in the dashboard for now, they require
 * confirmation UI, Stripe-plan gating, and Resend email side-effects
 * that we don't want an agent to trigger autonomously without a user
 * in the loop.
 *
 * Sensitive material is stripped server-side on every endpoint:
 *   - key cleartext + ciphertext + fingerprint never leave the server
 *   - per-invite redemption token never leaves the server
 *   - tester IP at redemption never leaves the server (country is the
 *     coarsest geo allowed; it's already shown in the dashboard's
 *     distinct-country sharing signal)
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type {
  PlaytestBatchListResponse,
  PlaytestBatchDetailResponse,
  PlaytestKeysResponse,
  TesterInvitesResponse,
  PlaytestHandlesResponse,
} from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerPlaytestersTools(
  server: McpServer,
  client: PlayloopClient,
): void {
  server.registerTool(
    'list_playtest_batches',
    {
      title: 'List playtest batches',
      description:
        'List every playtest batch for a game, name, distribution target (Steam / itch / Keymailer / etc.), fulfillment source, redemption mode (invite or public share link), identity mode, and rollup counts (key_count / redeemed_count / revoked_count). Useful for answering "how is my Steam Next Fest distribution going?" Returns `{ game, batches: PlaytestBatch[] }`.',
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        sort: z
          .enum(['created_at', 'name', 'key_count', 'redeemed_count'])
          .optional()
          .describe('Sort field. Default created_at.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
      },
    },
    async ({ game, ...query }) => {
      try {
        const data = await client.get<PlaytestBatchListResponse>(
          `/api/v1/batches/${encodeURIComponent(game)}`,
          query as Record<string, string | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_playtest_batch',
    {
      title: 'Get playtest batch',
      description:
        'Detail for one playtest batch. Same fields as `list_playtest_batches` plus the full `instructions` Markdown (the redemption-page copy the studio wrote, can be long). No key cleartext / ciphertext under any circumstances. Returns `{ game, batch: PlaytestBatch }`.',
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        batch_id: z.string().min(1).describe('Playtest batch id.'),
      },
    },
    async ({ game, batch_id }) => {
      try {
        const data = await client.get<PlaytestBatchDetailResponse>(
          `/api/v1/batches/${encodeURIComponent(game)}/${encodeURIComponent(batch_id)}`,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'list_playtest_keys',
    {
      title: 'List playtest keys',
      description:
        "List keys in a batch with lifecycle + redemption metadata: status (`available` / `reserved` / `redeemed` / `revoked` / `expired`), when it was redeemed, by which email + handle, from which country (ISO-3166 alpha-2), with which user-agent, and the linked invite id if any. Use this to answer 'who redeemed what, when, and from where' without ever holding a cleartext key. Paginated, returns `{ batch, keys: PlaytestKey[], hasMore, total }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        batch_id: z.string().min(1).describe('Playtest batch id.'),
        sort: z.enum(['created_at', 'redeemed_at', 'status']).optional().describe('Sort field. Default created_at.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 20, max 100.'),
        offset: z.number().int().nonnegative().optional().describe('Default 0.'),
      },
    },
    async ({ game, batch_id, ...query }) => {
      try {
        const data = await client.get<PlaytestKeysResponse>(
          `/api/v1/batches/${encodeURIComponent(game)}/${encodeURIComponent(batch_id)}/keys`,
          query as Record<string, string | number | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'list_tester_invites',
    {
      title: 'List tester invites',
      description:
        "List every 1:1 invite in a batch, recipient email, optional personal note, and the send / opened / redeemed timestamps. `opened_at` is a best-effort email-tracking beacon and may be null even when the recipient did open (many email clients block beacons); `redeemed_at` is the definitive 'did they actually use the link' signal. The per-tester redemption token is NEVER returned. Returns `{ batch, invites: TesterInvite[] }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        batch_id: z.string().min(1).describe('Playtest batch id.'),
        sort: z
          .enum(['sent_at', 'redeemed_at'])
          .optional()
          .describe('Sort field. Default sent_at.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
      },
    },
    async ({ game, batch_id, ...query }) => {
      try {
        const data = await client.get<TesterInvitesResponse>(
          `/api/v1/batches/${encodeURIComponent(game)}/${encodeURIComponent(batch_id)}/invites`,
          query as Record<string, string | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'list_playtest_handles',
    {
      title: 'List playtest handles',
      description:
        "List SDK-linked tester handles for a game with rollup metrics: session_count, total_play_time_ms, last_seen_at, distinct_countries (a wide spread can indicate a shared key). Defaults to last_seen_at desc, recently-active testers first; sort by session_count or total_play_time_ms to find your most-engaged testers. The one-shot claim token is NEVER returned. Paginated, returns `{ game, handles: PlaytestHandle[], hasMore, total }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        sort: z
          .enum(['last_seen_at', 'session_count', 'total_play_time_ms', 'created_at'])
          .optional()
          .describe('Sort field. Default last_seen_at.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 20, max 100.'),
        offset: z.number().int().nonnegative().optional().describe('Default 0.'),
      },
    },
    async ({ game, ...query }) => {
      try {
        const data = await client.get<PlaytestHandlesResponse>(
          `/api/v1/handles/${encodeURIComponent(game)}`,
          query as Record<string, string | number | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
