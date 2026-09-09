/**
 * A/B experiment tools.
 *
 * Reads:
 *   - list_game_experiments      → /api/v1/games/{id}/experiments
 *   - get_experiment_comparison  → /api/v1/experiments/{id}/comparison
 *
 * Writes (member+ role floor, audited server-side;
 * state transitions only, no delete tool):
 *   - create_experiment          → POST /api/v1/games/{id}/experiments
 *   - start_experiment           → POST /api/v1/experiments/{id}/start
 *   - stop_experiment            → POST /api/v1/experiments/{id}/stop
 *   - pick_experiment_winner     → POST /api/v1/experiments/{id}/pick-winner
 *   - pin_experiment_variant     → POST /api/v1/experiments/{id}/overrides
 *   - unpin_experiment_variant   → DELETE /api/v1/experiments/{id}/overrides
 *
 * Thin bearer-auth wrappers (path-encode args, relay JSON) over the
 * experiment surface. Client-side typing stays loose
 * (`Record<string, unknown>`) because the agent reads field names, not
 * enforced types, same convention as the tester / feedback tools.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import { jsonContent, errorContent } from './_shared.js'

const EXPERIMENT_VARIANT = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .describe('Stable variant key (letters/digits/dash/underscore), what sessions get tagged with.'),
  name: z.string().min(1).max(80).describe('Human-readable variant name.'),
  allocation: z
    .number()
    .positive()
    .describe('Relative traffic weight. Weights across variants normalize to 100.'),
  config: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe(
      'Optional flat key/value payload the game reads at runtime (tweak a number or flag without a rebuild). Primitives only: string, number, or boolean. No arrays or nested objects. Max 20 keys; string values up to 256 chars. Locked once the experiment leaves draft.',
    ),
})

export function registerExperimentsTools(server: McpServer, client: PlayloopClient): void {
  server.registerTool(
    'list_game_experiments',
    {
      title: 'List game experiments',
      description:
        "List the A/B experiments for a game (default newest first, excludes deleted). Each experiment carries its status (`draft` / `running` / `stopped`), the variant catalog (`{ key, name, allocation }[]`, allocations are percentages), the targeting audience id + resolved `audienceName` (null when the experiment targets all players), the picked `winnerVariantKey` (or null), and start/stop timestamps. Use this to answer 'what experiments am I running?' Returns `{ game, experiments }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        sort: z.enum(['createdAt', 'name', 'status']).optional().describe('Sort field. Default createdAt.'),
        order: z.enum(['asc', 'desc']).optional().describe('Default desc.'),
      },
    },
    async ({ game, ...query }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/experiments`,
          query as Record<string, string | number | undefined>,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'get_experiment_comparison',
    {
      title: 'Get experiment comparison',
      description:
        "Return one experiment's latest per-variant raw-stats comparison plus the persisted AI cross-variant digest (if one has been generated). The `comparison` has a `variants` array, per variant: session count, cohort-eligible D1/D2/D7 retention, engagement %, crash rate, top friction / praise clusters, and sample feedback quotes. The `digest` is null until first generated; when present it carries the recommendation, per-variant headlines, shared themes, sentiment shift, and the headline confidence label. 404s when the experiment doesn't exist or belongs to another user. Returns `{ comparison, digest }`.",
      inputSchema: {
        experiment_id: z.string().min(1).describe('Experiment id.'),
      },
    },
    async ({ experiment_id }) => {
      try {
        const data = await client.get<Record<string, unknown>>(
          `/api/v1/experiments/${encodeURIComponent(experiment_id)}/comparison`,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'create_experiment',
    {
      title: 'Create experiment',
      description:
        "Create a DRAFT A/B experiment for a game. Requires a member, admin, or owner role (viewers get 403). Variants need 2\u20138 entries; allocations are relative weights \u2014 if they don't sum to 100 the API returns 409 `allocations_need_normalization` with the normalized weights, and you re-submit with `acknowledgeNormalization: true` to confirm. The experiment starts in `draft` (players are NOT assigned yet) \u2014 call `start_experiment` to go live. Returns 201 `{ experiment }`.",
      inputSchema: {
        game: z.string().min(1).describe('Game id, slug, or exact name.'),
        name: z.string().min(1).max(120).describe('Experiment name.'),
        description: z.string().max(500).optional().describe('What this experiment tests.'),
        variants: z
          .array(EXPERIMENT_VARIANT)
          .min(2)
          .max(8)
          .describe(
            '2\u20138 variants: `{ key, name, allocation, config? }[]`. `config` is an optional flat key/value payload (primitives only) the game reads at runtime.',
          ),
        audienceId: z
          .string()
          .max(80)
          .optional()
          .describe('Optional audience id to target (omit = all players).'),
        newPlayersOnly: z
          .boolean()
          .optional()
          .describe(
            'Targeting: assign only devices first seen after the experiment starts, returning players are excluded and play the default (clean onboarding reads). Locked once the experiment leaves draft.',
          ),
        targetBuilds: z
          .array(z.string().min(1).max(80))
          .min(1)
          .max(20)
          .optional()
          .describe(
            'Targeting: limit the experiment to these game build versions (mutually exclusive with audienceId). Locked once the experiment leaves draft.',
          ),
        acknowledgeNormalization: z
          .boolean()
          .optional()
          .describe('Set true to accept allocation normalization to 100 after a 409.'),
      },
    },
    async (args) => {
      const { game, ...body } = args as { game: string } & Record<string, unknown>
      try {
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/games/${encodeURIComponent(game)}/experiments`,
          body,
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'start_experiment',
    {
      title: 'Start experiment',
      description:
        'Start a DRAFT experiment (draft \u2192 running). Starting locks the variants, allocations, and audience; players begin getting assigned. 409 if the experiment is already running or was stopped (resume a stopped experiment from the dashboard). Requires a member, admin, or owner role. Returns `{ experiment }`.',
      inputSchema: {
        experiment_id: z.string().min(1).describe('Experiment id.'),
      },
    },
    async ({ experiment_id }) => {
      try {
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/experiments/${encodeURIComponent(experiment_id)}/start`,
          {},
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'stop_experiment',
    {
      title: 'Stop experiment',
      description:
        'Stop a RUNNING experiment (running \u2192 stopped). Players stop getting assigned; all collected data stays intact (this is a reversible state transition, not a delete). 409 on any other status. Requires a member, admin, or owner role. Returns `{ experiment }`.',
      inputSchema: {
        experiment_id: z.string().min(1).describe('Experiment id.'),
      },
    },
    async ({ experiment_id }) => {
      try {
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/experiments/${encodeURIComponent(experiment_id)}/stop`,
          {},
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'pick_experiment_winner',
    {
      title: 'Pick experiment winner',
      description:
        "Set, change, or unset (pass null) the winner variant of a RUNNING or STOPPED experiment. 409 on a draft (no data yet); 400 when the key doesn't match one of the experiment's variants. Reversible \u2014 picking a winner records the decision, it doesn't delete anything. Requires a member, admin, or owner role. Returns `{ experiment }`.",
      inputSchema: {
        experiment_id: z.string().min(1).describe('Experiment id.'),
        winner_variant_key: z
          .union([z.string().min(1).max(40), z.null()])
          .describe('The winning variant key, or null to unset.'),
      },
    },
    async ({ experiment_id, winner_variant_key }) => {
      try {
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/experiments/${encodeURIComponent(experiment_id)}/pick-winner`,
          { winnerVariantKey: winner_variant_key },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'pin_experiment_variant',
    {
      title: 'Pin a device to a variant (QA)',
      description:
        "QA pinning: force a specific device into a specific variant of an experiment, bypassing the normal split and any audience/new-players filters. Use it to feel-test each arm on the dev's own machine. Re-pinning an already-pinned device swaps its variant. Works on any status (pin before starting to guarantee the first assignment). 400 when the variant key doesn't exist; 409 at the per-experiment pin limit. Requires a member, admin, or owner role. Returns `{ overrides }`: the experiment's full current pin list.",
      inputSchema: {
        experiment_id: z.string().min(1).describe('Experiment id.'),
        device_id: z.string().min(1).max(128).describe('The device GUID to pin (the SDK deviceId).'),
        variant_key: z.string().min(1).max(40).describe('The variant key to force this device into.'),
        reason: z.string().max(200).optional().describe('Optional note, e.g. "QA: feel-test arm B".'),
      },
    },
    async ({ experiment_id, device_id, variant_key, reason }) => {
      try {
        const data = await client.post<Record<string, unknown>>(
          `/api/v1/experiments/${encodeURIComponent(experiment_id)}/overrides`,
          { deviceId: device_id, variantKey: variant_key, reason: reason ?? null },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.registerTool(
    'unpin_experiment_variant',
    {
      title: 'Remove a QA variant pin',
      description:
        "Remove a QA pin so the device goes back to normal bucketed assignment on its next variant-map fetch. 404 when no pin exists for that device. Requires a member, admin, or owner role. Returns `{ overrides }`: the experiment's remaining pin list.",
      inputSchema: {
        experiment_id: z.string().min(1).describe('Experiment id.'),
        device_id: z.string().min(1).max(128).describe('The pinned device GUID to release.'),
      },
    },
    async ({ experiment_id, device_id }) => {
      try {
        const data = await client.delete<Record<string, unknown>>(
          `/api/v1/experiments/${encodeURIComponent(experiment_id)}/overrides`,
          { deviceId: device_id },
        )
        return jsonContent(data)
      } catch (err) {
        return errorContent(err)
      }
    },
  )
}
