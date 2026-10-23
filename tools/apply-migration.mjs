#!/usr/bin/env node
/**
 * apply-migration: apply every numbered migration the live database has not
 * recorded, in number order, each in its own transaction, recording each one
 * as it lands, and stopping at the first failure.
 *
 *   node tools/apply-migration.mjs                  # apply what is pending
 *   node tools/apply-migration.mjs --dry-run        # list what would apply; writes nothing
 *   node tools/apply-migration.mjs --dry-run --offline   # the same, without a database:
 *                                                   # assumes only the baseline is recorded
 *   node tools/apply-migration.mjs --print-bootstrap     # the bootstrap SQL, for a hand paste
 *   node tools/apply-migration.mjs --dir <path>     # read migrations from another directory
 *                                                   # (the e2e harness uses this; CI never does)
 *
 * The connection string is read from SUPABASE_MIGRATE_DB_URL and is NEVER
 * printed: not in a message, not in an error. `redact` below is the one place
 * that is enforced, and every line this tool prints goes through it.
 *
 * Ported from pina-hash/idea-app (`tools/apply-migration.mjs`,
 * `.github/workflows/migrate.yml`, `docs/MIGRATIONS.md`), cut down to what
 * this repo needs. See docs/subsystems/database.md for the path end to end.
 *
 * ---------------------------------------------------------------------------
 * THE RECORD. `supabase_migrations.schema_migrations (version text primary key,
 * statements text[], name text)` -- the Supabase CLI's own table and shape,
 * which is what idea-app seeded. `version` is the four-digit number ('0027'),
 * `name` the rest of the filename ('scouting_match_fields'). One row per
 * applied numbered migration. `statements` is left null, as idea-app does.
 *
 * THE BOOTSTRAP IS PART OF EVERY RUN, NOT A FILE SOMEBODY HAS TO PASTE. Before
 * reading what is applied, a real run creates the schema and table if missing
 * and inserts the BASELINE rows below with `on conflict do nothing`, in one
 * transaction. The baseline is every numbered migration Mr. Pina applied by
 * hand before this tool existed (0001 to 0026, confirmed 2026-10-23). Writing
 * it on every run is what makes it impossible for this tool to replay an old
 * file, even against a table somebody emptied: those files are applied, and
 * the baseline says so. A file numbered above the baseline is never seeded; it
 * is applied by this tool, which records it in the same transaction.
 *
 * `--dry-run` creates nothing. It reads the table if it exists and treats the
 * baseline as recorded either way, so it shows exactly what a real run would
 * apply.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS A MIGRATION HERE (`selectPending`, unit-tested in
 * tests/apply-migration.test.js):
 *   * a file DIRECTLY under supabase/migrations/ named NNNN_snake_case.sql
 *   * NOT an `_rls_test.sql` file: those are begin ... rollback proofs a person
 *     runs, and applying one is pointless at best
 *   * NEVER the frozen files (supabase/*.sql, sql/, the repo-root SQL): they
 *     are not in that directory, and the selection checks the directory
 *     rather than trusting the caller
 *   * two files with one number is a refusal before anything connects
 *
 * HOW ONE IS APPLIED. The whole file is sent as one simple query, which is what
 * the Supabase SQL editor does with a paste. A file that opens its own
 * transaction (a top-level `begin;`, as 0002 does) is sent unwrapped and its
 * record row is written right after its own commit; every other file is
 * wrapped in `begin ... commit` with the record insert inside, so the
 * migration and its row land together or not at all. A raise rolls the file
 * back, nothing is recorded, and the run stops there: nothing after it is
 * attempted.
 *
 * LIVE TRAFFIC. `lock_timeout` is 15 s: a migration that cannot take a lock
 * because students are mid check-in fails and rolls back rather than queueing
 * every later query on that table behind itself. Re-run it later. A session
 * advisory lock stops two appliers (CI and a person, say) from running at once.
 *
 * WHAT IT DOES NOT DO, deliberately. No destructive-DDL scanner (idea-app has
 * one; review of the migration on its way to main is the control here), no
 * per-object verification after the apply, no record file committed back to
 * the repo (a push to main deploys the PWA, so the workflow writes nothing to
 * git; the record is the table and the run summary), and no HTTPS proxy
 * tunnel (a GitHub runner needs none, and a cloud session cannot reach the
 * database through one anyway -- idea-app measured that).
 *
 * Exit codes: 0 applied everything pending, or nothing was pending, or the
 * dry run listed it. 1 a migration failed (rolled back, run stopped), or the
 * tool refused (duplicate number, no connection string, cannot connect).
 */

