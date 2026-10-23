#!/usr/bin/env node
/**
 * Mutation proof for 0027_scouting_match_fields_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0027.mjs
 *
 * Each mutant rewrites ONE clause of 0027 in the PERMISSIVE direction (null accepted, a fractional or text count, the count range, the rating range, the choice lists, an unknown key, the object check, the pit-report guard), re-pastes the rewritten file,
 * runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0027: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0027_scouting_match_fields.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0027_scouting_match_fields_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0027-'));

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
  ['null skipped as if recorded', "  if jsonb_typeof(v)='null' then raise exception using errcode='22023',message='Leave a match field out when it was not recorded; null is not an answer.'; end if;", "  continue when jsonb_typeof(v)='null';", [4]],
  ['a count may be text or a fraction', "if jsonb_typeof(v)<>'number' or s !~ '^[0-9]{1,3}$' or s::integer>500 then", "if s::numeric>500 then", [5]],
  ['the count range dropped', "or s !~ '^[0-9]{1,3}$' or s::integer>500 then", "or s !~ '^-?[0-9]+$' then", [6]],
  ['the rating range widened', "or s !~ '^[1-5]$' then", "or s !~ '^[0-9]$' then", [7]],
  ['any word is a choice', "or s not in ('yes','no','did_not_see') then", "or false then", [8]],
  ['an unknown match field accepted', "   raise exception using errcode='22023',message='Unknown match field.';", "   null;", [9]],
  // Not a mutant: without the object check an array still fails inside
  // jsonb_each with the same 22023, so removing it changes nothing observable.
  ['a pit report may carry match fields', "when 'pit' then array['capabilities','notes','pit_location']", "when 'pit' then array['capabilities','notes','pit_location','match']", [14]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0026`); continue }
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
console.log(`mutants 0027: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
