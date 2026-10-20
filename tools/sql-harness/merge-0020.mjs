#!/usr/bin/env node
/**
 * admin_merge_member (0020), PROVED ROW BY ROW on a real PostgreSQL 16:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/merge-0020.mjs
 *
 * 1. Two fresh accounts, FROM (the summer Gmail one) and INTO (the school
 *    one), and a row naming each of them in EVERY column the merge handles
 *    (_merge_member_rules), so every unique key that includes a member
 *    column sees a collision. The rows are built from the catalog (required
 *    columns, foreign keys, CHECK lists), with a short override list where a
 *    CHECK wants a shape.
 * 2. NEGATIVE CONTROLS: a mentor and a student calling the merge are refused
 *    (42501), and not one row of any handled table changes.
 * 3. POSITIVE CONTROL: the admin merge succeeds and, for every handled
 *    column: no row names FROM any more; every row INTO had is still there,
 *    unchanged; every row FROM had is there naming INTO, or it collided with
 *    an INTO row on a unique key (and that INTO row is there), and the count
 *    of those is what the merge answered; nothing else appeared. Roles,
 *    capabilities, credentials, the profile note and the trail as documented.
 * 4. MUTANTS, permissive direction, each restored by pasting 0020 again: the
 *    admin check gone (the mentor call must now be caught by step 2), a rule
 *    forgotten (the merge must refuse, naming the column), and the guard and
 *    a rule both gone (rows left on FROM must be caught by step 3).
 *
 * Every step runs in a transaction that is rolled back. Prints one line per
 * failed check and `merge 0020: N/T checks passed`.
 */
import pg from 'pg'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIG = readFileSync(path.join(REPO, 'supabase/migrations/0020_member_admin.sql'), 'utf8')
const ID = { admin: '00000000-0000-0000-0000-0000000000a1', mentor: '00000000-0000-0000-0000-0000000000b1', student: '00000000-0000-0000-0000-0000000000c1', other: '00000000-0000-0000-0000-0000000000c4' }
const FROM = '00000000-0000-4000-9000-0000000000f1'
const INTO = '00000000-0000-4000-9000-0000000000f2'

const client = new pg.Client({ host: process.env.PGHOST, port: Number(process.env.PGPORT), user: process.env.PGUSER ?? 'postgres', database: process.env.PGDATABASE ?? 'frc' })
await client.connect()
const q = (sql, params) => client.query(sql, params)

let passed = 0
let total = 0
const check = (ok, what) => {
  total += 1
  if (ok) passed += 1
  else console.log(`FAIL ${what}`)
  return ok
}

