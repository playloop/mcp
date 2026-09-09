/**
 * Tool: `query_insights`.
 *
 * Backing route: `/api/v1/insights`. Filter on game, build, type, sentiment,
 * and time range. Returns `{ items, hasMore, total }`.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { PaginatedInsights } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

const INSIGHT_TYPES = [
  'stuck-point',
  'confusion',
  'positive-moment',
  'negative-moment',
  'feature-request',
  'bug-report',
  'difficulty-spike',
  'pacing-issue',
  'ui-friction',
  'praise',
  'session-summary',
  'drop-reason',
] as const

export function registerInsightsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'query_insights',
    {
      title: 'Query insights',
      description:
        "Search across the user's insights. Useful for friction analysis ('show me all stuck-points in build 0.5.0') or praise hunts ('top positive moments this month').",
      inputSchema: {
        game: z.string().min(1).max(120).optional().describe('Game id, slug, or exact name.'),
        build: z.string().min(1).max(120).optional().describe('Match `metadata.gameVersion`.'),
        type: z.enum(INSIGHT_TYPES).optional(),
        sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
        from: z.number().int().nonnegative().optional().describe('unix ms, createdAt >= from.'),
        to: z.number().int().nonnegative().optional().describe('unix ms, createdAt <= to.'),
        sort: z.enum(['createdAt', 'confidence']).optional().describe('Sort field. Default createdAt.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().nonnegative().optional(),
      },
    },
    async (args) => {
      try {
        const data = await client.get<PaginatedInsights>('/api/v1/insights', args as Record<string, string | number | undefined>)
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
