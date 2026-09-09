/**
 * Prompt: `friction_analysis`.
 *
 * Drives the agent through a friction-pattern search at one of three scopes
 * (game, build, or tester) and produces a ranked list of recurring issues.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const FRICTION_ANALYSIS_ARGS = {
  scope: z.enum(['game', 'build', 'tester']).describe('What to scope the search to.'),
  id: z
    .string()
    .min(1)
    .describe(
      'For scope=game: game id or slug. For scope=build: "<game>:<version>". For scope=tester: "<game>:<deviceId>".',
    ),
} as const

export function frictionAnalysisText(scope: 'game' | 'build' | 'tester', id: string): string {
  const intro = `Find friction patterns at the ${scope} scope. Target: "${id}".`
  const fetchSteps = (() => {
    if (scope === 'game') {
      return [
        `Step 1. Call \`query_insights\` with \`game="${id}"\`, \`sentiment="negative"\`, and \`limit=100\`. Page through with \`offset\` if \`hasMore\` (cap at 300 insights).`,
        `Step 2. Also call \`query_insights\` with \`game="${id}"\` and \`type="stuck-point"\`, \`type="confusion"\`, and \`type="ui-friction"\` separately. Merge results.`,
      ]
    }
    if (scope === 'build') {
      const [g, v] = id.split(':', 2)
      return [
        `Step 1. Call \`query_insights\` with \`game="${g ?? ''}"\`, \`build="${v ?? ''}"\`, \`sentiment="negative"\`, and \`limit=100\`.`,
        `Step 2. Call \`get_build_summary\` with \`game="${g ?? ''}"\`, \`version="${v ?? ''}"\` for context (session count, playtime, AI summary).`,
      ]
    }
    const [g, d] = id.split(':', 2)
    return [
      `Step 1. Call \`get_tester_summary\` with \`game="${g ?? ''}"\`, \`device_id="${d ?? ''}"\` to get this tester's sessions and AI summary.`,
      'Step 2. For each session in the response, call `get_session` to get its insights. Filter for `sentiment=negative` or friction types.',
    ]
  })()

  return [
    intro,
    '',
    ...fetchSteps,
    'Step 3. Cluster the friction items by theme (controls, UI, level layout, difficulty, performance, etc.). For each theme:',
    '  • Count the unique sessions / testers affected.',
    '  • Quote the 1-2 most representative insight excerpts.',
    '  • Note whether it spans multiple builds (if you have that data).',
    'Step 4. Rank themes by severity (frequency × impact-on-completion) and present the top 5.',
    '',
    'Be specific. "Players found the controls clunky" is useless without "12 of 47 sessions in the last week mention input lag in the chase scene". Cite insight ids.',
  ].join('\n')
}

export function registerFrictionAnalysisPrompt(server: McpServer): void {
  server.registerPrompt(
    'friction_analysis',
    {
      title: 'Friction analysis',
      description: 'Find recurring friction patterns at a game / build / tester scope.',
      argsSchema: FRICTION_ANALYSIS_ARGS,
    },
    ({ scope, id }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: frictionAnalysisText(scope, id) },
        },
      ],
    }),
  )
}
