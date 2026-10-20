#!/usr/bin/env node
/**
 * Mutation proof for 0019_connector_writes_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0019 --tests none \
 *     --node tools/sql-harness/mutants-0019.mjs
 *
 * Every 0019 function is SECURITY INVOKER so the table policies decide it
 * exactly as they decided the direct write it replaced. Each mutant breaks
 * that in the PERMISSIVE direction: a function made SECURITY DEFINER (it then
 * runs as the owner, past every policy), or an own-row filter dropped from a
 * definer copy. The test must turn the named check red. Each mutant is
 * restored by pasting 0019 again (every function is create or replace,
 * security invoker), never with git checkout.
 *
 * Prints one line per mutant and `mutants 0019: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0019_connector_writes.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0019_connector_writes_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();
const restore = () => execFileSync(PSQL, [...base, '-f', MIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function runTest() {
  const r = spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' });
  const fails = new Set();
  let rows = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const c = line.split('\t');
    if (c.length >= 4 && /^(PASS|FAIL|SKIP)$/.test(c[2]) && c[1] !== 'SUMMARY') {
      rows += 1;
      if (c[2] === 'FAIL') fails.add(Number(c[0]));
    }
  }
  return { fails, rows, errored: r.status !== 0, err: (r.stderr || '').trim().split('\n').slice(-1)[0] };
}

const definer = (sig) => `alter function public.${sig} security definer`;

const MUTANTS = [
  ['an announcement role delete runs as the owner', definer('announce_delete_role(uuid)'), [1, 6]],
  ['a member application runs as the owner', definer('member_application_submit(jsonb)'), [1, 13]],
  ['the legacy feedback move runs as the owner', definer('feedback_set_legacy_status(uuid, text, boolean)'), [1, 17]],
  ['a job status change runs as the owner', definer('staff_set_job_status(uuid, text)'), [1, 23]],
  ['a logged-hours delete runs as the owner', definer('log_hours_delete(uuid)'), [1, 28]],
  ['a logged-hours review runs as the owner', definer('staff_review_logged_hours(uuid, boolean)'), [1, 29]],
  ['approving a member runs as the owner', definer('admin_approve_member(uuid)'), [1, 32]],
  ['a member status change runs as the owner', definer('admin_set_member_status(uuid, text)'), [1, 35]],
  ['adding an event runs as the owner', definer('schedule_create_event(text, text, timestamp with time zone, timestamp with time zone, text, text, boolean, integer, boolean)'), [1, 38]],
  ['deleting a survey runs as the owner', definer('survey_delete(uuid)'), [1, 56]],
  ['saving a trip day runs as the owner', definer('trips_save_day(uuid, jsonb)'), [1, 67]],
  ['the auto close setting runs as the owner', definer('staff_set_auto_close_cutoff(text)'), [1, 72]],
  ['clearing an answer drops its own-row filter, as the owner',
    `create or replace function public.event_clear_response(p_event uuid) returns void language plpgsql security definer set search_path = public as $fn$ begin delete from public.event_signups where event_id = p_event; end $fn$`, [1, 21]],
  ['logging hours writes for whoever is named, as the owner',
    `create or replace function public.log_hours_submit(p_date date, p_hours numeric, p_type text, p_description text) returns jsonb language plpgsql security definer set search_path = public as $fn$ declare v public.logged_hours; begin insert into public.logged_hours (member_id, date, hours, type, description, status) values (coalesce(auth.uid(), (select id from public.profiles order by id limit 1)), p_date, p_hours, p_type, p_description, 'pending') returning * into v; return to_jsonb(v); end $fn$`, [1, 27]],
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0019: baseline is not green, nothing to measure');
  process.exit(1);
}

let caught = 0;
for (const [name, apply, expect] of MUTANTS) {
  sql(apply);
  const r = runTest();
  restore();
  const ok = expect.every((n) => r.fails.has(n));
  if (ok) caught += 1;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'} ${name} -- FAIL rows: ${[...r.fails].sort((a, b) => a - b).join(', ') || 'none'}; want ${expect.join(', ')}${r.errored ? ` (errored: ${r.err})` : ''}`);
}

const after = runTest();
console.log(`after restoring every mutant: ${after.rows} rows, ${after.fails.size} FAIL`);
console.log(`mutants 0019: ${caught}/${MUTANTS.length} caught`);
process.exit(caught === MUTANTS.length && after.fails.size === 0 ? 0 : 1);
