# Editor configs

Drop-in MCP server configs for the major editors. Replace the placeholder management key with your real one from [https://playloop.gg/settings](https://playloop.gg/settings).

## Files

| File | Where it goes |
|---|---|
| `claude-desktop-config.json` | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` <br> Windows: `%APPDATA%\Claude\claude_desktop_config.json` <br> Linux: `~/.config/Claude/claude_desktop_config.json` |
| `claude-code-config.json` | Project-level `.mcp.json` for Claude Code. |
| `cursor-config.json` | Global: `~/.cursor/mcp.json` <br> Project-level: `.cursor/mcp.json` at the repo root |

## Codex CLI

Codex uses TOML, not JSON. Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.playloop]
command = "npx"
args = ["-y", "--package=git+https://github.com/playloop/mcp.git#v0.5.0", "playloop"]
env = { PLAYLOOP_MANAGEMENT_KEY = "pl_mgmt_REPLACE_WITH_YOUR_KEY_FROM_PLAYLOOP_SETTINGS" }
```

## How to use

1. Open the file at the path for your editor (create it if it doesn't exist).
2. Paste in the JSON / TOML from the matching example here.
3. Replace `pl_mgmt_REPLACE_WITH_YOUR_KEY_FROM_PLAYLOOP_SETTINGS` with your real management key.
4. Save the file.
5. **Restart your editor.** Most MCP clients only re-scan on startup.

## Verification

In Claude Desktop / Code, look for a tool icon in the chat input, it should include `list_games`, `get_game`, and the other Playloop tools.

In Cursor, MCP tools show up in the right-hand panel when you start a chat in Composer / Agent mode.

Ask the agent: *"List my Playloop games."* If it calls `list_games` and returns your real games, you're connected.

## Troubleshooting

If the tools don't appear after a restart, check the editor's MCP log for errors. Common issues:

- **"Missing bearer token"** → the env var isn't being passed. Some shells strip `env` keys from MCP launches; try setting `PLAYLOOP_MANAGEMENT_KEY` as a system-wide env var instead.
- **"This endpoint requires a management key"** → you used an ingest key by mistake. Management keys start with `pl_mgmt_`, ingest keys start with `pl_ik_`.
- **`npx`-related errors** → make sure Node 18+ is on your PATH and `npx` resolves (`which npx` should print a path).
