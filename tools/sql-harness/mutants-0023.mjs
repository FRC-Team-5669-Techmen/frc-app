#!/usr/bin/env node
/**
 * Mutation proof for 0023_family_link_recovery_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0023.mjs
 *
 * Each mutant rewrites ONE clause of 0023 in the PERMISSIVE direction (the
 * staff check to true, the email-on-family check dropped, the family token
 * scope widened to every student, the hourly dedupe dropped, anon handed
 * Send link), re-pastes the rewritten file, runs the test and requires the
 * named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0023: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0023_family_link_recovery.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0023_family_link_recovery_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0023-'));

function paste(text) {
  const f = path.join(TMP, 'm.sql');
  writeFileSync(f, text);
  execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

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
  return { fails, rows, errored: r.status !== 0 }
}

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  ['Send link open to every signed-in member (staff check to true)',
    "  if not public.is_staff() then\n    raise exception using errcode = '42501', message = 'hub:not_allowed'",
    "  if not true then\n    raise exception using errcode = '42501', message = 'hub:not_allowed'", [3]],
  ['any email accepted, on the family or not',
    'if not (v_email = any(i.emails)) then', 'if false then', [5]],
  ['the family token scope widened to every student on the trip',
    'where i.student_id = v_student and now() < public._hub_event_end(e.id)), \'[]\'::jsonb);',
    'where now() < public._hub_event_end(e.id)), \'[]\'::jsonb);', [13, 14]],
  ['the hourly dedupe dropped (a fresh key every call)',
    "to_char(now() at time zone 'UTC', 'YYYYMMDDHH24');", "gen_random_uuid()::text;", [2, 18]],
  ['anon handed Send link',
    'grant execute on function public.staff_send_trip_link(uuid, text, uuid, text) to authenticated;',
    'grant execute on function public.staff_send_trip_link(uuid, text, uuid, text) to anon, authenticated;', [22]],
  ['the over-event refusal dropped on the family button',
    "  if now() >= public._hub_event_end(i.event_id) then\n    perform public._hub_refuse('event_over', 'This event is over.');\n  end if;\n  if cardinality(i.emails) = 0 then",
    "  if cardinality(i.emails) = 0 then", [19]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0023`); continue }
  // A grant mutant needs the revoke to stay first, so the whole file is
  // re-pasted with the one change; anon loses the grant again on restore.
  paste(ORIGINAL.replace(find, replace))
  const r = runTest()
  const hit = want.every((n) => r.fails.has(n))
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0023: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
