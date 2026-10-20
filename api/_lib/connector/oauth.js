/**
 * THE APP AS ITS OWN OAUTH SERVER, for the connector only. Ported from
 * idea-app src/lib/server/connector/oauth.ts. The app already is the identity
 * (its own Supabase sign-in), so the consent step is the app's own session and
 * these handlers issue opaque tokens that stand for it.
 *
 *   protected-resource metadata naming the issuer     protectedResourceMetadata
 *   RFC 8414 authorization-server metadata             authorizationServerMetadata
 *   a 401 that points at the metadata                  wwwAuthenticate
 *   PKCE S256, form-urlencoded token endpoint          handleToken
 *   DCR (RFC 7591) or a client ID metadata document    handleRegister, resolveClient
 *   rotating refresh tokens; a dead one is invalid_grant
 *   revocation (RFC 7009)                              handleRevoke
 *   every endpoint answering inside 10 seconds         withBudget
 *
 * WHO MAY GET A CODE. Only the account connector_settings allowlists, and only
 * while it is an admin: `connector_may_connect()` asked AS THAT ACCOUNT, on
 * its own browser session. Anybody else is answered "not found" (the page
 * shows 404), so the consent card reveals nothing.
 *
 * Every handler takes its collaborators as `deps` ({backend, now, random,
 * fetch, limiter}), so a test hands the REAL handler a backend of its own.
 */
import { opaqueToken, PKCE_CHALLENGE, pkceMatches, sha256Hex } from './crypto.js'
import { ConnectorUnavailable } from './errors.js'

export const SCOPES = ['app', 'offline_access']
export const ACCESS_TTL_MS = 60 * 60_000
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000
export const CODE_TTL_MS = 5 * 60_000
export const OAUTH_BUDGET_MS = 9_000
export const CIMD_TIMEOUT_MS = 4_000
const CIMD_MAX_BYTES = 64 * 1024
const CIMD_CACHE_MS = 10 * 60_000
export const SERVICE_NAME = 'Techmen'

const NO_STORE = { 'cache-control': 'no-store', pragma: 'no-cache' }

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...NO_STORE, ...headers } })
}

function oauthError(status, error, description) {
  return json(status, { error, error_description: description })
}

export async function withBudget(work, budgetMs = OAUTH_BUDGET_MS) {
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(oauthError(503, 'temporarily_unavailable', 'The app took too long to answer. Try again.')), budgetMs)
  })
  try {
    return await Promise.race([
      work().catch((e) => {
        if (e instanceof ConnectorUnavailable) {
          return oauthError(503, 'temporarily_unavailable', e.notSetUp ? 'The connector is not set up yet.' : 'The connector store is not reachable right now.')
        }
        throw e
      }),
      late,
    ])
  } finally {
    clearTimeout(timer)
  }
}

// ── Metadata ─────────────────────────────────────────────────────────────────

export const resourceUrl = (origin) => `${origin}/mcp`
export const resourceMetadataUrl = (origin) => `${origin}/.well-known/oauth-protected-resource/mcp`

export function protectedResourceMetadata(origin) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: SERVICE_NAME,
  }
}

export function authorizationServerMetadata(origin) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/connector/authorize`,
    token_endpoint: `${origin}/connector/token`,
    registration_endpoint: `${origin}/connector/register`,
    revocation_endpoint: `${origin}/connector/revoke`,
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    grant_types_supported: ['authorization_code', 'refresh_token'],
    response_types_supported: ['code'],
    scopes_supported: [...SCOPES],
  }
}

export function wwwAuthenticate(origin, error) {
  const base = `Bearer resource_metadata="${resourceMetadataUrl(origin)}", scope="app"`
  return error ? `${base}, error="${error.code}", error_description="${error.description.replace(/"/g, "'")}"` : base
}

// ── Clients ──────────────────────────────────────────────────────────────────

/**
 * WHERE A CODE MAY BE SENT: Claude's hosted callback, and a loopback address
 * on any port (Claude Code, the MCP Inspector). A consent card someone was
 * tricked into pressing can only ever hand a code to Claude or to the machine
 * the browser is on.
 */
export function redirectAllowed(uri) {
  let u
  try { u = new URL(uri) } catch { return false }
  if (u.hash || u.username || u.password) return false
  if (u.protocol === 'https:' && (u.hostname === 'claude.ai' || u.hostname === 'claude.com')) {
    return u.pathname === '/api/mcp/auth_callback' && !u.port
  }
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return true
  return false
}