async function as(who, fn) {
  await q('savepoint act')
  try {
    if (who) {
      await q(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('role', 'authenticated', true)`,
        [JSON.stringify({ sub: who, role: 'authenticated' }), who])
    }
    const r = await fn()
    await q('reset role')
    await q('release savepoint act')
    return { ok: true, r }
  } catch (e) {
    await q('rollback to savepoint act')
    await q('reset role')
    return { ok: false, code: e.code, message: e.message }
  }
}

// ── the catalog ─────────────────────────────────────────────────────────────
async function tableInfo(tbl) {
  const cols = (await q(`select a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull,
      (pg_get_expr(d.adbin, d.adrelid) is not null or a.attidentity <> '' or a.attgenerated <> '') as has_default
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`, [`public.${tbl}`])).rows
  const fks = (await q(`select a.attname as col, c.confrelid::regclass::text as ref, fa.attname as refcol
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
   where c.conrelid = $1::regclass and c.contype = 'f' and cardinality(c.conkey) = 1`, [`public.${tbl}`])).rows
  const checks = (await q(`select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and contype = 'c'`, [`public.${tbl}`])).rows.map((r) => r.def)
  const uniques = (await q(`select array_agg(a.attname order by k.ord) as cols, i.indpred is not null as partial
    from pg_index i cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = $1::regclass and i.indisunique group by i.indexrelid, i.indpred`, [`public.${tbl}`])).rows
  return { cols, fks, checks, uniques }
}

const MEMBER_REFS = new Set(['public.profiles', 'profiles', 'auth.users'])

// Values a CHECK wants that the generic rules cannot guess.
const OVERRIDES = {
  handbook_acknowledgments: { version: () => '1999-01-01', signer_role: () => 'student' },
  handbook_versions: { version: (s) => (s === 'b' ? '1999-01-03' : '1999-01-02') },
  parent_acknowledgments: { version: () => '1999-01-01' },
  discord_announce_roles: { role_id: (s) => (s === 'b' ? '222222222222222222' : '333333333333333333') },
  push_subscriptions: { endpoint: (s) => `https://merge.example/${s}` },
  approved_emails: { email: (s) => `merge-${s}@example.com` },
  allowed_domains: { domain: (s) => `merge-${s}.example` },
  access_requests: { email: (s) => `merge-${s}@example.com` },
  notice_outbox: { to_email: (s) => `merge-${s}@example.com` },
  standing_weeks: { week_start: () => '2026-09-07' },
  team_weeks: { week_start: () => '2026-09-07' },
  subteam_status_reports: { week_start: () => '2026-09-07' },
  standing_months: { month: () => '2026-09-01' },
  letter_contributions: { season_start: () => '2026-09-01' },
  hub_cars: { seats: () => 3 },
  logged_hours: { hours: () => 1 },
  hour_adjustments: { hours: () => 1 },
  attendance_events: { type: () => 'in' },
}

function guessFromChecks(col, checks) {
  for (const def of checks) {
    const re = new RegExp(`\\(?\\b${col}\\b\\)?(?:::text)?\\s*=\\s*ANY\\s*\\(\\s*\\(?ARRAY\\[\\s*'([^']+)'`)
    const m = re.exec(def)
    if (m) return m[1]
  }
  return undefined
}

function scalarFor(type, col, checks, suffix) {
  const fromCheck = guessFromChecks(col, checks)
  if (fromCheck !== undefined) return fromCheck
  if (/^(text|character varying)/.test(type)) return `merge ${col} ${suffix}`
  if (/^(integer|smallint|bigint|numeric|real|double)/.test(type)) return 1
  if (type === 'boolean') return false
  if (type === 'date') return '2026-09-15'
  if (/^timestamp/.test(type)) return new Date().toISOString()
  if (type === 'jsonb' || type === 'json') return checks.some((d) => d.includes(`jsonb_typeof(${col})`) && d.includes("'array'")) ? [] : {}
  if (type.endsWith('[]')) return []
  if (type === 'uuid') return null
  return `merge ${suffix}`
}

const madeRef = new Map()
async function refRow(ref, refcol, depth) {
  const key = `${ref}.${refcol}`
  const have = await q(`select ${refcol}::text as v from ${ref} order by 1 limit 1`)
  if (have.rows.length) return have.rows[0].v
  if (madeRef.has(key)) return madeRef.get(key)
  const tbl = ref.replace(/^public\./, '')
  const id = await insertRow(tbl, {}, 'r', depth + 1)
  const v = (await q(`select ${refcol}::text as v from ${ref} order by 1 limit 1`)).rows[0]?.v ?? id
  madeRef.set(key, v)
  return v
}

// Insert one row into tbl with `fixed` columns; everything required is filled.
async function insertRow(tbl, fixed, suffix, depth = 0) {
  if (depth > 4) throw new Error(`too deep at ${tbl}`)
  const info = await tableInfo(tbl)
  const row = { ...fixed }
  for (const c of info.cols) {
    if (c.name in row) continue
    const fk = info.fks.find((f) => f.col === c.name)
    const ov = OVERRIDES[tbl]?.[c.name]
    if (ov) { row[c.name] = ov(suffix); continue }
    if (!c.notnull || c.has_default) continue
    if (fk && MEMBER_REFS.has(fk.ref)) { row[c.name] = ID.other; continue }
    if (fk) { row[c.name] = await refRow(fk.ref, fk.refcol, depth); continue }
    row[c.name] = scalarFor(c.type, c.name, info.checks, suffix)
  }
  const keys = Object.keys(row)
  const vals = keys.map((k) => { const v = row[k]; return v !== null && typeof v === 'object' ? JSON.stringify(v) : v })
  const typed = keys.map((k, i) => {
    const c = info.cols.find((x) => x.name === k)
    return `$${i + 1}::${c.type === 'ARRAY' ? 'text[]' : c.type}`
  })
  const sql = `insert into public.${tbl} (${keys.map((k) => `"${k}"`).join(', ')}) values (${typed.join(', ')}) returning to_jsonb(${tbl}.*) as row`
  const ins = await q(sql, vals.map((v, i) => (Array.isArray(row[keys[i]]) && info.cols.find((x) => x.name === keys[i]).type.endsWith('[]') ? row[keys[i]] : v)))
  return ins.rows[0].row
}

async function seedOne(tbl, col, who, suffix) {
  const fixed = { [col]: who }
  // The other member columns of the same row name a third member.
  const info = await tableInfo(tbl)
  for (const f of info.fks) if (MEMBER_REFS.has(f.ref) && f.col !== col && info.cols.find((c) => c.name === f.col)?.notnull) fixed[f.col] = ID.other
  await q('savepoint seed')
  try {
    await insertRow(tbl, fixed, suffix)
    await q('release savepoint seed')
    return true
  } catch (e) {
    await q('rollback to savepoint seed')
    // a unique key with no member column: vary the text and try once more
    if (e.code === '23505') {
      await q('savepoint seed')
      try {
        await insertRow(tbl, fixed, `${suffix}2`)
        await q('release savepoint seed')
        return true
      } catch (e2) {
        await q('rollback to savepoint seed')
        return `${e2.code} ${e2.message}`
      }
    }
    return `${e.code} ${e.message}`
  }
}

// ── one run ─────────────────────────────────────────────────────────────────
async function rulesNow() {
  return (await q(`select tbl, col, rule from public._merge_member_rules() r
                    where to_regclass('public.' || r.tbl) is not null
                      and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col)
                    order by tbl, col`)).rows
}

async function seedAll() {
  await q(`insert into auth.users (id, email) values ($1, 'summer.gmail@example.com'), ($2, 'merge.school@boscotech.edu') on conflict (id) do nothing`, [FROM, INTO])
  await q(`insert into public.profiles (id) values ($1), ($2) on conflict (id) do nothing`, [FROM, INTO])
  await q(`update public.profiles set full_name = 'Merge Summer', approved = true, nickname = 'Summer', grad_year = 2029, subteams = '{CAD}' where id = $1`, [FROM])
  await q(`update public.profiles set full_name = 'Merge School', approved = true, bio = 'Kept bio' where id = $1`, [INTO])
  await q(`insert into public.member_roles (member_id, role) values ($1, 'student'), ($1, 'mentor'), ($1, 'parent'), ($2, 'student') on conflict do nothing`, [FROM, INTO])
  await q(`insert into public.approved_emails (email, granted_role) values ('summer.gmail@example.com', 'student') on conflict do nothing`)
  const problems = []
  const seeded = []
  for (const r of await rulesNow()) {
    if (!['move', 'keep', 'drop', 'grants'].includes(r.rule)) continue
    if (r.tbl === 'profiles' || r.tbl === 'member_roles') continue
    for (const [who, s] of [[INTO, 'b'], [FROM, 'a']]) {
      const ok = await seedOne(r.tbl, r.col, who, s)
      if (ok !== true) problems.push(`${r.tbl}.${r.col} (${who === FROM ? 'from' : 'into'}): ${ok}`)
    }
    seeded.push(r)
  }
  return { problems, seeded }
}

async function snapshot(rules) {
  const out = {}
  for (const r of rules) {
    const rows = (await q(`select to_jsonb(t.*) as row from public.${r.tbl} t where "${r.col}" in ($1, $2)`, [FROM, INTO])).rows.map((x) => x.row)
    out[`${r.tbl}.${r.col}`] = rows
  }
  return out
}

const key = (row) => JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]))

