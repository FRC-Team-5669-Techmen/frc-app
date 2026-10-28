/**
 * THE WRITE MACHINERY: safety levels, preview, the asks-first gate, repeat
 * protection, the audit row and undo. Every connector write goes through
 * `write`, and `write` goes through the database's connector_call (0018), as
 * the minted user. Levels are enforced HERE, from the registry, never by a
 * prompt. Ported from idea-app src/lib/server/connector/engine.ts.
 *
 *   read     a direct call as him; no audit row, no preview
 *   undo     runs and is logged; dry_run previews; the entry names its reverse
 *   confirm  the first call ALWAYS previews and hands back a confirm token;
 *            only a second call carrying that token, within ten minutes, with
 *            the same arguments, writes
 *
 * THE CONFIRM TOKEN IS STORED, NOT DERIVED: a random token whose sha256 sits
 * in connector_confirmations beside the user, the tool and a hash of the
 * exact arguments. Single use, ten minutes.
 */
import { canonical, opaqueToken, sha256Hex } from './crypto.js'
import { levelFor, liveFunction } from './registry.js'

export const CONFIRM_WINDOW_MS = 10 * 60_000
export const PREVIEW_PREFIX = 'CONNECTOR_PREVIEW:'

export class NotRegistered extends Error {}

export function argsHash(tool, fn, args) {
  return sha256Hex(canonical({ tool, fn, args }))
}

/** The repeat key: Claude's request id when sent, otherwise the server's own hash (matched within 120 seconds). */
export function requestKey(ctx, plan, opts = {}) {
  const callHash = sha256Hex(canonical({ fn: plan.fn, args: plan.args, undoOf: plan.undoOf ?? null }))
  const salt = opts.again ? `:again:${opaqueToken(ctx.random)}` : ''
  if (opts.requestId && String(opts.requestId).trim()) {
    return `id:${ctx.session.user.id}:${String(opts.requestId).trim().slice(0, 120)}:${callHash.slice(0, 24)}${salt}`
  }
  return `derived:${sha256Hex(`${ctx.session.user.id}|${plan.tool}|${callHash}`)}${salt}`
}

export function previewPayload(error) {
  if (!error) return null
  const msg = error.message ?? ''
  const at = msg.indexOf(PREVIEW_PREFIX)
  if (at < 0) return null
  try {
    const parsed = JSON.parse(msg.slice(at + PREVIEW_PREFIX.length))
    return { result: parsed.result ?? null, rows: parsed.rows ?? [] }
  } catch {
    return null
  }
}

// ── Undo templates ───────────────────────────────────────────────────────────
//
//   $args.x  $result  $result.a  $before.x  $written.<table>.<column>  $user.id
//   {negate: <t>}            the number, negated
//   {concat: [<t>, ...]}     strings joined
//   {rows: <t>, pick: {k: col}}  a list of rows reshaped
//   [<t>, ...]               a list
//
// A reference that resolves to nothing leaves the alternative incomplete, so
// no reverse is offered rather than a wrong one.

function walk(value, path) {
  let cur = value
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = cur[p]
  }
  return cur
}

function lookup(ref, scope) {
  const [root, ...path] = ref.split('.')
  if (root === 'args') return walk(scope.args, path)
  if (root === 'result') return path.length ? walk(scope.result, path) : scope.result
  if (root === 'before') return scope.before ? walk(scope.before, path) : undefined
  if (root === 'user') return scope.user ? walk(scope.user, path) : undefined
  if (root === 'written') {
    const [table, column] = path
    const hit = (scope.rows ?? []).find((r) => r.table === table)
    return hit ? (column === 'id' ? (hit.id ?? hit.row?.id) : hit.row?.[column]) : undefined
  }
  return undefined
}

export function resolveTemplate(value, scope) {
  if (Array.isArray(value)) {
    const out = value.map((v) => resolveTemplate(v, scope))
    return out.some((v) => v === undefined) ? undefined : out
  }
  if (value && typeof value === 'object') {
    if ('negate' in value) {
      const n = Number(resolveTemplate(value.negate, scope))
      return Number.isFinite(n) ? -n : undefined
    }
    if ('concat' in value) {
      const parts = value.concat.map((v) => resolveTemplate(v, scope))
      return parts.some((v) => v === undefined || v === null) ? undefined : parts.join('')
    }
    if ('rows' in value) {
      const rows = resolveTemplate(value.rows, scope)
      if (!Array.isArray(rows) || rows.length === 0) return undefined
      return rows.map((r) => Object.fromEntries(Object.entries(value.pick ?? {}).map(([k, col]) => [k, r?.[col] ?? null])))
    }
    return value
  }
  if (typeof value !== 'string' || !/^!{0,2}\$/.test(value)) return value
  const bang = /^!+/.exec(value)?.[0].length ?? 0
  const out = lookup(value.slice(bang + 1), scope)
  if (bang === 2) return out === undefined ? undefined : !!out
  if (bang === 1) return out === undefined ? undefined : !out
  return out
}