import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
export const MIGRATIONS_DIR = 'supabase/migrations';
export const HISTORY_TABLE = 'supabase_migrations.schema_migrations';
export const ENV_VAR = 'SUPABASE_MIGRATE_DB_URL';
// Any constant will do; it only has to be the same for every applier.
export const ADVISORY_LOCK_KEY = 5669_0021;

/**
 * Every numbered migration applied BY HAND before this tool existed. Mr. Pina,
 * 2026-10-23: everything up to and including 0026 is applied (0022 to 0026
 * confirmed that day); 0027 and 0028 are not. NEVER EXTEND THIS LIST to record
 * a later file -- a later file is recorded by being applied by this tool, or,
 * if pasted by hand, by the one-row insert in supabase/migrations/README.md.
 * tests/apply-migration.test.js holds every entry to a real file of that exact
 * name.
 */
export const BASELINE = Object.freeze([
  ['0001', 'idea_certifications_mirror'],
  ['0002', 'feedback_console'],
  ['0003', 'discord_announcements'],
  ['0004', 'member_permissions'],
  ['0005', 'event_family_hub'],
  ['0006', 'beach_blitz_seed'],
  ['0007', 'event_hub_open_link'],
  ['0008', 'event_hub_families'],
  ['0009', 'event_hub_households'],
  ['0010', 'event_hub_roster_names'],
  ['0011', 'event_hub_parent_service_hours'],
  ['0012', 'jobs_idea_cert_gate'],
  ['0013', 'handbook_acknowledgments'],
  ['0014', 'session_signout'],
  ['0015', 'member_standing'],
  ['0016', 'event_rosters'],
  ['0017', 'families_and_records'],
  ['0018', 'connector'],
  ['0019', 'connector_writes'],
  ['0020', 'member_admin'],
  ['0021', 'connector_deleted_rows'],
  ['0022', 'scouting'],
  ['0023', 'family_link_recovery'],
  ['0024', 'feedback_inbox'],
  ['0025', 'absence_handbook'],
  ['0026', 'battery_log'],
]);
export const BASELINE_THROUGH = BASELINE.at(-1)[0];

const NUMBERED = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/**
 * Which files are migrations, in apply order, and which of them are pending.
 *
 * @param {string[]} paths repo-relative paths (or bare names, read as being in
 *   supabase/migrations/); anything not directly in that directory is ignored
 * @param {Iterable<string>} applied versions already recorded ('0001', ...)
 * @returns {{ all: Mig[], pending: Mig[], outOfOrder: Mig[] }}
 * @typedef {{ version: string, name: string, file: string }} Mig
 */
export function selectPending(paths, applied = []) {
  const done = new Set(applied);
  const all = [];
  for (const p of paths) {
    const norm = String(p).replace(/\\/g, '/');
    const dir = norm.includes('/') ? norm.slice(0, norm.lastIndexOf('/')) : MIGRATIONS_DIR;
    const base = norm.slice(norm.lastIndexOf('/') + 1);
    if (dir !== MIGRATIONS_DIR) continue; // frozen files, nested folders, anything else
    if (base.endsWith('_rls_test.sql')) continue; // proofs, never applied
    const m = NUMBERED.exec(base);
    if (!m) continue; // README.md and friends
    all.push({ version: m[1], name: m[2], file: `${MIGRATIONS_DIR}/${base}` });
  }
  all.sort((a, b) => (a.version === b.version ? a.name.localeCompare(b.name) : a.version < b.version ? -1 : 1));
  for (let i = 1; i < all.length; i += 1) {
    if (all[i].version === all[i - 1].version) {
      throw new Error(`two migrations claim number ${all[i].version}: ${all[i - 1].file} and ${all[i].file}. Renumber one before anything is applied.`);
    }
  }
  const pending = all.filter((m) => !done.has(m.version));
  // A pending file numbered BELOW something already recorded: somebody wrote a
  // row by hand out of order, or a file was added under an old number. It is
  // still applied in number order; the run says so out loud.
  const highest = [...done].filter((v) => /^\d{4}$/.test(v)).sort().at(-1) ?? '';
  const outOfOrder = pending.filter((m) => m.version < highest);
  return { all, pending, outOfOrder };
}

