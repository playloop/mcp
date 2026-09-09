/**
 * Tools: `get_build_summary`, `compare_builds`.
 *
 * `get_build_summary` is a thin wrapper around `/api/v1/builds/{game}/{version}`.
 *
 * `compare_builds` is a composite tool, it calls the build-summary route
 * twice plus the friction-compare route once, then diffs the rollups
 * in-process. This is the single composite tool in the surface; the other
 * tools are 1:1 with HTTP routes.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { BuildSummary, FrictionCompareResponse } from '../types.js'
import { jsonContent, errorContent } from './_shared.js'

export function registerBuildsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_builds',
    {
      title: 'List builds',
      description:
        "List every build (distinct `metadata.gameVersion`) for a game, one rollup per version, session count, unique devices, first/last seen, total playtime, dominant country, newest-active first. Use this to discover a game's builds and find the LATEST version before calling `get_build_summary` (which needs an exact version). Answers 'how did my latest build do?' Returns `{ game, builds }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional().describe('Environment scope (default: all envs aggregated).'),
      },
    },
    async ({ game, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/builds/${encodeURIComponent(game)}`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_build_summary',
    {
      title: 'Get build summary',
      description:
        'Return the rollup for one build (session count, unique devices, first/last seen, total playtime) plus the persisted AI build summary if present. Returns `{ game, rollup, summary }`.',
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        version: z.string().min(1).describe('Build version, matches `metadata.gameVersion`.'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional().describe('Environment scope (default: all envs aggregated).'),
      },
    },
    async ({ game, version, env }) => {
      try {
        const data = await client.get<BuildSummary>(
          `/api/v1/builds/${encodeURIComponent(game)}/${encodeURIComponent(version)}`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'compare_builds',
    {
      title: 'Compare builds',
      description:
        "Composite tool: fetch two builds' rollups + per-build AI summaries AND the classified friction diff (resolved / got_smaller / carried_over / got_larger / introduced per tag) between them. Useful for 'what changed between 0.4.9 and 0.5.0?' style questions. Returns `{ game, build_a, build_b, deltas, friction_diff }`. The `friction_diff` field is the higher-signal one for narrative answers; `deltas` is preserved for back-compat scripts.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        version_a: z.string().min(1).describe('Baseline version.'),
        version_b: z.string().min(1).describe('Comparison version.'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional(),
      },
    },
    async ({ game, version_a, version_b, env }) => {
      try {
        const [a, b, frictionRes] = await Promise.all([
          client.get<BuildSummary>(
            `/api/v1/builds/${encodeURIComponent(game)}/${encodeURIComponent(version_a)}`,
            env ? { env } : undefined,
          ),
          client.get<BuildSummary>(
            `/api/v1/builds/${encodeURIComponent(game)}/${encodeURIComponent(version_b)}`,
            env ? { env } : undefined,
          ),
          client.get<FrictionCompareResponse>('/api/v1/builds/compare', {
            game,
            a: version_a,
            b: version_b,
            ...(env ? { env } : {}),
          }),
        ])
        const deltas = diffRollups(a.rollup, b.rollup)
        return jsonContent({
          game: a.game,
          build_a: a,
          build_b: b,
          deltas,
          friction_diff: frictionRes.diff,
          friction_build_a: frictionRes.buildA,
          friction_build_b: frictionRes.buildB,
        })
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_build_drop_reasons',
    {
      title: 'Get build drop reasons',
      description:
        "The structured 'why players quit' rollup for one build, per-cluster drop reasons with distinct-tester counts, plus how many testers dropped and how many dropped with no clear cause. Distinct from `get_build_summary` (prose): this is the machine-readable drop-cause breakdown. Returns `{ gameId, version, testersWhoDropped, testersDroppedNoClearCause, clusters, ... }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        version: z.string().min(1).describe('Build version, matches `metadata.gameVersion`.'),
        env: z.string().regex(/^[a-z0-9_-]+$/).optional().describe('Environment (default production).'),
      },
    },
    async ({ game, version, env }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/builds/${encodeURIComponent(game)}/${encodeURIComponent(version)}/drop-reasons`,
          env ? { env } : undefined,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}

function diffRollups(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === 'version') continue
    const va = a[k]
    const vb = b[k]
    if (typeof va === 'number' && typeof vb === 'number') {
      out[k] = { a: va, b: vb, delta: vb - va }
    } else if (va !== vb) {
      out[k] = { a: va ?? null, b: vb ?? null }
    }
  }
  return out
}