// A `when` is one template or a list that must all hold. A boolean argument
// that arrived as the text "true" or "false" (call_app passes what Claude
// sent) reads as the boolean.
function holds(w, scope) {
  if (Array.isArray(w)) return w.every((x) => holds(x, scope))
  if (typeof w === 'string' && /^!{1,2}\$/.test(w)) {
    const bang = /^!+/.exec(w)[0].length
    let v = resolveTemplate(w.slice(bang), scope)
    if (v === undefined) return false
    if (v === 'true') v = true
    if (v === 'false') v = false
    return bang === 2 ? !!v : !v
  }
  const v = resolveTemplate(w, scope)
  return v === 'false' ? false : !!v
}

/** The reverse of a write: the first alternative whose `when` holds and whose arguments all resolve. */
export function computeUndo(alternatives, scope) {
  for (const alt of alternatives ?? []) {
    if (alt.when !== undefined && !holds(alt.when, scope)) continue
    const args = {}
    let complete = true
    for (const [k, v] of Object.entries(alt.args ?? {})) {
      const r = resolveTemplate(v, scope)
      if (r === undefined) { complete = false; break }
      args[k] = r
    }
    if (complete) return { function: alt.function, args }
  }
  return null
}

// ── Before a write: what its undo needs to know ─────────────────────────────
//
// An entry's `before` (functions.yaml) is read AS HIM before the write:
//   {rpc: <read function>, find: {<column>: <template>}, has: {<array column>: <template>}}
// answers {found, had}: whether a row matched, and whether its array column
// held the value. A read that fails leaves `before` empty, so an undo that
// needs it is not offered (and the write asks first, see `write`).

export async function readBefore(ctx, spec, args) {
  if (!spec?.rpc) return undefined
  const scope = { args, user: ctx.session.user }
  try {
    const r = await ctx.backend.rpc(ctx.session, spec.rpc, {})
    if (r.error || !Array.isArray(r.data)) return undefined
    const want = Object.fromEntries(Object.entries(spec.find ?? {}).map(([k, v]) => [k, resolveTemplate(v, scope)]))
    const row = r.data.find((x) => Object.entries(want).every(([k, v]) => String(x?.[k]) === String(v)))
    if (!row) return { found: false, had: false }
    const [[col, tmpl] = []] = Object.entries(spec.has ?? {})
    const value = col ? resolveTemplate(tmpl, scope) : undefined
    return { found: true, had: col ? (row[col] ?? []).includes(value) : false }
  } catch {
    return undefined
  }
}

// ── The write ────────────────────────────────────────────────────────────────

// The trip hub refuses with a bare code ("hub:car_full") and puts the
// sentence a person reads in the error detail (0005 _hub_refuse); the page
// shows the detail, so the connector does too, and keeps the code.
function refusal(level, error) {
  const hub = /^hub:([a-z_]+)$/.exec(error.message ?? '')
  if (hub && error.details) return { status: 'refused', level, message: error.details, code: error.code, reason: hub[1] }
  return { status: 'refused', level, message: error.message, code: error.code }
}

/** A function's own {ok: false, reason} answer: nothing it was asked for happened. */
function softRefusal(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.ok !== false) return null
  const reason = typeof result.reason === 'string' ? result.reason : 'refused'
  return { reason, message: typeof result.message === 'string' ? result.message : `The app said no (${reason.replace(/_/g, ' ')}).` }
}

function connectorCall(ctx, plan, key, mode) {
  return ctx.backend.rpc(ctx.session, 'connector_call', {
    p_tool: plan.tool,
    p_function: plan.fn,
    p_args: plan.args,
    p_request_key: key,
    p_mode: mode,
    p_meta: { group_key: plan.groupKey ?? null, token_id: ctx.token?.id ?? null, undo_of: plan.undoOf ?? null },
  })
}

/**
 * plan: {tool, fn, args, before?, undoOf?, asUndo?, groupKey?}
 * opts: {dryRun, requestId, confirmToken, again}
 */