/** RFC 8252 7.3: a loopback redirect matches whatever port the client opened. */
export function redirectMatches(registered, presented) {
  if (registered === presented) return true
  try {
    const a = new URL(registered)
    const b = new URL(presented)
    const loop = (h) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
    return a.protocol === 'http:' && loop(a.hostname) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search
  } catch {
    return false
  }
}

const cimdCache = new Map()
export function clearClientCache() { cimdCache.clear() }

export async function resolveClient(clientId, deps) {
  if (!clientId) return { ok: false, problem: 'The request names no client.' }
  if (/^https:\/\//.test(clientId)) {
    let host = ''
    try { host = new URL(clientId).hostname } catch { return { ok: false, problem: 'The client id is not a valid address.' } }
    if (host === 'localhost' || /^[\d.]+$/.test(host) || host.startsWith('[')) {
      return { ok: false, problem: 'A client metadata document must live on a public host.' }
    }
    const cached = cimdCache.get(clientId)
    if (cached && cached.until > deps.now()) return { ok: true, client: cached.client }
    let doc
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), CIMD_TIMEOUT_MS)
      const res = await deps.fetch(clientId, { headers: { accept: 'application/json' }, signal: controller.signal, redirect: 'error' })
      clearTimeout(timer)
      if (!res.ok) return { ok: false, problem: `The client's metadata document answered ${res.status}.` }
      const text = await res.text()
      if (text.length > CIMD_MAX_BYTES) return { ok: false, problem: "The client's metadata document is too large." }
      doc = JSON.parse(text)
    } catch {
      return { ok: false, problem: "The client's metadata document could not be fetched." }
    }
    if (doc.client_id !== clientId) return { ok: false, problem: "The client's metadata document does not name itself." }
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.filter((u) => typeof u === 'string') : []
    if (uris.length === 0) return { ok: false, problem: "The client's metadata document lists no redirect address." }
    const name = typeof doc.client_name === 'string' && doc.client_name.trim() ? doc.client_name.trim().slice(0, 120) : host
    const client = { clientId, clientName: name, redirectUris: uris }
    cimdCache.set(clientId, { client, until: deps.now() + CIMD_CACHE_MS })
    return { ok: true, client }
  }
  const client = await deps.backend.findClient(clientId)
  return client ? { ok: true, client } : { ok: false, problem: 'That client is not registered with this app.' }
}

// ── Authorize ────────────────────────────────────────────────────────────────

function errorRedirect(redirectUri, error, description, state) {
  const u = new URL(redirectUri)
  u.searchParams.set('error', error)
  u.searchParams.set('error_description', description)
  if (state) u.searchParams.set('state', state)
  return u.toString()
}

/**
 * Checks an authorize request. Answers {ok, request} or {ok: false, problem}
 * (shown on the page, never redirected: a bad client or redirect) or
 * {ok: false, problem, redirect} (sent back to a good client).
 */
export async function validateAuthorize(q, origin, deps) {
  const clientId = q.get('client_id') ?? ''
  const redirectUri = q.get('redirect_uri') ?? ''
  const client = await resolveClient(clientId, deps)
  if (!client.ok) return { ok: false, problem: client.problem }
  if (!redirectUri || !redirectAllowed(redirectUri) || !client.client.redirectUris.some((r) => redirectMatches(r, redirectUri))) {
    return { ok: false, problem: 'The address this request would return to is not one this app sends sign-ins to.' }
  }
  const state = q.get('state')
  const back = (error, description) => ({ ok: false, problem: description, redirect: errorRedirect(redirectUri, error, description, state) })
  if (q.get('response_type') !== 'code') return back('unsupported_response_type', 'Only the code flow is supported.')
  const challenge = q.get('code_challenge') ?? ''
  if (q.get('code_challenge_method') !== 'S256' || !PKCE_CHALLENGE.test(challenge)) return back('invalid_request', 'PKCE with S256 is required.')
  const resource = q.get('resource')
  if (resource && resource.replace(/\/+$/, '') !== resourceUrl(origin)) return back('invalid_target', 'That resource is not served here.')
  const asked = (q.get('scope') ?? 'app').split(/\s+/).filter(Boolean)
  if (asked.some((s) => !SCOPES.includes(s))) return back('invalid_scope', 'Only the app scope is offered.')
  const scope = [...new Set(['app', ...asked])].join(' ')
  return {
    ok: true,
    request: { clientId, clientName: client.client.clientName, redirectUri, redirectHost: new URL(redirectUri).host, state, codeChallenge: challenge, scope },
  }
}

