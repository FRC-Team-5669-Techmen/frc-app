// Fixture-mode stand-in for src/supabase.js. Under `vite --mode fixture` (and
// ONLY then) the plugin in vite.config.js resolves every import of
// src/supabase.js to this file, so the real app runs against an in-memory
// PostgREST seeded with fictional data. Same named export as the real module.
//
// The query engine lives in engine.js (pure, unit-tested); this file is the
// browser shell around it: persistence in localStorage, the persona and
// migration controls, auth, storage, Edge Functions, and window.__fx.
//
// Every localStorage/sessionStorage/window access is guarded: tests import the
// engine under node, and a private window can throw on storage access.

import { createEngine, normMigration, uuid } from './engine.js'
import { SCHEMA } from './schema.js'
import core from './core.js'
import { CORE_IDS } from './seed.js'
import { IDS, PERSONAS, PERSONA_KEYS, DEFAULT_PERSONA, resolvePersona } from './personas.js'
import { laDate } from './time.js'

// A string that exists only in this module. The production-build check greps
// every dist file for it and requires it ABSENT (tools/e2e/README.md).
export const FIXTURE_MARKER = 'techmen-fixture-client-v1'

const KEYS = { persona: '__fx_persona', mig: '__fx_mig', db: '__fx_db', sig: '__fx_sig', seededDay: '__fx_seeded_day', latency: '__fx_latency' }

// Milliseconds before a query or RPC answers. 25 is a fast round trip: never
// inside the same frame, which a real request never is either.
const DEFAULT_LATENCY_MS = 25
const parseLatency = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : DEFAULT_LATENCY_MS)

const ls = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null } catch { return null } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v) } catch { /* private window: in-memory only */ } },
  del(k) { try { globalThis.localStorage?.removeItem(k) } catch { /* ignore */ } },
}

// ── Plugins ───────────────────────────────────────────────────────────────────
// Every features/*.js default export, in file-name order after core. An empty
// directory is fine.
const modules = import.meta.glob('./features/*.js', { eager: true })
const features = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, mod]) => ({ name: path.replace(/^.*\/|\.js$/g, ''), ...(mod?.default ?? {}) }))
const plugins = [core, ...features]

// A store seeded by different seed code is stale: reseed rather than run the
// app against rows a plugin no longer produces.
function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
const SEED_SIG = hash(plugins.map((p) => `${p.name}:${p.migration ?? ''}:${String(p.seed ?? '')}`).join('|'))

// ── Controls ──────────────────────────────────────────────────────────────────

function parseMig(v) {
  if (v == null || v === '' || v === 'all') return 'all'
  if (v === 'none') return 'none'
  const list = String(v).split(/[,+|\s]+/).map(normMigration).filter(Boolean)
  return list.length ? list : 'none'
}

const state = {
  persona: PERSONA_KEYS.includes(ls.get(KEYS.persona)) ? ls.get(KEYS.persona) : DEFAULT_PERSONA,
  migrations: parseMig(ls.get(KEYS.mig)),
  latency: parseLatency(ls.get(KEYS.latency)),
}
let resetRequested = false

// `?__fx=persona:admin,mig:0001,0003,reset` on any route. Applied before the
// router reads the URL, then stripped so a reload does not reset again.
;(function applyQueryControls() {
  let url
  try { url = new URL(globalThis.location?.href) } catch { return }
  const raw = url.searchParams.get('__fx')
  if (raw == null) return
  // A bare number continues the mig list before it: mig:0001,0003 is two.
  let migList = null
  for (const t of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (t === 'reset') { resetRequested = true; continue }
    if (t.startsWith('persona:')) {
      const v = t.slice('persona:'.length)
      if (PERSONA_KEYS.includes(v)) { state.persona = v; ls.set(KEYS.persona, v) }
    } else if (t.startsWith('latency:')) {
      state.latency = parseLatency(t.slice('latency:'.length))
      ls.set(KEYS.latency, String(state.latency))
    } else if (t.startsWith('mig:')) {
      migList = [t.slice('mig:'.length)]
    } else if (migList && /^\d{1,4}$/.test(t)) {
      migList.push(t)
    }
  }
  if (migList) {
    state.migrations = parseMig(migList.join(','))
    ls.set(KEYS.mig, Array.isArray(state.migrations) ? state.migrations.join(',') : state.migrations)
  }
  url.searchParams.delete('__fx')
  try { globalThis.history?.replaceState(globalThis.history.state, '', url.pathname + (url.search || '') + url.hash) } catch { /* ignore */ }
})()

