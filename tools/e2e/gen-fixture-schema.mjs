#!/usr/bin/env node
/**
 * Regenerates `src/dev/fixture/schema.js` -- the catalog the fixture client
 * answers from -- by reading a REAL Postgres that has every frozen
 * `supabase/*.sql` file applied.
 *
 *   node tools/e2e/gen-fixture-schema.mjs --host /tmp --port 54330 --db lane_infra
 *
 * Why generated rather than hand-written: the fixture exists to behave like
 * production, and production's shape is whatever those SQL files left behind.
 * A hand-kept column list is a second copy of the schema that quietly stops
 * matching (CLAUDE.md, working convention 7). Reading the catalog gives the
 * fixture the same columns, defaults, NOT NULLs, enum-shaped CHECKs, unique
 * keys, foreign keys (which is what PostgREST resolves an embed through),
 * column privileges and RPC signatures that the live project has, so a client
 * that names a column the table does not have fails here the way it would
 * fail there.
 *
 * Requires `psql` on PATH and a database to point it at. Nothing in a clean
 * checkout provides that database; the output is committed so the fixture
 * never needs one at run time. Re-run this only when the frozen SQL changes.
 *
 * PATCHES below are the only hand edits, each with its reason.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const host = flag('host', process.env.PGHOST || '/tmp');
const port = flag('port', process.env.PGPORT || '54330');
const db = flag('db', process.env.PGDATABASE || 'frc_base');
const user = flag('user', process.env.PGUSER || 'postgres');
const out = flag('out', fileURLToPath(new URL('../../src/dev/fixture/schema.js', import.meta.url)));

const SQL = String.raw`
with t as (
  select c.oid, c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
)
select json_build_object(
  'tables', (select json_object_agg(t.relname, json_build_object(
    'columns', (
      select json_agg(json_build_object(
        'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod),
        'notnull', a.attnotnull,
        'default', pg_get_expr(d.adbin, d.adrelid),
        'select', has_column_privilege('authenticated', t.oid, a.attnum, 'SELECT')
      ) order by a.attnum)
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
    'indexes', (
      select json_agg(json_build_object(
        'name', i.relname,
        'primary', ix.indisprimary,
        'pred', pg_get_expr(ix.indpred, ix.indrelid),
        'cols', (select json_agg(a.attname order by k.ord)
                 from unnest(ix.indkey) with ordinality k(attnum, ord)
                 left join pg_attribute a on a.attrelid = ix.indrelid and a.attnum = k.attnum)
      ) order by i.relname)
      from pg_index ix join pg_class i on i.oid = ix.indexrelid
      where ix.indrelid = t.oid and ix.indisunique),
    'fks', (
      select json_agg(json_build_object(
        'name', con.conname,
        'columns', (select json_agg(a.attname order by k.ord)
                    from unnest(con.conkey) with ordinality k(attnum, ord)
                    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum),
        'onDelete', con.confdeltype,
        'refSchema', rn.nspname,
        'refTable', rc.relname,
        'refColumns', (select json_agg(a.attname order by k.ord)
                       from unnest(con.confkey) with ordinality k(attnum, ord)
                       join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum)
      ) order by con.conname)
      from pg_constraint con
      join pg_class rc on rc.oid = con.confrelid
      join pg_namespace rn on rn.oid = rc.relnamespace
      where con.conrelid = t.oid and con.contype = 'f'),
    'checks', (
      select json_agg(json_build_object('name', con.conname, 'def', pg_get_constraintdef(con.oid))
                      order by con.conname)
      from pg_constraint con
      where con.conrelid = t.oid and con.contype = 'c')
  )) from t),
  'functions', (
    select json_agg(json_build_object(
      'name', p.proname,
      'args', case when p.proargnames is null then '[]'::json else coalesce((
        select json_agg(x.nm order by x.ord)
        from unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargnames)])))
             with ordinality x(nm, md, ord)
        where x.md in ('i', 'b', 'v')), '[]'::json) end,
      'nargs', p.pronargs,
      'ndefaults', p.pronargdefaults
    ) order by p.proname, p.pronargs)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype)
)`;

const raw = execFileSync('psql', ['-h', host, '-p', String(port), '-U', user, '-d', db, '-AtX', '-c', SQL], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const cat = JSON.parse(raw.trim());

// A column default, as the fixture will apply it on insert.
function parseDefault(expr) {
  if (expr == null) return null;
  const e = expr.trim();
  if (/^gen_random_uuid\(\)$|^uuid_generate_v4\(\)$|^extensions\.uuid_generate_v4\(\)$/.test(e)) return { kind: 'uuid' };
  if (/^now\(\)$|^CURRENT_TIMESTAMP$|^timezone\('utc'::text, now\(\)\)$/i.test(e)) return { kind: 'now' };
  if (/^CURRENT_DATE$/i.test(e)) return { kind: 'today' };
  if (/^auth\.uid\(\)$/.test(e)) return { kind: 'auth_uid' };
  if (/^nextval\(/.test(e)) return { kind: 'serial' };
  if (/^(true|false)$/.test(e)) return { kind: 'value', value: e === 'true' };
  if (/^-?\d+(\.\d+)?$/.test(e)) return { kind: 'value', value: Number(e) };
  const lit = e.match(/^'((?:[^']|'')*)'::([a-z_ \[\]]+)$/);
  if (lit) {
    const text = lit[1].replace(/''/g, "'");
    const type = lit[2];
    if (type === 'jsonb' || type === 'json') return { kind: 'value', value: JSON.parse(text) };
    if (type.endsWith('[]')) {
      const inner = text.replace(/^\{|\}$/g, '');
      return { kind: 'value', value: inner === '' ? [] : inner.split(',') };
    }
    return { kind: 'value', value: text };
  }
  return { kind: 'expr', expr: e };
}

// Enum-shaped CHECKs only: `col = ANY (ARRAY['a'::text, ...])`, possibly AND'ed,
// possibly behind `(col IS NULL) OR`. Anything else (lengths, ranges, cross-
// column rules) is out of scope -- enforcing half of a rule is worse than
// enforcing none of it, because the fixture would then refuse a legal write.
function parseEnumChecks(def) {
  const stripped = def.replace(/\((\w+) IS NULL\) OR /g, '');
  if (/ OR /.test(stripped)) return [];
  const out = [];
  const re = /\(?(\w+) = ANY \(ARRAY\[([^\]]*)\]\)\)?/g;
  let m;
  while ((m = re.exec(def))) {
    const values = [...m[2].matchAll(/'((?:[^']|'')*)'::\w+/g)].map((v) => v[1].replace(/''/g, "'"));
    out.push({ column: m[1], values });
  }
  return out;
}

// A partial unique index's predicate, in the three shapes the frozen SQL uses.
function parsePredicate(pred) {
  if (pred == null) return null;
  let m = pred.match(/^\((\w+) = '((?:[^']|'')*)'::\w+\)$/);
  if (m) return { column: m[1], op: 'eq', value: m[2] };
  m = pred.match(/^\((\w+) IS (NOT )?NULL\)$/);
  if (m) return { column: m[1], op: m[2] ? 'notnull' : 'null' };
  m = pred.match(/^(\w+)$/);
  if (m) return { column: m[1], op: 'eq', value: true };
  return { unparsed: pred };
}

const tables = {};
for (const [name, t] of Object.entries(cat.tables).sort(([a], [b]) => a.localeCompare(b))) {
  const columns = {};
  for (const c of t.columns ?? []) {
    columns[c.name] = { type: c.type, notnull: c.notnull, default: parseDefault(c.default) };
    if (!c.select) columns[c.name].noSelect = true;
  }
  const unique = (t.indexes ?? []).map((ix) => ({
    name: ix.name,
    primary: ix.primary,
    columns: ix.cols.every((c) => c != null) ? ix.cols : [],
    where: parsePredicate(ix.pred),
  }));
  const pk = unique.find((u) => u.primary)?.columns ?? [];
  const fks = (t.fks ?? []).map((f) => ({
    name: f.name,
    columns: f.columns,
    table: f.refSchema === 'public' ? f.refTable : `${f.refSchema}.${f.refTable}`,
    refColumns: f.refColumns,
    onDelete: { c: 'cascade', n: 'set null', d: 'set default', r: 'restrict', a: 'no action' }[f.onDelete] ?? 'no action',
  }));
  const enums = {};
  for (const ch of t.checks ?? []) {
    for (const e of parseEnumChecks(ch.def)) enums[e.column] = { constraint: ch.name, values: e.values };
  }
  tables[name] = { columns, pk, unique, fks, enums };
}

const functions = {};
for (const f of cat.functions ?? []) {
  (functions[f.name] ??= []).push({ args: f.args, required: f.nargs - f.ndefaults });
}

// ── PATCHES ─────────────────────────────────────────────────────────────────
// events.kind: the harness this was generated from applies
// events_kind_training.sql BEFORE categories_reduce_event_kind.sql, and the
// latter re-pins the CHECK without 'training'. CLAUDE.md records the live order
// as the other way round (training added after volunteering), and SchedulePage
// offers 'training', so the fixture follows CLAUDE.md. Re-running
// categories_reduce_event_kind.sql on the live project would drop 'training'
// from the constraint the same way.
if (tables.events?.enums?.kind && !tables.events.enums.kind.values.includes('training')) {
  const v = tables.events.enums.kind.values;
  v.splice(v.indexOf('other') >= 0 ? v.indexOf('other') : v.length, 0, 'training');
}

// profiles.geofence_exempt: read by CheckinPage, VolunteerCheckinPage and
// RosterPage and documented in CLAUDE.md ("profiles.geofence_exempt (bool,
// default false)"), but NO SQL file in this repository creates it -- it was
// evidently added by hand on the live project. The check-in pages ignore the
// select error, so if the live column were missing the exemption would silently
// do nothing. The fixture models the documented column.
if (tables.profiles && !tables.profiles.columns.geofence_exempt) {
  tables.profiles.columns.geofence_exempt = { type: 'boolean', notnull: true, default: { kind: 'value', value: false } };
}

// app_settings.updated_at: sql/forgotten_checkout.sql creates the table WITH
// updated_at and study_sessions.sql creates it WITHOUT, both "if not exists".
// study_sessions.sql's own header says forgotten_checkout.sql ran first on the
// live project, so live has the column (and VerifyHoursPage writes it); a
// database that applies them the other way round does not.
if (tables.app_settings && !tables.app_settings.columns.updated_at) {
  tables.app_settings.columns.updated_at = { type: 'timestamp with time zone', notnull: false, default: { kind: 'now' } };
}

const header = `// GENERATED by tools/e2e/gen-fixture-schema.mjs -- do not edit by hand.
//
// The public schema as every frozen supabase/*.sql file leaves it: per table,
// its columns (type, NOT NULL, default), primary/unique keys (partial ones
// with their predicate), foreign keys (what an embed resolves through), the
// enum-shaped CHECKs, and columns 'authenticated' cannot SELECT (noSelect);
// plus every callable RPC's argument names. Dev-only: nothing in the
// production build imports this file.
`;
writeFileSync(out, `${header}\nexport const SCHEMA = ${JSON.stringify({ tables, functions }, null, 1)}\n`);
console.log(`wrote ${out}: ${Object.keys(tables).length} tables, ${Object.keys(functions).length} functions`);
