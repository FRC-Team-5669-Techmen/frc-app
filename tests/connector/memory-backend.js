// An in-memory stand-in for api/_lib/connector/backend.js, so the REAL OAuth
// handlers, MCP endpoint and write engine run in vitest with no database.
// What it cannot stand in for (RLS, connector_call, the function bodies) is
// proved against PostgreSQL 16 by tools/connector/harness/proof.mjs.
//
// `rpcImpl(session, fn, args)` decides what each database call answers; the
// default allows the allowlisted user and refuses everyone else, and answers a
// connector_call preview or commit the way 0018 does in shape.
import { canonical } from '../../api/_lib/connector/crypto.js'

export function memoryBackend({ allowed = 'u-admin', enabled = true, users = {}, rpcImpl } = {}) {
  const s = {
    settings: { enabled, allowedMember: allowed },
    clients: new Map(),
    codes: new Map(),
    tokens: new Map(),
    confirmations: new Map(),
    audit: [],
    registry: [],
    calls: [],
    minted: 0,
    users: { 'u-admin': { id: 'u-admin', email: 'admin@example.test' }, 'u-student': { id: 'u-student', email: 'student@example.test' }, ...users },
    browser: new Map([['tok-admin', 'u-admin'], ['tok-student', 'u-student']]),
  }
  let nextId = 1
  const id = () => `id-${nextId++}`

  const defaultRpc = (session, fn, args) => {
    const uid = session.user.id
    const may = uid === s.settings.allowedMember
    if (fn === 'connector_may_connect') return { data: may, error: null }
    if (fn === 'connector_call') {
      if (!may) return { data: null, error: { code: '42501', message: 'The Techmen connector is for its one approved account.' } }
      const rows = [{ table: 'hour_adjustments', id: id(), row: { ...args.p_args } }]
      if (args.p_mode === 'preview') {
        return { data: null, error: { code: 'CN001', message: `CONNECTOR_PREVIEW:${JSON.stringify({ result: 'preview-result', rows, level: 'undo' })}` } }
      }
      const prior = s.audit.find((a) => a.request_key === args.p_request_key && (!args.p_request_key.startsWith('derived:') || true))
      if (prior) return { data: { repeated: true, audit_id: prior.id, result: prior.result, rows: prior.rows }, error: null }
      const row = { id: id(), request_key: args.p_request_key, user_id: uid, tool: args.p_tool, function_name: args.p_function, args: args.p_args, result: `result-${s.audit.length + 1}`, rows, undo: null, undo_of: args.p_meta?.undo_of ?? null, undone_by: null, status: 'done', started_at: new Date().toISOString() }
      if (row.undo_of) {
        const of = s.audit.find((a) => a.id === row.undo_of)
        if (!of || of.undone_by) return { data: null, error: { code: 'P0001', message: 'That change was already undone, or it is not one of yours.' } }
        of.undone_by = row.id
      }
      s.audit.push(row)
      s.calls.push({ fn: args.p_function, args: args.p_args, uid })
      return { data: { repeated: false, audit_id: row.id, result: row.result, rows }, error: null }
    }
    if (fn === 'connector_audit_failure') return { data: id(), error: null }
    s.calls.push({ fn, args, uid, direct: true })
    return { data: { ok: true, fn }, error: null }
  }

  return {
    state: s,
    kind: 'memory',
    async settings() { return { ...s.settings } },
    async findClient(cid) { return s.clients.get(cid) ?? null },
    async registerClient(c) { s.clients.set(c.clientId, c) },
    async storeCode(c) { s.codes.set(c.codeHash, { ...c, usedAt: null }) },
    async takeCode(h, now) {
      const c = s.codes.get(h)
      if (!c || c.usedAt) return null
      c.usedAt = now
      return { ...c }
    },
    async createToken(t) {
      const tid = id()
      s.tokens.set(tid, { ...t, id: tid, revokedAt: null, lastUsedAt: null })
      return tid
    },
    async tokenByAccess(h) {
      const t = [...s.tokens.values()].find((x) => x.accessHash === h)
      return t ? { ...t } : null
    },
    async rotate(refreshHash, next, now) {
      const t = [...s.tokens.values()].find((x) => x.refreshHash === refreshHash && x.revokedAt === null && x.refreshExpiresAt > now)
      if (!t) return null
      Object.assign(t, next, { lastUsedAt: now })
      return { ...t }
    },
    async revokeByHash(h, by) {
      let m = false
      for (const t of s.tokens.values()) if ((t.accessHash === h || t.refreshHash === h) && t.revokedAt === null) { t.revokedAt = Date.now(); t.revokedBy = by; m = true }
      return m
    },
    async revokeToken(tid, by) { const t = s.tokens.get(tid); if (t && t.revokedAt === null) { t.revokedAt = Date.now(); t.revokedBy = by } },
    async touchToken(tid, now) { const t = s.tokens.get(tid); if (t) t.lastUsedAt = now },
    async storeConfirmation(c) { s.confirmations.set(c.tokenHash, { ...c, usedAt: null }) },
    async takeConfirmation(h, now) {
      const c = s.confirmations.get(h)
      if (!c || c.usedAt || c.expiresAt <= now) return null
      c.usedAt = now
      return { ...c }
    },
    async syncRegistry(rows) { s.registry = rows },
    async setAuditUndo(auditId, undo) { const a = s.audit.find((x) => x.id === auditId); if (a) a.undo = undo },
    async undoCandidates(uid) {
      return s.audit.filter((a) => a.user_id === uid && a.status === 'done' && !a.undone_by && !a.undo_of).reverse()
        .map((a) => ({ id: a.id, tool: a.tool, functionName: a.function_name, args: a.args, result: a.result, rows: a.rows, undo: a.undo, groupKey: null, startedAt: Date.parse(a.started_at) }))
    },
    async mintSession(user) { s.minted += 1; return { accessToken: `minted-${user.id}`, expiresAt: Date.now() + 3600_000, user } },
    async userFromAccessToken(t) { const uid = s.browser.get(t); return uid ? { ...s.users[uid] } : null },
    async rpc(session, fn, args) { return (rpcImpl ?? defaultRpc)(session, fn, args, s, defaultRpc) },
    async select() { return { data: [], error: null } },
    canonical,
  }
}

/** A clock that only moves when told to. */
export function testClock(start = Date.parse('2026-10-19T19:00:00Z')) {
  let t = start
  const now = () => t
  now.advance = (ms) => { t += ms }
  return now
}

/** Deterministic random bytes. */
export function testRandom() {
  let n = 0
  return (size) => { n += 1; return Buffer.alloc(size, n % 251) }
}
