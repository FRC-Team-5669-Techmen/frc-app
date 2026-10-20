/**
 * The Techmen connector's OAuth server and its two .well-known documents,
 * one Vercel function for all of them (the Hobby plan caps a deployment at
 * twelve). vercel.json rewrites each public path here as ?route=<name>:
 *
 *   /.well-known/oauth-protected-resource[/mcp]  -> protected-resource
 *   /.well-known/oauth-authorization-server      -> authorization-server
 *   POST /connector/token                        -> token
 *   POST /connector/register                     -> register
 *   POST /connector/revoke                       -> revoke
 *   POST /api/connector/authorize                -> authorize (the consent card's JSON call)
 *
 * GET /connector/authorize is the consent card itself: a page of the app
 * (src/ConnectorPage.jsx), served by the SPA rewrite.
 */
import { authorizationServerMetadata, handleAuthorizeDecision, handleRegister, handleRevoke, handleToken, json, protectedResourceMetadata } from '../_lib/connector/oauth.js'
import { originOf, productionDeps, sendResponse, toRequest } from '../_lib/connector/node.js'

export const config = { api: { bodyParser: false } }

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version' }

export async function route(name, request, origin, deps, address) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const withCors = (r) => { for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v); return r }
  switch (name) {
    case 'protected-resource':
      return withCors(json(200, protectedResourceMetadata(origin), { 'cache-control': 'public, max-age=300' }))
    case 'authorization-server':
      return withCors(json(200, authorizationServerMetadata(origin), { 'cache-control': 'public, max-age=300' }))
    case 'token':
      return request.method === 'POST' ? withCors(await handleToken(request, deps)) : json(405, { error: 'method_not_allowed' })
    case 'register':
      return request.method === 'POST' ? withCors(await handleRegister(request, deps, address)) : json(405, { error: 'method_not_allowed' })
    case 'revoke':
      return request.method === 'POST' ? withCors(await handleRevoke(request, deps)) : json(405, { error: 'method_not_allowed' })
    case 'authorize':
      return request.method === 'POST' ? await handleAuthorizeDecision(request, origin, deps) : json(405, { error: 'method_not_allowed' })
    default:
      return json(404, { error: 'not_found' })
  }
}

export default async function handler(req, res) {
  const origin = originOf(req)
  const name = String(req.query?.route ?? new URL(req.url, origin).searchParams.get('route') ?? '')
  const address = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim()
  await sendResponse(res, await route(name, await toRequest(req, origin), origin, productionDeps(), address))
}