/** The consent card's Connect: one code, five minutes, single use. Answers where to send the browser. */
export async function issueCode(user, req, deps) {
  const code = opaqueToken(deps.random)
  await deps.backend.storeCode({
    codeHash: sha256Hex(code), userId: user.id, email: user.email, clientId: req.clientId, clientName: req.clientName,
    redirectUri: req.redirectUri, codeChallenge: req.codeChallenge, scope: req.scope, expiresAt: deps.now() + CODE_TTL_MS,
  })
  const u = new URL(req.redirectUri)
  u.searchParams.set('code', code)
  if (req.state) u.searchParams.set('state', req.state)
  return u.toString()
}

export function denyRedirect(req) {
  return errorRedirect(req.redirectUri, 'access_denied', 'The connection was not approved.', req.state)
}

/**
 * POST /connector/authorize (JSON), from the consent card in the app:
 *   {access_token, query, decision: 'check' | 'connect' | 'deny'}
 * `access_token` is the card's own browser session. The account must be the
 * allowlisted admin (connector_may_connect, asked as that account); anybody
 * else gets 404 and learns nothing.
 */
export async function handleAuthorizeDecision(request, origin, deps) {
  return withBudget(async () => {
    let body
    try { body = await request.json() } catch { return json(400, { error: 'invalid_request' }) }
    const q = new URLSearchParams(typeof body?.query === 'string' ? body.query.replace(/^\?/, '') : '')
    const check = await validateAuthorize(q, origin, deps)
    if (!check.ok) {
      return json(check.redirect ? 200 : 400, { status: 'problem', problem: check.problem, ...(check.redirect ? { redirect: check.redirect } : {}) })
    }
    const token = typeof body?.access_token === 'string' ? body.access_token : ''
    const user = token ? await deps.backend.userFromAccessToken(token) : null
    if (!user) return json(401, { status: 'sign_in' })
    const session = { accessToken: token, user }
    const may = await deps.backend.rpc(session, 'connector_may_connect', {})
    if (may.error) {
      if (deps.isSchemaMissing?.(may.error)) return json(404, { status: 'not_found' })
      throw new ConnectorUnavailable(may.error.message)
    }
    if (may.data !== true) return json(404, { status: 'not_found' })
    const settings = await deps.backend.settings()
    if (!settings.enabled) return json(200, { status: 'switched_off' })
    if (body.decision === 'deny') return json(200, { status: 'redirect', redirect: denyRedirect(check.request) })
    if (body.decision === 'connect') return json(200, { status: 'redirect', redirect: await issueCode(user, check.request, deps) })
    return json(200, { status: 'ready', client_name: check.request.clientName, redirect_host: check.request.redirectHost, email: user.email })
  })
}

// ── Token ────────────────────────────────────────────────────────────────────

async function formOf(request) {
  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const body = await request.json()
      return Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, String(v ?? '')]))
    }
    return Object.fromEntries(new URLSearchParams(await request.text()))
  } catch {
    return null
  }
}

function tokenResponse(access, refresh, scope) {
  return json(200, { access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope })
}

