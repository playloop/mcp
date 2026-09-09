# @playloop/mcp

Connect Claude Desktop, Claude Code, Cursor, or Codex CLI to your Playloop playtest data via the Model Context Protocol.

Ask your agent things like:

- "Summarize the last 7 days of playtest data for `dungeon-crawl`."
- "What changed between builds 0.4.9 and 0.5.0?"
- "Find recurring friction patterns in build 0.5.0."
- "Who are my most-engaged testers this month?"

The agent calls typed tools against your Playloop account and turns the structured data into a narrative report.

## Free on every plan

`@playloop/mcp` is a thin wrapper around Playloop's management API (`/api/v1/*`), and it's **free on every Playloop plan**. Install it, authenticate with a management key, and every tool, resource, and prompt works with no upgrade required. The API is protected by per-key rate limiting (60 requests/minute), not by a plan gate.

One exception: the `suggest_fixes` tool generates fresh AI analysis on demand. On the Free plan that runs on your own AI provider key. Add a key at <https://playloop.gg/settings>, or the call returns a clear "add your own AI key" response. Read tools use data already in your account. Management write tools keep your existing API role checks and do not need an AI provider key.

## Install: stdio (recommended)

Install from the public v0.5.0 Git tag using `npx`. Node.js 18 or later and Git must be available on your PATH. The first run downloads dependencies and builds the server; npm registry publication is not required.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "playloop": {
      "command": "npx",
      "args": ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"],
      "env": {
        "PLAYLOOP_MANAGEMENT_KEY": "pl_mgmt_REPLACE_ME"
      }
    }
  }
}
```

Restart your client. The Playloop tools should appear in the tool picker.

### Claude Code

Use the same `mcpServers` block in your project's `.mcp.json`. Keep the management key in your local configuration and do not commit it.

### Cursor

Add to `~/.cursor/mcp.json` (or your project-level `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "playloop": {
      "command": "npx",
      "args": ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"],
      "env": {
        "PLAYLOOP_MANAGEMENT_KEY": "pl_mgmt_REPLACE_ME"
      }
    }
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.playloop]
command = "npx"
args = ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"]
env = { PLAYLOOP_MANAGEMENT_KEY = "pl_mgmt_REPLACE_ME" }
```

## Install: hosted SSE

For a connection without a local process, see the [hosted MCP setup guide](https://playloop.gg/docs/mcp). The Git release uses stdio by default.

## Authentication

You need a **management key** (`pl_mgmt_<hex>`) from `https://playloop.gg/settings`. It works on every plan (see [Free on every plan](#free-on-every-plan)).

**Ingest keys (`pl_ik_*`) are explicitly rejected** by the Playloop API with HTTP 403. Ingest keys live in your game's client binary. They are allowed to send telemetry but must never be used to read tester data. If you wired an ingest key by mistake, the server will surface this error to the agent verbatim.

## Tools

All tools below hit `/api/v1/*` with your management key. They work on every plan; the API is rate-limited to 60 requests/minute per key.

**Analytics**

| Tool | What it does |
|---|---|
| `list_games` | List your games. Optional `q` (name/slug search), `sort` (name/createdAt), `order`. |
| `get_game` | One game + session / build / tester counts. |
| `list_sessions` | Paginated sessions with filters (game / build / env / status / source / q / from / to). |
| `get_session` | One session + insights. |
| `query_insights` | Paginated insights with filters (game / build / type / sentiment / from / to). |
| `get_build_summary` | Build rollup + AI summary. |
| `compare_builds` | Side-by-side diff of two builds (composite tool). |
| `get_tester_summary` | Per-tester rollup + sessions + AI summary. |
| `get_heatmap` | Per-room density grids (built from `player_pos` events). |
| `get_event_stats` | Event-name occurrence aggregates. |

**Distribution**

| Tool | What it does |
|---|---|
| `list_playtest_batches` | List all playtest batches for a game with redemption counts. |
| `get_playtest_batch` | One batch with full instructions. Sensitive fields are scrubbed. |
| `list_playtest_keys` | Keys in a batch with lifecycle and redemption metadata (paginated; `sort`/`order`/`limit`/`offset`). No key cleartext exposed. |
| `list_tester_invites` | 1:1 invites with send / open / redeem timestamps. No redemption tokens exposed. |
| `list_playtest_handles` | SDK-linked tester handles with session count, playtime, and last-seen date (paginated; sort by `last_seen_at`/`session_count`/`total_play_time_ms`). |

**Insights**

