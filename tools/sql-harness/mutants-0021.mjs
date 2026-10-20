#!/usr/bin/env node
/**
 * Mutation proof for 0021_connector_deleted_rows_rls_test.sql:
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/sql-harness/mutants-0021.mjs
 *
 * Each mutant undoes one part of 0021 (the capture dropped from the roster
 * table, the capture taking every delete, not only the connector ones, the
 * rows read put back to the 0018 body that never saw a delete), runs the
 * test, requires the named checks to turn FAIL, and restores by pasting 0021
 * again. Prints `mutants 0021: N/N caught`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIG = path.join(REPO, 'supabase', 'migrations', '0021_connector_deleted_rows.sql');
const TEST = path.join(REPO, 'supabase', 'migrations', '0021_connector_deleted_rows_rls_test.sql');
const PSQL = process.env.PSQL || 'psql';
const base = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'];
const sql = (q) => execFileSync(PSQL, [...base, '-c', q], { encoding: 'utf8' }).trim();
const restore = () => execFileSync(PSQL, [...base, '-f', MIG], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// The 0018 body of _connector_rows_written, read out of 0018 itself.
const m18 = readFileSync(path.join(REPO, 'supabase', 'migrations', '0018_connector.sql'), 'utf8');
const start = m18.indexOf('create or replace function public._connector_rows_written');
const old18 = m18.slice(start, m18.indexOf('$fn$;', start) + 5);

function runTest() {
  const r = spawnSync(PSQL, ['-X', '-A', '-F', '\t', '-P', 'footer=off', '-f', TEST], { encoding: 'utf8' });
  const fails = new Set();
  let rows = 0;
  for (const line of (r.stdout || '').split('\n')) {
    const c = line.split('\t');
    if (c.length >= 4 && /^(PASS|FAIL|SKIP)$/.test(c[2]) && c[1] !== 'SUMMARY') { rows += 1; if (c[2] === 'FAIL') fails.add(Number(c[0])); }
  }
  return { fails, rows, errored: r.status !== 0, err: (r.stderr || '').trim().split('\n').slice(-1)[0] };
}

const MUTANTS = [
  ['the capture dropped from the roster table', 'drop trigger connector_capture_delete on public.member_roles', [1, 3, 5]],
  ['every delete captured, not only the connector ones',
    `create or replace function public._connector_capture_delete() returns trigger language plpgsql security definer set search_path = public as $fn$ begin create temporary table if not exists connector_deleted_rows (marker text, tbl text, row jsonb, at bigint generated always as identity) on commit drop; insert into pg_temp.connector_deleted_rows (marker, tbl, row) values (coalesce(current_setting('techmen.connector_call', true), ''), tg_table_name, to_jsonb(old)); return old; end $fn$`, [7]],
  ['the rows read put back to 0018, blind to deletes', old18, [3, 5, 6]],
];

const baseline = runTest();
console.log(`baseline: ${baseline.rows} check rows, ${baseline.fails.size} FAIL${baseline.errored ? ` (errored: ${baseline.err})` : ''}`);
if (baseline.errored || baseline.fails.size || baseline.rows === 0) { console.log('mutants 0021: baseline is not green, nothing to measure'); process.exit(1); }
let caught = 0;
for (const [name, apply, expect] of MUTANTS) {
  sql(apply);
  const r = runTest();
  restore();
  const ok = expect.every((n) => r.fails.has(n));
  if (ok) caught += 1;
  console.log(`${ok ? 'CAUGHT' : 'MISSED'} ${name} -- FAIL rows: ${[...r.fails].sort((a, b) => a - b).join(', ') || 'none'}; want ${expect.join(', ')}${r.errored ? ` (errored: ${r.err})` : ''}`);
}
const after = runTest();
console.log(`after restoring every mutant: ${after.rows} rows, ${after.fails.size} FAIL`);
console.log(`mutants 0021: ${caught}/${MUTANTS.length} caught`);
process.exit(caught === MUTANTS.length && after.fails.size === 0 ? 0 : 1);
