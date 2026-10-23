#!/usr/bin/env node
/**
 * Mutation proof for 0024_feedback_inbox_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0024.mjs
 *
 * Each mutant rewrites ONE clause of 0024 in the PERMISSIVE direction (the
 * admin check on answering and on reading answers, the sender scope of
 * my_feedback, a client read grant on the answers table, the send-back
 * condition, the daily access-request dedupe), re-pastes the rewritten file,
 * runs the test and requires the named check(s) to turn FAIL. Then it re-pastes the ORIGINAL text, read
 * once at start into memory (never git checkout), and confirms the test is
 * green again before the next mutant.
 *
 * Prints one line per mutant and `mutants 0024: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0024_feedback_inbox.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0024_feedback_inbox_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const TMP = mkdtempSync(path.join(tmpdir(), 'mut0024-'));

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
  ['anyone signed in may answer feedback',
    "  if not public.is_admin() then\n    raise exception 'Only an admin can answer feedback'",
    "  if not true then\n    raise exception 'Only an admin can answer feedback'", [7]],
  ['anyone signed in may read the answers in the inbox',
    "  if not public.is_admin() then\n    raise exception 'Only an admin can read the inbox'",
    "  if not true then\n    raise exception 'Only an admin can read the inbox'", [14]],
  ['my_feedback widened to every report',
    'where f.member_id = auth.uid()', 'where true', [12]],
  ['a client read grant on the answers table',
    'revoke all on table public.feedback_replies from public, anon, authenticated;',
    'revoke all on table public.feedback_replies from public, anon, authenticated;\ngrant select on public.feedback_replies to authenticated;\ncreate policy zz_mut on public.feedback_replies for select to authenticated using (true);', [13]],
  ['every decision on a pending sign-out notifies, not only a send-back',
    "if not (old.status = 'pending' and new.status = 'returned') then return new; end if;",
    "if not (old.status = 'pending') then return new; end if;", [3]],
  ['the daily access-request dedupe dropped',
    "where o.kind = 'access_request' and o.subject = v_subject and o.created_at > now() - interval '1 day') then",
    "where false) then", [6]],
]

const base = runTest()
if (base.errored || base.fails.size || base.rows === 0) {
  console.log(`baseline not green: ${base.rows} rows, fails ${[...base.fails].join(',') || 'none'}`)
  process.exit(1)
}
let caught = 0
for (const [name, find, replace, want] of MUTANTS) {
  if (!ORIGINAL.includes(find)) { console.log(`MISSING  ${name}: the find text is not in 0024`); continue }
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
console.log(`mutants 0024: ${caught}/${MUTANTS.length} caught`)
process.exit(caught === MUTANTS.length ? 0 : 1)
