#!/usr/bin/env node
/**
 * Mutation proof for 0017_families_and_records_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0001,0004,0005,0006,0007,0008,0009,0010,0011,0013,0014,0015,0016,0017 --tests none \
 *     --node tools/sql-harness/mutants-0017.mjs
 *
 * Each mutant widens ONE rule 0017 adds (who reads and writes emergency
 * information, the checklist steps, the shop gate, the driver-document
 * folder, view log, delete and storage read, the no-photo list, status
 * reports, publishing, the deadline proposal, the family link), runs the
 * test, requires the named check(s) to turn FAIL, then restores from the
 * definition it read first (never git).
 *
 * Prints one line per mutant and `mutants 0017: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0017_families_and_records_rls_test.sql');
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

const fn = (name, sig, pairs, expect) => ({ name, kind: 'fn', sig, pairs, expect });
const grant = (name, apply, restore, expect) => ({ name, kind: 'sql', apply, restore, expect });

const MUTANTS = [
  grant('emergency information readable by everyone', 'alter policy "medical read staff parent" on public.member_medical using (true)',
    'alter policy "medical read staff parent" on public.member_medical using (public.is_staff() or exists (select 1 from public.guardian_links g where g.parent_id = auth.uid() and g.student_id = member_id))', [3]),
  fn('anyone saves emergency information', 'public.save_medical(uuid,jsonb)', [['if not (public.is_staff() or exists', 'if false and not (public.is_staff() or exists']], [3]),
  fn('one contact is enough', 'public._save_medical(uuid,jsonb,uuid,text)',
    [["or nullif(btrim(coalesce(p ->> 'contact2_name', '')), '') is null or nullif(btrim(coalesce(p ->> 'contact2_phone', '')), '') is null then", 'then']], [4]),
  fn('a student ticks a mentor step', 'public.mark_onboarding(uuid,text,boolean,text)', [['if not public.is_staff() then raise exception', 'if false then raise exception']], [7]),
  fn('a student ticks another student', 'public.mark_onboarding(uuid,text,boolean,text)', [['elsif not (p_member = auth.uid() or public.is_staff()) then', 'elsif false then']], [7]),
  fn('shop tools always allowed', 'public.shop_tools_allowed(uuid)', [["return (public._onboarding_json(m) ->> 'done')::boolean;", 'return true;']], [8]),
  fn('upload under anyone folder', 'public.register_driver_document(text,text,text)', [["if split_part(p_path, '/', 1) <> auth.uid()::text then", 'if false then']], [9]),
  fn('staff open files without logging a view', 'public._driver_doc_readable(text)',
    [["and w.viewer_id = auth.uid() and w.viewed_at > now() - interval '2 minutes'", ''], ['join public.driver_document_views w on w.doc_id = d.id', 'left join public.driver_document_views w on w.doc_id = d.id']], [10]),
  fn('anyone deletes a document', 'public.delete_driver_document(uuid)', [['if v.owner_id <> auth.uid() and not public.is_staff() then', 'if false then']], [11]),
  grant('driver documents readable by everyone', 'alter policy "driver docs read owner staff" on public.driver_documents using (true)',
    'alter policy "driver docs read owner staff" on public.driver_documents using (owner_id = auth.uid() or public.is_staff())', [9]),
  fn('anyone sets the no-photo flag', 'public.staff_set_media_exception(uuid,boolean,text)', [['if not public.is_staff() then', 'if false then']], [12]),
  grant('the no-photo list readable by everyone', 'alter policy "media exceptions read" on public.media_exceptions using (true)',
    'alter policy "media exceptions read" on public.media_exceptions using (public.is_staff() or public._on_media_subteam() or member_id = auth.uid())', [12]),
  fn('anyone posts a sub-team status', 'public.set_subteam_status(text,text,text)', [["if not (public.is_staff() or public.has_role('lead')) then", 'if false then']], [13]),
  fn('any staff publishes the handbook', 'public.publish_handbook_version(text,text,boolean,boolean)', [['if not public.is_admin() then', 'if false then']], [14]),
  fn('changes take effect at once', 'public.publish_handbook_version(text,text,boolean,boolean)', [["case when p_safety then now() else now() + interval '7 days' end", 'now()']], [14]),
  fn('an overdue checklist proposes nothing', 'public.onboarding_deadline_check()', [["if not (o ->> 'done')::boolean and (o ->> 'due')::date < public._la_today()", "if false and (o ->> 'due')::date < public._la_today()"]], [15]),
  fn('replacing a link keeps the old one', 'public.staff_send_family_link(uuid,boolean)', [['if p_rotate then', 'if false then']], [18]),
  fn('anyone sends a family link', 'public.staff_send_family_link(uuid,boolean)', [['if not public.is_staff() then', 'if false then']], [19]),
  grant('anon reads emergency information', 'grant select on public.member_medical to anon; create policy zz_a on public.member_medical for select to anon using (true)',
    'drop policy zz_a on public.member_medical; revoke select on public.member_medical from anon', [17]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0017: baseline is not green, nothing to measure');
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
    let next = def;
    for (const [find, replace] of m.pairs) {
      if (!next.includes(find)) {
        console.log(`ABORT mutant "${m.name}": fragment not found in ${m.sig}: ${find}`);
        process.exit(1);
      }
      next = next.replace(find, replace);
    }
    const write = (text) => { execFileSync(PSQL, [...base, '-f', '-'], { input: text + '\n;', encoding: 'utf8' }); };
    write(next);
    restore = () => write(def);
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
const allGood = caught === MUTANTS.length && after.fails.size === 0 && !after.errored && after.rows === baseline.rows;
console.log(`mutants 0017: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
