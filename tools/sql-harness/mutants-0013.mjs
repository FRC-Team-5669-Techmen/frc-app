#!/usr/bin/env node
/**
 * Mutation proof for 0013_handbook_acknowledgments_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0013 --tests none \
 *     --node tools/sql-harness/mutants-0013.mjs
 *
 * Each mutant widens ONE boundary 0013 sets, in the PERMISSIVE direction
 * (the read policy to everyone, the insert check to anything, update and
 * delete handed back, the server time stamp removed, anon given a read),
 * runs the test, requires the named check(s) to turn FAIL, then restores.
 * Same mechanics as mutants-0012.mjs.
 *
 * Prints one line per mutant and `mutants 0013: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0013_handbook_acknowledgments_rls_test.sql');
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

const T = 'public.handbook_acknowledgments';
const SEL = '"hba select own staff guardian"';
const INS = '"hba insert own as held role"';
const SEL_USING = `(member_id = auth.uid() or public.is_staff() or exists (select 1 from public.guardian_links g where g.parent_id = auth.uid() and g.student_id = handbook_acknowledgments.member_id))`;
const INS_CHECK = `(member_id = auth.uid() and ((signer_role = 'student' and exists (select 1 from public.member_roles r where r.member_id = auth.uid() and r.role = 'student')) or (signer_role = 'parent' and exists (select 1 from public.member_roles r where r.member_id = auth.uid() and r.role = 'parent')) or (signer_role = 'mentor' and public.is_staff())))`;
const STAMP = `create or replace function public.handbook_ack_stamp() returns trigger language plpgsql set search_path = public as $fn$ begin %s return new; end; $fn$`;

const MUTANTS = [
  ['every member may read every signature', `alter policy ${SEL} on ${T} using (true)`, `alter policy ${SEL} on ${T} using ${SEL_USING}`, [9, 12]],
  ['the guardian clause dropped', `alter policy ${SEL} on ${T} using (member_id = auth.uid() or public.is_staff())`, `alter policy ${SEL} on ${T} using ${SEL_USING}`, [11]],
  ['anyone may insert anything', `alter policy ${INS} on ${T} with check (true)`, `alter policy ${INS} on ${T} with check ${INS_CHECK}`, [3, 4, 5]],
  ['the role clause dropped', `alter policy ${INS} on ${T} with check (member_id = auth.uid())`, `alter policy ${INS} on ${T} with check ${INS_CHECK}`, [4, 5]],
  ['update and delete handed back', `grant update, delete on ${T} to authenticated; create policy zz_mut on ${T} for all to authenticated using (true)`,
    `drop policy zz_mut on ${T}; revoke update, delete on ${T} from authenticated`, [6, 7]],
  ['the server time stamp removed', STAMP.replace('%s', 'null;'), STAMP.replace('%s', 'new.signed_at := now();'), [13]],
  ['the one-signature key dropped', `alter table ${T} drop constraint handbook_ack_once_key`, `alter table ${T} add constraint handbook_ack_once_key unique (member_id, version, signer_role)`, [1, 14]],
  ['anon may read', `grant select on ${T} to anon; create policy zz_anon on ${T} for select to anon using (true)`,
    `drop policy zz_anon on ${T}; revoke select on ${T} from anon`, [16]],
  ['the read policy broken shut', `alter policy ${SEL} on ${T} using (false)`, `alter policy ${SEL} on ${T} using ${SEL_USING}`, [8, 10, 11]],
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0013: baseline is not green, nothing to measure');
  process.exit(1);
}

let caught = 0;
for (const [name, apply, restore, expect] of MUTANTS) {
  sql(apply);
  const r = runTest();
  sql(restore);
  const ok = expect.every((n) => r.fails.has(n));
  if (ok) caught += 1;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'} ${name} -- FAIL rows: ${[...r.fails].sort((a, b) => a - b).join(', ') || 'none'}; want ${expect.join(', ')}${r.errored ? ` (errored: ${r.err})` : ''}`);
}

const after = runTest();
console.log(`after restoring every mutant: ${after.rows} rows, ${after.fails.size} FAIL`);
const allGood = caught === MUTANTS.length && after.fails.size === 0 && !after.errored && after.rows === baseline.rows;
console.log(`mutants 0013: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