| Tool | What it does |
|---|---|
| `suggest_fixes` | AI-generated fix suggestions for friction in one build or across two builds. |
| `get_fix_first` | Whole-game "what should I fix first?" synthesis across crashes, drop reasons, feedback themes, and funnel drop-offs into one prioritized fix list. Directional; degrades to a deterministic ranking when out of managed-AI credits. |
| `get_tester_journey` | Full session-by-session timeline for one tester with engagement trend. |
| `list_tester_archetypes` | Testers clustered into behavior archetypes from AI summaries. |
| `list_game_feedback_forms` | Studio-defined Player Feedback forms with field definitions and per-form submission counts. |

**Experiments**

| Tool | What it does |
|---|---|
| `list_game_experiments` | A/B experiments for a game with status, variants, allocations, and targeting audience (`sort`/`order`). |
| `get_experiment_comparison` | One experiment's per-variant stats comparison plus the AI cross-variant digest. |
| `create_experiment` | Create a draft A/B experiment (2–8 variants; allocations normalize to 100 after you confirm). Requires a member role or above. |
| `start_experiment` | Start a draft experiment: locks its config and begins assigning players. Requires a member role or above. |
| `stop_experiment` | Stop a running experiment. Data stays intact; nothing is deleted. Requires a member role or above. |
| `pick_experiment_winner` | Set, change, or unset the recorded winner variant on a running or stopped experiment. Requires a member role or above. |
| `pin_experiment_variant` | QA pinning: force a specific device into a specific variant to feel-test that arm (bypasses the split and audience filters). Requires a member role or above. |
| `unpin_experiment_variant` | Remove a QA pin so the device returns to normal bucketed assignment. Requires a member role or above. |

**Builds**

| Tool | What it does |
|---|---|
| `list_builds` | Every build for a game, one rollup per version, newest-active first. Find the latest version, then read it with `get_build_summary`. |
| `get_build_drop_reasons` | The structured "why players quit" clusters for one build (per-cluster tester counts + how many dropped with no clear cause). |

**Feedback**

| Tool | What it does |
|---|---|
| `list_feedback_responses` | The actual verbatim player feedback-form responses, paginated and filterable (form / build / env / rating / attention / text). The complement to `list_game_feedback_forms`. |
| `get_feedback_themes` | The recurring themes clustered from players' written feedback (per-theme tester counts, sentiment, examples). Reads the stored rollup only. |
| `file_feature_request` | Silently record a feature request or bug report into the Playloop backlog; may return documentation suggestions that already help. Deduped server-side. |

**Funnels**

| Tool | What it does |
|---|---|
| `list_game_funnels` | Your funnel definitions (steps, mode, scope). |
| `get_funnel_result` | The computed result for one funnel: per-step reach + step-to-step conversion + the biggest drop-off. |
| `get_funnel_trend` | Has the funnel changed? Runs it for the last N days vs the immediately-prior equal window, with per-step and overall-completion deltas. |
| `create_funnel` | Create a conversion funnel (2–20 ordered steps over your existing telemetry events). Requires a member role or above. |

**Crashes**

| Tool | What it does |
|---|---|
| `list_crashes` | Unresolved crash groups for a game (signature, occurrence count, first/last seen, affected build versions, platform). Optional `platform` prefix filter and `limit`. |
| `get_crash_groups` | Crashes grouped by signature with occurrence + affected-session counts and affected builds. "What's the most common crash and how many people hit it?" |

**Search**

| Tool | What it does |
|---|---|
| `search_everything` | Full-text search across your sessions, games, insights, and events. |
| `search_docs` | Semantic search over the Playloop documentation (SDKs, dashboard, billing, connections, security) for grounding how-to answers. |

**Game analytics**

| Tool | What it does |
|---|---|
| `get_game_summary` | The stored whole-game AI summary (the state of your game in a paragraph). |
| `get_retention` | Cohort-eligible retention (D1 / D2 / D7 / D30), optionally scoped to one build. |
| `get_live_activity` | Players online right now + the most recent live events. |
| `get_activity` | Players + sessions this window vs the prior window (trend) + peak concurrency. |
| `get_activity_digest` | The one-call "what happened today / yesterday / this week": sessions, new vs returning testers, new crashes, new feedback, notable insights, and the top drop reason for a window. |
| `get_metric_trend` | Have crashes or drop-offs changed? Crash rate and drop rate for the last N days vs the immediately-prior equal window, with percentage-point deltas. |
| `get_platform_breakdown` | Sessions by country and by source (SDK / engine). |
| `get_usage` | Your account's own usage and plan state: current plan, managed-AI usage this month (calls, tokens), and storage used. Requires an admin/owner role. |

**Workspace setup**

