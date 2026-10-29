#!/usr/bin/env node
/**
 * Mutation proof for 0042_scouting_pick_board_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0042.mjs
 *
 * Each mutant rewrites ONE clause of 0042 in the PERMISSIVE direction, re-pastes
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
const MIG = path.join(REPO, 'supabase', 'migrations', '0042_scouting_pick_board.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0042_scouting_pick_board_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0042-'));

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
  ["any scout changes the board", "if not scouting_private.can_manage(p_event) then", "if not scouting_private.caller_access() then", [2, 13]],
  ["a parent-only account reads the board", " if not scouting_private.caller_access() then raise exception using errcode='42501',message='Scouting is available to approved student and staff accounts.'; end if;", "", [6]],
  ["the table opened to clients", "revoke all on table public.scouting_pick_board from public, anon, authenticated;", "grant select, update on table public.scouting_pick_board to authenticated;\ndrop policy if exists pk_open on public.scouting_pick_board;\ncreate policy pk_open on public.scouting_pick_board for all to authenticated using (true) with check (true);", [23]],
  ["no selection version guard", "  if p_expected is null or p_expected <> cur then raise exception using errcode='40001',message='Someone else changed the selection. Reload it, then record the pick again.'; end if;", "", [11, 15]],
  ["any flag accepted", "   if p_value ? 'flag' and jsonb_typeof(p_value->'flag') <> 'null' and coalesce(p_value->>'flag','') not in ('must','avoid') then raise exception using errcode='22023',message='The flag is must or avoid.'; end if;", "", [7]],
  ["an override carries any key", "   if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('flag','bump','note')) then raise exception using errcode='22023',message='An override has flag, bump and note only.'; end if;", "", [8]],
  ["log entries not checked", "  if exists(select 1 from jsonb_array_elements(p_value->'log') a where jsonb_typeof(a) <> 'object' or coalesce(a->>'type','') not in ('pick','decline') or coalesce(jsonb_typeof(a->'team'),'missing') not in ('number','string')) then raise exception using errcode='22023',message='Each selection entry is a pick or a decline of one team.'; end if;", "", [14]],
  ["no size limit", " if p_value is not null and octet_length(p_value::text) > 400000 then raise exception using errcode='22023',message='That is too much data for the pick board.'; end if;", "", [22]],
  ["any event kind", "kind in ('competition','training')) then raise exception using errcode='22023',message='Choose a competition or training event.'; end if;", "kind is not null) then raise exception using errcode='22023',message='Choose a competition or training event.'; end if;", [21]],
  ["any setting accepted", "  if exists(select 1 from jsonb_object_keys(p_value) k where k not in ('event_key','our_team','rounds','alliances','want_defense')) then raise exception using errcode='22023',message='Unknown pick board setting.'; end if;", "", [19]],
]

const base = runTest()
if (process.env.SHOW) console.log(spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' }).stdout)
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0042`); continue }
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
console.log(`mutants 0042: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
