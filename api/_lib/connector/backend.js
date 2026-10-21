/**
 * THE CONNECTOR'S SUPABASE BACKEND, and the ONE file under api/ that the
 * connector lets read SUPABASE_SERVICE_ROLE_KEY.
 *
 * The service role is used for exactly two things: the connector_* tables
 * (0018 grants them to service_role alone; no client role may touch them) and
 * `mintSession`, which turns a connection into a Supabase session for the
 * user on its token row (generateLink then verifyOtp on a fresh anon client,
 * idea-app's Armory pattern). Every tool then runs through `rpc` and `select`,
 * which carry THAT user's access token, so auth.uid(), is_admin(), is_staff()
 * and every policy see that user and nobody else.
 * tests/connector-service-role.test.js holds this file to it.
 *
 * Env (Vercel project settings):
 *   SUPABASE_URL               the project URL (already set for api/discord-week-ahead.js)
 *   SUPABASE_SERVICE_ROLE_KEY  (already set for api/discord-week-ahead.js)
 *   SUPABASE_ANON_KEY          the public anon key; NEW for the connector. The
 *                              client build's VITE_SUPABASE_ANON_KEY is read as
 *                              a fallback, since it is the same value and Vercel
 *                              hands every project variable to functions too.
 */
import { createClient } from '@supabase/supabase-js'
import { ConnectorUnavailable, notSetUp } from './errors.js'

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

function env(name) {
  return process.env[name] ?? ''
}
const url = () => env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
const anonKey = () => env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')

function serviceClient() {
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!key || !url()) throw new ConnectorUnavailable('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.', { notSetUp: true })
  return createClient(url(), key, { auth: NO_SESSION })
}

export function userClient(accessToken) {
  if (!url() || !anonKey()) throw new ConnectorUnavailable('SUPABASE_URL or SUPABASE_ANON_KEY is not set.', { notSetUp: true })
  return createClient(url(), anonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: NO_SESSION,
  })
}

function unavailable(error) {
  if (error && notSetUp(error)) throw new ConnectorUnavailable('The connector is not set up yet: paste supabase/migrations/0018_connector.sql.', { notSetUp: true })
  throw new ConnectorUnavailable(error?.message ?? 'The connector store is not reachable.')
}

const ms = (iso) => (iso ? Date.parse(iso) : null)
const iso = (t) => new Date(t).toISOString()

const TOKEN_COLUMNS = 'id, user_id, email, client_id, label, scope, access_expires_at, refresh_expires_at, revoked_at, last_used_at'

function tokenRow(r) {
  return {
    id: r.id,
    userId: r.user_id,
    email: r.email,
    clientId: r.client_id,
    label: r.label,
    scope: r.scope,
    accessExpiresAt: Date.parse(r.access_expires_at),
    refreshExpiresAt: Date.parse(r.refresh_expires_at),
    revokedAt: ms(r.revoked_at),
    lastUsedAt: ms(r.last_used_at),
  }
}

const dbError = (e) => ({ code: e.code, message: e.message ?? 'Something went wrong.', details: e.details ?? null, hint: e.hint ?? null })

