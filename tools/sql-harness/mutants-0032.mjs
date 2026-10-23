#!/usr/bin/env node
/**
 * Mutation proof for 0032_connector_team_reads_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0032.mjs
 *
 * Each mutant rewrites ONE clause of 0032 in the PERMISSIVE direction (the
 * staff gate on the team read, an anon grant, the since window, the verified
 * filter, the parent-only mark, the accountless rows, the admin gate on the
 * bulk change, the own-account, status and reason refusals, the already-so
 * skip), re-pastes the rewritten file, runs the test and requires the named
 * check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read once at
 * start into memory (never git checkout), and confirms the test is green
 * again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0032: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0032_connector_team_reads.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0032_connector_team_reads_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0032-'));

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
  ['the team read open to any signed-in caller',
    "  if not public.is_staff() then\n    raise exception 'Only staff can read the whole team attendance.'",
    "  if false then\n    raise exception 'Only staff can read the whole team attendance.'", [3, 4]],
  ['the team read open to parents too',
    "  if not public.is_staff() then\n    raise exception 'Only staff can read the whole team attendance.'",
    "  if not (public.is_staff() or public.has_role('parent')) then\n    raise exception 'Only staff can read the whole team attendance.'", [4]],
  ['signed out handed execute on the team read',
    "revoke all on function public.team_attendance_summary(date) from public, anon;",
    "grant execute on function public.team_attendance_summary(date) to anon;", [19]],
  ['the since window dropped from check-ins',
    "count(*) filter (where v_since is not null and a.event_time >= v_since)::int as n_since",
    "count(*)::int as n_since", [7]],
  ['pending logged hours counted as verified',
    "from public.logged_hours l where l.status = 'verified' group by l.member_id",
    "from public.logged_hours l where l.status <> 'rejected' group by l.member_id", [9]],
  ['nobody marked parent-only',
    "         ('parent' = any(coalesce(r.roles, '{}'::text[]))\n           and not (coalesce(r.roles, '{}'::text[]) && array['student', 'mentor', 'lead', 'admin'])),",
    "         false,", [11]],
  ['the accountless approved emails left out',
    "   where not exists (select 1 from auth.users u2 where lower(u2.email) = ae.email);",
    "   where false;", [1, 12]],
  ['the bulk change open to any signed-in caller',
    "  if not public.is_admin() then\n    raise exception 'Only an admin can change member status.'",
    "  if false then\n    raise exception 'Only an admin can change member status.'", [14]],
  ['the bulk change open to mentors',
    "  if not public.is_admin() then\n    raise exception 'Only an admin can change member status.'",
    "  if not public.is_staff() then\n    raise exception 'Only an admin can change member status.'", [14]],
  ['the caller own account allowed',
    "  if auth.uid() = any(p_members) then",
    "  if false then", [17]],
  ['any status accepted',
    "  if p_status is null or p_status not in ('active', 'inactive', 'alumni') then",
    "  if p_status is null then", [17]],
  ['a blank reason accepted',
    "  if v_reason is null then\n    raise exception 'Give a reason for the change.'",
    "  if false then\n    raise exception 'Give a reason for the change.'", [17]],
  ['the already-so skip dropped (a log row every time)',
    "    if v_old = p_status then",
    "    if false then", [16]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0032`); continue }
  // A grant mutant needs the revoke to stay first, so the whole file is
  // re-pasted with the one change; anon loses the grant again on restore.
  paste(ORIGINAL.replace(find, () => replace)) // a function: a $' in the replacement must stay literal
  const r = runTest()
  const hit = want.every((n) => r.fails.has(n))
  if (hit) caught += 1
  console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${name}: failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'} (want ${want.join(',')})`)
  paste(ORIGINAL)
  const back = runTest()
  if (back.fails.size || back.errored) { console.log(`restore not green after "${name}"`); process.exit(1) }
}
console.log(`mutants 0032: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
