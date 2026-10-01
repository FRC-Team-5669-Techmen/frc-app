// The fake PostgREST behind fixture mode: a supabase-js v2 shaped query
// builder and RPC dispatcher over a plain in-memory store.
//
// PURE ON PURPOSE: no window, no localStorage, no React, no import.meta.glob.
// client.js owns everything browser-shaped (persistence, auth, the plugin glob)
// and hands this module a store and a context getter, which is what lets
// tests/fixture-client.test.js drive it under vitest's node environment.
//
// FIDELITY IS THE POINT. The fixture exists to behave like production, so it
// answers from the real catalog (schema.js, generated from the frozen SQL):
//   - a column the table does not have fails the way PostgREST fails
//     (select -> 42703, insert/update payload -> PGRST204);
//   - a missing table/RPC answers PGRST205/PGRST202, an unresolvable embed
//     PGRST200 -- the codes src/schemaMissing.js matches on;
//   - NOT NULL (23502), enum-shaped CHECKs (23514), unique keys including
//     partial ones (23505) and foreign keys (23503) are enforced on writes;
//   - UPDATE and DELETE find their rows through the read filter, exactly as a
//     Postgres UPDATE finds its rows through the SELECT policy.
// What it does NOT model: write-side RLS (a write a persona makes succeeds
// unless a constraint refuses it), triggers, views, and anything about a
// column's type beyond the coercions in `coerceIn`.

export class FixtureError extends Error {
  constructor(code, message, { details = null, hint = null, status = 400 } = {}) {
    super(message)
    this.code = code
    this.details = details
    this.hint = hint
    this.status = status
  }
  toJSON() { return { code: this.code, message: this.message, details: this.details, hint: this.hint } }
}

export const pgError = (code, message, extra) => new FixtureError(code, message, extra)

// ── Migration switch ────────────────────────────────────────────────────────

export function normMigration(m) {
  if (m == null || m === '') return null
  const s = String(m).trim()
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s
}

// setting: 'all' | 'none' | array of migration numbers
export function migrationApplied(migration, setting) {
  const m = normMigration(migration)
  if (m == null) return true
  if (setting == null || setting === 'all') return true
  if (setting === 'none') return false
  return Array.isArray(setting) && setting.map(normMigration).includes(m)
}

// ── Small value helpers ─────────────────────────────────────────────────────

export function uuid() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const h = () => Math.floor(Math.random() * 16).toString(16)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) =>
    ch === 'x' ? h() : ((Math.random() * 4) | 8).toString(16))
}

const clone = (v) => (v == null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)))
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/

function typeClass(type) {
  if (!type) return null
  if (type.endsWith('[]')) return 'array'
  if (/^timestamp/.test(type)) return 'timestamp'
  if (type === 'date') return 'date'
  if (/^(integer|bigint|smallint|numeric|real|double precision)/.test(type)) return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'uuid') return 'uuid'
  if (/^jsonb?$/.test(type)) return 'json'
  return 'text'
}

// A value arriving from the client, coerced the way Postgres would accept it
// (or refused the way Postgres would refuse it).
function coerceIn(value, type, column) {
  if (value === undefined || value === null) return null
  const tc = typeClass(type)
  switch (tc) {
    case 'timestamp': {
      const t = value instanceof Date ? value.getTime() : Date.parse(value)
      if (Number.isNaN(t)) throw pgError('22007', `invalid input syntax for type timestamp with time zone: "${value}"`)
      return new Date(t).toISOString()
    }
    case 'date': {
      const s = value instanceof Date ? value.toISOString() : String(value)
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw pgError('22007', `invalid input syntax for type date: "${value}"`)
      return s.slice(0, 10)
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (Number.isNaN(n)) throw pgError('22P02', `invalid input syntax for type ${type}: "${value}"`)
      return n
    }
    case 'boolean':
      if (value === true || value === 'true' || value === 't') return true
      if (value === false || value === 'false' || value === 'f') return false
      throw pgError('22P02', `invalid input syntax for type boolean: "${value}"`)
    case 'uuid':
      if (!UUID_RE.test(String(value))) throw pgError('22P02', `invalid input syntax for type uuid: "${value}"`)
      return String(value).toLowerCase()
    case 'array':
      if (!Array.isArray(value)) throw pgError('22P02', `malformed array literal: "${value}"`, { details: `column ${column}` })
      return clone(value)
    case 'json':
      return clone(value)
    case 'text':
      return typeof value === 'object' ? JSON.stringify(value) : String(value)
    default:
      return clone(value)
  }
}

// A comparable key for filters and ordering, by declared type when the column
// is known and by the value's own shape when it is not (lenient tables).
function sortKey(value, type) {
  if (value === undefined || value === null) return null
  let tc = typeClass(type)
  if (!tc) {
    if (typeof value === 'number') tc = 'number'
    else if (typeof value === 'boolean') tc = 'boolean'
    else if (typeof value === 'string' && ISO_TS_RE.test(value)) tc = 'timestamp'
    else tc = 'text'
  }
  switch (tc) {
    case 'timestamp': { const t = Date.parse(value); return Number.isNaN(t) ? String(value) : t }
    case 'number': return Number(value)
    case 'boolean': return value === true || value === 'true' ? 1 : 0
    case 'date': return String(value).slice(0, 10)
    case 'uuid': return String(value).toLowerCase()
    case 'array': case 'json': return JSON.stringify(value)
    default: return String(value)
  }
}