async function prove({ label, expectAll = true }) {
  await q('begin')
  try {
    const { problems, seeded } = await seedAll()
    check(problems.length === 0, `${label}: seeding every handled column: ${problems.join('; ')}`)
    const rules = seeded.filter((r) => r.rule === 'move')
    const fromRows = Object.fromEntries((await snapshot(rules)).map ? [] : [])
    const before = await snapshot(seeded)
    const counted = Object.values(before).reduce((n, rows) => n + rows.length, 0)
    check(counted >= rules.length * 2, `${label}: seeded ${counted} rows over ${rules.length} moved columns`)

    // negative controls
    for (const who of ['mentor', 'student']) {
      const r = await as(ID[who], () => q(`select public.admin_merge_member($1, $2, 'test')`, [FROM, INTO]))
      const after = await snapshot(seeded)
      const same = JSON.stringify(after) === JSON.stringify(before)
      check(!r.ok && r.code === '42501', `${label}: a ${who} is refused (got ${r.ok ? 'ok' : r.code})`)
      check(same, `${label}: a ${who} call changes nothing`)
    }

    // positive control
    const res = await as(ID.admin, () => q(`select public.admin_merge_member($1, $2, 'summer Gmail account') as out`, [FROM, INTO]))
    if (!check(res.ok, `${label}: the admin merge runs (${res.message ?? ''})`)) { await q('rollback'); return { res } }
    const out = res.r.rows[0].out
    const after = await snapshot(seeded)
    let leftOnFrom = 0
    for (const r of seeded) {
      const k = `${r.tbl}.${r.col}`
      const b = before[k]
      const a = after[k]
      if (r.rule === 'keep') {
        check(JSON.stringify(a.map(key).sort()) === JSON.stringify(b.map(key).sort()), `${label}: ${k} kept as written`)
        continue
      }
      if (r.rule === 'drop' || r.rule === 'grants') {
        check(a.every((row) => row[r.col] !== FROM), `${label}: ${k} removed from the duplicate`)
        check(b.filter((row) => row[r.col] === INTO).every((row) => a.some((x) => key(x) === key(row))), `${label}: ${k} of the kept account untouched`)
        continue
      }
      const fromLeft = a.filter((row) => row[r.col] === FROM).length
      leftOnFrom += fromLeft
      check(fromLeft === 0, `${label}: no ${k} row names the duplicate (${fromLeft} left)`)
      // every row the kept account had is still there, unchanged (another
      // column of the same row may have moved too, from FROM to INTO)
      const mapRow = (row) => Object.fromEntries(Object.entries(row).map(([c, v]) => [c, v === FROM ? INTO : v]))
      const intoBefore = b.filter((row) => row[r.col] === INTO).map(mapRow)
      check(intoBefore.every((row) => a.some((x) => key(mapRow(x)) === key(row))), `${label}: every ${k} row of the kept account is still there`)
      const fromBefore = b.filter((row) => row[r.col] === FROM)
      const movedOk = fromBefore.filter((row) => a.some((x) => key(mapRow(x)) === key(mapRow(row))))
      const collided = fromBefore.length - movedOk.length
      const reported = out.tables?.[r.tbl]?.kept_into ?? 0
      check(collided <= reported, `${label}: ${k}: ${collided} duplicate rows dropped, at most the ${reported} the merge reported for ${r.tbl}`)
      check(a.length === intoBefore.length + movedOk.length, `${label}: ${k}: nothing appeared and nothing was lost (${a.length} = ${intoBefore.length} + ${movedOk.length})`)
    }
    const prof = (await q(`select * from public.profiles where id in ($1, $2) order by full_name`, [FROM, INTO])).rows
    const from = prof.find((p) => p.id === FROM)
    const into = prof.find((p) => p.id === INTO)
    check(from.status === 'inactive' && from.approved === false && /^Merged into Merge School on \d{4}-\d{2}-\d{2}: summer Gmail account$/.test(from.bio ?? ''), `${label}: the duplicate profile is inactive, unapproved and notes the merge (${from.status}, ${from.bio})`)
    check(from.nickname === null && from.grad_year === null && (from.subteams ?? []).length === 0, `${label}: the duplicate profile keeps no other data`)
    check(into.nickname === 'Summer' && into.grad_year === 2029 && into.bio === 'Kept bio' && into.subteams.includes('CAD'), `${label}: the kept profile took what it lacked and kept what it had`)
    const roles = (await q(`select member_id, role from public.member_roles where member_id in ($1, $2) order by role`, [FROM, INTO])).rows
    check(roles.filter((x) => x.member_id === FROM).length === 0, `${label}: the duplicate has no roles`)
    check(JSON.stringify(roles.filter((x) => x.member_id === INTO).map((x) => x.role)) === JSON.stringify(['parent', 'student']), `${label}: student and parent moved, mentor did not (${roles.map((x) => x.role)})`)
    check(JSON.stringify(out.staff_roles_not_moved) === '["mentor"]' && JSON.stringify(out.roles_already_held) === '["student"]', `${label}: the answer names the roles`)
    const auth = (await q(`select count(*)::int as n from auth.users where id = $1`, [FROM])).rows[0].n
    check(auth === 1, `${label}: the duplicate sign-in is not deleted`)
    const ae = (await q(`select count(*)::int as n from public.approved_emails where email = 'summer.gmail@example.com'`)).rows[0].n
    check(ae === 0 && out.approved_email_removed === true, `${label}: the duplicate email no longer approves on sign-in`)
    const log = (await q(`select action from public.member_admin_log where member_id in ($1, $2) order by action`, [FROM, INTO])).rows.map((x) => x.action)
    check(JSON.stringify(log) === '["merge_from","merge_into"]', `${label}: one trail row for each account (${log})`)
    check(out.moved_total > 50 && Object.keys(out.tables).length > 30, `${label}: the answer counts per table (${out.moved_total} rows over ${Object.keys(out.tables).length} tables)`)
    // A second merge of the same pair finds nothing left to move.
    const again = await as(ID.admin, () => q(`select public.admin_merge_member($1, $2, 'again') as out`, [FROM, INTO]))
    check(again.ok && again.r.rows[0].out.moved_total === 0, `${label}: merging again moves nothing`)
    await q('rollback')
    return { res, leftOnFrom }
  } catch (e) {
    await q('rollback')
    check(false, `${label}: errored: ${e.message}`)
    return {}
  }
}

