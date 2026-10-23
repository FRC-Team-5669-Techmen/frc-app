#!/usr/bin/env node
/**
 * THE CONNECTOR, PROVED ON A REAL POSTGRESQL 16 (ledger 0013). Run through the
 * SQL harness, which applies every SQL file and seeds fictional members:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/connector/harness/proof.mjs
 *
 * What it proves, each with a positive control in the same run:
 *
 *   A. SAME ROWS. For every write entry with a sample below, the allowlisted
 *      admin's call through connector_call (commit) writes the same rows,
 *      column for column apart from ids and timestamps, as the same admin's
 *      direct call, in every table either touches, plus exactly one audit row.
 *   B. NOTHING FOR ANYONE ELSE. For EVERY write entry in the registry (hand
 *      and generated), with sample arguments where there are some and typed
 *      placeholders otherwise: a member, a mentor and a signed-out caller get
 *      nothing through connector_call, and no table changes. Where the inner
 *      function refuses the caller, the connector refusal is the same text.
 *   C. PREVIEW WRITES NOTHING, for every write entry the admin can run.
 *   D. THE ALLOWLIST PASTE (docs/connector/allowlist.sql) allows the named
 *      admin, and refuses an account that is not an admin.
 *
 * Each case runs in its own transaction, rolled back. Prints one line per
 * failure and `connector proof: N/T checks passed`.
 */
import pg from 'pg'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import REGISTRY from '../../../api/_lib/connector/registry.generated.js'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ID = { admin: '00000000-0000-0000-0000-0000000000a1', mentor: '00000000-0000-0000-0000-0000000000b1', sam: '00000000-0000-0000-0000-0000000000c1', riley: '00000000-0000-0000-0000-0000000000c2', parent: '00000000-0000-0000-0000-0000000000d1' }

const client = new pg.Client({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER ?? 'postgres', database: process.env.PGDATABASE ?? 'frc' })
await client.connect()
const q = (sql, params) => client.query(sql, params)

let passed = 0
let total = 0
const fails = []
function check(name, ok, detail = '') {
  total += 1
  if (ok) passed += 1
  else fails.push(`${name}${detail ? ` -- ${detail}` : ''}`)
}

async function as(who) {
  if (who === null) {
    await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true), set_config('role', 'anon', true)`)
  } else {
    await q(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('role', 'authenticated', true)`, [JSON.stringify({ sub: who, role: 'authenticated' }), who])
  }
}
const asOwner = () => q('reset role')

/**
 * Every public table's rows (connector tables aside), normalised so two
 * equivalent writes compare equal: uuids other than the fixed personas, and
 * timestamps, become placeholders (a fresh row id or a now() differs between
 * two transactions by construction). Returns {table: sorted rows}.
 */
async function snapshot() {
  const r = await q(`select pg_temp.proof_snapshot($1::uuid[]) as s`, [Object.values(ID)])
  return r.rows[0].s
}
/** Tables whose normalised contents differ between two snapshots. */
const changedTables = (a, b) => Object.keys({ ...a, ...b }).filter((t) => JSON.stringify(a[t] ?? []) !== JSON.stringify(b[t] ?? [])).sort()

async function installSnapshot() {
  await q(`create or replace function pg_temp.proof_norm(v jsonb, keep uuid[]) returns jsonb language sql immutable as $f$
    select case jsonb_typeof(v)
      when 'object' then coalesce((select jsonb_object_agg(k, pg_temp.proof_norm(x, keep)) from jsonb_each(v) e(k, x)
                                    where k not in ('id', 'created_at', 'updated_at')), '{}'::jsonb)
      when 'array' then coalesce((select jsonb_agg(pg_temp.proof_norm(x, keep) order by o) from jsonb_array_elements(v) with ordinality a(x, o)), '[]'::jsonb)
      when 'string' then case
        when length(v #>> '{}') = 36 and (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
          and not ((v #>> '{}')::uuid = any (keep)) then to_jsonb('<uuid>'::text)
        when (v #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:' then to_jsonb('<time>'::text)
        else v end
      else v end
  $f$`)
  await q(`create or replace function pg_temp.proof_snapshot(keep uuid[]) returns jsonb language plpgsql as $f$
    declare t text; part jsonb; out jsonb := '{}'::jsonb;
    begin
      for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r' and c.relname not like 'connector\_%' order by 1 loop
        execute format('select coalesce(jsonb_agg(x order by x::text), ''[]''::jsonb) from (select pg_temp.proof_norm(to_jsonb(r), $1) as x from public.%I r) s', t)
          into part using keep;
        out := out || jsonb_build_object(t, part);
      end loop;
      return out;
    end $f$`)
}