/**
 * True when a file manages its own transaction (a top-level begin/commit, or
 * anything that cannot run inside one), so it must not be wrapped. Comments,
 * quoted strings and dollar-quoted bodies are stripped first, so the `begin`
 * of a plpgsql block is not mistaken for one.
 */
export function managesOwnTransaction(sql) {
  const statements = topLevelStatements(sql).map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '));
  return statements.some((s) =>
    /^(begin|begin (transaction|work)|start transaction|commit|commit (transaction|work)|end|end (transaction|work)|rollback)$/.test(s) ||
    /\bconcurrently\b/.test(s),
  );
}

/** Top-level statement texts with comments, strings and dollar bodies blanked. */
export function topLevelStatements(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const e = sql.indexOf('\n', i);
      i = e < 0 ? n : e;
    } else if (two === '/*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql.slice(i, i + 2) === '/*') { depth += 1; i += 2; }
        else if (sql.slice(i, i + 2) === '*/') { depth -= 1; i += 2; }
        else i += 1;
      }
      out += ' ';
    } else if (c === "'") {
      i += 1;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") { i += 1; break; }
        else i += 1;
      }
      out += "''";
    } else if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end < 0 ? n : end + tag.length;
        out += ' $body$ ';
      } else { out += c; i += 1; }
    } else if (c === '"') {
      const e = sql.indexOf('"', i + 1);
      out += sql.slice(i, e < 0 ? n : e + 1);
      i = e < 0 ? n : e + 1;
    } else { out += c; i += 1; }
  }
  return out.split(';').filter((s) => s.trim() !== '');
}

/** Remove the connection string and its password from any text. */
export function redact(text, url) {
  let s = String(text ?? '');
  if (!url) return s;
  const secrets = new Set([url]);
  try {
    const u = new URL(url);
    if (u.password) { secrets.add(u.password); secrets.add(decodeURIComponent(u.password)); }
  } catch { /* not a URL: the whole value is the secret */ }
  for (const v of [...secrets].filter((x) => x && x.length >= 3).sort((a, b) => b.length - a.length)) {
    s = s.split(v).join('[redacted]');
  }
  return s;
}

/** The bootstrap: schema, table, the two columns idea-app guarantees, the baseline. */
export function bootstrapSql() {
  const values = BASELINE.map(([v, n]) => `  ('${v}', '${n}')`).join(',\n');
  return [
    'create schema if not exists supabase_migrations;',
    `create table if not exists ${HISTORY_TABLE} (\n  version text not null primary key,\n  statements text[],\n  name text\n);`,
    `alter table ${HISTORY_TABLE} add column if not exists statements text[];`,
    `alter table ${HISTORY_TABLE} add column if not exists name text;`,
    `-- every numbered migration applied by hand before the Migrate workflow (0001 to ${BASELINE_THROUGH})`,
    `insert into ${HISTORY_TABLE} (version, name) values\n${values}\non conflict (version) do nothing;`,
  ].join('\n');
}

const RECORD_SQL = `insert into ${HISTORY_TABLE} (version, name) values ($1, $2) on conflict (version) do nothing`;

/** Connection settings with SSL decided here, never by a `sslmode` in the URL. */
export function clientConfig(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  u.searchParams.delete('sslmode');
  const socketHost = (u.searchParams.get('host') ?? '').startsWith('/');
  const local = socketHost || ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  // Supabase serves TLS with its own CA, which is not in Node's store, so the
  // chain is not verified (idea-app does the same). The pooler refuses a
  // plaintext connection, so TLS is on unless the target is local or the URL
  // says sslmode=disable.
  const ssl = sslmode === 'disable' || (local && sslmode == null) ? false : { rejectUnauthorized: false };
  return { connectionString: u.toString(), ssl, application_name: 'frc-app migrate' };
}