// ── Store ─────────────────────────────────────────────────────────────────────

const store = { db: {} }
const calls = []
let seedProblems = []

function currentUser() {
  const p = PERSONAS[state.persona]
  if (!p) return null
  return {
    id: p.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: p.email,
    app_metadata: { provider: p.email.endsWith('@boscotech.edu') ? 'google' : 'email', providers: ['email'] },
    user_metadata: { full_name: p.name, name: p.name, email: p.email },
    created_at: '2026-05-01T16:00:00.000Z',
  }
}

const engine = createEngine({
  schema: SCHEMA,
  plugins,
  store,
  context: () => ({ user: currentUser(), persona: resolvePersona(state.persona, store.db), migrations: state.migrations }),
  now: () => new Date(),
  onWrite: save,
  latency: () => state.latency,
  log: (entry) => {
    calls.push({ at: new Date().toISOString(), ...entry })
    if (calls.length > 1000) calls.splice(0, calls.length - 1000)
  },
})

function save() {
  ls.set(KEYS.db, JSON.stringify(store.db))
}

function reseed() {
  const now = new Date()
  seedProblems = engine.seedAll({ ids: { ...IDS, ...CORE_IDS }, now, uuid })
  ls.set(KEYS.sig, SEED_SIG)
  ls.set(KEYS.seededDay, laDate(now))
  save()
  if (seedProblems.length) console.warn(`[fixture] ${seedProblems.length} seed problem(s); see window.__fx.seedProblems`)
}

;(function loadStore() {
  const raw = resetRequested ? null : ls.get(KEYS.db)
  // A store seeded on an earlier LA day has a stale "now": the shop window,
  // today's check-ins and the week ahead would all be in the past.
  const fresh = ls.get(KEYS.sig) === SEED_SIG && ls.get(KEYS.seededDay) === laDate(new Date())
  if (raw && fresh) {
    try { store.db = JSON.parse(raw); return } catch { /* fall through to reseed */ }
  }
  reseed()
})()

// ── Auth ──────────────────────────────────────────────────────────────────────

const listeners = new Set()

