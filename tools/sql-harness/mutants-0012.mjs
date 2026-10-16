#!/usr/bin/env node
/**
 * Mutation proof for 0012_jobs_idea_cert_gate_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --tests none \
 *     --node tools/sql-harness/mutants-0012.mjs
 *
 * Each mutant breaks ONE rule 0012 adds, in the PERMISSIVE direction where
 * there is one (the status, expiry or email clause dropped from the holding
 * check, the admin check widened to staff, the catalog check dropped, the
 * claim gate removed, the old member_skills gate put back, a write grant
 * handed back, the carry-over mapping an ambiguous job or overriding an
 * admin), then runs the test and requires the named check(s) to turn FAIL,
 * then restores the rule from the definition it read before changing it
 * (never from git). Same mechanics as mutants-0010.mjs, plus a mutant may
 * carry several find/replace pairs.
 *
 * Prints one line per mutant and `mutants 0012: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST = path.join(REPO, 'supabase', 'migrations', '0012_jobs_idea_cert_gate_rls_test.sql');
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
const HOLDS = 'public.idea_cert_caller_holds(text)';
const SETTER = 'public.admin_set_task_cert(uuid,text)';
const CLAIM = 'public.claim_task(uuid)';
const MAP = 'public._idea_cert_map_jobs()';

const MUTANTS = [
  // 1. what counts as holding a certification
  fn('any status counts as held', HOLDS, [["and h.status = 'active'", '']], [14, 22]),
  fn('expiry ignored', HOLDS, [['and (h.expires_at is null or h.expires_at > now())', '']], [15]),
  fn('any email counts as yours', HOLDS, [['join auth.users u on h.email = lower(btrim(u.email))', 'join auth.users u on true']], [16, 17]),

  // 2. who may set a job requirement, and to what
  fn('staff, not only admins, may set a requirement', SETTER, [['if not public.is_admin() then', 'if not public.is_staff() then']], [8]),
  fn('anyone may set a requirement', SETTER, [['if not public.is_admin() then', 'if false then']], [7, 8]),
  fn('a code outside the catalog accepted', SETTER, [['and not exists (select 1 from public.idea_cert_catalog c where c.code = v_code)', 'and false']], [10]),

  // 3. the claim path
  fn('the certification gate removed', CLAIM, [['if v_code is not null and not public.idea_cert_caller_holds(v_code) then', 'if false then']], [13, 14, 15, 16, 17]),
  fn('the old member_skills gate put back beside it', CLAIM, [['  -- IDEA certification gate.',
    "  if exists (select 1 from public.task_required_skills trs where trs.task_id = p_task and not exists (select 1 from public.member_skills ms where ms.member_id = auth.uid() and ms.skill_id = trs.skill_id and ms.status = 'certified')) then\n    raise exception 'old gate';\n  end if;\n  -- IDEA certification gate."]], [18, 27]),
  fn('capacity no longer enforced', CLAIM, [['if v_count >= v_max then', 'if false then']], [20]),

  // 4. the table and function grants
  // Without an insert policy RLS still refuses with the same 42501, so the
  // grant alone shows only in the structure check; grant plus a policy is
  // the real leak and must turn check 3 red too.
  grant('authenticated may insert requirements (grant only)', 'grant insert on public.task_idea_cert_requirements to authenticated',
    'revoke insert on public.task_idea_cert_requirements from authenticated', [27]),
  grant('authenticated may insert requirements (grant and policy)', 'grant insert on public.task_idea_cert_requirements to authenticated; create policy zzt_ins on public.task_idea_cert_requirements for insert to authenticated with check (true)',
    'drop policy zzt_ins on public.task_idea_cert_requirements; revoke insert on public.task_idea_cert_requirements from authenticated', [3, 27]),
  grant('authenticated may update requirements', 'grant update on public.task_idea_cert_requirements to authenticated',
    'revoke update on public.task_idea_cert_requirements from authenticated', [4, 6, 27]),
  grant('authenticated may delete requirements', 'grant delete on public.task_idea_cert_requirements to authenticated',
    'revoke delete on public.task_idea_cert_requirements from authenticated', [5, 27]),
  grant('anon may read requirements', 'grant select on public.task_idea_cert_requirements to anon; create policy zzt_anon on public.task_idea_cert_requirements for select to anon using (true)',
    'drop policy zzt_anon on public.task_idea_cert_requirements; revoke select on public.task_idea_cert_requirements from anon', [2]),
  grant('the read policy broken shut', 'alter policy "task_idea_cert_requirements read" on public.task_idea_cert_requirements using (false)',
    'alter policy "task_idea_cert_requirements read" on public.task_idea_cert_requirements using (true)', [1]),
  grant('anon may call idea_cert_caller_holds', 'grant execute on function public.idea_cert_caller_holds(text) to anon',
    'revoke execute on function public.idea_cert_caller_holds(text) from anon', [23]),
  grant('clients may run the carry-over', 'grant execute on function public._idea_cert_map_jobs() to authenticated',
    'revoke execute on function public._idea_cert_map_jobs() from authenticated', [24]),

  // 5. the carry-over
  fn('an ambiguous skill mapped anyway', MAP, [['bool_and(n_codes = 1)', 'bool_and(n_codes >= 1)']], [25]),
  fn('the carry-over overrides decided jobs', MAP, [
    ['     where not exists (select 1 from public.task_idea_cert_requirements r where r.task_id = trs.task_id)', '     where true'],
    ['on conflict (task_id) do nothing', 'on conflict (task_id) do update set code = excluded.code, source = excluded.source'],
  ], [25, 26]),
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) {
  console.log('mutants 0012: baseline is not green, nothing to measure');
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
console.log(`mutants 0012: ${caught}/${MUTANTS.length} caught`);
process.exit(allGood ? 0 : 1);
