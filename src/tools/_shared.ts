/**
 * Helpers shared by every MCP tool wrapper:
 *
 * - `jsonContent(data)`, wraps a JSON-serializable response as an MCP
 *   `text` content block. We don't expose a separate `resource` block per
 *   tool, the agent gets the data via the tool result and can decide how
 *   to use it. Resources are reserved for explicit URI fetches.
 *
 * - `errorContent(err)`, turns a `PlayloopApiError` / `PlayloopNetworkError`
 *   into a structured MCP tool result with `isError: true`. This is how the
 *   agent learns about 401/403/404/429 without crashing the connection.
 *   Importantly, 403 + `requiredScope: 'management'` (the "you wired an
 *   ingest key" case) is sanitized before being surfaced so the agent can tell the user
 *   what's wrong.
 */
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'
import { untrustedJsonContent } from '../security/model-data.js'
import { PlayloopApiError, PlayloopNetworkError } from '../client.js'

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Tool annotations. Every tool declares all four MCP behaviour hints
 * explicitly: connector directories require them, and an omitted hint defaults
 * to the worst case (destructive, open-world). Write tools carry an inline
 * object at their registration so the call site shows the behaviour.
 */

/** A pure read: no side effects, safe to repeat, limited to your Playloop data. */
export const READ_ONLY_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

/**
 * Reads that may generate fresh AI analysis (`suggest_fixes`, `get_fix_first`).
 * Not read-only, because a new generation can use your workspace's AI credits.
 * Nothing is deleted or overwritten, and a repeat call may generate again.
 */
export const AI_GENERATION_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}

export function jsonContent(data: unknown): McpToolResult {
  return untrustedJsonContent(data)
}

/**
 * The message a write tool returns on a read-only connection (`readOnly: true`).
 * It confirms nothing changed and points the caller to the fix, connect with the
 * key in an Authorization header rather than the URL. Writes remain role-gated at
 * the API, so this note lowers no authorization boundary. The stub never calls the
 * API, so no change is possible.
 */
export const READ_ONLY_WRITE_MESSAGE =
  'No changes were made: this is a read-only connection because the API key is in the URL. ' +
  'Creating or changing data (games, funnels, experiments) is still available to you based on ' +
  'your workspace role, reconnect with the key in an Authorization header (not the URL) to enable it.'

export async function readOnlyWriteStub(): Promise<McpToolResult> {
  return { isError: true, content: [{ type: 'text', text: READ_ONLY_WRITE_MESSAGE }] }
}

export function errorContent(err: unknown): McpToolResult {
  let data: unknown
  if (err instanceof PlayloopApiError) {
    data = { ...err.body, error: err.message, status: err.status }
  } else if (err instanceof PlayloopNetworkError) {
    data = { error: 'network error', message: err.message }
  } else {
    data = { error: 'unknown error', message: err instanceof Error ? err.message : String(err) }
  }
  return { ...jsonContent(data), isError: true }
}