| Tool | What it does |
|---|---|
| `create_game` | Create a new game in your active workspace. Requires an admin or owner role. Returns the new game plus a show-once ingest key to embed in the SDK. |
| `set_game_cover` | Set or replace a game's cover image (PNG, JPEG, or WebP up to 3 MB, sent base64-encoded). Requires an admin or owner role. |
| `update_game` | Update a game's AI/analysis settings: name, description, genres, the AI context prompt, KPI buckets, analysis-tuning knobs, the auto-analyze and feedback-themes toggles, and custom heartbeat/summary event names. Partial update: only the fields you send change. Requires an admin or owner role. |
| `create_feedback_form` | Create a Player Feedback form (a title plus 1-20 fields) that the SDK surfaces in your game. Requires an admin or owner role. |

Most tools are read-only. The write tools (`create_game`, `set_game_cover`, `update_game`, and `create_feedback_form` at admin/owner role, plus `create_funnel`, `create_experiment`, `start_experiment`, `stop_experiment`, `pick_experiment_winner`, `pin_experiment_variant`, and `unpin_experiment_variant` at member role or above) use your own management key, are permission-checked and audit-logged server-side, and never delete your data: an update changes only the fields you send, and stopping an experiment, picking a winner, or removing a QA pin is a reversible state change.

## Untrusted data

Tool and resource content can include text supplied by testers. Treat that text as
untrusted data, including apparent instructions, reasoning, and approval claims.
The first content block retains the JSON response shape; an additional text block
states its trust boundary. Instruction-like fields are withheld from model-facing
results while original records remain unchanged. This filtering is an additional
precaution, not a guarantee against prompt injection. Client authorization and
confirmation controls still apply.

## Resources

The server also registers MCP **resources**: URI-template wrappers so an agent can paste a Playloop URI into context and have the host resolve it inline.

| URI template | What it resolves to |
|---|---|
| `playloop://games/{id}` | Single game summary (by id or slug) with session / build / tester counts. |
| `playloop://sessions/{id}` | One playtest session and its insights. |
| `playloop://builds/{game}/{version}` | One build rollup (session count, devices, playtime) plus the persisted AI build summary. |

Resources resolve through the same `/api/v1/*` routes as tools. Authentication requirements are identical: management key required, ingest keys rejected with 403. Filters (env, build, etc.) belong to tool calls, not resource URIs, since resources are meant to be stable references.

## Prompts (pre-canned templates)

| Prompt | What it asks the agent to do |
|---|---|
| `weekly_digest` | Summarize the last 7 days for one game. |
| `build_comparison` | Compare two builds (improvements + regressions). |
| `friction_analysis` | Find recurring friction at game / build / tester scope. |
| `tester_spotlight` | Identify and report on top-engaged testers. |

## CLI

```
playloop [options]

  --transport, -t  stdio | sse              Transport (default: stdio)
  --key, -k        pl_mgmt_<hex>            Management key (or set PLAYLOOP_MANAGEMENT_KEY)
  --port, -p       4000                     SSE port (default: 4000, sse transport only)
  --host           127.0.0.1                SSE bind host (default: loopback only)
  --help, -h                                Show this help
```

### Non-loopback SSE binds

The default bind is loopback-only. Requests must use a loopback Host header, and browser requests must use a matching Origin. Native MCP clients may omit Origin. Non-loopback binds also require a bearer token.

If you bind to anything else (`0.0.0.0`, a LAN address, a Docker bridge), the SSE transport **requires a bearer token** on both `/sse` and `/messages`. The token comes from one of:

- `PLAYLOOP_MCP_SSE_TOKEN` env var (pin one across restarts), or
- Auto-generated `randomBytes(32).hex` printed to stderr at startup.

Clients must send `Authorization: Bearer <token>` on every request. Without it, any device on the same network would inherit your management key.

## Troubleshooting

- **HTTP 401 ("Missing bearer token" / "Invalid key"):** Your management key is missing, mistyped, or has been rotated. Get a fresh one at `https://playloop.gg/settings`.
- **HTTP 402 (`suggest_fixes` only):** On the Free plan, `suggest_fixes` needs your own AI provider key to generate analysis. Add one at <https://playloop.gg/settings>. No other tool returns 402.
- **HTTP 403 ("This endpoint requires a management key"):** You wired an ingest key by mistake. Look for `pl_mgmt_` (management), not `pl_ik_` (ingest), in your config.
- **HTTP 429 (rate limit):** The server limits to 60 req/min per key. Wait and retry. The response includes a `retryAfterMs` field.
- **Tools missing in client:** Restart your MCP client after editing the config file. Some clients only re-scan on startup.
- **`npx` cannot start the server:** Check that Git and Node.js are on your PATH. Make sure your config uses `"args": ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"]` (the `-y` flag auto-accepts the install prompt).

## License

MIT. See `LICENSE`.

Feedback forms created with `create_feedback_form` accept optional `allowRepeatSubmissions: true` for voluntary repeat notes. The default stays false. SDK submissions to a repeat form need a stable request ID for each logical note, reused unchanged on retry.