const reapply = async () => { await q(MIG) }

// ── the run ─────────────────────────────────────────────────────────────────
await prove({ label: 'merge' })

// the trail table: admins read, nobody writes
await q('begin')
for (const [who, want] of [['admin', true], ['mentor', false]]) {
  const r = await as(ID[who], () => q(`insert into public.member_admin_log (action) values ('set_name')`))
  check(!r.ok && r.code === '42501', `member_admin_log: a direct insert by ${who} is refused`)
  const s = await as(ID[who], () => q(`select count(*) from public.member_admin_log`))
  check(s.ok === true && (want || Number(s.r.rows[0].count) === 0), `member_admin_log: ${who} ${want ? 'reads it' : 'reads nothing'}`)
}
await q('rollback')

// MUTANT 1: the admin check gone. The mentor call must be caught.
await q(MIG.replace("if not public.is_admin() then\n    raise exception 'Permission denied: admin role required' using errcode = '42501';\n  end if;\n  if p_from is null", "if false then\n    raise exception 'x';\n  end if;\n  if p_from is null"))
{
  const before = passed
  const t0 = total
  await prove({ label: 'MUTANT no admin check' })
  const missed = (total - t0) - (passed - before)
  total -= (total - t0); passed = before
  check(missed > 0, `mutant "the admin check gone" is caught (${missed} checks went red)`)
}
await reapply()

