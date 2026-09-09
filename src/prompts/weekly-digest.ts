/**
 * Prompt: `weekly_digest`.
 *
 * Drives the agent through a 7-day rollup of playtest activity for one game:
 * sessions, top insights, friction patterns, and notable feedback. The agent
 * calls `list_sessions` + `query_insights` itself; this prompt just tells it
 * what to look for and what to produce.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const WEEKLY_DIGEST_ARGS = {
  game: z.string().min(1).describe('Game id or slug.'),
} as const

export function weeklyDigestText(game: string): string {
  return [
    `Produce a weekly playtest digest for the Playloop game "${game}".`,
    '',
    'Step 1. Call `list_sessions` with `game="' + game + '"`, `from=` set to 7 days ago in unix ms, and `limit=100`. Page through with `offset` if `hasMore` is true (cap total at 500 sessions).',
    'Step 2. Call `query_insights` with the same `game` and 7-day window. Pull both `sentiment=positive` and `sentiment=negative` (separate calls). Cap at 200 insights each.',
    'Step 3. From the data, produce a digest with these sections (markdown):',
    '  • **At a glance**, session count, unique testers, total playtime, dominant build.',
    '  • **What worked**, top 3 positive moments (insight titles + a sentence each).',
    '  • **Where it stuck**, top 5 friction items (stuck-points, confusion, ui-friction).',
    '  • **One thing to fix this week**, your pick of the highest-impact actionable item.',
    '',
    'Cite session ids or insight ids in parentheses next to each call-out so the user can drill in. Do not invent numbers, if a metric is missing in the API response, say so.',
  ].join('\n')
}

export function registerWeeklyDigestPrompt(server: McpServer): void {
  server.registerPrompt(
    'weekly_digest',
    {
      title: 'Weekly playtest digest',
      description: 'Summarize the last 7 days of playtest activity for one game.',
      argsSchema: WEEKLY_DIGEST_ARGS,
    },
    ({ game }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: weeklyDigestText(game) },
        },
      ],
    }),
  )
}