function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    dryRun: has('--dry-run'),
    offline: has('--offline'),
    printBootstrap: has('--print-bootstrap'),
    dir: val('--dir'),
  };
}

function listFiles(dirAbs) {
  // Always reported as supabase/migrations/<name>, whatever --dir is, so the
  // selection rule is the one the unit test pins.
  return readdirSync(dirAbs).map((f) => `${MIGRATIONS_DIR}/${f}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env[ENV_VAR] ?? '';
  const say = (line = '') => console.log(redact(line, url));
  const summary = [];
  const sum = (line = '') => summary.push(redact(line, url));
  const flushSummary = () => {
    const f = process.env.GITHUB_STEP_SUMMARY;
    if (f && summary.length) appendFileSync(f, `${summary.join('\n')}\n`);
  };

  if (args.printBootstrap) { console.log(bootstrapSql()); return 0; }

  const dirAbs = args.dir ? resolve(process.cwd(), args.dir) : join(REPO_ROOT, MIGRATIONS_DIR);
  const readSql = (m) => readFileSync(join(dirAbs, m.file.slice(MIGRATIONS_DIR.length + 1)), 'utf8');
  const files = listFiles(dirAbs);
  const baseline = BASELINE.map(([v]) => v);

  if (args.offline) {
    if (!args.dryRun) { say('--offline only makes sense with --dry-run.'); return 1; }
    const { pending } = selectPending(files, baseline);
    say(`dry run, OFFLINE: assuming only the baseline (0001 to ${BASELINE_THROUGH}) is recorded.`);
    say(pending.length ? `would apply ${pending.length}, in this order:` : 'would apply nothing.');
    for (const m of pending) say(`  ${m.file}`);
    return 0;
  }

  if (!url) {
    say(`${ENV_VAR} is not set, so nothing was read and nothing was applied.`);
    say('Use --dry-run --offline to list what is pending without a database.');
    return 1;
  }

  // Selection is checked BEFORE connecting: a duplicate number refuses here.
  selectPending(files, baseline);

  const { default: pg } = await import('pg');
  const client = new pg.Client(clientConfig(url));
  const notices = [];
  client.on('notice', (n) => notices.push(`${n.severity ?? 'NOTICE'}: ${n.message}`));
  const drainNotices = () => { for (const n of notices.splice(0)) say(`    ${n}`); };

  try {
    await client.connect();
  } catch (e) {
    say(`could not connect to the database: ${e.message}`);
    sum('## Migrate: could not connect');
    sum('');
    sum(`The secret is set and the database could not be reached, so nothing was applied. \`${redact(e.message, url)}\``);
    flushSummary();
    return 1;
  }

  try {
    await client.query("set lock_timeout = '15s'");
    await client.query("set statement_timeout = '10min'");
    const lock = await client.query('select pg_try_advisory_lock($1) as ok', [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0].ok) {
      say('another applier holds the migration lock; nothing was applied. Run again when it finishes.');
      sum('## Migrate: another run holds the lock\n\nNothing was applied.');
      flushSummary();
      return 1;
    }

    // ── what is recorded ────────────────────────────────────────────────────
    const exists = (await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null as ok")).rows[0].ok;
    let seeded = 0;
    if (!args.dryRun) {
      await client.query('begin');
      try {
        const before = exists ? Number((await client.query(`select count(*)::int as n from ${HISTORY_TABLE} where version = any($1)`, [baseline])).rows[0].n) : 0;
        await client.query(bootstrapSql());
        await client.query('commit');
        seeded = baseline.length - before;
      } catch (e) {
        await client.query('rollback').catch(() => {});
        throw new Error(`the bootstrap failed and was rolled back: ${e.message}`);
      }
      if (!exists) say(`created ${HISTORY_TABLE}.`);
      if (seeded) say(`recorded ${seeded} baseline migration(s) applied by hand (through ${BASELINE_THROUGH}).`);
    }
    const tableNow = args.dryRun ? exists : true;
    const recorded = tableNow ? (await client.query(`select version from ${HISTORY_TABLE}`)).rows.map((r) => r.version) : [];
    const appliedSet = [...new Set([...recorded, ...baseline])];
    const { pending, outOfOrder } = selectPending(files, appliedSet);

    for (const m of outOfOrder) say(`WARNING: ${m.file} is pending and numbered below a migration already recorded. Applying it in number order anyway.`);

    if (args.dryRun) {
      say(`dry run: nothing was written.${exists ? '' : ` ${HISTORY_TABLE} does not exist yet; a real run creates it and records 0001 to ${BASELINE_THROUGH}.`}`);
      say(pending.length ? `would apply ${pending.length}, in this order:` : 'would apply nothing: every migration is recorded.');
      for (const m of pending) say(`  ${m.file}${managesOwnTransaction(readSql(m)) ? '   (opens its own transaction)' : ''}`);
      sum('## Migrate: dry run');
      sum('');
      sum(pending.length ? pending.map((m) => `- would apply \`${m.file}\``).join('\n') : 'Nothing pending.');
      flushSummary();
      return 0;
    }

    if (!pending.length) {
      say('nothing to apply: every numbered migration is recorded.');
      sum('## Migrate: nothing to apply');
      sum('');
      sum(`Every numbered migration in \`${MIGRATIONS_DIR}/\` is recorded in \`${HISTORY_TABLE}\`.${seeded ? ` (This run created the record and wrote the ${seeded} hand-applied baseline rows, 0001 to ${BASELINE_THROUGH}.)` : ''}`);
      flushSummary();
      return 0;
    }

    // ── apply, in order, stop at the first failure ─────────────────────────
    sum('## Migrate');
    sum('');
    if (seeded) sum(`Created the record and wrote the ${seeded} hand-applied baseline rows (0001 to ${BASELINE_THROUGH}).\n`);
    say(`applying ${pending.length}: ${pending.map((m) => m.version).join(', ')}`);
    let applied = 0;
    for (const m of pending) {
      const sql = readSql(m);
      const own = managesOwnTransaction(sql);
      const t0 = Date.now();
      try {
        if (own) {
          await client.query(sql);
          await client.query(RECORD_SQL, [m.version, m.name]);
        } else {
          await client.query('begin');
          await client.query(sql);
          await client.query(RECORD_SQL, [m.version, m.name]);
          await client.query('commit');
        }
      } catch (e) {
        await client.query('rollback').catch(() => {});
        drainNotices();
        const where = [e.code && `code ${e.code}`, e.position && `position ${e.position}`, e.where && `where: ${e.where}`].filter(Boolean).join(', ');
        say(`FAILED ${m.file}: ${e.message}${where ? ` (${where})` : ''}`);
        say(own
          ? 'This file manages its own transaction, so read it: anything before its own commit may have landed. It was NOT recorded.'
          : 'Rolled back: nothing from this file landed and it was NOT recorded.');
        const rest = pending.slice(pending.indexOf(m) + 1);
        if (rest.length) say(`Not attempted: ${rest.map((r) => r.version).join(', ')}.`);
        sum(`- **FAILED** \`${m.file}\`: ${redact(e.message, url)}${where ? ` (${redact(where, url)})` : ''}`);
        sum(`- ${own ? 'It opens its own transaction; read it before re-running.' : 'Rolled back; nothing from it landed; not recorded.'}`);
        if (rest.length) sum(`- Not attempted: ${rest.map((r) => `\`${r.version}\``).join(', ')}`);
        sum(`\n${applied} applied before the failure.`);
        flushSummary();
        return 1;
      }
      drainNotices();
      applied += 1;
      say(`applied ${m.file} and recorded ${m.version} (${Date.now() - t0} ms)${own ? ', unwrapped: it opens its own transaction' : ''}`);
      sum(`- applied and recorded \`${m.file}\``);
    }
    say(`done: ${applied} applied.`);
    sum(`\n${applied} applied.`);
    flushSummary();
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(redact(`apply-migration: ${e.message}`, process.env[ENV_VAR] ?? ''));
      process.exit(1);
    },
  );
}

