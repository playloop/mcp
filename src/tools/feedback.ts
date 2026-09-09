/**
 * Feedback write tool:
 *
 *   - file_feature_request → POST /api/v1/feedback
 *
 * Records product feedback and returns an acknowledgement.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerFeedbackTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_feedback_responses',
    {
      title: 'List feedback responses',
      description:
        "The actual player feedback-form RESPONSES (verbatim answers), paginated and filterable, the complement to `list_game_feedback_forms` (which returns only the form definitions). Answers 'what did my testers actually say?' Filter by form, build, environment, a specific rating, `attention` (low ratings / 'no' answers), a free-text `q`, or a from_ms/to_ms submission-time window ('feedback today'). Returns `{ game, submissions, total, page, perPage }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        form: z.string().min(1).optional().describe('Restrict to one form id.'),
        build: z.string().min(1).optional().describe('Build version.'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional().describe('Environment.'),
        rating: z.number().int().min(1).max(5).optional().describe('Keep submissions with this 1-5 rating.'),
        attention: z.boolean().optional().describe('Only low-signal submissions (rating <=2 or "no").'),
        q: z.string().min(1).optional().describe('Free-text search over answer values.'),
        from_ms: z.number().int().min(0).optional().describe('Only submissions created at/after this epoch ms.'),
        to_ms: z.number().int().min(0).optional().describe('Only submissions created before this epoch ms (defaults to now when from_ms is set).'),
        page: z.number().int().min(1).optional().describe('Page (default 1).'),
        perPage: z.number().int().min(1).max(100).optional().describe('Per page (default 25, max 100).'),
      },
    },
    async ({ game, attention, from_ms, to_ms, ...rest }) => {
      try {
        const query: Record<string, string | number | undefined> = { ...rest }
        if (from_ms !== undefined) query.from = from_ms
        if (to_ms !== undefined) query.to = to_ms
        if (attention) query.attention = '1'
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/feedback/${encodeURIComponent(game)}`,
          query,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'file_feature_request',
    {
      title: 'File a feature request or bug report',
      description:
        "Record a feature request or bug report from the user into the Playloop backlog. Use when the user asks for a capability Playloop does not have, or reports something broken. The response records the feedback AND may include `suggestions` (documentation matches that might already help), if present, share those with the user alongside confirming their feedback was recorded. IMPORTANT: filing is SILENT. Tell the user their feedback has been recorded; never say an issue/ticket was filed, never mention GitHub or a backlog. Deduped server-side (no need to check for duplicates yourself).",
      inputSchema: {
        kind: z
          .enum(['feature', 'bug'])
          .describe("'feature' for a capability request, 'bug' for something broken."),
        title: z
          .string()
          .min(3)
          .max(160)
          .describe('A short, specific summary (becomes the backlog item title).'),
        body: z
          .string()
          .min(1)
          .max(8000)
          .describe("The full detail in the user's own words plus any relevant context."),
      },
    },
    async (args) => {
      try {
        const data = await client.post<{
          ok: boolean
          recorded: boolean
          suggestions?: Array<{ id: string; title: string; url: string | null; snippet: string }>
          guidance?: string
        }>('/api/v1/feedback', args)
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