function session() {
  const user = currentUser()
  if (!user) return null
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: `fixture.${user.id}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'fixture-refresh', user }
}

function emit(event) {
  const s = session()
  for (const cb of [...listeners]) {
    try { cb(event, s) } catch (e) { console.error('[fixture] auth listener threw', e) }
  }
}

const auth = {
  getSession: async () => ({ data: { session: session() }, error: null }),
  getUser: async () => {
    const user = currentUser()
    return user ? { data: { user }, error: null } : { data: { user: null }, error: { name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 } }
  },
  refreshSession: async () => ({ data: { session: session(), user: currentUser() }, error: null }),
  // Like supabase-js v2: INITIAL_SESSION is delivered asynchronously, after the
  // caller has its subscription back.
  onAuthStateChange(cb) {
    listeners.add(cb)
    Promise.resolve().then(() => { if (listeners.has(cb)) cb('INITIAL_SESSION', session()) })
    return { data: { subscription: { id: uuid(), callback: cb, unsubscribe: () => listeners.delete(cb) } } }
  },
  signOut: async () => {
    state.persona = 'signedout'
    ls.set(KEYS.persona, 'signedout')
    emit('SIGNED_OUT')
    return { error: null }
  },
  // Harmless no-ops: fixture sign-in is the persona switch (/_fixture or
  // window.__fx.setPersona), never a credential.
  signInWithOtp: async () => ({ data: { user: null, session: null }, error: null }),
  verifyOtp: async () => ({ data: { user: null, session: null }, error: null }),
  signInWithOAuth: async ({ provider } = {}) => ({ data: { provider: provider ?? null, url: null }, error: null }),
  updateUser: async () => ({ data: { user: currentUser() }, error: null }),
}

// ── Storage ───────────────────────────────────────────────────────────────────
// Uploads are recorded (path, size, type) in the store; the bytes live only in
// this page as object URLs. A URL for anything else is a small placeholder.

const PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">'
  + '<rect width="320" height="200" fill="#2a2d33"/><rect x="8" y="8" width="304" height="184" fill="none" stroke="#6b7280" stroke-dasharray="6 6"/>'
  + '<text x="160" y="106" text-anchor="middle" font-family="monospace" font-size="14" fill="#9ca3af">fixture image</text></svg>')
const objectUrls = new Map()

function bucket(name) {
  const key = (p) => `${name}/${p}`
  const urlFor = (p) => objectUrls.get(key(p)) ?? PLACEHOLDER
  const objects = () => (store.db.__storage ??= [])
  return {
    upload: async (path, file, opts = {}) => {
      if (objects().some((o) => o.key === key(path)) && !opts.upsert) {
        return { data: null, error: { name: 'StorageApiError', message: 'The resource already exists', statusCode: '409' } }
      }
      try { if (file instanceof Blob && globalThis.URL?.createObjectURL) objectUrls.set(key(path), URL.createObjectURL(file)) } catch { /* ignore */ }
      store.db.__storage = objects().filter((o) => o.key !== key(path))
      objects().push({ key: key(path), bucket: name, path, size: file?.size ?? null, type: file?.type ?? opts.contentType ?? null, at: new Date().toISOString() })
      save()
      return { data: { path, id: uuid(), fullPath: key(path) }, error: null }
    },
    createSignedUrl: async (path, expiresIn) => ({ data: { signedUrl: urlFor(path), expiresIn }, error: null }),
    createSignedUrls: async (paths) => ({ data: (paths ?? []).map((path) => ({ path, signedUrl: urlFor(path), error: null })), error: null }),
    getPublicUrl: (path) => ({ data: { publicUrl: urlFor(path) } }),
    download: async () => ({ data: null, error: { name: 'StorageApiError', message: 'Not available in fixture mode' } }),
    remove: async (paths) => {
      const keys = new Set((paths ?? []).map(key))
      const gone = objects().filter((o) => keys.has(o.key))
      store.db.__storage = objects().filter((o) => !keys.has(o.key))
      save()
      return { data: gone.map((o) => ({ name: o.path })), error: null }
    },
    list: async (prefix = '') => ({ data: objects().filter((o) => o.bucket === name && o.path.startsWith(prefix)).map((o) => ({ name: o.path.slice(prefix.length).replace(/^\//, ''), id: o.key, metadata: { size: o.size, mimetype: o.type } })), error: null }),
  }
}

// ── Edge Functions ────────────────────────────────────────────────────────────

async function runFunction(name, body) {
  const fn = engine.edgeFunction(name)
  const user = currentUser()
  if (!fn) return { data: { ok: true, skipped: true }, error: null, status: 200 }
  try {
    const out = (await fn({ body, user, persona: resolvePersona(state.persona, store.db), db: store.db, now: new Date(), engine })) ?? {}
    save()
    return { status: 200, ...out }
  } catch (e) {
    return { data: null, error: { message: e?.message ?? String(e) }, status: 500 }
  }
}

const functions = {
  invoke: async (name, opts = {}) => {
    calls.push({ at: new Date().toISOString(), kind: 'function', name })
    let body = opts.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { /* leave as text */ } }
    const out = await runFunction(name, body)
    if (out.status >= 400) {
      return { data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status: out.status, body: out.data } } }
    }
    return { data: out.data ?? null, error: out.error ?? null }
  },
}

// ParentResponse.jsx calls its capability-URL function with plain fetch(), at
// VITE_SUPABASE_URL/functions/v1/<name>. Route exactly that prefix to the same
// handlers; every other request goes to the real fetch untouched.
;(function interceptFunctionFetch() {
  const base = import.meta.env?.VITE_SUPABASE_URL
  if (!base || typeof globalThis.fetch !== 'function' || typeof globalThis.Response !== 'function') return
  const prefix = `${String(base).replace(/\/$/, '')}/functions/v1/`
  const real = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url
    if (!url || !url.startsWith(prefix)) return real(input, init)
    const name = url.slice(prefix.length).split(/[?#/]/)[0]
    let body = init.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { /* text */ } }
    calls.push({ at: new Date().toISOString(), kind: 'function', name, via: 'fetch' })
    const out = await runFunction(name, body)
    const payload = out.error ? { error: out.error.message } : out.data
    return new Response(JSON.stringify(payload ?? null), { status: out.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
})()

// ── Realtime (not wired in this project; harmless no-ops) ────────────────────

function channel(name) {
  const ch = {
    topic: name,
    on: () => ch,
    subscribe: (cb) => { try { cb?.('SUBSCRIBED') } catch { /* ignore */ } return ch },
    unsubscribe: async () => 'ok',
    send: async () => 'ok',
  }
  return ch
}

// ── The client ────────────────────────────────────────────────────────────────

export const supabase = {
  from: (table) => engine.from(table),
  rpc: (name, args, opts) => engine.rpc(name, args ?? {}, opts),
  auth,
  storage: { from: bucket },
  functions,
  channel,
  removeChannel: async () => 'ok',
  removeAllChannels: async () => [],
  getChannels: () => [],
}

// ── Test and control surface ──────────────────────────────────────────────────

export const fixture = {
  marker: FIXTURE_MARKER,
  // The same client the app uses, as the current persona: a browser test can
  // ask `await __fx.supabase.from('feedback').select('id')` what a page would.
  supabase,
  get db() { return store.db },
  get persona() { return state.persona },
  get migrations() { return state.migrations },
  get latency() { return state.latency },
  setLatency(ms) { state.latency = parseLatency(ms); ls.set(KEYS.latency, String(state.latency)) },
  get calls() { return calls },
  get seedProblems() { return seedProblems },
  personas: PERSONAS,
  personaKeys: PERSONA_KEYS,
  plugins: plugins.map((p) => ({ name: p.name, migration: p.migration ?? null, creates: p.creates ?? null })),
  migrationNumbers: [...new Set(features.map((f) => normMigration(f.migration)).filter(Boolean))].sort(),
  reset() { reseed(); calls.length = 0 },
  save,
  // Switch who is signed in. Emits SIGNED_IN / SIGNED_OUT like supabase-js, so
  // a mounted app reacts (App.jsx completes a pending NFC check-in on it).
  setPersona(key) {
    if (!PERSONA_KEYS.includes(key)) throw new Error(`unknown persona ${key}`)
    state.persona = key
    ls.set(KEYS.persona, key)
    emit(key === 'signedout' ? 'SIGNED_OUT' : 'SIGNED_IN')
  },
  setMigrations(v) {
    state.migrations = parseMig(Array.isArray(v) ? v.join(',') : v)
    ls.set(KEYS.mig, Array.isArray(state.migrations) ? state.migrations.join(',') : state.migrations)
  },
  // Rows of a table, read RAW (no read filter) -- what a test asserts on.
  rows(table) { return (store.db[table] ?? []).slice() },
  // Insert as the service role (defaults and constraints apply, RLS does not).
  insert(table, row) { const r = engine.insertRow(table, row); save(); return r },
  // Patch rows in place: __fx.patch('profiles', { id }, { geofence_exempt: true })
  patch(table, match, values) {
    const hits = (store.db[table] ?? []).filter((r) => Object.entries(match).every(([k, v]) => r[k] === v))
    for (const r of hits) Object.assign(r, values)
    save()
    return hits.length
  },
}

try { if (typeof window !== 'undefined') window.__fx = fixture } catch { /* ignore */ }