// MUTANT 2: a rule forgotten. The merge must refuse and change nothing.
await q(MIG.replace("    ('event_signups', 'member_id', 'move'),\n", ''))
await q('begin')
{
  await seedAll()
  const r = await as(ID.admin, () => q(`select public.admin_merge_member($1, $2, 'test')`, [FROM, INTO]))
  check(!r.ok && /event_signups\.member_id/.test(r.message ?? ''), `mutant "a rule forgotten": the merge refuses, naming the column (${r.message})`)
  const left = (await q(`select count(*)::int as n from public.event_signups where member_id = $1`, [FROM])).rows[0].n
  check(left === 1, 'mutant "a rule forgotten": nothing moved')
}
await q('rollback')
await reapply()

// MUTANT 3: the guard and a rule both gone. Rows left on FROM must be caught.
await q(MIG.replace("    ('event_signups', 'member_id', 'move'),\n", '').replace('if v_unknown is not null then', 'if false then'))
{
  const before = passed
  const t0 = total
  await prove({ label: 'MUTANT guard and rule gone' })
  const missed = (total - t0) - (passed - before)
  total -= (total - t0); passed = before
  check(missed > 0, `mutant "the guard and a rule gone" is caught (${missed} checks went red)`)
}
await reapply()

// After every mutant, the real one is green again.
{
  const before = passed
  const t0 = total
  await prove({ label: 'restored' })
  check(passed - before === total - t0 - 0, 'after restoring: every check green again')
}

await client.end()
console.log(`merge 0020: ${passed}/${total} checks passed`)
process.exit(passed === total ? 0 : 1)
