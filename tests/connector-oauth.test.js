// The connector's OAuth server and the MCP endpoint's front door, driven
// through the REAL handlers (api/_lib/connector/oauth.js, mcp.js and the
// api/connector/[route].js switch) over an in-memory backend.
//
// Every refusal is paired with the same fixture turned the other way, so a
// handler that has stopped working fails here rather than passing.
import { beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { route } from '../api/connector/[route].js'
import { handleMcp, resetMcpCaches } from '../api/_lib/connector/mcp.js'
import { clearClientCache, memoryLimiter, redirectAllowed } from '../api/_lib/connector/oauth.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ORIGIN = 'https://frc-app-liard.vercel.app'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'v'.repeat(43) + 'erifier-for-the-connector-test'
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')

let backend, deps, clock
beforeEach(() => {
  resetMcpCaches()
  clearClientCache()
  clock = testClock()
  backend = memoryBackend()
  deps = { backend, now: clock, random: testRandom(), fetch: async () => { throw new Error('no network') }, limiter: memoryLimiter(), isSchemaMissing: () => false }
})

const post = (path, body, type = 'application/json') =>
  new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': type }, body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString() })

async function register() {
  const r = await route('register', post('/connector/register', { redirect_uris: [CALLBACK], client_name: 'Claude' }), ORIGIN, deps, '1.2.3.4')
  return (await r.json()).client_id
}
const authQuery = (clientId, extra = {}) => new URLSearchParams({
  response_type: 'code', client_id: clientId, redirect_uri: CALLBACK, code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 'st8', ...extra,
}).toString()

async function decide(token, query, decision) {
  const r = await route('authorize', post('/api/connector/authorize', { access_token: token, query, decision }), ORIGIN, deps)
  return { status: r.status, body: await r.json() }
}

async function fullSignIn() {
  const clientId = await register()
  const d = await decide('tok-admin', authQuery(clientId), 'connect')
  const code = new URL(d.body.redirect).searchParams.get('code')
  const t = await route('token', post('/connector/token', { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: VERIFIER, client_id: clientId }, 'application/x-www-form-urlencoded'), ORIGIN, deps)
  return { clientId, tokens: await t.json(), status: t.status }
}

const mcp = (bearer, body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) =>
  handleMcp(new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) }), ORIGIN, deps)

