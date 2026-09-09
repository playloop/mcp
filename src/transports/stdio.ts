/**
 * Stdio transport, the primary distribution path for the Playloop MCP
 * server. Editors that spawn MCP servers as subprocesses (Claude Desktop /
 * Code, Cursor, Codex CLI) all speak this transport.
 *
 * Resolves when the transport is closed. Errors propagate.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // The MCP SDK manages the lifecycle from here. Block on close.
  await new Promise<void>((resolve) => {
    const close = () => resolve()
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
    transport.onclose = close
  })
}
