# Changelog

## [0.5.0] - 2026-09-09

- Public Git installation with a build step on first install, without an npm registry package.
- MCP tools for playtest analytics, games, builds, feedback, experiments, and funnels, using your existing management-key permissions.
- Three resource templates and four prompt templates for exploring your playtest data.
- Stdio and optional local HTTP transports, plus configuration examples for Claude Desktop, Claude Code, Cursor, and Codex.
- Feedback forms can accept optional repeat submissions while preserving request IDs on retries.
- Executable startup works through npm's installed command. Local HTTP requests validate their origin and allow reconnecting after a client disconnects.
