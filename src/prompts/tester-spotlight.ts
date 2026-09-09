/**
 * Prompt: `tester_spotlight`.
 *
 * Drives the agent through identifying the most engaged testers for a game
 * and producing a per-tester report. Useful for "who's worth reaching out
 * to?" / "who is providing the most signal?" questions.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const TESTER_SPOTLIGHT_ARGS = {
  game: z.string().min(1).describe('Game id or slug.'),
} as const

export function testerSpotlightText(game: string): string {
  return [
    `Identify and spotlight the top-engaged testers for "${game}".`,
    '',
    `Step 1. Call \`get_game\` with \`game_id="${game}"\` to get the tester count.`,
    `Step 2. Call \`list_sessions\` with \`game="${game}"\` and \`limit=100\`. Page through (cap at 500 sessions) to gather every recent session.`,
    'Step 3. Group sessions by tester `deviceId` (each session\'s metadata or `userId` field, inspect the response shape). Score each tester by:',
    '  • Session count (weight 1.0).',
    '  • Total playtime in ms (weight 1.0, normalized).',
    '  • Insight count generated (you may need to call `get_session` for a sample if insight counts aren\'t in the list response).',
    'Step 4. Pick the top 5 testers by combined score. For each:',
    `  • Call \`get_tester_summary\` with \`game="${game}"\` and the deviceId.`,
    '  • Read the AI summary if present.',
    '  • Surface 1-2 representative insights they generated.',
    'Step 5. Produce a spotlight report (markdown):',
    '  • Header per tester: deviceId (truncated to 8 chars + "…"), session count, playtime, last build.',
    '  • One paragraph synthesizing their behavior and feedback.',
    '  • Standout insight quote.',
    '',
    'Do not invent tester names, devices are anonymous. Just refer to them as "Tester A" / "Tester B" / etc. in the prose, with the truncated deviceId in parentheses.',
  ].join('\n')
}

export function registerTesterSpotlightPrompt(server: McpServer): void {
  server.registerPrompt(
    'tester_spotlight',
    {
      title: 'Tester spotlight',
      description: 'Identify and report on the most engaged testers for a game.',
      argsSchema: TESTER_SPOTLIGHT_ARGS,
    },
    ({ game }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: testerSpotlightText(game) },
        },
      ],
    }),
  )
}
