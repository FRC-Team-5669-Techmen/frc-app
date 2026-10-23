#!/usr/bin/env node
/**
 * Mutation proof for 0030_scouting_shifts_super_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0030.mjs
 *
 * Each mutant rewrites ONE clause of 0030 in the PERMISSIVE direction (a super
 * note with counts, the rating range, null, an unknown key, super ratings on a
 * data scout's sheet, an empty sheet, any role, a super assignment without its
 * own team, an alliance on a plain assignment, the manager gate on the now
 * match, the access gate on reading it, the table grant, the zero clamp),
 * re-pastes the rewritten file, runs the test and requires the named check(s)
 * to turn FAIL. Then it re-pastes the ORIGINAL text, read once at start into
 * memory (never git checkout), and confirms the test is green again.
 *
 * Prints one line per mutant and `mutants 0030: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0030_scouting_shifts_super.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0030_scouting_shifts_super_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0030-'));

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
  ['a super note may carry counts or answers', "   if p_payload ? 'match' or exists(select 1 from jsonb_object_keys(p_payload->'answers')) then", "   if false then", [2]],
  ['the super rating range widened', "if jsonb_typeof(v)<>'number' or s !~ '^[1-5]$' then raise exception using errcode='22023',message='A super-scout rating", "if jsonb_typeof(v)<>'number' or s !~ '^[0-9]$' then raise exception using errcode='22023',message='A super-scout rating", [3]],
  ['null skipped as if judged', "  if jsonb_typeof(v)='null' then raise exception using errcode='22023',message='Leave a rating out when it was not judged; null is not an answer.'; end if;", "  continue when jsonb_typeof(v)='null';", [4]],
  ['an unknown super field accepted', "   raise exception using errcode='22023',message='Unknown super-scout field.';", "   null;", [5]],
  ['super ratings on a data scout sheet', "  elsif p_payload ? 'super' then\n   raise exception using errcode='22023',message='Only a super-scout note carries super-scout ratings.';\n", "", [6]],
  ['an empty super sheet accepted', " or not exists(select 1 from jsonb_object_keys(p_super))", "", [7]],
  ['any role accepted', "or p_payload->>'role' not in ('scout','super'))", "or false)", [8]],
  ['a super assignment without its own team', "\n      or not exists(select 1 from jsonb_array_elements(p_payload->'teams') x where (x #>> '{}') = p_team::text) then", " then", [12]],
  ['an alliance on a plain assignment', "  elsif p_payload ? 'alliance' or p_payload ? 'teams' then\n   raise exception using errcode='22023',message='Only a super-scout assignment names an alliance.';\n", "", [14]],
  ['any scout moves the now match', " if not scouting_private.can_manage(p_event) then raise exception using errcode='42501',message='Only scouting managers can move the current match.'; end if;", "", [19]],
  ['a parent reads the now match', " if not scouting_private.caller_access() then raise exception using errcode='42501',message='Scouting is available to approved student and staff accounts.'; end if;", "", [22]],
  ['the table opened to clients', "revoke all on table public.scouting_now from public, anon, authenticated;", "grant select, update on table public.scouting_now to authenticated; create policy mut0030 on public.scouting_now for all to authenticated using (true);", [23]],
  ['the zero clamp dropped', "greatest(0, least(999, scouting_now.match_number + p_delta))", "scouting_now.match_number + p_delta", [24]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0030`); continue }
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
console.log(`mutants 0030: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