function cmp(a, b) {
  if (a === b) return 0
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

function likeToRegex(pattern, insensitive) {
  const src = String(pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[%*]/g, '.*')
    .replace(/_/g, '.')
  return new RegExp(`^${src}$`, insensitive ? 'is' : 's')
}

// jsonb @> containment (and array containment).
function containsValue(hay, needle) {
  if (Array.isArray(needle)) {
    if (!Array.isArray(hay)) return false
    return needle.every((n) => hay.some((h) => (typeof n === 'object' && n !== null ? containsValue(h, n) : h === n)))
  }
  if (needle && typeof needle === 'object') {
    if (!hay || typeof hay !== 'object' || Array.isArray(hay)) return false
    return Object.entries(needle).every(([k, v]) => containsValue(hay[k], v))
  }
  return hay === needle
}

// ── The select grammar ──────────────────────────────────────────────────────

function splitTop(str, sep = ',') {
  const parts = []
  let depth = 0
  let quote = false
  let cur = ''
  for (const ch of str) {
    if (ch === '"') quote = !quote
    if (!quote) {
      if (ch === '(') depth += 1
      if (ch === ')') depth -= 1
      if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue }
    }
    cur += ch
  }
  if (cur.trim() !== '' || parts.length) parts.push(cur)
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

// '*, member:profiles!fk_name!inner(full_name, nickname)' -> nodes
export function parseSelect(str) {
  const s = (str == null || str === '' ? '*' : String(str)).replace(/\s+/g, ' ').trim()
  return splitTop(s).map((item) => {
    const it = item.replace(/\s/g, '')
    if (it === '*') return { type: 'star' }
    const open = it.indexOf('(')
    if (open > 0 && it.endsWith(')') && !/->/.test(it.slice(0, open))) {
      let head = it.slice(0, open)
      const inner = it.slice(open + 1, -1)
      let alias = null
      if (head.includes(':')) [alias, head] = head.split(':')
      const [name, ...mods] = head.split('!')
      let hint = null
      let joinType = 'left'
      for (const m of mods) {
        if (m === 'inner' || m === 'left') joinType = m
        else hint = m
      }
      return { type: 'embed', name: name.replace(/^\.\.\./, ''), alias, hint, inner: joinType === 'inner', nodes: parseSelect(inner) }
    }
    let alias = null
    let rest = it
    const colon = rest.indexOf(':')
    if (colon > 0 && rest[colon + 1] !== ':') { alias = rest.slice(0, colon); rest = rest.slice(colon + 1) }
    rest = rest.replace(/::\w+$/, '')
    const arrow = rest.match(/^(\w+)((?:->>?\w+)+)$/)
    if (arrow) {
      const path = [...arrow[2].matchAll(/->(>?)(\w+)/g)].map((m) => ({ key: m[2], text: m[1] === '>' }))
      return { type: 'col', name: arrow[1], alias: alias ?? path.at(-1).key, path }
    }
    return { type: 'col', name: rest, alias: alias ?? rest }
  })
}

// PostgREST logic-tree strings: 'a.eq.1,b.is.null,and(c.gt.2,d.in.(x,y))'
export function parseLogic(str) {
  return splitTop(String(str)).map((term) => {
    const t = term.trim()
    const group = t.match(/^(not\.)?(and|or)\((.*)\)$/s)
    if (group) return { kind: group[2], negate: !!group[1], terms: parseLogic(group[3]) }
    const dot = t.indexOf('.')
    const column = t.slice(0, dot)
    let rest = t.slice(dot + 1)
    let negate = false
    if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4) }
    const d2 = rest.indexOf('.')
    const op = d2 < 0 ? rest : rest.slice(0, d2)
    const raw = d2 < 0 ? '' : rest.slice(d2 + 1)
    return { kind: 'cond', column, op, value: parseRawValue(op, raw), negate }
  })
}

function unquote(s) {
  const t = s.trim()
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
}

function parseRawValue(op, raw) {
  if (op === 'in') return splitTop(raw.replace(/^\(|\)$/g, '')).map(unquote)
  if (op === 'is') return raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw
  if (op === 'cs' || op === 'cd' || op === 'ov') {
    if (raw.startsWith('{')) return splitTop(raw.slice(1, -1)).map(unquote)
    if (raw.startsWith('(')) return splitTop(raw.slice(1, -1)).map(unquote)
    try { return JSON.parse(raw) } catch { return raw }
  }
  return unquote(raw)
}

// ── The engine ──────────────────────────────────────────────────────────────

/**
 * createEngine({ schema, plugins, store, context, now, onWrite, log })
 *   schema   SCHEMA from schema.js
 *   plugins  [core, ...features] -- the README contract
 *   store    { db } -- db is { table: rows[] }; replaced wholesale on reseed
 *   context  () => { user: {id,email,...}|null, persona: {...}|null, migrations }
 *   now      () => Date
 *   onWrite  () => void, after every successful write (persistence)
 *   log      (entry) => void, every call with its outcome
 *   latency  () => ms | null -- answer after a timer, like a network round
 *            trip. null (the default, and what the unit tests use) answers
 *            on a microtask. A real request is never answered within the same
 *            frame, so an app racing its own state against a response must be
 *            tested with some latency or the fixture manufactures the race.
 */
