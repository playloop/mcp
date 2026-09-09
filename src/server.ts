/**
 * Creates the Playloop MCP tools, resource templates, and prompt templates.
 * Calls use the supplied management key; API roles and rate limits still apply.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PlayloopClient, type PlayloopClientOptions } from './client.js'
import { readOnlyWriteStub } from './tools/_shared.js'
export { READ_ONLY_WRITE_MESSAGE } from './tools/_shared.js'
import { registerGamesTools } from './tools/games.js'
import { registerSessionsTools } from './tools/sessions.js'
import { registerInsightsTools } from './tools/insights.js'
import { registerDocsTools } from './tools/docs.js'
import { registerFeedbackTools } from './tools/feedback.js'
import { registerBuildsTools } from './tools/builds.js'
import { registerTestersTools } from './tools/testers.js'
import { registerHeatmapsTools } from './tools/heatmaps.js'
import { registerEventsTools } from './tools/events.js'
import { registerPlaytestersTools } from './tools/playtesters.js'
import {
  registerSuggestFixesTool,
  registerFixFirstTool,
  registerTesterJourneyTool,
  registerTesterArchetypesTool,
  registerFeedbackFormsTool,
} from './tools/tester-feedback.js'
import { registerExperimentsTools } from './tools/experiments.js'
import { registerCrashesTools } from './tools/crashes.js'
import { registerFunnelsTools } from './tools/funnels.js'
import { registerSearchTools } from './tools/search.js'
import { registerGameAnalyticsTools } from './tools/game-analytics.js'
import { registerResources } from './resources/index.js'
import { registerWeeklyDigestPrompt } from './prompts/weekly-digest.js'
import { registerBuildComparisonPrompt } from './prompts/build-comparison.js'
import { registerFrictionAnalysisPrompt } from './prompts/friction-analysis.js'
import { registerTesterSpotlightPrompt } from './prompts/tester-spotlight.js'

export interface PlayloopMcpServerOptions extends PlayloopClientOptions {
  /** Server name reported in the MCP handshake. Defaults to "playloop". */
  name?: string
  /** Server version reported in the MCP handshake. Defaults to the package version. */
  version?: string
  /**
   * When true, the management write tools stay visible but return a refusal.
   * Reads remain available. Product feedback through file_feature_request
   * remains available in this mode.
   */
  readOnly?: boolean
}

const SERVER_VERSION = '0.5.0'

/**
 * Management writes refused in `readOnly` mode. Product-feedback submission
 * remains available; callers cannot modify games, experiments, or funnels.
 */
export const MCP_WRITE_TOOLS: readonly string[] = [
  'create_game',
  'set_game_cover',
  'update_game',
  'create_feedback_form',
  'create_funnel',
  'create_experiment',
  'start_experiment',
  'stop_experiment',
  'pick_experiment_winner',
  'pin_experiment_variant',
  'unpin_experiment_variant',
]

export function createPlayloopMcpServer(opts: PlayloopMcpServerOptions): McpServer {
  const client = new PlayloopClient(opts)
  const server = new McpServer({
    name: opts.name ?? 'playloop',
    version: opts.version ?? SERVER_VERSION,
  })

  // In read-only mode, keep each write tool visible but swap its handler for a
  // refusing stub (a clear "reconnect with a header" message), the stub never
  // calls the API, so reads work and writes can't mutate. The registrars only
  // ever call `registerTool`, so a thin shim over that one method is enough;
  // everything else passes through.
  const target: McpServer = opts.readOnly
    ? (new Proxy(server, {
        get(t, prop, receiver) {
          if (prop === 'registerTool') {
            return (name: string, ...rest: unknown[]) => {
              const fn = t.registerTool as unknown as (n: string, ...r: unknown[]) => unknown
              if (MCP_WRITE_TOOLS.includes(name)) {
                // rest[0] = descriptor, rest[1] = real handler. Keep the
                // descriptor, replace the handler with the refusing stub.
                return fn.call(t, name, rest[0], readOnlyWriteStub)
              }
              return fn.call(t, name, ...rest)
            }
          }
          const value = Reflect.get(t, prop, receiver)
          return typeof value === 'function' ? value.bind(t) : value
        },
      }) as McpServer)
    : server

  registerGamesTools(target, client)
  registerSessionsTools(target, client)
  registerInsightsTools(target, client)
  registerDocsTools(target, client)
  registerFeedbackTools(target, client)
  registerBuildsTools(target, client)
  registerTestersTools(target, client)
  registerHeatmapsTools(target, client)
  registerEventsTools(target, client)
  registerPlaytestersTools(target, client)
  // Tester / feedback read tools.
  registerSuggestFixesTool(target, client)
  registerFixFirstTool(target, client)
  registerTesterJourneyTool(target, client)
  registerTesterArchetypesTool(target, client)
  registerFeedbackFormsTool(target, client)
  // A/B experiments: list + comparison/digest read tools.
  registerExperimentsTools(target, client)
  // Crashes: unresolved list + grouped-by-signature.
  registerCrashesTools(target, client)
  // Conversion funnels: definitions + computed results.
  registerFunnelsTools(target, client)
  // Full-text search across sessions / games / insights / events.
  registerSearchTools(target, client)
  // Game-level analytics: summary, retention, live, activity, breakdown.
  registerGameAnalyticsTools(target, client)

  registerResources(server, client)

  registerWeeklyDigestPrompt(server)
  registerBuildComparisonPrompt(server)
  registerFrictionAnalysisPrompt(server)
  registerTesterSpotlightPrompt(server)

  return server
}