export async function write(ctx, planIn, opts = {}) {
  let plan = planIn
  const entry = liveFunction(plan.fn)
  if (!entry) throw new NotRegistered(`The connector does not know "${plan.fn}".`)
  let level = plan.asUndo ? 'undo' : levelFor(entry, plan.args)
  if (entry.before && plan.before === undefined && !plan.asUndo) plan = { ...plan, before: await readBefore(ctx, entry.before, plan.args) }
  // A change that should be undoable but whose reverse cannot be known yet
  // (the before read failed) asks first instead.
  if (level === 'undo' && entry.before && plan.before === undefined) level = 'confirm'

  if (level === 'read') {
    const r = await ctx.backend.rpc(ctx.session, plan.fn, plan.args)
    if (r.error) return refusal(level, r.error)
    return { status: 'done', level, result: r.data, rows: [], audit_id: '', undo_available: false, message: 'Read.' }
  }

  const key = requestKey(ctx, plan, opts)
  const confirmFirst = level === 'confirm' && !opts.confirmToken
  if (opts.dryRun || confirmFirst) {
    const r = await connectorCall(ctx, plan, key, 'preview')
    const payload = previewPayload(r.error)
    if (!payload) {
      if (r.error) return refusal(level, r.error)
      return { status: 'refused', level, message: 'The preview did not come back.' }
    }
    if (confirmFirst && !opts.dryRun) {
      const token = opaqueToken(ctx.random)
      const expiresAt = ctx.now() + CONFIRM_WINDOW_MS
      await ctx.backend.storeConfirmation({
        tokenHash: sha256Hex(token), userId: ctx.session.user.id, tool: plan.tool,
        argsHash: argsHash(plan.tool, plan.fn, plan.args), preview: payload, expiresAt,
      })
      return {
        status: 'preview', level, ...payload, confirm_token: token, expires_at: new Date(expiresAt).toISOString(),
        message: 'Nothing has changed yet. Read this preview to him and ask; if he says yes, call again with the same arguments and this confirm_token within ten minutes.',
      }
    }
    return { status: 'preview', level, ...payload, message: 'Preview only: nothing was written.' }
  }

  // opts.confirmed is set only by writeGroup below, after it took and checked
  // this plan's own token; no tool argument reaches it (writeOpts in tools.js).
  if (level === 'confirm' && !opts.confirmed) {
    const c = await ctx.backend.takeConfirmation(sha256Hex(opts.confirmToken ?? ''), ctx.now())
    if (!c || c.userId !== ctx.session.user.id || c.tool !== plan.tool || c.argsHash !== argsHash(plan.tool, plan.fn, plan.args)) {
      return {
        status: 'needs_confirmation', level,
        message: 'That confirmation is missing, already used, more than ten minutes old, or was for different arguments. Nothing was written. Preview it again and ask him.',
      }
    }
  }

  const r = await connectorCall(ctx, plan, key, 'commit')
  if (r.error || !r.data) {
    const error = r.error ?? { message: 'The write did not answer.' }
    await ctx.backend.rpc(ctx.session, 'connector_audit_failure', {
      p_tool: plan.tool, p_function: plan.fn, p_args: plan.args, p_request_key: key, p_error: error.message,
      p_meta: { group_key: plan.groupKey ?? null, token_id: ctx.token?.id ?? null },
    }).catch(() => undefined)
    return refusal(level, error)
  }
  const data = r.data
  const soft = softRefusal(data.result)
  let undoAvailable = false
  if (!data.repeated && !soft && !plan.undoOf && !plan.asUndo) {
    const undo = computeUndo(entry.undo, { args: plan.args, result: data.result, rows: data.rows ?? [], before: plan.before, user: ctx.session.user })
    if (undo) {
      undoAvailable = true
      await ctx.backend.setAuditUndo(data.audit_id, undo).catch(() => { undoAvailable = false })
    }
  }
  if (soft) return { status: 'refused', level, code: soft.reason, message: `${soft.message} Nothing it was asked for happened.` }
  // This runs only after connector_call committed. A preview returns above.
  // Repeated requests may check a reserved delivery, but the server's atomic
  // reservation never sends a delivered/uncertain/sending version twice.
  let delivery
  if (plan.fn === 'scouting_save' && data.result?.payload?.request_delivery === true
      && ['message', 'observation'].includes(data.result?.kind)) {
    try {
      const sent = await ctx.backend.scoutingDispatch?.(ctx.session, { record_id: data.result.id, version: data.result.version })
      delivery = sent && !sent.error ? sent.data : { status: 'queued', message: 'The note is saved. Delivery could not be checked.' }
    } catch {
      delivery = { status: 'queued', message: 'The note is saved. Delivery could not be checked.' }
    }
  }
  return {
    status: data.repeated ? 'repeated' : 'done', level, result: data.result, ...(delivery ? { delivery } : {}), rows: data.rows ?? [], audit_id: data.audit_id, undo_available: undoAvailable,
    message: data.repeated
      ? 'This exact request was already done, so nothing was written again. Pass again: true only if he wants it done a second time.'
      : 'Done.',
  }
}