export function createEngine({ schema, plugins = [], store, context, now = () => new Date(), onWrite = () => {}, log = () => {}, latency = () => null }) {
  const answer = (value) => {
    const ms = latency()
    return ms == null ? Promise.resolve(value) : new Promise((r) => setTimeout(() => r(value), ms))
  }

  const tablesMeta = schema.tables
  const coreFunctions = schema.functions

  // Static claims made by plugins, indexed once.
  const featureTables = new Map()
  const featureColumns = new Map()
  // Changes a migration makes to a column that already exists: a NOT NULL
  // dropped, an enum CHECK replaced. table -> [{ column, nullable, values, migration }]
  const featureAlters = new Map()
  const rpcClaims = new Map()
  const relations = []
  const visibles = new Map()
  const functionHandlers = new Map()
  for (const p of plugins) {
    const mig = normMigration(p.migration)
    for (const t of p.creates?.tables ?? []) featureTables.set(t, { migration: mig, plugin: p.name })
    for (const [t, cols] of Object.entries(p.creates?.columns ?? {})) {
      const list = Array.isArray(cols) ? cols.map((c) => [c, {}]) : Object.entries(cols)
      const entry = featureColumns.get(t) ?? []
      for (const [c, def] of list) entry.push({ column: c, def: def ?? {}, migration: mig, plugin: p.name })
      featureColumns.set(t, entry)
    }
    for (const [t, cols] of Object.entries(p.alters ?? {})) {
      const entry = featureAlters.get(t) ?? []
      for (const [c, def] of Object.entries(cols ?? {})) {
        entry.push({ column: c, nullable: def?.nullable === true, values: Array.isArray(def?.values) ? def.values.slice() : null, migration: mig, plugin: p.name })
      }
      featureAlters.set(t, entry)
    }
    const handlers = p.rpcs ?? {}
    const claimed = new Set([...(p.creates?.rpcs ?? []), ...Object.keys(handlers)])
    for (const name of claimed) {
      const list = rpcClaims.get(name) ?? []
      list.push({ migration: mig, handler: handlers[name] ?? null, plugin: p.name, core: p.name === 'core' })
      rpcClaims.set(name, list)
    }
    for (const [key, def] of Object.entries(p.relations ?? {})) relations.push({ key, def, migration: mig })
    for (const [t, fn] of Object.entries(p.visible ?? {})) {
      const list = visibles.get(t) ?? []
      list.push(fn)
      visibles.set(t, list)
    }
    for (const [name, fn] of Object.entries(p.functions ?? {})) functionHandlers.set(name, { fn, migration: mig })
  }

  const ctx = () => context() ?? {}
  const applied = (mig) => migrationApplied(mig, ctx().migrations)
  const db = () => store.db

  // A table as the CURRENT migration setting sees it (or as `isApplied` says,
  // which the seed check uses to judge rows against every migration applied).
  function tableInfo(name, isApplied = applied) {
    if (typeof name !== 'string' || name.startsWith('__')) return { exists: false, name }
    const core = tablesMeta[name]
    const feat = featureTables.get(name)
    let columns = null
    let strict = false
    let exists = false
    if (core) {
      exists = true
      strict = true
      columns = { ...core.columns }
    } else if (feat) {
      exists = isApplied(feat.migration)
    } else if (Array.isArray(db()[name])) {
      exists = true
    }
    const hidden = new Set()
    for (const fc of featureColumns.get(name) ?? []) {
      if (isApplied(fc.migration)) {
        if (!columns) columns = {}
        if (!core && !columns[fc.column]) strict = true
        columns[fc.column] = { type: fc.def.type ?? null, notnull: false, default: fc.def.default !== undefined ? { kind: 'value', value: fc.def.default } : null, feature: true }
      } else {
        hidden.add(fc.column)
      }
    }
    // A feature's own table that lists its columns is strict, and always has
    // the id/created_at every lenient insert would have given it.
    if (!core && strict) {
      columns.id ??= { type: null, notnull: false, default: { kind: 'uuid' } }
      columns.created_at ??= { type: null, notnull: false, default: { kind: 'now' } }
    }
    // A migration that relaxes an existing column (drops NOT NULL, replaces an
    // enum CHECK's list) does so only while it is applied: before it, the old
    // constraint refuses exactly as the live table does, which is what a
    // client's fallback to the old shape is tested against. Copies only, so
    // the shared schema objects never change.
    let meta = core ?? { pk: ['id'], unique: [], fks: [], enums: {} }
    const alters = (featureAlters.get(name) ?? []).filter((a) => isApplied(a.migration))
    if (alters.length) {
      const enums = { ...(meta.enums ?? {}) }
      for (const a of alters) {
        if (a.nullable && columns?.[a.column]) columns[a.column] = { ...columns[a.column], notnull: false }
        if (a.values) enums[a.column] = { constraint: enums[a.column]?.constraint ?? `${name}_${a.column}_check`, values: a.values }
      }
      meta = { ...meta, enums }
    }
    return {
      name,
      exists,
      strict,
      columns,
      hidden,
      meta,
    }
  }

  function requireTable(name) {
    const info = tableInfo(name)
    if (!info.exists) {
      throw pgError('PGRST205', `Could not find the table 'public.${name}' in the schema cache`, { status: 404 })
    }
    return info
  }

  function colType(info, col) {
    return info.columns?.[col]?.type ?? null
  }

  function assertColumn(info, col, where = 'select') {
    if (!info.strict) return
    if (info.columns[col]) return
    if (where === 'write') {
      throw pgError('PGRST204', `Could not find the '${col}' column of '${info.name}' in the schema cache`)
    }
    throw pgError('42703', `column ${info.name}.${col} does not exist`)
  }

  function persona() {
    return ctx().persona ?? null
  }

  function visibleRows(name) {
    const rows = db()[name] ?? []
    const c = ctx()
    // Every SELECT policy in this schema is `to authenticated`: a signed-out
    // caller (the anon key) reads nothing.
    if (!c.user) return []
    const fns = visibles.get(name)
    if (!fns || !fns.length) return rows
    return rows.filter((row) => fns.every((fn) => {
      try { return fn({ table: name, row, user: c.user ?? null, persona: c.persona ?? null, db: db() }) !== false } catch { return false }
    }))
  }

  // ── Embeds ───────────────────────────────────────────────────────────────

  function resolveEmbed(fromTable, node) {
    const keys = [node.hint && `${fromTable}.${node.hint}`, node.alias && `${fromTable}.${node.alias}`, `${fromTable}.${node.name}`].filter(Boolean)
    for (const k of keys) {
      const rel = relations.find((r) => r.key === k && applied(r.migration))
      if (rel) {
        const d = rel.def
        return { table: d.table ?? node.name, local: [].concat(d.local), foreign: [].concat(d.foreign), one: !!d.one }
      }
    }
    const fromMeta = tablesMeta[fromTable]
    const fksFrom = fromMeta?.fks ?? []
    // alias:fk_column(...) -- embed through a foreign key column of this table
    const byColumn = fksFrom.filter((f) => f.columns.length === 1 && f.columns[0] === node.name && !f.table.includes('.'))
    if (byColumn.length === 1 && !tablesMeta[node.name]) {
      const f = byColumn[0]
      return { table: f.table, local: f.columns, foreign: f.refColumns, one: true }
    }
    const target = node.name
    const targetMeta = tablesMeta[target]
    const outbound = fksFrom.filter((f) => f.table === target).map((f) => ({ fk: f, dir: 'out' }))
    const inbound = (targetMeta?.fks ?? []).filter((f) => f.table === fromTable).map((f) => ({ fk: f, dir: 'in' }))
    let cands = [...outbound, ...inbound]
    if (node.hint) {
      cands = cands.filter(({ fk }) => fk.name === node.hint || (fk.columns.length === 1 && fk.columns[0] === node.hint))
    }
    if (cands.length === 1) {
      const { fk, dir } = cands[0]
      return dir === 'out'
        ? { table: target, local: fk.columns, foreign: fk.refColumns, one: true }
        : { table: target, local: fk.refColumns, foreign: fk.columns, one: false }
    }
    if (cands.length > 1) {
      throw pgError('PGRST201', `Could not embed because more than one relationship was found for '${fromTable}' and '${target}'`, {
        hint: `Try changing '${target}' to one of: ${cands.map(({ fk }) => `'${target}!${fk.name}'`).join(', ')}`,
        status: 300,
      })
    }
    throw pgError('PGRST200', `Could not find a relationship between '${fromTable}' and '${target}' in the schema cache`, {
      hint: 'Perhaps you meant a different relationship', status: 400,
    })
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  function testCond(info, row, cond) {
    const { column, op } = cond
    let value = cond.value
    if (info) assertColumn(info, column)
    const type = info ? colType(info, column) : null
    const raw = row[column]
    let res
    switch (op) {
      case 'eq': res = raw != null && value != null && cmp(sortKey(raw, type), sortKey(value, type)) === 0; break
      case 'neq': res = raw != null && value != null && cmp(sortKey(raw, type), sortKey(value, type)) !== 0; break
      case 'gt': res = raw != null && value != null && cmp(sortKey(raw, type), sortKey(value, type)) > 0; break
      case 'gte': res = raw != null && value != null && cmp(sortKey(raw, type), sortKey(value, type)) >= 0; break
      case 'lt': res = raw != null && value != null && cmp(sortKey(raw, type), sortKey(value, type)) < 0; break
      case 'lte': res = raw != null && value != null && cmp(sortKey(raw, type), sortKey(value, type)) <= 0; break
      case 'like': res = raw != null && likeToRegex(value, false).test(String(raw)); break
      case 'ilike': res = raw != null && likeToRegex(value, true).test(String(raw)); break
      case 'match': res = raw != null && new RegExp(value).test(String(raw)); break
      case 'imatch': res = raw != null && new RegExp(value, 'i').test(String(raw)); break
      case 'is':
        if (value === 'null') value = null
        res = value === null ? raw == null : value === true ? raw === true : value === false ? raw === false : raw == null
        break
      case 'in': {
        const list = Array.isArray(value) ? value : parseRawValue('in', String(value))
        res = raw != null && list.some((v) => v != null && cmp(sortKey(raw, type), sortKey(v, type)) === 0)
        break
      }
      case 'cs': res = raw != null && containsValue(raw, value); break
      case 'cd': res = raw != null && containsValue(value, raw); break
      case 'ov': res = Array.isArray(raw) && Array.isArray(value) && raw.some((r) => value.includes(r)); break
      case 'fts': case 'plfts': case 'phfts': case 'wfts': {
        const words = String(value).toLowerCase().split(/[\s&|!]+/).filter(Boolean)
        res = raw != null && words.every((w) => String(raw).toLowerCase().includes(w))
        break
      }
      default:
        throw pgError('PGRST100', `"failed to parse filter (${op})" (line 1, column 1)`)
    }
    return cond.negate ? !res : res
  }

  function testTree(info, row, node) {
    if (node.kind === 'cond') return testCond(info, row, node)
    const results = node.terms.map((t) => testTree(info, row, t))
    const r = node.kind === 'and' ? results.every(Boolean) : results.some(Boolean)
    return node.negate ? !r : r
  }

  // ── Projection ───────────────────────────────────────────────────────────

  const DROP = Symbol('drop')

  function project(info, row, nodes, q, path) {
    const out = {}
    for (const node of nodes) {
      if (node.type === 'star') {
        if (info.strict) {
          for (const [col, def] of Object.entries(info.columns)) {
            if (def.noSelect) throw pgError('42501', `permission denied for column ${col}`, { hint: `select('*') reads ${info.name}.${col}; name the columns instead` })
            out[col] = row[col] === undefined ? null : clone(row[col])
          }
        } else {
          for (const [col, v] of Object.entries(row)) if (!info.hidden.has(col)) out[col] = clone(v)
        }
      } else if (node.type === 'col') {
        assertColumn(info, node.name)
        if (info.columns?.[node.name]?.noSelect) throw pgError('42501', `permission denied for column ${node.name}`)
        if (!info.strict && info.hidden.has(node.name)) throw pgError('42703', `column ${info.name}.${node.name} does not exist`)
        let v = row[node.name] === undefined ? null : row[node.name]
        for (const step of node.path ?? []) {
          v = v && typeof v === 'object' ? v[step.key] : null
          if (v === undefined) v = null
          if (step.text && v != null && typeof v === 'object') v = JSON.stringify(v)
          else if (step.text && v != null) v = String(v)
        }
        out[node.alias] = clone(v)
      } else if (node.type === 'embed') {
        const rel = resolveEmbed(info.name, node)
        const tinfo = tableInfo(rel.table)
        if (!tinfo.exists) throw pgError('PGRST200', `Could not find a relationship between '${info.name}' and '${rel.table}' in the schema cache`)
        const key = node.alias ?? node.name
        const subPath = [...path, key]
        const pathKey = subPath.join('.')
        let matches = visibleRows(rel.table).filter((r) =>
          rel.local.every((lc, i) => row[lc] != null && sortKey(r[rel.foreign[i]], colType(tinfo, rel.foreign[i])) === sortKey(row[lc], colType(info, lc))))
        const sub = q.embedFilters.filter((f) => f.path === pathKey)
        if (sub.length) matches = matches.filter((r) => sub.every((f) => testTree(tinfo, r, f.tree)))
        const ord = q.orders.filter((o) => o.path === pathKey)
        if (ord.length) matches = sortRows(tinfo, matches, ord)
        const lim = q.embedLimits[pathKey]
        if (lim) matches = matches.slice(lim.from, lim.to + 1)
        const projected = matches.map((r) => project(tinfo, r, node.nodes, q, subPath)).filter((r) => r !== DROP)
        if (rel.one) {
          out[key] = projected[0] ?? null
          if (node.inner && out[key] == null) return DROP
        } else {
          out[key] = projected
          if (node.inner && projected.length === 0) return DROP
        }
      }
    }
    return out
  }

  function sortRows(info, rows, orders) {
    const list = rows.slice()
    list.sort((a, b) => {
      for (const o of orders) {
        assertColumn(info, o.column)
        const type = colType(info, o.column)
        const ka = sortKey(a[o.column], type)
        const kb = sortKey(b[o.column], type)
        const nullsFirst = o.nullsFirst ?? !o.ascending
        if (ka === null && kb === null) continue
        if (ka === null) return nullsFirst ? -1 : 1
        if (kb === null) return nullsFirst ? 1 : -1
        const c = cmp(ka, kb)
        if (c !== 0) return o.ascending ? c : -c
      }
      return 0
    })
    return list
  }

  // ── Writes ───────────────────────────────────────────────────────────────

  function applyDefault(def, table) {
    if (!def) return null
    switch (def.kind) {
      case 'uuid': return uuid()
      case 'now': return now().toISOString()
      case 'today': return now().toISOString().slice(0, 10)
      case 'auth_uid': return ctx().user?.id ?? null
      case 'serial': {
        const rows = db()[table] ?? []
        return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
      }
      case 'value': return clone(def.value)
      default: return null
    }
  }

  // Build the stored row for an insert: payload columns checked and coerced,
  // defaults applied for the rest.
  function buildRow(info, payload) {
    const row = {}
    for (const [col, val] of Object.entries(payload)) {
      if (val === undefined) continue
      if (!info.strict && info.hidden.has(col)) throw pgError('PGRST204', `Could not find the '${col}' column of '${info.name}' in the schema cache`)
      assertColumn(info, col, 'write')
      row[col] = info.strict ? coerceIn(val, colType(info, col), col) : clone(val)
    }
    if (info.strict) {
      for (const [col, def] of Object.entries(info.columns)) {
        if (!(col in row)) row[col] = applyDefault(def.default, info.name)
      }
    } else {
      if (!('id' in row)) row.id = uuid()
      if (!('created_at' in row)) row.created_at = now().toISOString()
    }
    return row
  }

  function predicateHolds(where, row) {
    if (!where) return true
    if (where.unparsed) return false
    const v = row[where.column]
    if (where.op === 'null') return v == null
    if (where.op === 'notnull') return v != null
    return v === where.value || (v != null && String(v) === String(where.value))
  }

  function checkRow(info, row, others) {
    if (!info.strict) return
    for (const [col, def] of Object.entries(info.columns)) {
      if (def.notnull && row[col] == null) {
        throw pgError('23502', `null value in column "${col}" of relation "${info.name}" violates not-null constraint`)
      }
    }
    for (const [col, e] of Object.entries(info.meta.enums ?? {})) {
      if (row[col] != null && !e.values.includes(row[col])) {
        throw pgError('23514', `new row for relation "${info.name}" violates check constraint "${e.constraint}"`)
      }
    }
    for (const u of info.meta.unique ?? []) {
      if (u.where?.unparsed) continue
      if (!predicateHolds(u.where, row)) continue
      if (u.columns.some((c) => row[c] == null)) continue
      const clash = others.find((o) => predicateHolds(u.where, o) &&
        u.columns.every((c) => o[c] != null && sortKey(o[c], colType(info, c)) === sortKey(row[c], colType(info, c))))
      if (clash) {
        throw pgError('23505', `duplicate key value violates unique constraint "${u.name}"`, {
          details: u.columns.length ? `Key (${u.columns.join(', ')})=(${u.columns.map((c) => row[c]).join(', ')}) already exists.` : null,
          status: 409,
        })
      }
    }
    for (const fk of info.meta.fks ?? []) {
      if (fk.table.includes('.')) continue
      if (fk.columns.some((c) => row[c] == null)) continue
      const target = db()[fk.table] ?? []
      const tinfo = tableInfo(fk.table)
      const hit = target.some((t) => fk.columns.every((c, i) =>
        sortKey(t[fk.refColumns[i]], colType(tinfo, fk.refColumns[i])) === sortKey(row[c], colType(info, c))))
      if (!hit) {
        throw pgError('23503', `insert or update on table "${info.name}" violates foreign key constraint "${fk.name}"`, {
          details: `Key (${fk.columns.join(', ')})=(${fk.columns.map((c) => row[c]).join(', ')}) is not present in table "${fk.table}".`,
          status: 409,
        })
      }
    }
  }

  // Deleting `rows` from `table`: follow every foreign key that points at it.
  function cascadeDelete(table, rows, seen = new Set()) {
    if (!rows.length) return
    for (const [childName, childMeta] of Object.entries(tablesMeta)) {
      for (const fk of childMeta.fks ?? []) {
        if (fk.table !== table) continue
        const childRows = db()[childName] ?? []
        const refs = childRows.filter((c) => rows.some((r) => fk.columns.every((col, i) => c[col] != null && String(c[col]) === String(r[fk.refColumns[i]]))))
        if (!refs.length) continue
        if (fk.onDelete === 'cascade') {
          const key = `${childName}`
          db()[childName] = childRows.filter((c) => !refs.includes(c))
          if (!seen.has(key)) cascadeDelete(childName, refs, new Set([...seen, key]))
        } else if (fk.onDelete === 'set null' || fk.onDelete === 'set default') {
          for (const c of refs) for (const col of fk.columns) c[col] = null
        } else {
          throw pgError('23503', `update or delete on table "${table}" violates foreign key constraint "${fk.name}" on table "${childName}"`, { status: 409 })
        }
      }
    }
  }

  // ── The query builder ────────────────────────────────────────────────────

  class Query {
    constructor(table) {
      this.table = table
      this.op = 'select'
      this.columns = '*'
      this.returning = null
      this.filters = []
      this.embedFilters = []
      this.orders = []
      this.embedLimits = {}
      this.limitN = null
      this.rangeFrom = null
      this.rangeTo = null
      this.singleMode = null
      this.countMode = null
      this.head = false
      this.payload = null
      this.upsertOpts = null
    }

    select(columns = '*', opts = {}) {
      if (this.op === 'select') {
        this.columns = columns ?? '*'
        this.countMode = opts.count ?? null
        this.head = !!opts.head
      } else {
        this.returning = columns ?? '*'
      }
      return this
    }
    insert(values, opts = {}) { this.op = 'insert'; this.payload = values; this.countMode = opts.count ?? null; return this }
    upsert(values, opts = {}) { this.op = 'upsert'; this.payload = values; this.upsertOpts = opts; return this }
    update(values, opts = {}) { this.op = 'update'; this.payload = values; this.countMode = opts.count ?? null; return this }
    delete(opts = {}) { this.op = 'delete'; this.countMode = opts.count ?? null; return this }

    _filter(column, op, value, negate = false) {
      const parts = String(column).split('.')
      if (parts.length > 1) {
        this.embedFilters.push({ path: parts.slice(0, -1).join('.'), tree: { kind: 'cond', column: parts.at(-1), op, value, negate } })
      } else {
        this.filters.push({ kind: 'cond', column, op, value, negate })
      }
      return this
    }
    eq(c, v) { return this._filter(c, 'eq', v) }
    neq(c, v) { return this._filter(c, 'neq', v) }
    gt(c, v) { return this._filter(c, 'gt', v) }
    gte(c, v) { return this._filter(c, 'gte', v) }
    lt(c, v) { return this._filter(c, 'lt', v) }
    lte(c, v) { return this._filter(c, 'lte', v) }
    like(c, v) { return this._filter(c, 'like', v) }
    ilike(c, v) { return this._filter(c, 'ilike', v) }
    is(c, v) { return this._filter(c, 'is', v) }
    in(c, v) { return this._filter(c, 'in', v) }
    contains(c, v) { return this._filter(c, 'cs', v) }
    containedBy(c, v) { return this._filter(c, 'cd', v) }
    overlaps(c, v) { return this._filter(c, 'ov', v) }
    textSearch(c, v) { return this._filter(c, 'fts', v) }
    match(obj) { for (const [c, v] of Object.entries(obj ?? {})) this._filter(c, 'eq', v); return this }
    not(c, op, v) {
      const value = typeof v === 'string' && (op === 'in' || op === 'is' || op === 'cs' || op === 'cd') ? parseRawValue(op, v) : v
      return this._filter(c, op, value, true)
    }
    filter(c, op, v) {
      let negate = false
      let o = op
      if (o.startsWith('not.')) { negate = true; o = o.slice(4) }
      const value = typeof v === 'string' ? parseRawValue(o, v) : v
      return this._filter(c, o, value, negate)
    }
    or(expr, opts = {}) {
      const tree = { kind: 'or', negate: false, terms: parseLogic(expr) }
      const path = opts.referencedTable ?? opts.foreignTable
      if (path) this.embedFilters.push({ path, tree })
      else this.filters.push(tree)
      return this
    }
    order(column, opts = {}) {
      const path = opts.referencedTable ?? opts.foreignTable ?? ''
      this.orders.push({ column, ascending: opts.ascending !== false, nullsFirst: opts.nullsFirst, path })
      return this
    }
    limit(n, opts = {}) {
      const path = opts.referencedTable ?? opts.foreignTable
      if (path) this.embedLimits[path] = { from: 0, to: n - 1 }
      else this.limitN = n
      return this
    }
    range(from, to, opts = {}) {
      const path = opts.referencedTable ?? opts.foreignTable
      if (path) this.embedLimits[path] = { from, to }
      else { this.rangeFrom = from; this.rangeTo = to }
      return this
    }
    single() { this.singleMode = 'single'; return this }
    maybeSingle() { this.singleMode = 'maybe'; return this }
    csv() { return this }
    returns() { return this }
    abortSignal() { return this }
    throwOnError() { this.throwing = true; return this }

    then(resolve, reject) {
      let result
      try {
        result = this._execute()
      } catch (e) {
        if (!(e instanceof FixtureError)) {
          result = { data: null, error: { code: 'FIXTURE', message: String(e?.message ?? e), details: null, hint: null }, count: null, status: 500, statusText: 'Fixture fault' }
          // A fault in the fixture itself is loud on purpose: a bug here must
          // never read as the app behaving.
          console.error('[fixture] engine fault', e)
        } else {
          result = { data: null, error: e.toJSON(), count: null, status: e.status, statusText: 'Error' }
        }
      }
      log({ kind: this.op, table: this.table, columns: this.op === 'select' ? this.columns : this.returning, error: result.error?.code ?? null, rows: Array.isArray(result.data) ? result.data.length : result.data == null ? 0 : 1, count: result.count ?? null })
      return answer(result).then((r) => {
        if (r.error && this.throwing) throw Object.assign(new Error(r.error.message), r.error)
        return r
      }).then(resolve, reject)
    }
    catch(reject) { return this.then(undefined, reject) }
    finally(fn) { return this.then((v) => { fn(); return v }, (e) => { fn(); throw e }) }

    _matching(info) {
      let rows = visibleRows(this.table)
      if (this.filters.length) rows = rows.filter((r) => this.filters.every((f) => testTree(info, r, f)))
      return rows
    }

    _shape(info, rows, columns, status) {
      const nodes = parseSelect(columns)
      const top = this.orders.filter((o) => !o.path)
      let list = top.length ? sortRows(info, rows, top) : rows
      let projected = list.map((r) => project(info, r, nodes, this, [])).filter((r) => r !== DROP)
      const count = this.countMode ? projected.length : null
      if (this.rangeFrom != null) projected = projected.slice(this.rangeFrom, this.rangeTo + 1)
      if (this.limitN != null) projected = projected.slice(0, this.limitN)
      if (this.head) return { data: null, error: null, count, status, statusText: 'OK' }
      if (this.singleMode) {
        if (projected.length === 1) return { data: projected[0], error: null, count, status, statusText: 'OK' }
        if (projected.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count, status, statusText: 'OK' }
        throw pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned', {
          details: `The result contains ${projected.length} rows`, status: 406,
        })
      }
      return { data: projected, error: null, count, status, statusText: 'OK' }
    }

    _execute() {
      const info = requireTable(this.table)
      if (this.op === 'select') {
        return this._shape(info, this._matching(info), this.columns, 200)
      }
      const rows = db()[this.table] ?? (db()[this.table] = [])
      let affected = []
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        const conflict = this.op === 'upsert'
          ? (this.upsertOpts?.onConflict ? String(this.upsertOpts.onConflict).split(',').map((s) => s.trim()) : info.meta.pk)
          : null
        if (conflict && info.strict) {
          const ok = (info.meta.unique ?? []).some((u) => !u.where && u.columns.length === conflict.length && u.columns.every((c) => conflict.includes(c)))
          if (!ok) throw pgError('42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification')
        }
        const staged = rows.slice()
        for (const p of list) {
          if (conflict) {
            const keyed = conflict.every((c) => p[c] != null)
            const existing = keyed && staged.find((r) => conflict.every((c) => sortKey(r[c], colType(info, c)) === sortKey(p[c], colType(info, c))))
            if (existing) {
              if (this.upsertOpts?.ignoreDuplicates) continue
              const merged = { ...existing }
              for (const [c, v] of Object.entries(p)) {
                if (v === undefined) continue
                if (!info.strict && info.hidden.has(c)) throw pgError('PGRST204', `Could not find the '${c}' column of '${info.name}' in the schema cache`)
                assertColumn(info, c, 'write')
                merged[c] = info.strict ? coerceIn(v, colType(info, c), c) : clone(v)
              }
              checkRow(info, merged, staged.filter((r) => r !== existing))
              staged[staged.indexOf(existing)] = merged
              affected.push(merged)
              continue
            }
          }
          const row = buildRow(info, p)
          checkRow(info, row, staged)
          staged.push(row)
          affected.push(row)
        }
        db()[this.table] = staged
      } else if (this.op === 'update') {
        const patch = this.payload ?? {}
        for (const c of Object.keys(patch)) {
          if (!info.strict && info.hidden.has(c)) throw pgError('PGRST204', `Could not find the '${c}' column of '${info.name}' in the schema cache`)
          assertColumn(info, c, 'write')
        }
        const targets = this._matching(info)
        const staged = rows.slice()
        for (const t of targets) {
          const next = { ...t }
          for (const [c, v] of Object.entries(patch)) if (v !== undefined) next[c] = info.strict ? coerceIn(v, colType(info, c), c) : clone(v)
          checkRow(info, next, staged.filter((r) => r !== t))
          staged[staged.indexOf(t)] = next
          affected.push(next)
        }
        db()[this.table] = staged
      } else if (this.op === 'delete') {
        const targets = this._matching(info)
        const snapshot = JSON.stringify(store.db)
        try {
          db()[this.table] = rows.filter((r) => !targets.includes(r))
          cascadeDelete(this.table, targets)
        } catch (e) {
          store.db = JSON.parse(snapshot)
          throw e
        }
        affected = targets
      }
      onWrite()
      const status = this.op === 'insert' || this.op === 'upsert' ? 201 : this.returning ? 200 : 204
      if (this.returning == null) {
        return { data: null, error: null, count: this.countMode ? affected.length : null, status, statusText: status === 201 ? 'Created' : 'No Content' }
      }
      // RETURNING goes through the read filter too, as it does in Postgres.
      const fns = visibles.get(this.table)
      const back = fns ? affected.filter((r) => visibleRows(this.table).includes(r) || !(db()[this.table] ?? []).includes(r)) : affected
      const saveFilters = this.filters
      this.filters = []
      try {
        return this._shape(info, back, this.returning, status)
      } finally {
        this.filters = saveFilters
      }
    }
  }

  // ── RPC ──────────────────────────────────────────────────────────────────

  function resolveRpc(name, args) {
    const claims = rpcClaims.get(name) ?? []
    const live = claims.filter((c) => !c.core && applied(c.migration))
    if (live.length) return { handler: live.at(-1).handler, owner: live.at(-1).plugin, checkArgs: false }
    const overloads = coreFunctions[name]
    if (!overloads) {
      throw pgError('PGRST202', `Could not find the function public.${name}(${Object.keys(args).sort().join(', ')}) in the schema cache`, {
        hint: 'Perhaps the migration that creates it has not been applied', status: 404,
      })
    }
    const given = Object.keys(args)
    const fits = overloads.some((o) => given.every((g) => o.args.includes(g)) && o.args.slice(0, o.required).every((a) => given.includes(a)))
    if (!fits) {
      throw pgError('PGRST202', `Could not find the function public.${name}(${given.sort().join(', ')}) in the schema cache`, {
        hint: `The deployed signature is ${name}(${overloads[0].args.join(', ')})`, status: 404,
      })
    }
    const core = claims.find((c) => c.core)
    return { handler: core?.handler ?? null, owner: core ? 'core' : null, checkArgs: true }
  }

  class RpcQuery extends Query {
    constructor(name, args, opts) {
      super(null)
      this.rpcName = name
      this.args = args ?? {}
      this.head = !!opts?.head
      this.countMode = opts?.count ?? null
    }
    select(columns = '*') { this.columns = columns; return this }
    then(resolve, reject) {
      const run = async () => {
        try {
          const { handler } = resolveRpc(this.rpcName, this.args)
          const c = ctx()
          let out = handler
            ? await handler({ args: this.args, db: db(), store, user: c.user ?? null, persona: c.persona ?? null, now: now(), error: (code, message) => ({ data: null, error: { code, message, details: null, hint: null } }), from: (t) => new Query(t), uuid, engine: api })
            : { data: null, error: null }
          if (out == null) out = { data: null, error: null }
          if (!('data' in out) && !('error' in out)) out = { data: out, error: null }
          if (out.error) return { data: null, error: out.error, count: null, status: 400, statusText: 'Error' }
          onWrite()
          let data = out.data ?? null
          if (Array.isArray(data)) {
            if (this.filters.length) data = data.filter((r) => this.filters.every((f) => testTree(null, r, f)))
            const top = this.orders.filter((o) => !o.path)
            if (top.length) data = sortRows({ strict: false, columns: null, name: this.rpcName }, data, top)
            if (this.rangeFrom != null) data = data.slice(this.rangeFrom, this.rangeTo + 1)
            if (this.limitN != null) data = data.slice(0, this.limitN)
            if (this.singleMode) {
              if (data.length === 1) data = data[0]
              else if (data.length === 0 && this.singleMode === 'maybe') data = null
              else throw pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned', { status: 406 })
            }
          }
          return { data: this.head ? null : clone(data), error: null, count: this.countMode && Array.isArray(out.data) ? out.data.length : null, status: 200, statusText: 'OK' }
        } catch (e) {
          if (e instanceof FixtureError) return { data: null, error: e.toJSON(), count: null, status: e.status, statusText: 'Error' }
          console.error('[fixture] rpc fault', this.rpcName, e)
          return { data: null, error: { code: 'FIXTURE', message: String(e?.message ?? e), details: null, hint: null }, count: null, status: 500, statusText: 'Fixture fault' }
        }
      }
      return run().then((result) => {
        log({ kind: 'rpc', name: this.rpcName, error: result.error?.code ?? null })
        return answer(result)
      }).then(resolve, reject)
    }
  }

  // ── Seeding ──────────────────────────────────────────────────────────────

  // Rows from every plugin's seed, appended in plugin order, with column
  // defaults filled in. Constraint problems are COLLECTED, not thrown: a bad
  // seed row in one feature must not blank every route, but it must be visible.
  function seedAll(seedArgs) {
    const next = {}
    const problems = []
    for (const p of plugins) {
      if (typeof p.seed !== 'function') continue
      let tables
      try {
        tables = p.seed(seedArgs) ?? {}
      } catch (e) {
        problems.push({ plugin: p.name, problem: `seed threw: ${e?.message ?? e}` })
        continue
      }
      for (const [table, list] of Object.entries(tables)) {
        const meta = tablesMeta[table]
        const extra = new Set((featureColumns.get(table) ?? []).map((f) => f.column))
        const bucket = next[table] ?? (next[table] = [])
        for (const raw of list ?? []) {
          const row = {}
          for (const [c, v] of Object.entries(raw)) {
            const t = meta?.columns[c]?.type ?? null
            if (meta && !meta.columns[c] && !extra.has(c)) problems.push({ plugin: p.name, table, problem: `unknown column ${c}` })
            try { row[c] = t ? coerceIn(v, t, c) : clone(v) } catch (e) { problems.push({ plugin: p.name, table, problem: e.message }); row[c] = clone(v) }
          }
          if (meta) {
            for (const [c, def] of Object.entries(meta.columns)) if (!(c in row)) row[c] = defaultFor(def.default, next, table)
          } else {
            if (!('id' in row)) row.id = uuid()
            if (!('created_at' in row)) row.created_at = seedArgs.now.toISOString()
          }
          bucket.push(row)
        }
      }
    }
    store.db = next
    // Constraint pass over the finished store, so a seed may reference rows a
    // later plugin adds. One store serves every migration setting, so a row is
    // judged against the schema with every migration applied: a value a
    // feature's own migration makes legal is not a seed problem.
    for (const [table, rows] of Object.entries(next)) {
      if (!tablesMeta[table]) continue
      const info = tableInfo(table, () => true)
      rows.forEach((row, i) => {
        try { checkRow(info, row, rows.filter((_, j) => j !== i)) } catch (e) { problems.push({ table, problem: `${e.code} ${e.message}`, row: row.id ?? null }) }
      })
    }
    return problems

    function defaultFor(def, acc, table) {
      if (!def) return null
      if (def.kind === 'now') return seedArgs.now.toISOString()
      if (def.kind === 'today') return seedArgs.now.toISOString().slice(0, 10)
      if (def.kind === 'serial') return (acc[table] ?? []).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1
      if (def.kind === 'auth_uid') return null
      return applyDefault(def, table)
    }
  }

  function edgeFunction(name) {
    const h = functionHandlers.get(name)
    if (!h || !applied(h.migration)) return null
    return h.fn
  }

  // Service-role writes for RPC handlers. A SECURITY DEFINER function bypasses
  // RLS but not constraints, so these skip the read filter and still apply
  // defaults, coercion, NOT NULL, CHECK, unique and foreign keys.
  function insertRow(table, payload) {
    const info = requireTable(table)
    const rows = db()[table] ?? (db()[table] = [])
    const row = buildRow(info, payload)
    checkRow(info, row, rows)
    rows.push(row)
    return row
  }
  function updateRows(table, predicate, patch) {
    const info = requireTable(table)
    const rows = db()[table] ?? []
    const out = []
    rows.forEach((r, i) => {
      if (!predicate(r)) return
      const next = { ...r }
      for (const [c, v] of Object.entries(patch)) {
        if (v === undefined) continue
        assertColumn(info, c, 'write')
        next[c] = info.strict ? coerceIn(v, colType(info, c), c) : clone(v)
      }
      checkRow(info, next, rows.filter((_, j) => j !== i))
      rows[i] = next
      out.push(next)
    })
    return out
  }
  function deleteRows(table, predicate) {
    requireTable(table)
    const rows = db()[table] ?? []
    const gone = rows.filter(predicate)
    db()[table] = rows.filter((r) => !gone.includes(r))
    cascadeDelete(table, gone)
    return gone
  }

  const api = {
    from: (table) => new Query(table),
    rpc: (name, args, opts) => new RpcQuery(name, args, opts),
    tableInfo,
    seedAll,
    edgeFunction,
    visibleRows,
    insertRow,
    updateRows,
    deleteRows,
  }
  return api
}