describe('metadata documents', () => {
  it('protected-resource names the MCP URL and this issuer', async () => {
    const r = await route('protected-resource', new Request(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`), ORIGIN, deps)
    const body = await r.json()
    expect(r.status).toBe(200)
    expect(body.resource).toBe(`${ORIGIN}/mcp`)
    expect(body.authorization_servers).toEqual([ORIGIN])
  })
  it('authorization-server metadata advertises PKCE S256, DCR, CIMD and public clients', async () => {
    const body = await (await route('authorization-server', new Request(`${ORIGIN}/.well-known/oauth-authorization-server`), ORIGIN, deps)).json()
    expect(body.issuer).toBe(ORIGIN)
    expect(body.authorization_endpoint).toBe(`${ORIGIN}/connector/authorize`)
    expect(body.token_endpoint).toBe(`${ORIGIN}/connector/token`)
    expect(body.registration_endpoint).toBe(`${ORIGIN}/connector/register`)
    expect(body.code_challenge_methods_supported).toEqual(['S256'])
    expect(body.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(body.client_id_metadata_document_supported).toBe(true)
  })
  it('an unknown route answers 404', async () => {
    expect((await route('nope', new Request(`${ORIGIN}/x`), ORIGIN, deps)).status).toBe(404)
  })
})

describe('the MCP front door', () => {
  it('no bearer: 401 with the resource_metadata pointer', async () => {
    const r = await mcp(null)
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`)
  })
  it('a full sign-in lists the tools (positive control), and an unknown bearer is 401', async () => {
    const { tokens, status } = await fullSignIn()
    expect(status).toBe(200)
    const ok = await mcp(tokens.access_token)
    expect(ok.status).toBe(200)
    const listed = await ok.json()
    expect(listed.result.tools.map((t) => t.name)).toContain('todays_signins')
    expect((await mcp('not-a-token')).status).toBe(401)
  })
  it('the switch off answers 401; on again answers 200', async () => {
    const { tokens } = await fullSignIn()
    backend.state.settings.enabled = false
    const off = await mcp(tokens.access_token)
    expect(off.status).toBe(401)
    expect(off.headers.get('www-authenticate')).toContain('switched off')
    backend.state.settings.enabled = true
    expect((await mcp(tokens.access_token)).status).toBe(200)
  })
  it('a connection whose account is no longer allowlisted is revoked on its next request', async () => {
    const { tokens } = await fullSignIn()
    backend.state.settings.allowedMember = 'someone-else'
    expect((await mcp(tokens.access_token)).status).toBe(401)
    backend.state.settings.allowedMember = 'u-admin'
    expect((await mcp(tokens.access_token)).status).toBe(401) // revoked, stays dead
  })
  it('a connection whose account loses admin is revoked on its next request', async () => {
    const { tokens } = await fullSignIn()
    const realRpc = backend.rpc
    backend.rpc = async (session, fn, args) => (fn === 'connector_may_connect' ? { data: false, error: null } : realRpc(session, fn, args))
    expect((await mcp(tokens.access_token)).status).toBe(401)
    backend.rpc = realRpc
    expect((await mcp(tokens.access_token)).status).toBe(401)
    expect([...backend.state.tokens.values()][0].revokedBy).toBe('no longer an admin')
  })
  it('GET is 405', async () => {
    const r = await handleMcp(new Request(`${ORIGIN}/mcp`), ORIGIN, deps)
    expect(r.status).toBe(405)
  })
})

describe('the consent card', () => {
  it('the allowlisted admin gets the card (positive control); a member signed in gets 404', async () => {
    const clientId = await register()
    const yes = await decide('tok-admin', authQuery(clientId), 'check')
    expect(yes.body.status).toBe('ready')
    expect(yes.body.client_name).toBe('Claude')
    const no = await decide('tok-student', authQuery(clientId), 'check')
    expect(no.status).toBe(404)
    const noConnect = await decide('tok-student', authQuery(clientId), 'connect')
    expect(noConnect.status).toBe(404)
    expect(backend.state.codes.size).toBe(0)
  })
  it('signed out asks for sign-in', async () => {
    const clientId = await register()
    expect((await decide('', authQuery(clientId), 'check')).status).toBe(401)
  })
  it('an admin who is not the allowlisted account gets 404', async () => {
    const clientId = await register()
    backend.state.settings.allowedMember = 'u-student'
    expect((await decide('tok-admin', authQuery(clientId), 'connect')).status).toBe(404)
  })
  it('Not now sends access_denied back with the state', async () => {
    const clientId = await register()
    const d = await decide('tok-admin', authQuery(clientId), 'deny')
    const u = new URL(d.body.redirect)
    expect(u.searchParams.get('error')).toBe('access_denied')
    expect(u.searchParams.get('state')).toBe('st8')
  })
  it('a redirect that is not Claude or loopback is shown, never followed', async () => {
    const clientId = await register()
    const d = await decide('tok-admin', authQuery(clientId, { redirect_uri: 'https://evil.example/cb' }), 'connect')
    expect(d.body.status).toBe('problem')
    expect(d.body.redirect).toBeUndefined()
    expect(redirectAllowed('https://evil.example/cb')).toBe(false)
    expect(redirectAllowed(CALLBACK)).toBe(true)
    expect(redirectAllowed('http://127.0.0.1:6274/oauth/callback')).toBe(true)
  })
  it('a missing PKCE challenge is sent back as invalid_request', async () => {
    const clientId = await register()
    const d = await decide('tok-admin', authQuery(clientId, { code_challenge_method: 'plain' }), 'connect')
    expect(new URL(d.body.redirect).searchParams.get('error')).toBe('invalid_request')
  })
})

describe('token endpoint', () => {
  it('a wrong PKCE verifier is invalid_grant, and the code is spent', async () => {
    const clientId = await register()
    const d = await decide('tok-admin', authQuery(clientId), 'connect')
    const code = new URL(d.body.redirect).searchParams.get('code')
    const form = (verifier) => post('/connector/token', { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: verifier, client_id: clientId }, 'application/x-www-form-urlencoded')
    const bad = await route('token', form('w'.repeat(50)), ORIGIN, deps)
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toBe('invalid_grant')
    const thenGood = await route('token', form(VERIFIER), ORIGIN, deps)
    expect((await thenGood.json()).error).toBe('invalid_grant')
  })
  it('a code is single use: the first exchange works (positive control), the second is invalid_grant', async () => {
    const clientId = await register()
    const d = await decide('tok-admin', authQuery(clientId), 'connect')
    const code = new URL(d.body.redirect).searchParams.get('code')
    const form = () => post('/connector/token', { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, 'application/x-www-form-urlencoded')
    expect((await route('token', form(), ORIGIN, deps)).status).toBe(200)
    expect((await (await route('token', form(), ORIGIN, deps)).json()).error).toBe('invalid_grant')
  })
  it('an expired code is invalid_grant', async () => {
    const clientId = await register()
    const d = await decide('tok-admin', authQuery(clientId), 'connect')
    clock.advance(6 * 60_000)
    const code = new URL(d.body.redirect).searchParams.get('code')
    const r = await route('token', post('/connector/token', { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, code_verifier: VERIFIER }, 'application/x-www-form-urlencoded'), ORIGIN, deps)
    expect((await r.json()).error).toBe('invalid_grant')
  })
  it('refresh rotates both tokens; the old refresh token is then invalid_grant', async () => {
    const { tokens } = await fullSignIn()
    const refresh = (t) => route('token', post('/connector/token', { grant_type: 'refresh_token', refresh_token: t }, 'application/x-www-form-urlencoded'), ORIGIN, deps)
    const first = await refresh(tokens.refresh_token)
    const next = await first.json()
    expect(first.status).toBe(200)
    expect(next.access_token).not.toBe(tokens.access_token)
    expect(next.refresh_token).not.toBe(tokens.refresh_token)
    expect((await (await refresh(tokens.refresh_token)).json()).error).toBe('invalid_grant')
    expect((await mcp(tokens.access_token)).status).toBe(401)
    expect((await mcp(next.access_token)).status).toBe(200)
  })
  it('revocation kills the connection and answers 200 for an unknown token too', async () => {
    const { tokens } = await fullSignIn()
    const rv = await route('revoke', post('/connector/revoke', { token: tokens.access_token }, 'application/x-www-form-urlencoded'), ORIGIN, deps)
    expect(rv.status).toBe(200)
    expect((await mcp(tokens.access_token)).status).toBe(401)
    expect((await route('revoke', post('/connector/revoke', { token: 'unknown' }, 'application/x-www-form-urlencoded'), ORIGIN, deps)).status).toBe(200)
  })
})

describe('registration', () => {
  it('registers Claude (positive control) and refuses another redirect host', async () => {
    const ok = await route('register', post('/connector/register', { redirect_uris: [CALLBACK] }), ORIGIN, deps, 'a')
    expect(ok.status).toBe(201)
    const bad = await route('register', post('/connector/register', { redirect_uris: ['https://evil.example/cb'] }), ORIGIN, deps, 'a')
    expect(bad.status).toBe(400)
  })
  it('rate limits at ten a minute per address', async () => {
    const statuses = []
    for (let i = 0; i < 11; i += 1) statuses.push((await route('register', post('/connector/register', { redirect_uris: [CALLBACK] }), ORIGIN, deps, 'b')).status)
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})
