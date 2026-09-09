/**
 * Wire types for the Playloop /api/v1 surface.
 *
 * These mirror the JSON shapes returned by `https://playloop.gg/api/v1/*`.
 * They are intentionally loose (`Record<string, unknown>` for opaque payloads
 * like `metadata`, `rollup`, etc.) so a server-side schema bump doesn't
 * silently break this client at runtime, agents will still get the data,
 * even if a new field shows up.
 */

export interface Game {
  id: string
  userId: string
  name: string
  slug: string
  createdAt: number
  updatedAt: number
  [key: string]: unknown
}

export interface GameCounts {
  sessionCount: number
  buildCount: number
  testerCount: number
}

export interface GameDetail {
  game: Game
  counts: GameCounts
}

export interface CreateGameResponse {
  game: Game
  /** Show-once write-only ingest key minted at creation. */
  ingestKey: string
}

export interface PlaytestSession {
  id: string
  userId: string
  gameId?: string
  title: string
  status: string
  source: string
  recordedAt: number
  testerHandle?: string | null
  transcript?: string | null
  metadata: Record<string, unknown>
  eventCounts?: Record<string, number> | null
  [key: string]: unknown
}

export interface Insight {
  id: string
  sessionId: string
  type: string
  sentiment?: 'positive' | 'neutral' | 'negative' | null
  title?: string
  body?: string
  createdAt: number
  [key: string]: unknown
}

export interface BuildRollup {
  version: string
  sessionCount: number
  deviceCount: number
  firstSeen?: number
  lastSeen?: number
  totalPlaytimeMs?: number
  [key: string]: unknown
}

export interface BuildSummary {
  game: Game
  rollup: BuildRollup
  summary: Record<string, unknown> | null
}

export interface TesterRollup {
  deviceId: string
  sessionCount: number
  firstSeen?: number
  lastSeen?: number
  lastBuild?: string
  totalPlaytimeMs?: number
  [key: string]: unknown
}

export interface TesterSummary {
  game: Game
  rollup: TesterRollup
  sessions: PlaytestSession[]
  summary: Record<string, unknown> | null
}

export interface HeatmapRoom {
  room: string
  width: number
  height: number
  grid: number[]
  eventCount: number
  [key: string]: unknown
}

export interface HeatmapResponse {
  game: Game
  rooms: HeatmapRoom[]
  eventCount: number
}

export interface EventStatsResponse {
  game: Game
  sessionCount: number
  total: number
  byName: Record<string, number>
  top: Array<[string, number]>
}

export interface PaginatedSessions {
  items: PlaytestSession[]
  hasMore: boolean
  total: number
}

export interface PaginatedInsights {
  items: Insight[]
  hasMore: boolean
  total: number
}

export interface GamesListResponse {
  games: Game[]
}

export interface SessionDetailResponse {
  session: PlaytestSession
  insights: Insight[]
}

/**
 * Playtest batch, a named bundle of keys (and optional 1:1 invites)
 * that the studio created to distribute their game to testers.
 * Returned by `/api/v1/batches/{game}` (list) and
 * `/api/v1/batches/{game}/{batchId}` (detail).
 *
 * Sensitive fields are NEVER on the wire:
 *   - per-key cleartext / ciphertext / fingerprint (only `redeemed_count`
 *     and per-key redemption metadata are exposed, never the code itself)
 *   - per-invite redemption token (anyone with it could redeem)
 */
export interface PlaytestBatch {
  id: string
  name: string
  distribution_target: string
  fulfillment_source: string
  redemption_mode: string
  identity_mode: string
  share_token: string | null
  /** Markdown, only present on the detail endpoint. */
  instructions?: string | null
  key_count: number
  redeemed_count: number
  revoked_count: number
  expires_at: number | null
  created_at: number
}

export interface PlaytestBatchListResponse {
  game: Game
  batches: PlaytestBatch[]
}

export interface PlaytestBatchDetailResponse {
  game: Game
  batch: PlaytestBatch
}

/**
 * One key in a batch. `encrypted_code` and `code_fingerprint` are
 * stripped server-side, this type intentionally only exposes
 * lifecycle + redemption metadata.
 */
export interface PlaytestKey {
  id: string
  status: string
  redeemed_at: number | null
  redeemed_by_email: string | null
  redeemed_by_handle: string | null
  redemption_country: string | null
  redemption_user_agent: string | null
  tester_invite_id: string | null
  created_at: number
}

export interface PlaytestKeysResponse {
  batch: { id: string; name: string }
  keys: PlaytestKey[]
  hasMore: boolean
  total: number
}

/**
 * One 1:1 invite. `invite_token` is stripped server-side, the read
 * API exposes the recipient + send/open/redeem timeline only.
 */
export interface TesterInvite {
  id: string
  email: string
  personal_note: string | null
  sent_at: number
  opened_at: number | null
  redeemed_at: number | null
}

export interface TesterInvitesResponse {
  batch: { id: string; name: string }
  invites: TesterInvite[]
}

/**
 * SDK correlation row. After a tester redeems a key, the SDK links the
 * picked `handle` to the device via the one-shot `claim_token` (which
 * is NEVER returned by the read API). The cron-cached rollup
 * (session_count, total_play_time_ms, last_seen_at, distinct_countries)
 * powers "which testers actually played, how much, and from how many
 * countries (a wide spread can indicate a shared key)" without scanning sessions.
 */
export interface PlaytestHandle {
  id: string
  handle: string
  key_id: string
  device_id: string | null
  claimed_at: number | null
  session_count: number
  total_play_time_ms: number
  last_seen_at: number | null
  distinct_countries: number
  created_at: number
}

export interface PlaytestHandlesResponse {
  game: Game
  handles: PlaytestHandle[]
  hasMore: boolean
  total: number
}

/** One build's per-tag friction breakdown in a build-compare response. */
export interface FrictionCompareBuild {
  version: string
  testersInBatch: number
  sessionCount: number
  byTag: Array<{
    tag: string
    testersWithTag: number
    testersInBatch: number
    pct: number
    insightCount: number
    exampleSummaries: string[]
  }>
}

/**
 * Response shape of `/api/v1/builds/compare`, the classified friction diff
 * between two builds. `compare_builds` folds `diff` into its result as
 * `friction_diff`. The agent reads field names; the type isn't enforced.
 */
export interface FrictionCompareResponse {
  game: { id: string; slug: string; name: string }
  environment: string
  buildA: FrictionCompareBuild
  buildB: FrictionCompareBuild
  diff: {
    buildA: { version: string; testersInBatch: number; sessionCount: number }
    buildB: { version: string; testersInBatch: number; sessionCount: number }
    changes: Array<{
      kind: 'resolved' | 'got_smaller' | 'carried_over' | 'got_larger' | 'introduced'
      tag: string
      deltaPct: number
    }>
    totals: {
      resolved: number
      gotSmaller: number
      carriedOver: number
      gotLarger: number
      introduced: number
    }
  }
}

/**
 * A 4xx response from the Playloop API.
 *
 * The shape is `{ error: string, ...extra }` per the house convention. We
 * surface `requiredScope` explicitly for 403 ingest-key-used-on-management
 * cases (the most common 4xx an agent will hit if the user wires an ingest
 * key instead of a management key by mistake).
 */
export interface ApiErrorBody {
  error: string
  requiredScope?: string
  retryAfterMs?: number
  scope?: string
  issues?: unknown
  [key: string]: unknown
}