async function inTx(fn) {
  await q('begin')
  try { return await fn() } finally { await q('rollback') }
}

async function prepare() {
  await asOwner()
  await q(`update public.connector_settings set allowed_member = $1, enabled = true where id`, [ID.admin])
  await q(`insert into public.connector_registry (function_name, tool, level)
           select x ->> 'function_name', x ->> 'tool', x ->> 'level' from jsonb_array_elements($1::jsonb) x
           on conflict (function_name) do update set tool = excluded.tool, level = excluded.level`, [JSON.stringify(registryRows())])
}
function registryRows() {
  return Object.values(REGISTRY.functions).filter((f) => !f.excluded).map((f) => ({ function_name: f.name, tool: 'call_app', level: f.level_when ? 'confirm' : f.level }))
}

async function connectorCall(fn, args, mode, key) {
  return q(`select public.connector_call('proof', $1, $2::jsonb, $3, $4) as r`, [fn, JSON.stringify(args), key, mode])
}
async function tryRun(sqlFn) {
  await q('savepoint s')
  try {
    const r = await sqlFn()
    await q('release savepoint s')
    return { ok: true, r }
  } catch (e) {
    await q('rollback to savepoint s')
    return { ok: false, code: e.code, message: e.message }
  }
}
function directCall(fn, args) {
  const keys = Object.keys(args)
  const sql = `select to_jsonb(public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})) as r`
  const values = keys.map((k) => (Array.isArray(args[k]) || (args[k] && typeof args[k] === 'object') ? JSON.stringify(args[k]) : args[k]))
  // Arrays go to Postgres as arrays, not JSON; a jsonb argument holding an array stays JSON (0035).
  const pgArray = (k) => Array.isArray(args[k]) && !/^jsonb?$/.test(typeFor(fn, k))
  return q(sql.replace(/\$(\d+)/g, (m, i) => (pgArray(keys[i - 1]) ? `${m}::${typeFor(fn, keys[i - 1])}` : m)),
    keys.map((k, i) => (pgArray(k) ? args[k] : values[i])))
}
function typeFor(fn, arg) {
  for (const f of REGISTRY.functions[fn]?.forms ?? []) for (const a of f.args) if (a.name === arg) return a.type
  return 'text'
}

// ── Fixtures the samples need, created as the table owner inside each tx ────
async function fixtures() {
  await asOwner()
  const ev = await q(`insert into public.events (title, kind, starts_at, ends_at) values ('Proof build', 'build', now() + interval '2 days', now() + interval '2 days 3 hours') returning id`)
  const lh = await q(`insert into public.logged_hours (member_id, date, hours, type, status) values ($1, current_date, 2, 'outreach', 'pending') returning id`, [ID.sam])
  const ae = await q(`insert into public.attendance_events (user_id, type, event_time, location, method, category) values ($1, 'in', now() - interval '2 hours', 'shop', 'nfc', 'build') returning id`, [ID.riley])
  const fb = await q(`insert into public.feedback (member_id, category, message) values ($1, 'bug', 'Proof report') returning id`, [ID.sam])
  const sr = await q(`insert into public.signout_requests (member_id, note, cleanup_confirmed, location) values ($1, 'Wired the drive base', true, 'shop') returning id`, [ID.riley])
  // ledger 0016: one coming trip with Riley's family on it (0023, Send link).
  // Fixed ids: each sample runs in its own rolled-back transaction, and the
  // mail dedupe key names the invite, so both runs must share it.
  const he = await q(`insert into public.hub_events (id, title) values ('0f000000-0000-4000-8000-000000000023', 'Proof trip') returning id`)
  await q(`insert into public.hub_days (event_id, day_date, venue_closes_at) values ($1, current_date + 10, now() + interval '10 days')`, [he.rows[0].id])
  const hi = await q(`insert into public.hub_invites (id, event_id, student_id, emails) values ('0f000000-0000-4000-8000-000000000123', $1, $2, array['riley.family@example.invalid']) returning id`, [he.rows[0].id, ID.riley])
  // ledger 0017: one battery to log and charge (0026). Fixed id for the same reason.
  const bt = await q(`insert into public.batteries (id, label, status, charge_state) values ('0f000000-0000-4000-8000-000000000026', 'PF99', 'competition', 'charged') returning id`)
  // ledger 0026: a Meet a team box on the proof event (0035), when 0035 is there.
  if ((await q(`select to_regprocedure('public.staff_meet_team_fill(uuid, boolean)') is not null as ok`)).rows[0].ok) {
    await q(`insert into public.role_slots (id, event_id, day, label, starts_at, ends_at, needs) values ('0f000000-0000-4000-8000-000000000035', $1, current_date + 2, 'Proof quals', now() + interval '2 days', now() + interval '2 days 1 hour', '{"meet_team":3}')`, [ev.rows[0].id])
  }
  return { event: ev.rows[0].id, logged: lh.rows[0].id, attendance: ae.rows[0].id, feedback: fb.rows[0].id, signout: sr.rows[0].id, invite: hi.rows[0].id, battery: bt.rows[0].id }
}

