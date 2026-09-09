/**
 * MCP resource registrations for the Playloop server.
 *
 * Three URI templates:
 *
 *   playloop://games/{id}               , single game + counts
 *   playloop://sessions/{id}            , single session + insights
 *   playloop://builds/{game}/{version}  , one build rollup + AI summary
 *
 * Resources are read via the same `/api/v1` HTTP surface as tools, these
 * are just URI-template wrappers so an agent can include a Playloop URI in
 * its context and the host (Claude Desktop, etc.) can resolve it.
 *
 * URI scheme: `playloop://<kind>/<...path>`. We do NOT support filters in
 * the URI (env, build) because resources are meant to be stable references;
 * filtered queries belong to tool calls.
 */
import { jsonContent, errorContent } from '../tools/_shared.js'
import { untrustedResourceContent } from '../security/model-data.js'
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { PlayloopClient } from '../client.js'
import type { GameDetail, SessionDetailResponse, BuildSummary } from '../types.js'

export function registerResources(server: McpServer, client: PlayloopClient): void {
  server.registerResource(
    'playloop-game',
    new ResourceTemplate('playloop://games/{id}', { list: undefined }),
    {
      title: 'Playloop game',
      description: 'A Playloop game (by id or slug) with session, build, and tester counts.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables['id'])
      try {
        const data = await client.get<GameDetail>(`/api/v1/games/${encodeURIComponent(id)}`)
        return untrustedResourceContent(uri, jsonContent(data))
      } catch (err) {
        return untrustedResourceContent(uri, errorContent(err))
      }
    },
  )

  server.registerResource(
    'playloop-session',
    new ResourceTemplate('playloop://sessions/{id}', { list: undefined }),
    {
      title: 'Playloop session',
      description: 'A single playtest session and its insights.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = String(variables['id'])
      try {
        const data = await client.get<SessionDetailResponse>(
          `/api/v1/sessions/${encodeURIComponent(id)}`,
        )
        return untrustedResourceContent(uri, jsonContent(data))
      } catch (err) {
        return untrustedResourceContent(uri, errorContent(err))
      }
    },
  )

  server.registerResource(
    'playloop-build',
    new ResourceTemplate('playloop://builds/{game}/{version}', { list: undefined }),
    {
      title: 'Playloop build',
      description: 'A build rollup (session count, devices, playtime) and the persisted AI build summary.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const game = String(variables['game'])
      const version = String(variables['version'])
      try {
        const data = await client.get<BuildSummary>(
          `/api/v1/builds/${encodeURIComponent(game)}/${encodeURIComponent(version)}`,
        )
        return untrustedResourceContent(uri, jsonContent(data))
      } catch (err) {
        return untrustedResourceContent(uri, errorContent(err))
      }
    },
  )
}
