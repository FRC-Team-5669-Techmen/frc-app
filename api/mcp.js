/**
 * POST /mcp -- the Techmen connector's MCP endpoint (ledger 0013).
 * The whole of it is api/_lib/connector/mcp.js; this file is the Vercel
 * entry point. docs/subsystems/connector.md says how it works.
 */
import { handleMcp } from './_lib/connector/mcp.js'
import { originOf, productionDeps, sendResponse, toRequest } from './_lib/connector/node.js'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  const origin = originOf(req)
  await sendResponse(res, await handleMcp(await toRequest(req, origin), origin, productionDeps()))
}
