#!/usr/bin/env node
/**
 * Mutation proof for 0005_event_family_hub_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server.
 *
 * Each mutant widens ONE boundary in the PERMISSIVE direction -- a policy to
 * using (true), a grant handed back, a consent condition dropped from the
 * board builder, a rule switched off -- then runs the test and requires the
 * named check(s) to turn FAIL, then restores the boundary from the copy it
 * read before changing it (never from git). A mutant that leaves the test
 * green is a hole in the test, and this script fails.
 *
 * A function mutant reads the live definition with pg_get_functiondef,
 * replaces one fragment (which must occur, or the mutant aborts), executes
 * the result, and restores the original definition afterwards.
 *
 * Prints one line per mutant and `mutants 0005: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0005_event_family_hub_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();

function runTest() {
  const r = spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' });
  const fails = new Set();
  let rows = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const c = line.split('\t');
    if (c.length >= 4 && /^(PASS|FAIL|SKIP)$/.test(c[2]) && c[1] !== 'summary') {
      rows += 1;
      if (c[2] === 'FAIL') fails.add(Number(c[0]));
    }
  }
  return { fails, rows, errored: r.status !== 0, err: (r.stderr || '').trim().split('\n').slice(-1)[0] };
}

const STAFF_READ = ['hub_invites', 'hub_responses', 'hub_day_answers', 'hub_cars', 'hub_seats', 'hub_pickups', 'hub_food_claims', 'hub_outbox'];
const STAFF_ALL = ['hub_events', 'hub_days', 'hub_meals', 'hub_food_needs'];
const READ_CHECK = Object.fromEntries(
  ['hub_events', 'hub_days', 'hub_meals', 'hub_food_needs', 'hub_invites', 'hub_responses', 'hub_day_answers',
   'hub_cars', 'hub_seats', 'hub_pickups', 'hub_food_claims', 'hub_outbox'].map((t, i) => [t, 50 + i]));

const fnMutant = (name, sig, find, replace, expect) => ({ name, kind: 'fn', sig, find, replace, expect });
const MUTANTS = [
  ...STAFF_ALL.map((t) => ({ name: `policy "${t} staff all" -> using (true)`, kind: 'sql',
    apply: `alter policy "${t} staff all" on public.${t} using (true) with check (true)`,
    restore: `alter policy "${t} staff all" on public.${t} using (public.is_staff()) with check (public.is_staff())`,
    expect: [READ_CHECK[t]] })),
  ...STAFF_READ.map((t) => ({ name: `policy "${t} staff read" -> using (true)`, kind: 'sql',
    apply: `alter policy "${t} staff read" on public.${t} using (true)`,
    restore: `alter policy "${t} staff read" on public.${t} using (public.is_staff())`,
    expect: [READ_CHECK[t]] })),
  { name: 'select on hub_invite_tokens granted back to authenticated, with a permissive policy', kind: 'sql',
    apply: `grant select on public.hub_invite_tokens to authenticated; create policy mut_tokens on public.hub_invite_tokens for select to authenticated using (true)`,
    restore: `drop policy mut_tokens on public.hub_invite_tokens; revoke select on public.hub_invite_tokens from authenticated`,
    expect: [4, 62] },
  { name: 'insert on hub_seats granted back to authenticated, with a permissive policy', kind: 'sql',
    apply: `grant insert on public.hub_seats to authenticated; create policy mut_seats on public.hub_seats for insert to authenticated with check (true)`,
    restore: `drop policy mut_seats on public.hub_seats; revoke insert on public.hub_seats from authenticated`,
    expect: [3, 65] },
  { name: 'hub_family_call executable by authenticated', kind: 'sql',
    apply: `grant execute on function public.hub_family_call(text, text, jsonb) to authenticated`,
    restore: `revoke execute on function public.hub_family_call(text, text, jsonb) from authenticated`,
    expect: [5, 33] },
  { name: 'anon given select on hub_events', kind: 'sql',
    apply: `grant select on public.hub_events to anon; create policy mut_anon on public.hub_events for select to anon using (true)`,
    restore: `drop policy mut_anon on public.hub_events; revoke select on public.hub_events from anon`,
    expect: [2, 68] },
  fnMutant('driver phone shown without the driver\'s consent', 'public._hub_board_car(uuid,text,uuid)',
    "when dr.driver_phone_consent_at is not null and (v_seated or v_mine or v_staff)", "when (v_seated or v_mine or v_staff)", [23]),
  fnMutant('driver phone shown to every family, not only that car\'s', 'public._hub_board_car(uuid,text,uuid)',
    "when dr.driver_phone_consent_at is not null and (v_seated or v_mine or v_staff)", "when dr.driver_phone_consent_at is not null", [22]),
  fnMutant('rider phone shown without the rider family\'s consent', 'public._hub_board_car(uuid,text,uuid)',
    "(v_staff or v_mine) and rr.rider_phone_consent_at is not null then rr.parent_phone", "(v_staff or v_mine) then rr.parent_phone", [28]),
  fnMutant('accepted pickup spot shown to every viewer', 'public._hub_board_car(uuid,text,uuid)',
    "'spot', case when (v_staff or v_mine) and s.via_pickup then pk.spot end", "'spot', case when s.via_pickup then pk.spot end", [27]),
  fnMutant('open pickup requests shown to every viewer', 'public._hub_board_run(uuid,text,text,uuid)',
    "if p_run = 'to' and (v_staff or v_pickup_driver) then", "if p_run = 'to' then", [24]),
  fnMutant('allergy names shown to every viewer', 'public._hub_board_meal(uuid,text,uuid)',
    "  if v_staff then\n    select coalesce(jsonb_agg(jsonb_build_object(\n             'name'", "  if true then\n    select coalesce(jsonb_agg(jsonb_build_object(\n             'name'", [29, 30]),
  fnMutant('one-minor rule switched off at the claim', 'public._hub_claim(uuid,uuid,uuid,text,boolean)',
    "  if e.one_minor_rule and not public._hub_own_aboard(c.id)\n     and (v_riders + 1 = 1", "  if false and not public._hub_own_aboard(c.id)\n     and (v_riders + 1 = 1", [16]),
  fnMutant('a red car may be marked Left without an override', 'public._hub_mark(uuid,text,uuid,uuid,text)',
    "    if public._hub_car_problem(c.id) is not null then", "    if false then", [20]),
  fnMutant('a car that left is not frozen', 'public._hub_unclaim(uuid,uuid,uuid)',
    "  if c.left_at is not null then\n    perform public._hub_refuse('car_left'", "  if false then\n    perform public._hub_refuse('car_left'", [21]),
  fnMutant('capacity ignored', 'public._hub_claim(uuid,uuid,uuid,text,boolean)',
    "  if v_riders >= c.seats then", "  if false then", [15]),
  fnMutant('a revoked token still opens the page', 'public._hub_invite_for_token(text)',
    "     and t.revoked_at is null", "", [43]),
  fnMutant('the member board open to any signed-in account', 'public._hub_member_ok()',
    "  select public.is_staff()\n      or (exists", "  select true\n      or (exists", [31]),
  fnMutant('food window ignored for families', 'public._hub_food_claim(uuid,uuid,uuid,uuid,text,text,integer,text)',
    "  if p_staff is null and now() >= m.starts_at then", "  if false then", [35]),
  fnMutant('pickup spot stored without consent', 'public._hub_save(uuid,uuid,text,jsonb,uuid)',
    "      if v_text is null or not v_bool then\n        perform public._hub_withdraw_pickup(p_invite, p_day);\n      else",
    "      if v_text is null then\n        perform public._hub_withdraw_pickup(p_invite, p_day);\n      else", [9]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0005: baseline is not green, nothing to measure');
  process.exit(1);
}

let caught = 0;
for (const m of MUTANTS) {
  let restore;
  if (m.kind === 'sql') {
    sql(m.apply);
    restore = () => sql(m.restore);
  } else {
    const def = sql(`select pg_get_functiondef('${m.sig}'::regprocedure)`);
    if (!def.includes(m.find)) {
      console.log(`ABORT mutant "${m.name}": fragment not found in ${m.sig}`);
      process.exit(1);
    }
    const f = path.join(process.env.TMPDIR || '/tmp', `mut-${process.pid}.sql`);
    const write = (text) => { execFileSync(PSQL, [...base, '-f', '-'], { input: text + '\n;', encoding: 'utf8' }); };
    write(def.replace(m.find, m.replace));
    restore = () => write(def);
    void f;
  }
  const r = runTest();
  restore();
  const hit = m.expect.filter((n) => r.fails.has(n));
  const ok = hit.length === m.expect.length;
  if (ok) caught += 1;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'} ${m.name} -- FAIL rows: ${[...r.fails].sort((a, b) => a - b).join(', ') || 'none'}; want ${m.expect.join(', ')}${r.errored ? ` (errored: ${r.err})` : ''}`);
}

const after = runTest();
console.log(`after restoring every mutant: ${after.rows} rows, ${after.fails.size} FAIL`);
const allGood = caught === MUTANTS.length && after.fails.size === 0 && !after.errored;
console.log(`mutants 0005: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
