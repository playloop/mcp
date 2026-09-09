/**
 * Tools: `list_sessions`, `get_session`.
 *
 * Backing routes: `/api/v1/sessions` (paginated) and `/api/v1/sessions/{id}`.
 * The list endpoint accepts a wide filter set, we mirror that here so the
 * agent doesn't have to fetch and filter locally.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { PaginatedSessions, SessionDetailResponse } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

const SESSION_STATUSES = ['pending', 'transcribing', 'processing', 'analyzed', 'failed'] as const
const SESSION_SOURCES = [
  'manual',
  'discord',
  'unity-telemetry',
  'unreal-telemetry',
  'godot-telemetry',
  'python-telemetry',
  'typescript-telemetry',
  'unknown-telemetry',
  'obs',
] as const

export function registerSessionsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_sessions',
    {
      title: 'List sessions',
      description:
        'Paginated playtest sessions across the user\'s games. All filters optional. Returns `{ items, hasMore, total }`.',
      inputSchema: {
        game: z.string().min(1).max(120).optional().describe('Game id, slug, or exact name, limit to one game.'),
        build: z.string().min(1).max(120).optional().describe('Match `metadata.gameVersion`, limit to one build.'),
        env: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9_-]+$/)
          .optional()
          .describe('Environment slug, lowercase, [a-z0-9_-].'),
        status: z.enum(SESSION_STATUSES).optional(),
        source: z.enum(SESSION_SOURCES).optional(),
        q: z.string().min(1).max(200).optional().describe('Substring match against title, testerHandle, or transcript (case-insensitive).'),
        from: z.number().int().nonnegative().optional().describe('unix ms, recordedAt >= from.'),
        to: z.number().int().nonnegative().optional().describe('unix ms, recordedAt <= to.'),
        sort: z.enum(['recordedAt', 'title']).optional().describe('Sort field. Default recordedAt.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 20, max 100.'),
        offset: z.number().int().nonnegative().optional().describe('Default 0.'),
      },
    },
    async (args) => {
      try {
        const data = await client.get<PaginatedSessions>('/api/v1/sessions', args as Record<string, string | number | undefined>)
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_session',
    {
      title: 'Get session',
      description:
        'Return one session with all its insights joined. Returns `{ session, insights }`. 404 on ownership mismatch (existence-leak convention).',
      inputSchema: {
        session_id: z.string().min(1).describe('Session id (uuid).'),
      },
    },
    async ({ session_id }) => {
      try {
        const data = await client.get<SessionDetailResponse>(
          `/api/v1/sessions/${encodeURIComponent(session_id)}`,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