// Hand samples: the writes the hand entries make, with real arguments.
const SAMPLES = {
  staff_add_hour_adjustment: () => ({ p_member: ID.sam, p_category: 'build', p_hours: 1.5, p_reason: 'Proof credit' }),
  admin_set_member_role: () => ({ p_member: ID.riley, p_role: 'lead', p_grant: true }),
  approve_signout: (fx) => ({ p_request: fx.signout }),
  feedback_set_status: (fx) => ({ p_ids: [fx.feedback], p_status: 'done' }),
  connector_report_gap: () => ({ p_said: 'make a bus seating chart', p_missing: 'There is no seating chart' }),
  staff_log_safety: () => ({ p_member: ID.sam, p_rule: 'Safety glasses', p_note: 'Proof' }),
  staff_add_manual_session: () => ({ p_member: ID.sam, p_in: new Date(Date.now() - 5 * 3600e3).toISOString(), p_out: new Date(Date.now() - 3 * 3600e3).toISOString(), p_category: 'build', p_reason: 'Forgot to tap' }),
  staff_edit_logged_hours: (fx) => ({ p_entry: fx.logged, p_type: 'outreach', p_hours: 3, p_date: new Date().toISOString().slice(0, 10) }),
  staff_void_session: () => ({ p_member: ID.riley, p_reason: 'Proof void' }),
  set_hour_goal: () => null,
  // ledger 0014
  schedule_create_event: () => ({ p_title: 'Proof build', p_kind: 'build', p_starts_at: '2026-10-24T16:00:00Z', p_ends_at: '2026-10-24T20:00:00Z', p_location: 'Shop' }),
  admin_set_member_name: () => ({ p_member: ID.riley, p_full_name: 'Riley Proofname' }),
  admin_merge_member: () => ({ p_from: ID.riley, p_into: ID.sam, p_reason: 'Proof merge' }),
  admin_set_geofence_exempt: () => ({ p_member: ID.riley, p_exempt: true }),
  survey_create: () => ({ p_title: 'Proof survey', p_opens_at: null, p_closes_at: null }),
  // ledger 0016
  staff_send_trip_link: (fx) => ({ p_invite: fx.invite }),
  feedback_reply: (fx) => ({ p_feedback: fx.feedback, p_body: 'Proof answer' }),
  // ledger 0017: the battery log (0026)
  battery_set_charge: (fx) => ({ p_battery: fx.battery, p_state: 'charging' }),
  battery_log_run: (fx) => ({ p_battery: fx.battery, p_kind: 'match', p_match: 'qm12', p_voltage_before: 12.9, p_voltage_after: 11.8, p_brownout: 'no' }),
  battery_add_set: () => ({ p_prefix: 'PF', p_from: 1, p_to: 3 }),
  // ledger 0024 (0032)
  admin_set_member_status_bulk: () => ({ p_members: [ID.riley, ID.sam], p_status: 'inactive', p_reason: 'Proof never came' }),
  staff_add_event: () => ({ p_member: ID.sam, p_type: 'in', p_event_time: new Date(Date.now() - 3600e3).toISOString(), p_category: 'build', p_reason: 'Proof sign-in' }),
  // ledger 0026 (0035)
  staff_meet_team_fill: (fx) => ({ p_event: fx.event, p_apply: true }),
  team_connection_save: (fx) => ({ p_id: null, p_event: fx.event, p_team: 254, p_team_name: 'Proof Poofs', p_contact: { name: 'Jordan', role: 'mentor' }, p_does_well: 'Spares cart',
    p_org_tags: ['subteams'], p_org_note: null, p_resource_tags: ['mentoring'], p_resource_note: null, p_copy: 'Label the spares', p_follow_up: false, p_follow_up_note: null }),
}

