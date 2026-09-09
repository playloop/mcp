# Releasing the MCP server

The current release is distributed from the public `v0.5.0` Git tag. Package registry publishing is not configured.

Before creating a release, run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `.githooks/release-check.sh`. Verify the installed `playloop --help` executable and an MCP stdio connection. Update the changelog before tagging the reviewed commit.

Use a new version tag for a new release. Do not move a tag that users have already installed. To roll back an installation, change the Git tag in the MCP client configuration to the previous working release and restart the client.