export async function handleToken(request, deps) {
  return withBudget(async () => {
    const form = await formOf(request)
    if (!form) return oauthError(400, 'invalid_request', 'The body could not be read.')
    const now = deps.now()
    if (form.grant_type === 'authorization_code') {
      const code = form.code ?? ''
      if (!code) return oauthError(400, 'invalid_request', 'The code is missing.')
      // TAKEN BEFORE IT IS CHECKED: a code is single use whatever happens next.
      const stored = await deps.backend.takeCode(sha256Hex(code), now)
      if (!stored) return oauthError(400, 'invalid_grant', 'That code is unknown or was already used.')
      if (stored.expiresAt <= now) return oauthError(400, 'invalid_grant', 'That code has expired.')
      if (form.client_id && form.client_id !== stored.clientId) return oauthError(400, 'invalid_grant', 'That code was issued to a different client.')
      if (form.redirect_uri !== stored.redirectUri) return oauthError(400, 'invalid_grant', 'The redirect address does not match.')
      if (!pkceMatches(form.code_verifier ?? '', stored.codeChallenge)) return oauthError(400, 'invalid_grant', 'The code verifier does not match.')
      const access = opaqueToken(deps.random)
      const refresh = opaqueToken(deps.random)
      let host = ''
      try { host = new URL(stored.redirectUri).host } catch { host = '' }
      await deps.backend.createToken({
        userId: stored.userId, email: stored.email, clientId: stored.clientId,
        label: `${stored.clientName || 'Claude'}${host ? ` (${host})` : ''}`.slice(0, 200), scope: stored.scope,
        accessHash: sha256Hex(access), refreshHash: sha256Hex(refresh),
        accessExpiresAt: now + ACCESS_TTL_MS, refreshExpiresAt: now + REFRESH_TTL_MS,
      })
      return tokenResponse(access, refresh, stored.scope)
    }
    if (form.grant_type === 'refresh_token') {
      const refresh = form.refresh_token ?? ''
      if (!refresh) return oauthError(400, 'invalid_request', 'The refresh token is missing.')
      const access = opaqueToken(deps.random)
      const nextRefresh = opaqueToken(deps.random)
      const row = await deps.backend.rotate(sha256Hex(refresh), {
        accessHash: sha256Hex(access), refreshHash: sha256Hex(nextRefresh),
        accessExpiresAt: now + ACCESS_TTL_MS, refreshExpiresAt: now + REFRESH_TTL_MS,
      }, now)
      if (!row) return oauthError(400, 'invalid_grant', 'That refresh token is revoked, expired or already used.')
      if (form.client_id && form.client_id !== row.clientId) {
        await deps.backend.revokeToken(row.id, 'refresh from another client')
        return oauthError(400, 'invalid_grant', 'That refresh token belongs to a different client.')
      }
      return tokenResponse(access, nextRefresh, row.scope)
    }
    return oauthError(400, 'unsupported_grant_type', 'Only authorization_code and refresh_token are supported.')
  })
}

// ── Registration and revocation ──────────────────────────────────────────────

const REGISTER_LIMIT_PER_MINUTE = 10

export async function handleRegister(request, deps, address) {
  return withBudget(async () => {
    if (!deps.limiter.take(`register:${address}`, REGISTER_LIMIT_PER_MINUTE, deps.now())) {
      return oauthError(429, 'slow_down', 'Too many registrations. Wait a minute.')
    }
    let body
    try { body = await request.json() } catch { return oauthError(400, 'invalid_client_metadata', 'The body must be JSON.') }
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === 'string') : []
    if (uris.length === 0 || uris.length > 10) return oauthError(400, 'invalid_redirect_uri', 'List between one and ten redirect addresses.')
    const bad = uris.filter((u) => !redirectAllowed(u))
    if (bad.length) return oauthError(400, 'invalid_redirect_uri', `This app only returns sign-ins to Claude or to this computer, not to ${bad.join(', ')}.`)
    const method = typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : 'none'
    if (method !== 'none') return oauthError(400, 'invalid_client_metadata', 'Only public clients (token_endpoint_auth_method none) are supported.')
    const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : 'Claude'
    const clientId = `techmen_${opaqueToken(deps.random).slice(0, 32)}`
    await deps.backend.registerClient({ clientId, clientName: name, redirectUris: uris })
    return json(201, {
      client_id: clientId, client_id_issued_at: Math.floor(deps.now() / 1000), client_name: name, redirect_uris: uris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    })
  })
}

export async function handleRevoke(request, deps) {
  return withBudget(async () => {
    const form = await formOf(request)
    const token = form?.token ?? ''
    // RFC 7009 2.2: an unknown token is answered 200 too.
    if (token) await deps.backend.revokeByHash(sha256Hex(token), 'revoked by the client')
    return new Response(null, { status: 200, headers: NO_STORE })
  })
}

/** A per-instance fixed-window limiter (the register endpoint). */
export function memoryLimiter() {
  const hits = new Map()
  return {
    take(key, perMinute, now) {
      const windowStart = Math.floor(now / 60_000)
      const h = hits.get(key)
      if (!h || h.window !== windowStart) { hits.set(key, { window: windowStart, n: 1 }); return true }
      h.n += 1
      return h.n <= perMinute
    },
  }
}
