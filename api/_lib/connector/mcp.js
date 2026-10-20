/**
 * POST /mcp: THE CONNECTOR'S MCP ENDPOINT. Streamable HTTP, stateless, JSON
 * responses, no session ids. The SDK's web-standard transport does the
 * protocol; this file does who, and whether. Ported from idea-app
 * src/lib/server/connector/mcp.ts.
 *
 * On every request, before any tool runs:
 *   1. the bearer must name a live connection (no bearer, unknown, expired or
 *      revoked: 401 with the resource-metadata pointer, so Claude signs in);
 *   2. the switch on /connector must be on (off: 401);
 *   3. the connection's user, AS THEMSELVES, must still pass
 *      connector_may_connect(): the one allowlisted account, still an admin.
 *      Either failing revokes the connection here and answers 401.
 * Until 0018 is pasted, every request answers 503 "not set up yet" and the
 * app itself is unaffected.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js'
import { sha256Hex } from './crypto.js'
import { json, wwwAuthenticate } from './oauth.js'
import { ConnectorUnavailable, isSchemaMissing } from './errors.js'
import { registryRows } from './registry.js'
import { LOG_TABLES } from './log-tables.js'
import { runTool, toolList, UnknownTool } from './tools.js'

export const MCP_INSTRUCTIONS = [
  'This is the Techmen app of FRC Team 5669. Every call acts as the one signed-in admin, with exactly their permissions, and every change lands in the app\'s own records as theirs.',
  'Every tool takes said: his request in his own words, exactly as he said it, the same words for every call made for that one request.',
  'Use a tool named for what he asked when there is one; otherwise call find_tool with his words and then call_app exactly as it says.',
  'Send a fresh random request_id with every change he asks for, and reuse it unchanged only when retrying that same change; pass again: true only when he asks for the same thing twice on purpose.',
  'When a tool answers ambiguous or not_found, nothing was changed: ask him the one question it names.',
  'A change that asks first returns a preview and a confirm_token: read the preview to him and send the confirm_token only after he says yes. Whether a change asks first is the server\'s decision, never yours.',
  'When the app cannot do what he asked, say so plainly and call report_gap; never stitch other actions together to fake it.',
].join(' ')

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id',
}

function withCors(res) {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

function unauthorized(origin, error) {
  return withCors(json(401,
    error ? { error: error.code, error_description: error.description } : { error: 'unauthorized', error_description: 'Sign in to use the Techmen connector.' },
    { 'www-authenticate': wwwAuthenticate(origin, error) }))
}

const sessions = new Map()
const SESSION_MARGIN_MS = 60_000
const TOUCH_EVERY_MS = 60_000
const SYNC_EVERY_MS = 10 * 60_000
let lastSync = 0

export function resetMcpCaches() {
  sessions.clear()
  lastSync = 0
}

async function sessionFor(backend, token, now) {
  const cached = sessions.get(token.id)
  if (cached && cached.user.id === token.userId && cached.expiresAt - SESSION_MARGIN_MS > now) return cached
  const minted = await backend.mintSession({ id: token.userId, email: token.email })
  sessions.set(token.id, minted)
  return minted
}

const bearerOf = (request) => /^Bearer\s+([A-Za-z0-9\-._~+/]+=*)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? null
const ERROR_STATUSES = new Set(['refused', 'invalid', 'needs_confirmation', 'not_available', 'not_set_up'])

export async function handleMcp(request, origin, deps) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') {
    return withCors(json(405, { error: 'method_not_allowed', error_description: 'This MCP endpoint takes POST only.' }, { allow: 'POST, OPTIONS' }))
  }
  const now = deps.now()
  const bearer = bearerOf(request)
  if (!bearer) return unauthorized(origin)

  let token
  let session
  try {
    token = await deps.backend.tokenByAccess(sha256Hex(bearer))
    if (!token || token.revokedAt !== null || token.accessExpiresAt <= now) {
      return unauthorized(origin, { code: 'invalid_token', description: 'This connection is signed out or expired.' })
    }
    const settings = await deps.backend.settings()
    if (!settings.enabled) {
      return unauthorized(origin, { code: 'invalid_token', description: 'The Techmen connector is switched off. Switch it on in the app at /connector.' })
    }
    if (settings.allowedMember !== token.userId) {
      sessions.delete(token.id)
      await deps.backend.revokeToken(token.id, 'no longer the allowlisted account')
      return unauthorized(origin, { code: 'invalid_token', description: 'This account may not use the Techmen connector.' })
    }
    session = await sessionFor(deps.backend, token, now)
    const may = await deps.backend.rpc(session, 'connector_may_connect', {})
    if (may.error) throw new ConnectorUnavailable(may.error.message, { notSetUp: isSchemaMissing(may.error) })
    if (may.data !== true) {
      sessions.delete(token.id)
      await deps.backend.revokeToken(token.id, 'no longer an admin')
      return unauthorized(origin, { code: 'invalid_token', description: 'This account is not an admin of the app.' })
    }
    if (!token.lastUsedAt || now - token.lastUsedAt > TOUCH_EVERY_MS) await deps.backend.touchToken(token.id, now)
    if (now - lastSync > SYNC_EVERY_MS) {
      await deps.backend.syncRegistry(registryRows(), LOG_TABLES)
      lastSync = now
    }
  } catch (e) {
    if (e instanceof ConnectorUnavailable) {
      return withCors(json(503, {
        error: 'temporarily_unavailable',
        error_description: e.notSetUp ? 'The Techmen connector is not set up yet.' : 'The app could not be reached. Try again.',
      }))
    }
    throw e
  }

  const liveToken = token
  const server = new Server(
    { name: 'Techmen', version: '1.0.0' },
    { capabilities: { tools: { listChanged: false } }, instructions: MCP_INSTRUCTIONS },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolList() }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const ctx = { backend: deps.backend, session, token: liveToken, now: deps.now, random: deps.random, cache: new Map() }
    try {
      const out = await runTool(ctx, req.params.name, req.params.arguments ?? {})
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: ERROR_STATUSES.has(String(out.status)) }
    } catch (e) {
      if (e instanceof UnknownTool) throw new McpError(ErrorCode.InvalidParams, e.message)
      if (e instanceof ConnectorUnavailable) {
        return { content: [{ type: 'text', text: 'The app could not be reached. Nothing was changed. Try again in a moment.' }], isError: true }
      }
      throw e
    }
  })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(request))
  } finally {
    await server.close().catch(() => undefined)
  }
}
