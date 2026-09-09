/**
 * Playloop MCP CLI entry point.
 *
 * Usage:
 *   playloop                                      # stdio (default)
 *   playloop --transport sse --port 4000           # local HTTP transport
 *
 * The management key can also be supplied via the `PLAYLOOP_MANAGEMENT_KEY`
 * env var (preferred, keeps the key out of shell history and ps output).
 *
 * Auth note: this server REQUIRES a management key. The Playloop API
 * rejects ingest keys (the ones embedded in client binaries) with HTTP 403.
 * Do not use an ingest key here, see AGENTS.md.
 */
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPlayloopMcpServer } from './server.js'
import { runStdio } from './transports/stdio.js'
import { runSSE } from './transports/sse.js'

interface ParsedArgs {
  transport: 'stdio' | 'sse'
  key: string | null
  baseUrl: string | undefined
  port: number
  host: string | undefined
  help: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    transport: 'stdio',
    key: process.env['PLAYLOOP_MANAGEMENT_KEY'] ?? null,
    baseUrl: process.env['PLAYLOOP_BASE_URL'] ?? undefined,
    port: 4000,
    host: undefined,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '--help':
      case '-h':
        args.help = true
        break
      case '--transport':
      case '-t': {
        const v = argv[++i]
        if (v !== 'stdio' && v !== 'sse') {
          throw new Error(`--transport must be "stdio" or "sse" (got "${String(v)}")`)
        }
        args.transport = v
        break
      }
      case '--key':
      case '-k':
        args.key = argv[++i] ?? null
        break
      case '--base-url':
        args.baseUrl = argv[++i]
        break
      case '--port':
      case '-p': {
        const v = argv[++i]
        const n = v === undefined ? NaN : Number(v)
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          throw new Error(`--port must be an integer 1-65535 (got "${String(v)}")`)
        }
        args.port = n
        break
      }
      case '--host':
        args.host = argv[++i]
        break
      default:
        if (a !== undefined && a.startsWith('-')) {
          throw new Error(`Unknown flag: ${a}`)
        }
    }
  }
  return args
}

function usage(): string {
  return [
    'Playloop MCP server',
    '',
    'Usage:',
    '  playloop [options]',
    '',
    'Options:',
    '  --transport, -t  stdio | sse              Transport (default: stdio)',
    '  --key, -k        pl_mgmt_<hex>            Management key (or set PLAYLOOP_MANAGEMENT_KEY)',
    '  --port, -p       4000                     SSE port (default: 4000, sse transport only)',
    '  --host           127.0.0.1                SSE bind host (default: loopback only)',
    '  --help, -h                                Show this help',
    '',
    'Auth:',
    '  This server requires a MANAGEMENT key (pl_mgmt_*). Ingest keys (pl_ik_*)',
    '  are rejected by the Playloop API with HTTP 403.',
    '',
    '  When --host binds to a non-loopback address (anything other than 127.0.0.1,',
    '  ::1, or localhost), the SSE transport REQUIRES a bearer token on /sse and',
    '  /messages. Set PLAYLOOP_MCP_SSE_TOKEN to pin one, or one will be generated',
    '  and printed at startup. Clients must send Authorization: Bearer <token>.',
    '',
    'Get your management key at https://playloop.gg/settings',
  ].join('\n')
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: ParsedArgs
  try {
    args = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${usage()}\n`)
    return 2
  }

  if (args.help) {
    process.stdout.write(`${usage()}\n`)
    return 0
  }

  if (!args.key) {
    process.stderr.write(
      'error: missing management key. Pass --key pl_mgmt_<hex> or set PLAYLOOP_MANAGEMENT_KEY.\n\n',
    )
    process.stderr.write(`${usage()}\n`)
    return 2
  }

  const server = createPlayloopMcpServer({
    apiKey: args.key,
    ...(args.baseUrl !== undefined ? { baseUrl: args.baseUrl } : {}),
  })

  if (args.transport === 'stdio') {
    await runStdio(server)
  } else {
    await runSSE(server, { port: args.port, ...(args.host !== undefined ? { host: args.host } : {}) })
  }
  return 0
}

// Run only when invoked as a script, `import('./cli.js')` in tests must not start the server.
const invokedDirectly = (() => {
  try {
    const argv1 = process.argv[1]
    return argv1 !== undefined && realpathSync(argv1) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  main().then(
    (code) => {
      if (code !== 0) process.exit(code)
    },
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
      process.exit(1)
    },
  )
}
