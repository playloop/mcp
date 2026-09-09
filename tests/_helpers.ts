/**
 * Shared test fixtures and fakes.
 */
import type { PlayloopClient } from '../src/client.js'
import type {
  Game,
  GameDetail,
  GamesListResponse,
  CreateGameResponse,
  PaginatedSessions,
  PaginatedInsights,
  SessionDetailResponse,
  BuildSummary,
  TesterSummary,
  HeatmapResponse,
  EventStatsResponse,
} from '../src/types.js'

export function fakeGame(over: Partial<Game> = {}): Game {
  return {
    id: 'g_1',
    userId: 'u_1',
    name: 'Dungeon Crawl',
    slug: 'dungeon-crawl',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  }
}

export function fakeGameDetail(): GameDetail {
  return {
    game: fakeGame(),
    counts: { sessionCount: 12, buildCount: 3, testerCount: 5 },
  }
}

export function fakeGamesList(): GamesListResponse {
  return { games: [fakeGame(), fakeGame({ id: 'g_2', slug: 'puzzle-jam', name: 'Puzzle Jam' })] }
}

export function fakeCreateGameResponse(over: Partial<Game> = {}): CreateGameResponse {
  return { game: fakeGame(over), ingestKey: 'pl_ik_deadbeef' }
}

export function fakeSessions(): PaginatedSessions {
  return {
    items: [
      {
        id: 's_1',
        userId: 'u_1',
        gameId: 'g_1',
        title: 'Run 1',
        status: 'analyzed',
        source: 'unity-telemetry',
        recordedAt: 1_700_000_500_000,
        metadata: { gameVersion: '0.5.0' },
        eventCounts: { player_pos: 1200, door_opened: 4 },
      },
    ],
    hasMore: false,
    total: 1,
  }
}

export function fakeInsights(): PaginatedInsights {
  return {
    items: [
      {
        id: 'i_1',
        sessionId: 's_1',
        type: 'stuck-point',
        sentiment: 'negative',
        title: 'Stuck on room 3',
        body: 'Player wandered for 4 minutes',
        createdAt: 1_700_000_600_000,
      },
    ],
    hasMore: false,
    total: 1,
  }
}

export function fakeSessionDetail(): SessionDetailResponse {
  return {
    session: {
      id: 's_1',
      userId: 'u_1',
      gameId: 'g_1',
      title: 'Run 1',
      status: 'analyzed',
      source: 'unity-telemetry',
      recordedAt: 1_700_000_500_000,
      metadata: { gameVersion: '0.5.0' },
    },
    insights: fakeInsights().items,
  }
}

export function fakeBuildSummary(version = '0.5.0'): BuildSummary {
  return {
    game: fakeGame(),
    rollup: {
      version,
      sessionCount: 6,
      deviceCount: 4,
      firstSeen: 1_700_000_000_000,
      lastSeen: 1_700_500_000_000,
      totalPlaytimeMs: 1_800_000,
    },
    summary: { text: 'AI summary for ' + version },
  }
}

export function fakeTesterSummary(): TesterSummary {
  return {
    game: fakeGame(),
    rollup: {
      deviceId: 'dev_abc',
      sessionCount: 3,
      firstSeen: 1_700_000_000_000,
      lastSeen: 1_700_300_000_000,
      lastBuild: '0.5.0',
      totalPlaytimeMs: 900_000,
    },
    sessions: fakeSessions().items,
    summary: { text: 'AI tester summary' },
  }
}

export function fakeHeatmap(): HeatmapResponse {
  return {
    game: fakeGame(),
    rooms: [
      { room: 'lobby', width: 32, height: 32, grid: new Array(32 * 32).fill(0), eventCount: 120 },
    ],
    eventCount: 120,
  }
}

export function fakeEventStats(): EventStatsResponse {
  return {
    game: fakeGame(),
    sessionCount: 6,
    total: 4800,
    byName: { player_pos: 4000, door_opened: 800 },
    top: [
      ['player_pos', 4000],
      ['door_opened', 800],
    ],
  }
}

/** Build a fake PlayloopClient whose `.get(path, query?)` is controlled by `routes`. */
export function fakeClient(routes: Record<string, unknown> | ((path: string, query?: unknown) => unknown)): PlayloopClient {
  const resolve = (path: string, arg?: unknown): unknown => {
    if (typeof routes === 'function') return routes(path, arg)
    if (path in routes) return routes[path]
    throw new Error(`fakeClient: no fixture for path "${path}"`)
  }
  return {
    get: async <T>(path: string, query?: unknown): Promise<T> => resolve(path, query) as T,
    // POST passes the request body through as the second arg so tests can
    // assert on what was sent (mirrors the `get` query passthrough).
    post: async <T>(path: string, body?: unknown): Promise<T> => resolve(path, body) as T,
  } as unknown as PlayloopClient
}
