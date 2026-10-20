#!/usr/bin/env node
/**
 * The connector build reads function signatures off the SQL files
 * (tools/connector/sqlchain.mjs) so that it needs no database and no
 * credential. This proves that parse against a real PostgreSQL 16 with the
 * whole chain applied: every public function pg_proc holds that some file in
 * this repo creates must be in the parse with the same argument names, the
 * same argument types, the same defaults count, the same set-returning flag
 * and the same SECURITY DEFINER flag, and the parse must hold nothing pg_proc
 * does not.
 *
 *   node tools/sql-harness/run.mjs --tests none --node tools/connector/harness/check-parse.mjs
 *
 * Prints mismatches and `check connector: N/N signatures match`.
 */
import { execFileSync } from 'node:child_process';
import { readChain } from '../sqlchain.mjs';

const PSQL = process.env.PSQL || 'psql';
const q = (sql) => execFileSync(PSQL, ['-X', '-q', '-A', '-t', '-F', '\t', '-c', sql], { encoding: 'utf8' }).trim();

const rows = q(`
  select p.proname,
         coalesce((select string_agg(format_type(t, null), ',' order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)), ''),
         coalesce(case when p.proargmodes is null then array_to_string(p.proargnames[1:p.pronargs], ',')
                  else (select string_agg(nm, ',' order by ord) from unnest(p.proargnames, p.proargmodes) with ordinality u(nm, md, ord) where md in ('i','b','v')) end, ''),
         p.pronargdefaults, p.proretset, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)
  .split('\n').filter(Boolean).map((l) => l.split('\t'));

const chain = readChain();
const parsed = new Map([...chain.values()].map((f) => [f.signature, f]));
const live = new Map();
for (const [name, types, names, ndef, retset, definer] of rows) {
  live.set(`${name}(${types.replace(/ ?\[\]/g, '[]')})`, { name, names, ndef: Number(ndef), retset: retset === 't', definer: definer === 't' });
}

let ok = 0;
const bad = [];
const normalize = (s) => s.replace(/character varying/g, 'character varying');
for (const [sig, l] of live) {
  const f = parsed.get(normalize(sig));
  if (!f) {
    // A function the harness stubs created (auth helpers live in auth, not public), or a test helper: not ours.
    bad.push(`in pg_proc, not in the parse: ${sig}`);
    continue;
  }
  const problems = [];
  const names = f.args.map((a) => a.name ?? '').join(',');
  if (names !== l.names) problems.push(`names ${names} vs ${l.names}`);
  const ndef = f.args.filter((a) => a.has_default).length;
  if (ndef !== l.ndef) problems.push(`defaults ${ndef} vs ${l.ndef}`);
  if (f.retset !== l.retset) problems.push(`retset ${f.retset} vs ${l.retset}`);
  if (f.definer !== l.definer) problems.push(`definer ${f.definer} vs ${l.definer}`);
  if (problems.length) bad.push(`${sig}: ${problems.join('; ')}`);
  else ok += 1;
}
for (const sig of parsed.keys()) if (!live.has(sig)) bad.push(`in the parse, not in pg_proc: ${sig}`);
for (const b of bad) console.log(`MISMATCH ${b}`);
console.log(`check connector: ${ok}/${live.size} signatures match, ${bad.length} mismatch(es)`);
process.exit(bad.length === 0 && ok > 200 ? 0 : 1);
