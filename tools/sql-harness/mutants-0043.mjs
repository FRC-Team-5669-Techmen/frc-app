#!/usr/bin/env node
/**
 * Mutation proof for 0043_my_schedule_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0043.mjs
 *
 * Each mutant rewrites ONE clause of 0043 in the PERMISSIVE direction, re-pastes
 * the file, runs the test and requires the named check(s) to turn FAIL; then it
 * re-pastes the ORIGINAL text (read once into memory, never git checkout) and
 * confirms the test is green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0042: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0043_my_schedule.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0043_my_schedule_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0043-'));

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
  return { fails, rows, errored: r.status !== 0 || /ERROR:/.test(r.stderr || '') }
}

// [name, find, replace, checks that must FAIL]
const MUTANTS = [
  ["every student reads every seat", "where i.student_id = auth.uid() and d.day_date", "where true and d.day_date", [2]],
  ["backups are reminded too", "where q.status = 'assigned' and", "where q.status in ('assigned','backup') and", [8]],
  ["no dedupe on stations", "    insert into public.schedule_reminders_sent(key) values ('role:' || r.slot_id || ':' || r.member_id) on conflict do nothing;\n    if not found then continue; end if;", "    insert into public.schedule_reminders_sent(key) values ('role:' || r.slot_id || ':' || r.member_id || ':' || clock_timestamp()) on conflict do nothing;", [10]],
  ["a 60-minute station window", "s.starts_at <= p_now + interval '10 minutes'", "s.starts_at <= p_now + interval '60 minutes'", [6]],
  ["cars that left are reminded", " and c.left_at is null\n", "\n", [13]],
  ["clients may run the reminders", "revoke all on function public.schedule_reminders_run(timestamptz) from public, anon, authenticated;", "grant execute on function public.schedule_reminders_run(timestamptz) to authenticated;", [14]],
  ["the ledger readable and writable", "revoke all on table public.schedule_reminders_sent from public, anon, authenticated;", "grant select, insert on table public.schedule_reminders_sent to authenticated;\ndrop policy if exists open43 on public.schedule_reminders_sent;\ncreate policy open43 on public.schedule_reminders_sent for all to authenticated using (true) with check (true);", [15]],
  ["no date range limit", " or p_to - p_from > 14 then", " then", [5]],
]

const base = runTest()
if (process.env.SHOW) console.log(spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' }).stdout)
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0043`); continue }
  // A grant mutant needs the revoke to stay first, so the whole file is
  // re-pasted with the one change; anon loses the grant again on restore.
  paste(ORIGINAL.replace(find, () => replace)) // a function: a $' in the replacement must stay literal
  const r = runTest()
  // A test that stops with an error under a mutant has not passed it: count it caught, and say so.
  const hit = want.every((n) => r.fails.has(n)) || (r.errored && r.rows < base.rows)
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0043: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
