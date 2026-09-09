import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { createServer, request, type IncomingMessage } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const scratch = mkdtempSync(join(tmpdir(), 'mcp-runtime-'))
const executable = join(scratch, 'playloop')

beforeAll(() => {
  // Build the source under test, never rely on a stale dist directory.
  execFileSync(process.execPath, [join(root, 'node_modules/tsup/dist/cli-default.js')], {
    cwd: root,
    stdio: 'pipe',
  })
  symlinkSync(join(root, 'dist/cli.js'), executable)
}, 30_000)

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

async function reservePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No TCP address')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

async function startHttp(host = '127.0.0.1') {
  const port = await reservePort()
  const child = spawn(process.execPath, [executable, '--transport', 'sse', '--host', host, '--port', String(port)], {
    env: { ...process.env, PLAYLOOP_MANAGEMENT_KEY: 'pl_mgmt_runtime_test', PLAYLOOP_MCP_SSE_TOKEN: 'runtime-test-token' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HTTP server did not start')), 5000)
    child.once('exit', () => { clearTimeout(timer); reject(new Error('HTTP server exited before readiness')) })
    child.stderr.on('data', (data: Buffer) => {
      if (data.toString().includes('Playloop MCP listening')) { clearTimeout(timer); resolve() }
    })
  }).catch(async (err: unknown) => { await stop(child); throw err })
  return { child, base: `http://${host === '::1' ? '[::1]' : '127.0.0.1'}:${port}` }
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const force = setTimeout(() => child.kill('SIGKILL'), 2000)
  try { await exited } finally { clearTimeout(force) }
}

async function httpResponse(url: string, headers: Record<string, string> = {}, method = 'GET', body?: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers, method }, resolve)
    req.once('error', reject)
    req.end(body)
  })
}

describe('installed CLI runtime', () => {
  it('runs through the npm-style executable symlink', () => {
    const output = execFileSync(process.execPath, [executable, '--help'], { encoding: 'utf8' })
    expect(output).toContain('Playloop MCP server')
    expect(output).toContain('PLAYLOOP_MANAGEMENT_KEY')
  })

  it('does not start the server when imported', () => {
    const url = pathToFileURL(join(root, 'dist/cli.js')).href
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('imported')`], {
      encoding: 'utf8', env: { ...process.env, PLAYLOOP_MANAGEMENT_KEY: '' },
    })
    expect(output.trim()).toBe('imported')
  })

  it('completes a stdio handshake and reads through the supplied management key', async () => {
    const requests: { path: string | undefined; authorization: string | undefined }[] = []
    const api = createServer((req, res) => {
      requests.push({ path: req.url, authorization: req.headers.authorization })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ games: [{ id: 'local-game', slug: 'local-game', name: 'Local game' }], total: 1 }))
    })
    api.listen(0, '127.0.0.1')
    await once(api, 'listening')
    const address = api.address()
    if (!address || typeof address === 'string') throw new Error('No API address')
    const client = new Client({ name: 'runtime-test', version: '1.0.0' })
    const transport = new StdioClientTransport({
      command: process.execPath, args: [executable],
      env: { PLAYLOOP_MANAGEMENT_KEY: 'pl_mgmt_runtime_test', PLAYLOOP_BASE_URL: `http://127.0.0.1:${address.port}` },
    })
    try {
      await client.connect(transport)
      const tools = await client.listTools()
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['list_games', 'create_feedback_form']))
      const result = await client.callTool({ name: 'list_games', arguments: {} })
      expect(JSON.stringify(result)).toContain('local-game')
      expect(requests).toEqual([{ path: '/api/v1/games', authorization: 'Bearer pl_mgmt_runtime_test' }])
    } finally {
      await client.close()
      await new Promise<void>((resolve) => api.close(() => resolve()))
    }
  })

  it('rejects hostile loopback requests on both routes and supports reconnecting', async () => {
    const { child, base } = await startHttp()
    const open: IncomingMessage[] = []
    try {
      for (const [path, method] of [['/sse', 'GET'], ['/messages', 'POST']]) {
        for (const headers of [{ Host: 'attacker.invalid' }, { Origin: 'https://attacker.invalid' }, { Origin: 'null' }]) {
          const response = await httpResponse(base + path, headers, method)
          expect(response.statusCode).toBe(403)
          response.resume()
        }
      }
      const first = await httpResponse(`${base}/sse`, { Origin: base })
      open.push(first)
      expect(first.statusCode).toBe(200)
      const [firstChunk] = await once(first, 'data') as [Buffer]
      const oldEndpoint = firstChunk.toString().match(/data: (.+)/)?.[1]
      expect(oldEndpoint).toContain('/messages?sessionId=')
      const concurrent = await httpResponse(`${base}/sse`)
      expect(concurrent.statusCode).toBe(409)
      concurrent.resume()
      first.destroy()
      let status = 409
      let currentEndpoint = ''
      for (let attempt = 0; attempt < 20 && status === 409; attempt++) {
        await delay(10)
        const next = await httpResponse(`${base}/sse`)
        status = next.statusCode ?? 0
        if (status === 200) {
          open.push(next)
          const [chunk] = await once(next, 'data') as [Buffer]
          currentEndpoint = chunk.toString().match(/data: (.+)/)?.[1] ?? ''
        }
        else next.resume()
      }
      expect(status).toBe(200)
      for (const endpoint of ['/messages', oldEndpoint!]) {
        const stale = await httpResponse(base + endpoint, {}, 'POST')
        expect(stale.statusCode).toBe(400)
        stale.resume()
      }
      const current = await httpResponse(base + currentEndpoint, { 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }))
      expect(current.statusCode).toBe(202)
      current.resume()
    } finally { open.forEach((response) => response.destroy()); await stop(child) }
  })

  it.skipIf(!Object.values(networkInterfaces()).flat().some((address) => address?.address === '::1'))('accepts the IPv6 loopback bind', async () => {
    const { child, base } = await startHttp('::1')
    let response: IncomingMessage | undefined
    try {
      response = await httpResponse(`${base}/sse`, { Origin: base })
      expect(response.statusCode).toBe(200)
    } finally { response?.destroy(); await stop(child) }
  })

  it('requires bearer authentication beyond loopback', async () => {
    const { child, base } = await startHttp('0.0.0.0')
    let accepted: IncomingMessage | undefined
    try {
      for (const headers of [{}, { Authorization: 'Bearer wrong-token' }]) {
        const response = await httpResponse(`${base}/sse`, headers)
        expect(response.statusCode).toBe(401)
        response.resume()
      }
      accepted = await httpResponse(`${base}/sse`, { Authorization: 'Bearer runtime-test-token' })
      expect(accepted.statusCode).toBe(200)
    } finally { accepted?.destroy(); await stop(child) }
  })
})
