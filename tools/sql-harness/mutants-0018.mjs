#!/usr/bin/env node
/**
 * Mutation proof for 0018_connector_rls_test.sql, run by
 * tools/sql-harness/run.mjs --node against its live server:
 *
 *   node tools/sql-harness/run.mjs --migrations 0002,0018 --tests none \
 *     --node tools/sql-harness/mutants-0018.mjs
 *
 * Each mutant widens ONE boundary 0018 sets, in the PERMISSIVE direction, by
 * applying a copy of 0018_connector.sql with one text replacement (or one
 * extra statement), runs the test, requires the named check(s) to turn FAIL,
 * then restores by re-applying the unmodified file read from disk at start.
 * The file on disk is never written.
 *
 * Prints one line per mutant and `mutants 0018: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0018_connector.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0018_connector_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const ORIGINAL = readFileSync(MIG, 'utf8');
const tmp = mkdtempSync(path.join(tmpdir(), 'mut0018-'));

function applyText(text) {
  const f = path.join(tmp, `m-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(f, text);
  // The self-check at the end of 0018 would refuse some mutants (a grant to a
  // client role); a mutant is applied without it.
  execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const withoutSelfCheck = (t) => t.slice(0, t.indexOf('-- ── 8. Self-check'));
const sql = (q) => execFileSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' });

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

const ALLOW = 'and exists (select 1 from public.connector_settings s where s.id and s.allowed_member = auth.uid())';
const ADMIN = "and coalesce(public.is_admin(), false);\n$fn$;\nrevoke all on function public.connector_may_connect()";
const MUTANTS = [
  ['the allowlist clause dropped from connector_may_connect', [[ALLOW, '']], [4, 7]],
  ['the admin clause dropped from connector_may_connect', [[ADMIN, "and true;\n$fn$;\nrevoke all on function public.connector_may_connect()"]], [7]],
  ['connector_call lets anyone through', [["if not coalesce(public.connector_may_connect(), false) then\n    execute v_sql", "if false then\n    execute v_sql"],
    ["  if not public.connector_may_connect() then\n    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';\n  end if;\nend;\n$fn$;\nrevoke all on function public._connector_guard()", "end;\n$fn$;\nrevoke all on function public._connector_guard()"]], [11]],
  ['the transaction marker no longer required', [["  if not public._connector_marker_ok() then\n    raise exception 'This is only reachable", "  if false then\n    raise exception 'This is only reachable"]], [16]],
  ['the connector tables opened to clients', null, [3], 'grant select on public.connector_audit to authenticated; create policy zz_mut on public.connector_audit for select to authenticated using (true); grant update on public.connector_settings to authenticated; create policy zz_mut on public.connector_settings for update to authenticated using (true)'],
  ['the admin state readable by anyone', [["as $fn$\ndeclare s public.connector_settings;\nbegin\n  if auth.uid() is null or not public.is_admin() then", "as $fn$\ndeclare s public.connector_settings;\nbegin\n  if false then"]], [19]],
  ['the switch flippable by anyone', [["as $fn$\nbegin\n  if auth.uid() is null or not public.is_admin() then\n    raise exception 'Not found.' using errcode = '42501';\n  end if;\n  if p_enabled is null", "as $fn$\nbegin\n  if p_enabled is null"]], [20]],
  ['a preview commits', [["if p_mode = 'preview' then\n    execute v_sql", "if false then\n    execute v_sql"]], [13]],
  ['derived repeats no longer matched', [["if v_prior.id is not null then\n      return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result, 'rows', v_prior.rows_written);\n    end if;\n  else", "if false then\n      return null;\n    end if;\n  else"]], [15]],
  ['an app service call open to any member', [["declare v jsonb;\nbegin\n  if not public.connector_may_connect() then", "declare v jsonb;\nbegin\n  if false then"],
    ["  if not public.connector_may_connect() then\n    raise exception 'The Techmen connector is for its one approved account.' using errcode = '42501';\n  end if;\nend;\n$fn$;\nrevoke all on function public._connector_guard()", "end;\n$fn$;\nrevoke all on function public._connector_guard()"]], [22]],
  ['anon granted the admin state', null, [23], 'grant execute on function public.connector_admin_state() to anon'],
  ['connector_may_connect broken shut', [[ALLOW, 'and false']], [5, 9, 13, 14, 15, 17, 22]],
];

const UNDO_SQL = {
  'the connector tables opened to clients': 'drop policy if exists zz_mut on public.connector_audit; drop policy if exists zz_mut on public.connector_settings; revoke select on public.connector_audit from authenticated; revoke update on public.connector_settings from authenticated',
  'anon granted the admin state': 'revoke execute on function public.connector_admin_state() from anon',
};

const base = runTest();
if (base.errored || base.fails.size) {
  console.log(`mutants 0018: the unmutated test is not green (${[...base.fails].join(',')}) ${base.err}`);
  process.exit(1);
}
let caught = 0;
for (const [name, replacements, expect, extraSql] of MUTANTS) {
  let text = withoutSelfCheck(ORIGINAL);
  let applied = true;
  for (const [find, repl] of replacements ?? []) {
    if (!text.includes(find)) { console.log(`MUTANT TEXT NOT FOUND: ${name}: ${find.slice(0, 60)}`); applied = false; break; }
    text = text.split(find).join(repl);
  }
  if (!applied) continue;
  if (replacements) applyText(text);
  if (extraSql) sql(extraSql);
  const r = runTest();
  const hit = expect.every((n) => r.fails.has(n));
  if (hit) caught += 1;
  console.log(`${hit ? 'caught' : 'MISSED'}  ${name}: expected ${expect.join(',')} to fail, failed ${[...r.fails].sort((a, b) => a - b).join(',') || 'none'}${r.errored ? ` (errored: ${r.err})` : ''}`);
  if (UNDO_SQL[name]) sql(UNDO_SQL[name]);
  applyText(ORIGINAL);
}
const after = runTest();
console.log(`restored: ${after.rows} checks, ${after.fails.size} failing`);
console.log(`mutants 0018: ${caught}/${MUTANTS.length} caught`);
process.exit(caught === MUTANTS.length && after.fails.size === 0 ? 0 : 1);
