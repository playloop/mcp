# Using `@playloop/mcp` with your coding agent

This is the **Playloop MCP server**. It connects an AI agent (Claude Desktop,
Claude Code, Cursor, Codex CLI, or any MCP-compatible client) to your Playloop
playtest data, so you can ask plain-language questions and get back structured,
analyzed results, "summarize the last 7 days of `dungeon-crawl`", "what changed
between builds 0.4.9 and 0.5.0?", "who are my most-engaged testers?"

It includes read tools and role-checked write tools. The server is **free on every Playloop plan**. This file is written
for the coding agent that's wiring Playloop into your workflow; the human-facing
overview is in `README.md`.

## Install

Run the public v0.5.0 Git release on demand with `npx`. Node.js 18+ and Git are required. The first run builds the server. Add it to your
MCP client config with a management key (see [Authentication](#authentication)).

**Claude Desktop**, `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "playloop": {
      "command": "npx",
      "args": ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"],
      "env": { "PLAYLOOP_MANAGEMENT_KEY": "pl_mgmt_REPLACE_ME" }
    }
  }
}
```

**Claude Code:** use the same block in a project-level `.mcp.json`; do not commit your management key.

**Cursor**, `~/.cursor/mcp.json` (or project-level `.cursor/mcp.json`): same
`mcpServers` block as above.

**Codex CLI**, `~/.codex/config.toml`:

```toml
[mcp_servers.playloop]
command = "npx"
args = ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"]
env = { PLAYLOOP_MANAGEMENT_KEY = "pl_mgmt_REPLACE_ME" }
```

Restart your client after editing the config, most clients only re-scan MCP
servers on startup. The Playloop tools then appear in the tool picker.

For hosted connection options, see <https://playloop.gg/docs/mcp>.

## Authentication

You need a **management key** (`pl_mgmt_<hex>`) from <https://playloop.gg/settings>.
It works on every plan. Set it as `PLAYLOOP_MANAGEMENT_KEY` in the server's `env`
(above) or pass `--key`.

**Ingest keys (`pl_ik_*`) are rejected with HTTP 403.** Ingest keys live in your
game's client binary and may only send telemetry, never read tester data. If
you wire one by mistake, the server surfaces the error to the agent verbatim.

## Configuration (CLI flags / env)

| Flag | Env | Default | What it does |
|---|---|---|---|
| `--transport`, `-t` | | `stdio` | `stdio` (local client) or `sse` (hosted/HTTP). |
| `--key`, `-k` | `PLAYLOOP_MANAGEMENT_KEY` | | Your `pl_mgmt_<hex>` management key. |
| `--port`, `-p` | | `4000` | SSE port (sse transport only). |
| `--host` | | `127.0.0.1` | SSE bind host. |

**SSE binds beyond loopback need a bearer token.** The default `--host 127.0.0.1`
is local-only, so no transport auth is needed. If you bind to `0.0.0.0`, a LAN
address, or a Docker bridge, the SSE transport **requires** an
`Authorization: Bearer <token>` header on `/sse` and `/messages`. Provide the
token via `PLAYLOOP_MCP_SSE_TOKEN`, or let the server auto-generate one and print
it to stderr at startup. Without it, any device on your network could inherit
your management key.

## Tools the server provides

Most tools are read-only. Write tools retain the management API role checks documented in `README.md`; creating a feedback form requires admin or owner access. Requests are rate-limited to 60 per minute per key. They
work on every plan. Pass a game by `id` or `slug`; most accept an optional `env`
filter.

### Analytics

| Tool | What it returns |
|---|---|
| `list_games` | Your games. |
| `get_game` | One game plus session / build / tester counts. |
| `list_sessions` | Paginated sessions, filterable by game / build / env / status / source / search / date range. |
| `get_session` | One session and its insights (including any feedback-form submissions tied to it). |
| `query_insights` | Paginated insights, filterable by game / build / type / sentiment / date range. |
| `get_build_summary` | A build's rollup plus its AI build summary. |
| `compare_builds` | Side-by-side comparison of two builds. |
| `get_tester_summary` | One tester's rollup, sessions, and AI summary. |
| `get_heatmap` | Per-room position-density grids. |
| `get_event_stats` | Event-name occurrence aggregates. |

### Distribution

| Tool | What it returns |
|---|---|
| `list_playtest_batches` | A game's playtest batches with redemption counts. |
| `get_playtest_batch` | One batch with its instructions (sensitive fields scrubbed). |
| `list_playtest_keys` | Keys in a batch with lifecycle + redemption metadata (no key cleartext). |
| `list_tester_invites` | 1:1 invites with send / open / redeem timestamps (no tokens). |
| `list_playtest_handles` | SDK-linked tester handles with session count, playtime, and last-seen. |

### Insights & feedback

| Tool | What it returns |
|---|---|
| `suggest_fixes` | AI fix suggestions for friction in one build, or across two builds (`a` / `b`). |
| `get_tester_journey` | One tester's session-by-session timeline with an engagement trend. |
| `list_tester_archetypes` | Testers grouped into behavior archetypes from their summaries. |
| `list_game_feedback_forms` | Your studio-defined Player Feedback forms, field definitions + per-form submission counts. |

### Experiments

| Tool | What it returns |
|---|---|
| `list_game_experiments` | A game's A/B experiments with status, variants, allocations, and target audience. |
| `get_experiment_comparison` | One experiment's per-variant comparison plus its AI cross-variant digest. |

### Builds

| Tool | What it returns |
|---|---|
| `list_builds` | Every build for a game, one rollup per version, newest-active first (find the latest, then read it with `get_build_summary`). |
| `get_build_drop_reasons` | The structured "why players quit" clusters for one build. |

### Feedback

| Tool | What it returns |
|---|---|
| `list_feedback_responses` | The actual verbatim player feedback-form responses (paginated, filterable). The complement to `list_game_feedback_forms`. |

### Funnels

| Tool | What it returns |
|---|---|
| `get_funnel_result` | The computed per-step reach + conversion + biggest drop-off for one funnel. |

### Crashes

| Tool | What it returns |
|---|---|
| `list_crashes` | A game's unresolved crash groups (signature, occurrence count, first/last seen, affected build versions, platform). Optional `platform` prefix filter and `limit`. |
| `get_crash_groups` | Crashes grouped by signature with occurrence + affected-session counts. "What's the most common crash and how many people hit it?" |

### Search

| Tool | What it returns |
|---|---|
| `search_everything` | Full-text search across your sessions, games, insights, and events. |

### Game analytics

| Tool | What it returns |
|---|---|
| `get_game_summary` | The stored whole-game AI summary. |
| `get_retention` | Cohort retention (D1 / D2 / D7 / D30), optionally per-build. |
| `get_live_activity` | Players online now + recent live events. |
| `get_activity` | Players + sessions this window vs the prior window + peak concurrency. |
| `get_platform_breakdown` | Sessions by country and by source (SDK / engine). |
| `get_usage` | Your account's plan + managed-AI usage this month + storage used. **Owner / admin only** (member and viewer keys get a 403). |

> **`suggest_fixes` and AI keys.** Most tools read data already in your account
> and need no key of your own. `suggest_fixes` generates fresh analysis on
> demand, on the Free plan it runs on your own AI provider key (add one at
> <https://playloop.gg/settings>) and otherwise returns a clear
> `{ ok: false, requiresPremium: true }` with HTTP 402. No other tool returns 402.

## Resources

The server also registers MCP **resources**, URI templates an agent can resolve
inline. They resolve through the same routes (management key required, ingest
keys rejected). Filters belong on tool calls, not resource URIs.

| URI template | Resolves to |
|---|---|
| `playloop://games/{id}` | One game summary (by id or slug) with counts. |
| `playloop://sessions/{id}` | One session and its insights. |
| `playloop://builds/{game}/{version}` | One build rollup plus its AI build summary. |

## Prompts (pre-canned templates)

| Prompt | What it asks the agent to do |
|---|---|
| `weekly_digest` | Summarize the last 7 days for one game. |
| `build_comparison` | Compare two builds (improvements + regressions). |
| `friction_analysis` | Find recurring friction at game / build / tester scope. |
| `tester_spotlight` | Identify and report on top-engaged testers. |

## Telemetry & feedback basics

Playloop's data starts in your game: a Playloop SDK (Unity / Unreal / Godot /
Python / TypeScript) sends sessions and events, and **studio-defined feedback
forms** collect structured player feedback in-game. This MCP server is the
**management** side of that loop. It reads results and can configure games and
feedback forms; it does not send game telemetry or submit player responses. Use `list_game_feedback_forms` to see what feedback you're collecting,
and `get_session` to read the submissions tied to a given session.

## Wiring this into a project (note for coding agents)

When a user asks you to "connect Playloop" or "analyze my playtest data":

1. **Add the MCP server** to the client's config (the `mcpServers` / `mcp_servers`
   block above), using a `pl_mgmt_<hex>` management key from
   <https://playloop.gg/settings> via `PLAYLOOP_MANAGEMENT_KEY`. Don't hardcode
   the key in committed files, keep it in the user's local MCP config or env.
2. **Restart / re-scan** the client so the tools register.
3. **Discover before you drill down.** Call `list_games` first to resolve the
   right game id/slug, then `list_sessions` / `query_insights` / `get_build_summary`
   for the specifics. Use the resources (`playloop://…`) when you want a stable
   reference to a single game / session / build.
4. **Errors come back as tool results, not crashes**, read the HTTP status:
   `401` (key missing/rotated), `402` (`suggest_fixes` needs a BYO AI key on
   Free), `403` (you used an ingest key, switch to `pl_mgmt_`), `429` (rate
   limit; back off using the `retryAfterMs` field).

## License

MIT. See `LICENSE`.
