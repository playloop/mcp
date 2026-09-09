/**
 * Prompt: `build_comparison`.
 *
 * Drives the agent through a head-to-head comparison of two builds for one
 * game. Uses `compare_builds` (which fetches both rollups + AI summaries +
 * computes deltas in one call) plus `query_insights` for build-scoped
 * friction/positive evidence.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export const BUILD_COMPARISON_ARGS = {
  game: z.string().min(1).describe('Game id or slug.'),
  build_a: z.string().min(1).describe('Baseline build version.'),
  build_b: z.string().min(1).describe('Comparison build version.'),
} as const

export function buildComparisonText(game: string, buildA: string, buildB: string): string {
  return [
    `Compare two builds of "${game}": ${buildA} (baseline) vs ${buildB} (comparison).`,
    '',
    `Step 1. Call \`compare_builds\` with \`game="${game}"\`, \`version_a="${buildA}"\`, \`version_b="${buildB}"\`. The response includes both rollups, both AI summaries, and a \`deltas\` map.`,
    `Step 2. Call \`query_insights\` twice, once with \`build="${buildA}"\` and once with \`build="${buildB}"\`, to gather build-scoped evidence. Cap each at 100 insights.`,
    'Step 3. Produce a side-by-side report (markdown) with these sections:',
    '  • **Rollup deltas**, table of session count, unique testers, average playtime, friction count, with the delta highlighted.',
    `  • **What's better in ${buildB}**, positive moments and removed friction.`,
    `  • **What got worse in ${buildB}**, new friction or removed positives.`,
    '  • **AI summary diff**, one paragraph comparing the two persisted AI summaries (if both are present).',
    '  • **Verdict**, your call on whether the change moved the needle.',
    '',
    'Cite insight ids next to each claim. If either build summary is missing, note it and proceed with the rollup-only comparison.',
  ].join('\n')
}

export function registerBuildComparisonPrompt(server: McpServer): void {
  server.registerPrompt(
    'build_comparison',
    {
      title: 'Build comparison',
      description: 'Compare two builds of a game, what improved, what regressed.',
      argsSchema: BUILD_COMPARISON_ARGS,
    },
    ({ game, build_a, build_b }) => ({
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: buildComparisonText(game, build_a, build_b) },
        },
      ],
    }),
  )
}
