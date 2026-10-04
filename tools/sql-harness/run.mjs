#!/usr/bin/env node
/**
 * A throwaway PostgreSQL 16 with Supabase stand-ins, every frozen SQL file,
 * the numbered migrations and fictional members -- then the _rls_test.sql
 * files run against it, one PASS/FAIL row per check, read and counted.
 *
 *   node tools/sql-harness/run.mjs                      # apply everything, run every test
 *   node tools/sql-harness/run.mjs --migrations 0001,0005,0006
 *   node tools/sql-harness/run.mjs --tests supabase/migrations/0005_event_family_hub_rls_test.sql
 *   node tools/sql-harness/run.mjs --sql extra.sql      # also run a file after the tests (repeatable, comma list)
 *   node tools/sql-harness/run.mjs --keep               # leave the server up; prints how to psql into it
 *   node tools/sql-harness/run.mjs --mutate 0005:'<find>'=>'<replace>'   # see "Mutation runs" below
 *   node tools/sql-harness/run.mjs --mutant-sql "alter policy ... using (true)"  # SQL run after the migrations
 *   node tools/sql-harness/run.mjs --tests none         # apply only
 *   node tools/sql-harness/run.mjs --node tools/sql-harness/race-0005.mjs   # a script that needs the live server
 *
 * WHY IT IS COMMITTED. The 2026-10-01 bundle proved four migrations on a
 * harness exactly like this one and then left it out of the repo, so its
 * numbers can never be re-run (CLAUDE.md: "A measurement that cannot be
 * repeated is a claim about the past"). This one is kept.
 *
 * WHAT IT DOES, in order:
 *   1. initdb into a fresh temp directory and start postgres on a unix socket
 *      only (no TCP), port --port (default 54331).
 *   2. stubs.sql: the Supabase stand-ins (roles, auth.*, storage.*, stub
 *      pg_net/pg_cron, the starter profiles/attendance_events tables).
 *   3. platform_migration.sql, every supabase/*.sql that is not a test, and
 *      sql/forgotten_checkout.sql, each in its own transaction, in a FIXPOINT
 *      loop: alphabetical, and a file that fails because something it needs
 *      comes later alphabetically is retried on the next pass. The repo's git
 *      history is shallow, so the order these were pasted live is not
 *      recoverable; three frozen objects depend on it (decision 26), and a
 *      result here that touches one of them says so.
 *   4. seed.sql: fictional members with the fixture personas' ids, a season
 *      spanning today, and a current-season application for every student
 *      but Sam (c1); its header says why.
 *   5. each selected numbered migration in number order, TWICE (they promise
 *      to be re-runnable; the second paste must succeed and change nothing).
 *   6. each test file. A test is a begin ... rollback script whose final
 *      select returns rows of (n, check, result, detail); every row is read,
 *      FAIL rows are printed, and a summary line per file is printed:
 *        <file>: N PASS, M FAIL, K SKIP
 *      then one final line:
 *        sql harness: N/T checks passed across F test file(s)
 *      A test that errors outright counts as a failure of that file.
 *
 * MUTATION RUNS. `--mutate <num>:<find>=><replace>` rewrites one numbered
 * migration in memory before it is applied (the file on disk is never
 * touched, so there is nothing to restore and no `git checkout --` that could
 * discard the session's own work). Run it with the policy widened to
 * `using (true)` and the test must turn red; a mutant that stays green is a
 * hole in the test. `<find>` must occur in the file, or the run aborts.
 * `--mutant-sql <sql>` (repeatable) runs SQL after every migration is
 * applied and before the tests: the way to widen ONE policy among several
 * created by a loop, e.g.
 *   --mutant-sql 'alter policy "hub_responses staff read" on public.hub_responses using (true)'
 *
 * Requires initdb/pg_ctl/psql (PostgreSQL 16 at /usr/lib/postgresql/16/bin or
 * on PATH). Writes nothing inside the repository.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
function flags(name) {
  const out = [];
  argv.forEach((a, i) => { if (a === `--${name}` && argv[i + 1]) out.push(argv[i + 1]); });
  return out;
}

const PORT = Number(flag('port', 54331));
const KEEP = !!flag('keep', false);
const QUIET = !!flag('quiet', false);
const BIN = existsSync('/usr/lib/postgresql/16/bin/initdb') ? '/usr/lib/postgresql/16/bin' : '';
const bin = (n) => (BIN ? path.join(BIN, n) : n);
// initdb and postgres refuse to run as root. Under root (this container), the
// server-side commands run as the unprivileged `postgres` user through
// runuser, and the temp directory is handed to it; psql connects as before.
const AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
function server(cmd, args, opts = {}) {
  return AS_ROOT
    ? spawnSync('runuser', ['-u', 'postgres', '--', bin(cmd), ...args], { encoding: 'utf8', ...opts })
    : spawnSync(bin(cmd), args, { encoding: 'utf8', ...opts });
}

const MIG_DIR = path.join(REPO, 'supabase', 'migrations');
const allMigrations = readdirSync(MIG_DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith('_rls_test.sql'))
  .sort();
const migFlag = flag('migrations', 'all');
const wantedNums = migFlag === 'all' ? null
  : migFlag === 'none' ? []
  : String(migFlag).split(',').map((s) => s.trim().padStart(4, '0'));
const migrations = allMigrations.filter((f) => wantedNums == null || wantedNums.includes(f.slice(0, 4)));

const mutations = flags('mutate').map((m) => {
  const mm = m.match(/^(\d{1,4}):([\s\S]*)=>([\s\S]*)$/);
  if (!mm) throw new Error(`--mutate wants <num>:<find>=><replace>, got ${m}`);
  return { num: mm[1].padStart(4, '0'), find: mm[2], replace: mm[3] };
});

function log(...a) { if (!QUIET) console.log(...a); }

const dir = mkdtempSync(path.join(tmpdir(), 'frc-sqlh-'));
const data = path.join(dir, 'data');
const sock = dir;
const DB = 'frc';
let started = false;

function psqlArgs(extra = []) {
  return ['-X', '-h', sock, '-p', String(PORT), '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1', ...extra];
}
function runPsqlFile(file, { single = true } = {}) {
  const r = spawnSync(bin('psql'), psqlArgs([...(single ? ['--single-transaction'] : []), '-q', '-f', file]), { encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout, err: r.stderr };
}
function psqlQuery(sql) {
  return execFileSync(bin('psql'), psqlArgs(['-A', '-t', '-c', sql]), { encoding: 'utf8' }).trim();
}

// The only rewrite applied to any file: pg_cron / pg_net are stubs here
// (stubs.sql), so their create-extension statements become comments.
function prepare(file, text = readFileSync(file, 'utf8')) {
  const out = text.replace(/^[ \t]*create extension if not exists (pg_cron|pg_net)[ \t]*;/gim, '-- [sql-harness] $&');
  const tmp = path.join(dir, path.basename(file));
  writeFileSync(tmp, out);
  return tmp;
}

function stop() {
  if (!started) return;
  server('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  started = false;
}

function main() {
  if (AS_ROOT) execFileSync('chown', ['postgres:postgres', dir]);
  const init = server('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const r = server('pg_ctl', ['-D', data, '-w', '-l', path.join(dir, 'pg.log'), '-o', `-k ${sock} -p ${PORT} -c listen_addresses='' -c timezone=UTC -c fsync=off`, 'start']);
  if (r.status !== 0) throw new Error(`postgres did not start: ${r.stderr || r.stdout}\n${readFileSync(path.join(dir, 'pg.log'), 'utf8')}`);
  started = true;
  execFileSync(bin('createdb'), ['-h', sock, '-p', String(PORT), '-U', 'postgres', DB]);

  const stubs = runPsqlFile(path.join(HERE, 'stubs.sql'));
  if (!stubs.ok) throw new Error(`stubs.sql failed: ${stubs.err}`);

  // ── frozen files, fixpoint ────────────────────────────────────────────────
  const frozen = [
    path.join(REPO, 'platform_migration.sql'),
    ...readdirSync(path.join(REPO, 'supabase')).filter((f) => f.endsWith('.sql') && !f.endsWith('_rls_test.sql')).sort()
      .map((f) => path.join(REPO, 'supabase', f)),
    path.join(REPO, 'sql', 'forgotten_checkout.sql'),
  ];
  let pending = frozen.slice();
  const lastErr = new Map();
  for (let pass = 1; pending.length; pass += 1) {
    const next = [];
    for (const f of pending) {
      const res = runPsqlFile(prepare(f));
      if (!res.ok) { next.push(f); lastErr.set(f, res.err.trim().split('\n').slice(-2).join(' ')); }
    }
    if (next.length === pending.length) {
      for (const f of next) console.log(`FROZEN FILE NEVER APPLIED: ${path.relative(REPO, f)} -- ${lastErr.get(f)}`);
      throw new Error(`${next.length} frozen file(s) could not be applied`);
    }
    pending = next;
  }
  log(`frozen SQL: ${frozen.length}/${frozen.length} files applied`);

  const seed = runPsqlFile(path.join(HERE, 'seed.sql'));
  if (!seed.ok) throw new Error(`seed.sql failed: ${seed.err}`);

  // ── numbered migrations, each twice ──────────────────────────────────────
  for (const f of migrations) {
    const full = path.join(MIG_DIR, f);
    let text = readFileSync(full, 'utf8');
    for (const m of mutations.filter((x) => x.num === f.slice(0, 4))) {
      if (!text.includes(m.find)) throw new Error(`--mutate: "${m.find.slice(0, 60)}" does not occur in ${f}`);
      text = text.split(m.find).join(m.replace);
      log(`MUTANT ${f}: replaced "${m.find.slice(0, 60)}"`);
    }
    for (const round of [1, 2]) {
      const res = runPsqlFile(prepare(full, text), { single: false });
      if (!res.ok) throw new Error(`${f} failed on application ${round}: ${res.err.trim()}`);
    }
    log(`migration ${f}: applied twice`);
  }

  // ── mutants given as SQL (e.g. a policy widened to using (true)) ─────────
  for (const m of flags('mutant-sql')) {
    const f = path.join(dir, `mutant-${Date.now()}.sql`);
    writeFileSync(f, m);
    const res = runPsqlFile(f);
    if (!res.ok) throw new Error(`--mutant-sql failed: ${res.err.trim()}`);
    log(`MUTANT SQL applied: ${m.slice(0, 100)}`);
  }

  // ── tests ────────────────────────────────────────────────────────────────
  const testFlag = flags('tests').flatMap((s) => s.split(',')).filter(Boolean);
  const noTests = testFlag.length === 1 && testFlag[0] === 'none';
  const applied = new Set(migrations.map((f) => f.slice(0, 4)));
  const tests = noTests ? [] : testFlag.length ? testFlag.map((t) => path.resolve(REPO, t)) : [
    ...readdirSync(path.join(REPO, 'supabase')).filter((f) => f.endsWith('_rls_test.sql')).sort()
      .map((f) => path.join(REPO, 'supabase', f)),
    ...readdirSync(MIG_DIR).filter((f) => f.endsWith('_rls_test.sql') && applied.has(f.slice(0, 4))).sort()
      .map((f) => path.join(MIG_DIR, f)),
  ];

  let total = 0; let passed = 0; let fileFails = 0;
  for (const t of tests) {
    const res = spawnSync(bin('psql'), psqlArgs(['-A', '-F', '\t', '-P', 'footer=off', '-f', prepare(t)]), { encoding: 'utf8' });
    // Two report styles exist in this repo. The numbered tests return rows
    // ([n,] check, result, detail; one per check, plus a summary row). The
    // three older frozen tests RAISE on the first failure and say nothing on
    // success, so for them "ran to the end without raising" is the one check.
    const rows = (res.stdout || '').split('\n').map((l) => l.split('\t'))
      .map((c) => { const i = c.findIndex((x) => /^(PASS|FAIL|SKIP)$/.test(x)); return i > 0 ? { n: i > 1 ? c[0] : '', name: c[i - 1], result: c[i], detail: c.slice(i + 1).join(' ') } : null; })
      .filter(Boolean);
    const errored = res.status !== 0;
    const raiseStyle = rows.length === 0;
    const checks = raiseStyle
      ? [{ n: '', name: 'ran to the end without raising', result: errored ? 'FAIL' : 'PASS', detail: '' }]
      : rows.filter((c) => !/^summary$/i.test(c.name));
    const p = checks.filter((c) => c.result === 'PASS').length;
    const fl = checks.filter((c) => c.result === 'FAIL');
    const sk = checks.filter((c) => c.result === 'SKIP').length;
    for (const c of fl) console.log(`FAIL ${path.basename(t)} ${c.n ? `#${c.n} ` : ''}${c.name}${c.detail ? ` -- ${c.detail}` : ''}`);
    if (errored) console.log(`ERROR ${path.basename(t)}: ${(res.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
    console.log(`${path.relative(REPO, t)}: ${p} PASS, ${fl.length} FAIL, ${sk} SKIP${raiseStyle ? ' (raise-style test)' : ''}${errored ? ' (the script errored)' : ''}`);
    total += checks.length - sk; passed += p;
    if (errored || fl.length) fileFails += 1;
  }

  for (const extra of flags('sql').flatMap((s) => s.split(',')).filter(Boolean)) {
    const res = spawnSync(bin('psql'), psqlArgs(['-A', '-F', '\t', '-P', 'footer=off', '-f', prepare(path.resolve(REPO, extra))]), { encoding: 'utf8' });
    process.stdout.write(res.stdout);
    if (res.status !== 0) { console.log(`ERROR ${extra}: ${res.stderr.trim()}`); fileFails += 1; }
  }

  // ── node scripts that need the live server (two sessions at once) ───────
  for (const script of flags('node').flatMap((x) => x.split(',')).filter(Boolean)) {
    const res = spawnSync(process.execPath, [path.resolve(REPO, script)], {
      encoding: 'utf8',
      env: { ...process.env, PGHOST: sock, PGPORT: String(PORT), PGDATABASE: DB, PGUSER: 'postgres', PSQL: bin('psql') },
    });
    process.stdout.write(res.stdout || '');
    if (res.status !== 0) { console.log(`ERROR ${script}: ${(res.stderr || '').trim().split('\n').slice(-3).join(' | ')}`); fileFails += 1; }
  }

  console.log(`sql harness: ${passed}/${total} checks passed across ${tests.length} test file(s)${fileFails ? `, ${fileFails} file(s) failing` : ''}`);
  if (KEEP) {
    console.log(`kept running: psql -h ${sock} -p ${PORT} -U postgres -d ${DB}   (stop: ${AS_ROOT ? 'runuser -u postgres -- ' : ''}${bin('pg_ctl')} -D ${data} stop)`);
  }
  return fileFails === 0;
}

let ok = false;
try {
  ok = main();
} catch (e) {
  console.error(`sql harness: ERROR ${e.message}`);
  ok = false;
} finally {
  if (!KEEP) { stop(); rmSync(dir, { recursive: true, force: true }); }
}
process.exit(ok ? 0 : 1);

export { psqlQuery };
