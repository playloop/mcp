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
 *   ingest key" case) is surfaced verbatim so the agent can tell the user
 *   what's wrong.
 */
import { PlayloopApiError, PlayloopNetworkError } from '../client.js'

export type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function jsonContent(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  }
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
  if (err instanceof PlayloopApiError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...err.body,
              error: err.message,
              status: err.status,
            },
            null,
            2,
          ),
        },
      ],
    }
  }
  if (err instanceof PlayloopNetworkError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: 'network error', message: err.message },
            null,
            2,
          ),
        },
      ],
    }
  }
  const message = err instanceof Error ? err.message : String(err)
  return {
    isError: true,
    content: [
      { type: 'text', text: JSON.stringify({ error: 'unknown error', message }, null, 2) },
    ],
  }
}
