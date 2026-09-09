import { describe, expect, it, vi } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerFeedbackTools } from '../../src/tools/feedback.js'
import { fakeClient } from '../_helpers.js'
import { PlayloopApiError } from '../../src/client.js'

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function setup(routes: Record<string, unknown> | ((path: string, body?: unknown) => unknown)) {
  const server = new McpServer({ name: 'test', version: '0.0.0' })
  const client = fakeClient(routes)
  registerFeedbackTools(server, client)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
  return { fileFeatureRequest: tools['file_feature_request'] }
}

describe('tool: file_feature_request', () => {
  it('validates kind/title/body', () => {
    const { fileFeatureRequest } = setup({})
    const s = fileFeatureRequest.inputSchema
    expect(s.safeParse({}).success).toBe(false)
    expect(s.safeParse({ kind: 'other', title: 'abc', body: 'x' }).success).toBe(false)
    expect(s.safeParse({ kind: 'feature', title: 'ab', body: 'x' }).success).toBe(false) // title too short
    expect(s.safeParse({ kind: 'bug', title: 'A real title', body: 'detail' }).success).toBe(true)
  })

  it('POSTs the feedback to /api/v1/feedback', async () => {
    const spy = vi.fn(() => ({ ok: true, recorded: true }))
    const server = new McpServer({ name: 'test', version: '0.0.0' })
    const client = fakeClient(spy as unknown as (p: string, b?: unknown) => unknown)
    registerFeedbackTools(server, client)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools
    await tools['file_feature_request'].handler(
      { kind: 'feature', title: 'Add dark mode', body: 'please' },
      {},
    )
    expect(spy).toHaveBeenCalledWith('/api/v1/feedback', {
      kind: 'feature',
      title: 'Add dark mode',
      body: 'please',
    })
  })

  it('relays the generic ack', async () => {
    const { fileFeatureRequest } = setup({ '/api/v1/feedback': { ok: true, recorded: true } })
    const out = (await fileFeatureRequest.handler(
      { kind: 'bug', title: 'Export crashes', body: 'steps' },
      {},
    )) as ToolResult
    expect(out.isError).toBeFalsy()
    expect(JSON.parse(out.content[0]!.text)).toEqual({ ok: true, recorded: true })
  })

  it('relays an API error', async () => {
    const { fileFeatureRequest } = setup(() => {
      throw new PlayloopApiError(401, { error: 'Missing bearer token' })
    })
    const out = (await fileFeatureRequest.handler(
      { kind: 'feature', title: 'A title', body: 'x' },
      {},
    )) as ToolResult
    expect(out.isError).toBe(true)
    expect(JSON.parse(out.content[0]!.text).status).toBe(401)
  })
})