/** Placeholder arguments of the right types, for a function with no sample. */
function placeholders(entry) {
  const form = entry.forms[0]
  if (!form) return {}
  const out = {}
  for (const a of form.args) {
    if (a.optional) continue
    const t = a.type
    out[a.name] = t === 'uuid' ? ID.sam : t === 'boolean' ? true : /int|numeric|real|double/.test(t) ? 1 : t === 'date' ? '2026-10-19' : /timestamp/.test(t) ? '2026-10-19T19:00:00Z' : t === 'jsonb' || t === 'json' ? {} : t.endsWith('[]') ? [] : 'proof'
  }
  return out
}

await installSnapshot()
await prepare()

// ── A. same rows ───────────────────────────────────────────────────────────
for (const [fn, sample] of Object.entries(SAMPLES)) {
  const entry = REGISTRY.functions[fn]
  if (!entry || entry.excluded) continue
  const direct = await inTx(async () => {
    const fx = await fixtures()
    const args = sample(fx)
    if (!args) return null
    const before = await snapshot()
    await as(ID.admin)
    const r = await tryRun(() => directCall(fn, args))
    await asOwner()
    return { ok: r.ok, err: r.message, before, after: await snapshot() }
  })
  if (!direct) continue
  const via = await inTx(async () => {
    const fx = await fixtures()
    const args = sample(fx)
    const before = await snapshot()
    await as(ID.admin)
    const r = await tryRun(() => connectorCall(fn, args, 'commit', `id:proof:${fn}`))
    await asOwner()
    const audit = await q(`select count(*)::int as n from public.connector_audit where request_key = $1 and status = 'done' and user_id = $2`, [`id:proof:${fn}`, ID.admin])
    return { ok: r.ok, err: r.message, before, after: await snapshot(), audit: audit.rows[0].n }
  })
  check(`A ${fn}: the direct call works as the admin (positive control)`, direct.ok, direct.err)
  check(`A ${fn}: through connector_call it works too`, via.ok, via.err)
  const changed = (s) => changedTables(s.before, s.after)
  const dChanged = changed(direct)
  const vChanged = changed(via)
  check(`A ${fn}: the direct call changed something (positive control)`, dChanged.length > 0, 'no table changed')
  check(`A ${fn}: the same tables change both ways`, JSON.stringify(dChanged) === JSON.stringify(vChanged), `${dChanged} vs ${vChanged}`)
  for (const t of dChanged) check(`A ${fn}: ${t} holds the same rows both ways`, JSON.stringify(direct.after[t]) === JSON.stringify(via.after[t]))
  check(`A ${fn}: exactly one audit row, as the admin`, via.audit === 1, String(via.audit))
}

// A positive control for the comparison itself: a real write is seen.
{
  const seen = await inTx(async () => {
    const before = await snapshot()
    await q(`insert into public.hour_adjustments (member_id, category, hours, reason) values ($1, 'build', 1, 'control')`, [ID.sam])
    return changedTables(before, await snapshot())
  })
  check('the snapshot comparison sees a planted write (positive control)', JSON.stringify(seen) === JSON.stringify(['hour_adjustments']), String(seen))
}