export function supabaseConnectorBackend() {
  return {
    kind: 'supabase',

    // ---- The service-role half: the connector_* tables, and minting. ----

    async settings() {
      const { data, error } = await serviceClient().from('connector_settings').select('enabled, allowed_member').eq('id', true).maybeSingle()
      if (error) unavailable(error)
      return { enabled: data?.enabled === true, allowedMember: data?.allowed_member ?? null }
    },
    async findClient(clientId) {
      const { data, error } = await serviceClient().from('connector_clients').select('client_id, client_name, redirect_uris').eq('client_id', clientId).maybeSingle()
      if (error) unavailable(error)
      return data ? { clientId: data.client_id, clientName: data.client_name, redirectUris: data.redirect_uris } : null
    },
    async registerClient(c) {
      const { error } = await serviceClient().from('connector_clients').insert({ client_id: c.clientId, client_name: c.clientName, redirect_uris: c.redirectUris })
      if (error) unavailable(error)
    },
    async storeCode(c) {
      const { error } = await serviceClient().from('connector_codes').insert({
        code_hash: c.codeHash, user_id: c.userId, email: c.email, client_id: c.clientId, client_name: c.clientName,
        redirect_uri: c.redirectUri, code_challenge: c.codeChallenge, scope: c.scope, expires_at: iso(c.expiresAt),
      })
      if (error) unavailable(error)
    },
    async takeCode(codeHash, now) {
      const { data, error } = await serviceClient().from('connector_codes')
        .update({ used_at: iso(now) }).eq('code_hash', codeHash).is('used_at', null)
        .select('code_hash, user_id, email, client_id, client_name, redirect_uri, code_challenge, scope, expires_at')
      if (error) unavailable(error)
      const r = (data ?? [])[0]
      if (!r) return null
      return {
        codeHash: r.code_hash, userId: r.user_id, email: r.email, clientId: r.client_id, clientName: r.client_name ?? '',
        redirectUri: r.redirect_uri, codeChallenge: r.code_challenge, scope: r.scope, expiresAt: Date.parse(r.expires_at),
      }
    },
    async createToken(t) {
      const { data, error } = await serviceClient().from('connector_tokens').insert({
        user_id: t.userId, email: t.email, client_id: t.clientId, label: t.label, scope: t.scope,
        access_hash: t.accessHash, refresh_hash: t.refreshHash,
        access_expires_at: iso(t.accessExpiresAt), refresh_expires_at: iso(t.refreshExpiresAt),
      }).select('id').single()
      if (error || !data) unavailable(error)
      return data.id
    },
    async tokenByAccess(accessHash) {
      const { data, error } = await serviceClient().from('connector_tokens').select(TOKEN_COLUMNS).eq('access_hash', accessHash).maybeSingle()
      if (error) unavailable(error)
      return data ? tokenRow(data) : null
    },
    async rotate(refreshHash, next, now) {
      // ONE STATEMENT: the row matches only while the presented refresh token
      // is the current one, unrevoked and unexpired.
      const { data, error } = await serviceClient().from('connector_tokens').update({
        access_hash: next.accessHash, refresh_hash: next.refreshHash,
        access_expires_at: iso(next.accessExpiresAt), refresh_expires_at: iso(next.refreshExpiresAt), last_used_at: iso(now),
      }).eq('refresh_hash', refreshHash).is('revoked_at', null).gt('refresh_expires_at', iso(now)).select(`${TOKEN_COLUMNS}, rotations`)
      if (error) unavailable(error)
      const row = (data ?? [])[0]
      if (!row) return null
      await serviceClient().from('connector_tokens').update({ rotations: (row.rotations ?? 0) + 1 }).eq('id', row.id)
      return tokenRow(row)
    },
    async revokeByHash(hash, by) {
      const client = serviceClient()
      let matched = false
      for (const column of ['access_hash', 'refresh_hash']) {
        const { data, error } = await client.from('connector_tokens').update({ revoked_at: new Date().toISOString(), revoked_by: by })
          .eq(column, hash).is('revoked_at', null).select('id')
        if (error) unavailable(error)
        if ((data ?? []).length > 0) matched = true
      }
      return matched
    },
    async revokeToken(id, by) {
      const { error } = await serviceClient().from('connector_tokens').update({ revoked_at: new Date().toISOString(), revoked_by: by }).eq('id', id).is('revoked_at', null)
      if (error) unavailable(error)
    },
    async touchToken(id, now) {
      const { error } = await serviceClient().from('connector_tokens').update({ last_used_at: iso(now) }).eq('id', id)
      if (error) unavailable(error)
    },
    async storeConfirmation(c) {
      const { error } = await serviceClient().from('connector_confirmations').insert({
        token_hash: c.tokenHash, user_id: c.userId, tool: c.tool, args_hash: c.argsHash, preview: c.preview ?? null, expires_at: iso(c.expiresAt),
      })
      if (error) unavailable(error)
    },
    async takeConfirmation(tokenHash, now) {
      const { data, error } = await serviceClient().from('connector_confirmations')
        .update({ used_at: iso(now) }).eq('token_hash', tokenHash).is('used_at', null).gt('expires_at', iso(now))
        .select('token_hash, user_id, tool, args_hash, preview, expires_at')
      if (error) unavailable(error)
      const r = (data ?? [])[0]
      if (!r) return null
      return { tokenHash: r.token_hash, userId: r.user_id, tool: r.tool, argsHash: r.args_hash, preview: r.preview, expiresAt: Date.parse(r.expires_at) }
    },
    async syncRegistry(rows, logTables = []) {
      if (rows.length > 0) {
        const { error } = await serviceClient().from('connector_registry')
          .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'function_name' })
        if (error) unavailable(error)
      }
      if (logTables.length > 0) {
        const { error } = await serviceClient().from('connector_log_tables')
          .upsert(logTables.map((t) => ({ table_name: t, note: 'registry' })), { onConflict: 'table_name', ignoreDuplicates: true })
        if (error) unavailable(error)
      }
    },
    async setAuditUndo(auditId, undo) {
      const { error } = await serviceClient().from('connector_audit').update({ undo }).eq('id', auditId)
      if (error) unavailable(error)
    },
    async undoCandidates(userId, limit) {
      const { data, error } = await serviceClient().from('connector_audit')
        .select('id, user_id, tool, function_name, args, result, rows_written, undo, undo_of, undone_by, group_key, status, started_at')
        .eq('user_id', userId).eq('status', 'done').is('undone_by', null).is('undo_of', null)
        .order('started_at', { ascending: false }).limit(limit)
      if (error) unavailable(error)
      return (data ?? []).map((r) => ({
        id: r.id, tool: r.tool, functionName: r.function_name, args: r.args, result: r.result, rows: r.rows_written,
        undo: r.undo, groupKey: r.group_key, startedAt: Date.parse(r.started_at),
      }))
    },
    async mintSession(user) {
      const link = await serviceClient().auth.admin.generateLink({ type: 'magiclink', email: user.email })
      const tokenHash = link.data?.properties?.hashed_token
      if (link.error || !tokenHash) unavailable(link.error)
      if (!url() || !anonKey()) throw new ConnectorUnavailable('SUPABASE_ANON_KEY is not set.', { notSetUp: true })
      const fresh = createClient(url(), anonKey(), { auth: NO_SESSION })
      const verified = await fresh.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
      const session = verified.data?.session
      if (verified.error || !session) unavailable(verified.error)
      if (session.user?.id !== user.id) throw new ConnectorUnavailable('The minted session belongs to a different account.')
      return {
        accessToken: session.access_token,
        expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in) * 1000,
        user,
      }
    },
    /** The account behind a browser session (the consent card's own sign-in). */
    async userFromAccessToken(accessToken) {
      const { data, error } = await userClient(accessToken).auth.getUser(accessToken)
      if (error || !data?.user) return null
      return { id: data.user.id, email: data.user.email ?? '' }
    },

    // ---- The user half: as the minted user. ----

    async rpc(session, fn, args) {
      const { data, error } = await userClient(session.accessToken).rpc(fn, args)
      if (error) return { data: null, error: dbError(error) }
      return { data, error: null }
    },
    // Only these fixed scouting functions; credentials remain the user's JWT.
    async scoutingImport(session, body) {
      return userClient(session.accessToken).functions.invoke('scouting-import', { body })
    },
    async scoutingDispatch(session, body) {
      return userClient(session.accessToken).functions.invoke('scouting-dispatch', { body })
    },
    async select(session, spec) {
      let q = userClient(session.accessToken).from(spec.table).select(spec.columns.join(', '))
      for (const [k, v] of Object.entries(spec.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v)
      for (const [k, v] of Object.entries(spec.in ?? {})) q = q.in(k, v)
      for (const [k, v] of Object.entries(spec.gte ?? {})) q = q.gte(k, v)
      for (const [k, v] of Object.entries(spec.lte ?? {})) q = q.lte(k, v)
      for (const [k, v] of Object.entries(spec.lt ?? {})) q = q.lt(k, v)
      for (const [k, dir] of spec.order ?? []) q = q.order(k, { ascending: dir === 'asc' })
      const offset = spec.offset ?? 0
      const limit = spec.limit ?? 1000
      const { data, error } = await q.range(offset, offset + limit - 1)
      if (error) return { data: null, error: dbError(error) }
      return { data: data ?? [], error: null }
    },
  }
}
