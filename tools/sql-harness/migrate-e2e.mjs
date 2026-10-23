#!/usr/bin/env node
/**
 * tools/apply-migration.mjs, end to end, against the harness database.
 *
 *   node tools/sql-harness/run.mjs --migrations 0001-0026 --tests none \
 *     --node tools/sql-harness/migrate-e2e.mjs
 *
 * The harness has pasted 0001 to 0026 the way Mr. Pina did (by psql, with no
 * record anywhere), which is the live database's state on 2026-10-23. This
 * then drives the real tool, as a child process, through the connection
 * string the workflow would hand it:
 *
 *   1. --dry-run writes nothing (the record table is still absent after it)
 *      and names 0027 and 0028 as pending, and nothing at or below 0026
 *   2. a real run creates the record, writes the 26 baseline rows, applies
 *      0027 and 0028 for real (their objects appear in the catalog) and
 *      records both
 *   3. a second real run applies nothing and changes no row
 *   4. stop-at-first-failure: a directory holding a migration that raises
 *      (after creating a table) and one after it; the run exits 1, the table
 *      is rolled back, neither is recorded, and the one after it never ran
 *      (with the raise removed, plus a file carrying its own begin/commit,
 *      all three apply and are recorded: the positive control)
 *   5. the record schema is not reachable by `authenticated` or `anon`,
 *      against `postgres` which can (the positive control)
 *   6. the password in the connection string appears in no output, against a
 *      run that prints a message carrying the database name (positive control
 *      that output is captured at all)
 *
 * Prints one line per check and `migrate e2e: N/T checks passed`; exits 1 on
 * any failure.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const TOOL = path.join(REPO, 'tools', 'apply-migration.mjs');
const { PGHOST, PGPORT, PGDATABASE, PGUSER, PSQL } = process.env;
if (!PGHOST) { console.error('run me through tools/sql-harness/run.mjs --node'); process.exit(1); }

const PASSWORD = 'e2e-Pa55word-never-printed';
const urlFor = (db) => `postgresql://${PGUSER}:${PASSWORD}@localhost/${db}?host=${encodeURIComponent(PGHOST)}&port=${PGPORT}`;
const URL_OK = urlFor(PGDATABASE);

function tool(args, url = URL_OK) {
  const r = spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_MIGRATE_DB_URL: url, GITHUB_STEP_SUMMARY: '' },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}
function q(sql) {
  return execFileSync(PSQL, ['-X', '-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', PGDATABASE, '-A', '-t', '-c', sql], { encoding: 'utf8' }).trim();
}
const recorded = () => (q("select to_regclass('supabase_migrations.schema_migrations') is not null") === 't'
  ? q('select string_agg(version, \',\' order by version) from supabase_migrations.schema_migrations') : '(no table)');

let pass = 0; let total = 0; const outputs = [];
function check(name, ok, detail = '') {
  total += 1; if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? ` -- ${detail}` : ''}`);
}
const baseline = Array.from({ length: 26 }, (_, i) => String(i + 1).padStart(4, '0'));

// 0. the starting state: 0027 and 0028 objects absent, no record
check('start: no record table', recorded() === '(no table)', recorded());
check('start: 0027 not applied (scouting_match_fields absent)', q("select count(*) from pg_proc where proname = 'scouting_match_fields'") === '0');
check('start: 0028 not applied (role_slots absent)', q("select to_regclass('public.role_slots') is null") === 't');
check('start, positive control: 0026 is applied (batteries exists)', q("select to_regclass('public.batteries') is not null") === 't');

// 1. dry run
const dry = tool(['--dry-run']); outputs.push(dry.out);
check('dry run exits 0', dry.code === 0, dry.out);
check('dry run names 0027 then 0028', /0027_scouting_match_fields\.sql[\s\S]*0028_role_interest_board\.sql/.test(dry.out), dry.out);
check('dry run names nothing at or below 0026', !/supabase\/migrations\/00(0\d|1\d|2[0-6])_/.test(dry.out), dry.out);
check('dry run wrote nothing (still no record table)', recorded() === '(no table)', recorded());

// 2. real run
const run1 = tool([]); outputs.push(run1.out);
check('run 1 exits 0', run1.code === 0, run1.out);
check('run 1 created the record and wrote 26 baseline rows', /created supabase_migrations\.schema_migrations/.test(run1.out) && /recorded 26 baseline/.test(run1.out), run1.out);
check('run 1 applied 0027 and 0028, in that order', /applied supabase\/migrations\/0027[^\n]*\n[\s\S]*applied supabase\/migrations\/0028/.test(run1.out), run1.out);
check('record now holds exactly 0001..0028', recorded() === [...baseline, '0027', '0028'].join(','), recorded());
check('0027 objects exist (scouting_match_fields, validate_match)', q("select count(*) from pg_proc where proname in ('scouting_match_fields','validate_match')") === '2');
check('0028 objects exist (role_slots, role_requests, role_board)', q("select (to_regclass('public.role_slots') is not null and to_regclass('public.role_requests') is not null and exists (select 1 from pg_proc where proname = 'role_board'))::text") === 'true');
check('names recorded from the filename', q("select name from supabase_migrations.schema_migrations where version = '0028'") === 'role_interest_board');

// 3. second run
const before = q('select count(*) from supabase_migrations.schema_migrations');
const run2 = tool([]); outputs.push(run2.out);
check('run 2 exits 0', run2.code === 0, run2.out);
check('run 2 applied nothing', /nothing to apply/.test(run2.out) && !/applied supabase/.test(run2.out) && !/recorded \d+ baseline/.test(run2.out), run2.out);
check('run 2 changed no row (28)', q('select count(*) from supabase_migrations.schema_migrations') === before && before === '28', before);

// 4. stop at the first failure
const dir = mkdtempSync(path.join(tmpdir(), 'frc-migrate-e2e-'));
try {
  writeFileSync(path.join(dir, '0029_raises.sql'), "create table public.e2e_should_roll_back (id int);\ndo $chk$ begin raise exception 'e2e self-check says no'; end $chk$;\n");
  writeFileSync(path.join(dir, '0029_raises_rls_test.sql'), 'select 1/0;\n');
  writeFileSync(path.join(dir, '0030_never.sql'), 'create table public.e2e_never_ran (id int);\n');
  const dryBad = tool(['--dry-run', '--dir', dir]); outputs.push(dryBad.out);
  check('failure dir, dry run: lists 0029 and 0030, not the _rls_test file', /0029_raises\.sql[\s\S]*0030_never\.sql/.test(dryBad.out) && !/rls_test/.test(dryBad.out), dryBad.out);
  const bad = tool(['--dir', dir]); outputs.push(bad.out);
  check('failing run exits 1', bad.code === 1, bad.out);
  check('failing run names the failure and what was not attempted', /FAILED supabase\/migrations\/0029_raises\.sql: e2e self-check says no/.test(bad.out) && /Not attempted: 0030/.test(bad.out), bad.out);
  check('the failing file was rolled back (its table is absent)', q("select to_regclass('public.e2e_should_roll_back') is null") === 't');
  check('the file after it never ran (its table is absent)', q("select to_regclass('public.e2e_never_ran') is null") === 't');
  check('neither was recorded (still 28 rows, through 0028)', q('select count(*) || \':\' || max(version) from supabase_migrations.schema_migrations') === '28:0028');
  // positive control for the rollback check: the same directory without the
  // raise applies both and records both, so "absent" above is not vacuous
  writeFileSync(path.join(dir, '0029_raises.sql'), 'create table public.e2e_should_roll_back (id int);\n');
  // and a file that opens its own transaction, as 0002 does, goes unwrapped
  writeFileSync(path.join(dir, '0031_own_transaction.sql'), '-- begin; in a comment is not a statement\nbegin;\ncreate table public.e2e_own_txn (id int);\ncommit;\n');
  const good = tool(['--dir', dir]); outputs.push(good.out);
  check('positive control: fixed, both apply and are recorded', good.code === 0
    && q("select (to_regclass('public.e2e_should_roll_back') is not null and to_regclass('public.e2e_never_ran') is not null)::text") === 'true'
    && q("select count(*) from supabase_migrations.schema_migrations where version in ('0029','0030')") === '2', good.out);
  check('a file with its own begin/commit is sent unwrapped, applied and recorded', /applied supabase\/migrations\/0031_own_transaction\.sql and recorded 0031[^\n]*unwrapped/.test(good.out)
    && q("select to_regclass('public.e2e_own_txn') is not null") === 't'
    && q("select count(*) from supabase_migrations.schema_migrations where version = '0031'") === '1', good.out);
} finally {
  rmSync(dir, { recursive: true, force: true });
  q('drop table if exists public.e2e_should_roll_back; drop table if exists public.e2e_never_ran; drop table if exists public.e2e_own_txn');
  q("delete from supabase_migrations.schema_migrations where version in ('0029','0030','0031')");
}

// 5. the record is not reachable by client roles
check('authenticated has no USAGE on schema supabase_migrations', q("select has_schema_privilege('authenticated','supabase_migrations','USAGE')") === 'f');
check('anon has no USAGE on schema supabase_migrations', q("select has_schema_privilege('anon','supabase_migrations','USAGE')") === 'f');
check('positive control: postgres has USAGE', q("select has_schema_privilege('postgres','supabase_migrations','USAGE')") === 't');

// 6. the password is never printed
const missing = tool(['--dry-run'], urlFor('no_such_db_e2e')); outputs.push(missing.out);
check('positive control: a bad database name is reported (output is captured)', missing.code === 1 && /no_such_db_e2e/.test(missing.out), missing.out);
check(`the password appears in none of ${outputs.length} outputs`, outputs.every((o) => !o.includes(PASSWORD)));

console.log(`migrate e2e: ${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
