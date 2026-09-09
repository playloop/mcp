/**
 * Public surface for `@playloop/mcp`.
 *
 * Use this entry point to embed the server in an MCP-compatible application.
 *
 * For the CLI, see `cli.ts` (binary `playloop`).
 */
export { createPlayloopMcpServer } from './server.js'
export type { PlayloopMcpServerOptions } from './server.js'
export {
  PlayloopClient,
  PlayloopApiError,
  PlayloopNetworkError,
  type PlayloopClientOptions,
} from './client.js'
export { runStdio } from './transports/stdio.js'
export { runSSE, type RunSseOptions } from './transports/sse.js'
export type {
  Game,
  GameCounts,
  GameDetail,
  PlaytestSession,
  Insight,
  BuildRollup,
  BuildSummary,
  TesterRollup,
  TesterSummary,
  HeatmapRoom,
  HeatmapResponse,
  EventStatsResponse,
  PaginatedSessions,
  PaginatedInsights,
  GamesListResponse,
  SessionDetailResponse,
  ApiErrorBody,
} from './types.js'
