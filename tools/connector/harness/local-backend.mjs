// A connector backend over a local PostgreSQL (the SQL harness), so the REAL
// MCP handler can be driven by the MCP Inspector with no Supabase project.
// Dev and test only: nothing under api/ imports this file.
//
// The service-role half writes the connector_* tables as the table owner.
// The user half runs every call as `authenticated` with the minted user's
// claims set exactly as PostgREST sets them (request.jwt.claims), inside its
// own transaction, so auth.uid(), RLS and every function gate decide.
import pg from 'pg'

const conn = () => ({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER ?? 'postgres', database: process.env.PGDATABASE ?? 'frc' })
const iso = (t) => new Date(t).toISOString()

export async function localBackend() {
  const pool = new pg.Pool({ ...conn(), max: 4 })
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0] ?? null

  async function asUser(userId, fn) {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('role', 'authenticated', true)`,
        [JSON.stringify({ sub: userId, role: 'authenticated' }), userId])
      const out = await fn(c)
      await c.query('commit')
      return out
    } catch (e) {
      await c.query('rollback').catch(() => undefined)
      return { data: null, error: { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } }
    } finally {
      c.release()
    }
  }
  const tokenRow = (r) => r && ({ id: r.id, userId: r.user_id, email: r.email, clientId: r.client_id, label: r.label, scope: r.scope, accessExpiresAt: Date.parse(r.access_expires_at), refreshExpiresAt: Date.parse(r.refresh_expires_at), revokedAt: r.revoked_at ? Date.parse(r.revoked_at) : null, lastUsedAt: r.last_used_at ? Date.parse(r.last_used_at) : null })

  return {
    kind: 'local-pg',
    pool,
    async settings() {
      const r = await one('select enabled, allowed_member from public.connector_settings where id')
      return { enabled: r?.enabled === true, allowedMember: r?.allowed_member ?? null }
    },
    async findClient() { return null },
    async registerClient() {},
    async storeCode() {},
    async takeCode() { return null },
    async createToken(t) {
      const r = await one(`insert into public.connector_tokens (user_id, email, client_id, label, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`, [t.userId, t.email, t.clientId, t.label, t.scope, t.accessHash, t.refreshHash, iso(t.accessExpiresAt), iso(t.refreshExpiresAt)])
      return r.id
    },
    async tokenByAccess(h) { return tokenRow(await one('select * from public.connector_tokens where access_hash = $1', [h])) },
    async rotate() { return null },
    async revokeByHash() { return false },
    async revokeToken(id, by) { await pool.query('update public.connector_tokens set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null', [id, by]) },
    async touchToken(id, now) { await pool.query('update public.connector_tokens set last_used_at = $2 where id = $1', [id, iso(now)]) },
    async storeConfirmation(c) {
      await pool.query('insert into public.connector_confirmations (token_hash, user_id, tool, args_hash, preview, expires_at) values ($1,$2,$3,$4,$5,$6)',
        [c.tokenHash, c.userId, c.tool, c.argsHash, JSON.stringify(c.preview ?? null), iso(c.expiresAt)])
    },
    async takeConfirmation(h, now) {
      const r = await one('update public.connector_confirmations set used_at = $2 where token_hash = $1 and used_at is null and expires_at > $2 returning *', [h, iso(now)])
      return r && { tokenHash: r.token_hash, userId: r.user_id, tool: r.tool, argsHash: r.args_hash, preview: r.preview, expiresAt: Date.parse(r.expires_at) }
    },
    async syncRegistry(rows, logTables = []) {
      for (const r of rows) {
        await pool.query(`insert into public.connector_registry (function_name, tool, level) values ($1,$2,$3)
          on conflict (function_name) do update set tool = excluded.tool, level = excluded.level, updated_at = now()`, [r.function_name, r.tool, r.level])
      }
      for (const t of logTables) await pool.query(`insert into public.connector_log_tables (table_name, note) values ($1, 'registry') on conflict do nothing`, [t])
    },
    async setAuditUndo(id, undo) { await pool.query('update public.connector_audit set undo = $2 where id = $1', [id, JSON.stringify(undo)]) },
    async undoCandidates(userId, limit) {
      const r = await pool.query(`select * from public.connector_audit where user_id = $1 and status = 'done' and undone_by is null and undo_of is null order by started_at desc limit $2`, [userId, limit])
      return r.rows.map((x) => ({ id: x.id, tool: x.tool, functionName: x.function_name, args: x.args, result: x.result, rows: x.rows_written, undo: x.undo, groupKey: x.group_key, startedAt: Date.parse(x.started_at) }))
    },
    async mintSession(user) { return { accessToken: `local:${user.id}`, expiresAt: Date.now() + 3600_000, user } },
    async userFromAccessToken() { return null },
    async rpc(session, fn, args) {
      return asUser(session.user.id, async (c) => {
        const keys = Object.keys(args ?? {})
        const types = await c.query(`select p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes::oid[]) t) as types
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn])
        const typeOf = (k) => { for (const r of types.rows) { const i = (r.proargnames ?? []).indexOf(k); if (i >= 0) return r.types[i] } return null }
        const params = keys.map((k) => { const v = args[k]; const t = typeOf(k); return t === 'jsonb' || t === 'json' ? JSON.stringify(v) : v })
        const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}${typeOf(k) ? `::${typeOf(k)}` : ''}`).join(', ')})`
        const r = await c.query(`select coalesce((select jsonb_agg(to_jsonb(x)) from ${call} x), 'null'::jsonb) as r, (select p.proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $${keys.length + 1} limit 1) as setof`, [...params, fn])
        let data = r.rows[0].r
        if (!r.rows[0].setof && Array.isArray(data)) data = data[0] ?? null
        if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 1 && fn in data) data = data[fn]
        return { data, error: null }
      })
    },
    async select(session, spec) {
      return asUser(session.user.id, async (c) => {
        const where = []
        const params = []
        const p = (v) => { params.push(v); return `$${params.length}` }
        for (const [k, v] of Object.entries(spec.eq ?? {})) where.push(v === null ? `${k} is null` : `${k} = ${p(v)}`)
        for (const [k, v] of Object.entries(spec.in ?? {})) where.push(`${k} = any(${p(v)})`)
        for (const [k, v] of Object.entries(spec.gte ?? {})) where.push(`${k} >= ${p(v)}`)
        for (const [k, v] of Object.entries(spec.lte ?? {})) where.push(`${k} <= ${p(v)}`)
        for (const [k, v] of Object.entries(spec.lt ?? {})) where.push(`${k} < ${p(v)}`)
        const order = (spec.order ?? []).map(([k, d]) => `${k} ${d === 'asc' ? 'asc' : 'desc'}`).join(', ')
        const sql = `select ${spec.columns.join(', ')} from public.${spec.table}${where.length ? ` where ${where.join(' and ')}` : ''}${order ? ` order by ${order}` : ''} limit ${spec.limit ?? 1000} offset ${spec.offset ?? 0}`
        const r = await c.query(sql, params)
        return { data: r.rows.map((row) => JSON.parse(JSON.stringify(row))), error: null }
      })
    },
  }
}