// ── B and C. every write entry ─────────────────────────────────────────────
const writes = Object.values(REGISTRY.functions).filter((f) => !f.excluded && f.writes && f.forms.length)
let bCount = 0
for (const entry of writes) {
  for (const [who, label] of [[ID.sam, 'a member'], [ID.mentor, 'a mentor'], [null, 'signed out']]) {
    const res = await inTx(async () => {
      const fx = await fixtures()
      const args = SAMPLES[entry.name]?.(fx) ?? placeholders(entry)
      await as(who)
      const direct = await tryRun(() => directCall(entry.name, args))
      await asOwner()
      // Start the connector call from the same place the direct call did.
      await q('rollback'); await q('begin')
      const fx2 = await fixtures()
      const args2 = SAMPLES[entry.name]?.(fx2) ?? placeholders(entry)
      const before = await snapshot()
      await as(who)
      const via = await tryRun(() => connectorCall(entry.name, args2, 'commit', `id:proof-b:${entry.name}:${label}`))
      await asOwner()
      return { direct, via, landed: changedTables(before, await snapshot()) }
    })
    bCount += 1
    check(`B ${entry.name} ${label}: nothing lands through the connector`, !res.via.ok && res.landed.length === 0, res.via.ok ? 'the call succeeded' : `landed in ${res.landed}`)
    if (!res.direct.ok) {
      check(`B ${entry.name} ${label}: the refusal is the inner function own text`, res.via.message === res.direct.message, `${res.via.message} vs ${res.direct.message}`)
    } else {
      check(`B ${entry.name} ${label}: a call that would have worked gets the connector refusal`, /Techmen connector is for its one approved account/.test(res.via.message ?? ''), res.via.message)
    }
  }
  const pv = await inTx(async () => {
    const fx = await fixtures()
    const args = SAMPLES[entry.name]?.(fx) ?? placeholders(entry)
    const before = await snapshot()
    await as(ID.admin)
    const r = await tryRun(() => connectorCall(entry.name, args, 'preview', `id:proof-c:${entry.name}`))
    await asOwner()
    const audit = await q(`select count(*)::int as n from public.connector_audit where request_key = $1`, [`id:proof-c:${entry.name}`])
    return { r, landed: changedTables(before, await snapshot()), audit: audit.rows[0].n }
  })
  check(`C ${entry.name}: a preview raises and writes nothing`, !pv.r.ok && pv.landed.length === 0 && pv.audit === 0, pv.r.ok ? 'preview committed' : `${pv.r.code} landed ${pv.landed}`)
}
check('B covered every write entry (positive control: more than seventy)', writes.length > 70, String(writes.length))

// ── D. the allowlist paste ─────────────────────────────────────────────────
const allowSql = readFileSync(path.join(REPO, 'docs/connector/allowlist.sql'), 'utf8')
const run = async (email) => inTx(async () => {
  await asOwner()
  await q(`update public.connector_settings set allowed_member = null, enabled = false where id`)
  const sql = allowSql.replace(`v_email text := 'apina@boscotech.edu';`, `v_email text := '${email}';`)
  const r = await tryRun(() => q(sql))
  const s = await q(`select enabled, allowed_member from public.connector_settings where id`)
  await as(ID.admin)
  const may = (await q('select public.connector_may_connect() as m')).rows[0].m
  await asOwner()
  return { ok: r.ok, err: r.message, s: s.rows[0], may }
})
check('D the allowlist paste the email names is not hardcoded in code (positive control: the file names it once)', (allowSql.match(/apina@boscotech\.edu/g) ?? []).length === 1)
const dAdmin = await run('admin.test@boscotech.edu')
check('D allowlisting the admin switches it on and lets the admin connect', dAdmin.ok && dAdmin.s.enabled === true && dAdmin.s.allowed_member === ID.admin && dAdmin.may === true, dAdmin.err)
const dStudent = await run('student.one@boscotech.edu')
check('D allowlisting a non-admin is refused and changes nothing', !dStudent.ok && /admin role/.test(dStudent.err ?? '') && dStudent.s.allowed_member === null && dStudent.s.enabled === false, dStudent.err)
const dNobody = await run('nobody@example.com')
check('D an email nobody signs in with is refused', !dNobody.ok && /No account signs in/.test(dNobody.err ?? ''), dNobody.err)

await client.end()
for (const f of fails) console.log(`FAIL ${f}`)
console.log(`connector proof: ${passed}/${total} checks passed (${Object.keys(SAMPLES).length} hand samples, ${writes.length} write entries x 3 callers = ${bCount} refusal runs)`)
process.exit(fails.length ? 1 : 0)