/**
 * SEVERAL ASKS-FIRST WRITES, ONE QUESTION (ledger 0028d). Each plan is its
 * own connector_call: its own transaction, its own audit row, previewed and
 * committed exactly as `write` does one. What is grouped is the asking:
 *
 *   first call   every plan previews (each rolled back); if ANY refuses,
 *                nothing is offered and the answer names that item. Otherwise
 *                one confirm_token comes back: each plan's own stored token,
 *                joined with dots, in plan order.
 *   second call  every plan's token is taken and checked against its own
 *                tool and arguments BEFORE any commit; one bad or stale token
 *                writes nothing for anyone. Then each commits in order. A plan
 *                the database refuses at commit (a car filled meanwhile) is
 *                reported as such; the others stand (status partial).
 *
 * Only for plans whose level is confirm: an undo-level plan would commit on
 * the first call, before the question was asked.
 */
export const GROUP_TOKEN_SEP = '.'

export async function writeGroup(ctx, tool, plans, opts = {}) {
  if (!plans.length) return { status: 'invalid', message: 'There is nothing to change. Nothing was written.' }
  for (const p of plans) {
    const entry = liveFunction(p.fn)
    if (!entry) throw new NotRegistered(`The connector does not know "${p.fn}".`)
    if (levelFor(entry, p.args) !== 'confirm') throw new NotRegistered(`A grouped change asks first; "${p.fn}" does not.`)
  }
  const groupKey = `group:${sha256Hex(canonical({ tool, plans: plans.map((p) => ({ fn: p.fn, args: p.args })) })).slice(0, 24)}`
  const one = (p) => ({ tool, fn: p.fn, args: p.args, groupKey })

  if (!opts.confirmToken || opts.dryRun) {
    const items = []
    const tokens = []
    let expiresAt = null
    for (const [i, p] of plans.entries()) {
      const r = await write(ctx, one(p), { dryRun: opts.dryRun, requestId: opts.requestId, again: opts.again })
      if (r.status !== 'preview') {
        return { ...r, item: i, message: `${r.message ?? 'Refused.'} (change ${i + 1} of ${plans.length}; nothing was changed for any of them)` }
      }
      items.push({ result: r.result, rows: r.rows })
      if (r.confirm_token) tokens.push(r.confirm_token)
      expiresAt = expiresAt ?? r.expires_at ?? null
    }
    if (opts.dryRun) return { status: 'preview', level: 'confirm', items, message: 'Preview only: nothing was written.' }
    return {
      status: 'preview', level: 'confirm', items, confirm_token: tokens.join(GROUP_TOKEN_SEP), expires_at: expiresAt,
      message: `Nothing has changed yet. These ${plans.length} changes are one question: read them to him and ask once; if he says yes, call again with the same arguments and this confirm_token within ten minutes.`,
    }
  }

  const stale = {
    status: 'needs_confirmation', level: 'confirm',
    message: 'That confirmation is missing, already used, more than ten minutes old, or was for different changes. Nothing was written for any of them. Preview it again and ask him.',
  }
  const tokens = String(opts.confirmToken).split(GROUP_TOKEN_SEP)
  if (tokens.length !== plans.length) return stale
  const taken = []
  for (const t of tokens) taken.push(await ctx.backend.takeConfirmation(sha256Hex(t), ctx.now()))
  const fits = taken.every((c, i) => c && c.userId === ctx.session.user.id && c.tool === tool && c.argsHash === argsHash(tool, plans[i].fn, plans[i].args))
  if (!fits) return stale

  const items = []
  for (const [i, p] of plans.entries()) {
    items.push(await write(ctx, one(p), { requestId: opts.requestId, again: opts.again, confirmToken: tokens[i], confirmed: true }))
  }
  const ok = items.filter((r) => r.status === 'done' || r.status === 'repeated').length
  const status = ok === plans.length ? (items.every((r) => r.status === 'repeated') ? 'repeated' : 'done') : ok === 0 ? 'refused' : 'partial'
  return {
    status, level: 'confirm', done: ok, refused: plans.length - ok, items,
    message: status === 'done' ? 'Done.' : status === 'repeated'
      ? 'These exact changes were already done, so nothing was written again.'
      : `${ok} of ${plans.length} done; the rest were refused (each says why).`,
  }
}

/** Undo the newest connector write that names a reverse. */
export async function undoLast(ctx, opts = {}) {
  const candidates = await ctx.backend.undoCandidates(ctx.session.user.id, 50)
  const newest = candidates.find((c) => c.undo)
  if (!newest) return { status: 'none', message: 'There is nothing made through Claude left to undo.' }
  const outcome = await write(ctx, {
    tool: 'undo_last', fn: newest.undo.function, args: newest.undo.args, undoOf: newest.id, groupKey: `undo:${newest.id}`, asUndo: true,
  }, { ...opts, requestId: opts.requestId ? `${opts.requestId}:${newest.id}` : undefined })
  return { status: outcome.status === 'done' ? 'done' : outcome.status, undid: newest.tool, made: new Date(newest.startedAt).toISOString(), args: newest.args, outcome }
}
