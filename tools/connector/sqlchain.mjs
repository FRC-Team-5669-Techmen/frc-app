// tools/connector/sqlchain.mjs
//
// EVERY PUBLIC FUNCTION THE SQL IN THIS REPO CREATES, read off the files
// themselves, never off a database. CI reads no credential (CLAUDE.md), so the
// connector build must too: this parses `create [or replace] function
// public.<name>(...)` across the frozen files (`platform_migration.sql`,
// `supabase/*.sql`, `sql/*.sql`) and the numbered migrations, in apply order
// (frozen first, then by number), and keeps the LAST definition of each
// signature, which is what the live database ends with when every file has
// been pasted. `drop function public.<name>(...)` removes a signature.
//
// What it reads for each function: argument names, types and which have a
// default; the return type; SECURITY DEFINER or INVOKER; and the body, so the
// generated layer can tell a read from a write and find a staff gate.
//
// THE PROOF THAT THIS PARSE MATCHES POSTGRES is tools/connector/harness/check-parse.mjs,
// which applies the whole chain to a real PostgreSQL 16 and compares every
// signature here against pg_proc. A parse that drifts reddens that check.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The SQL files in apply order: frozen (alphabetical, as the harness applies them), then numbered. */
export function chainFiles(root = ROOT) {
  const frozen = [
    'platform_migration.sql',
    ...readdirSync(join(root, 'supabase')).filter((f) => f.endsWith('.sql') && !f.endsWith('_rls_test.sql')).sort().map((f) => `supabase/${f}`),
    ...(existsSync(join(root, 'sql')) ? readdirSync(join(root, 'sql')).filter((f) => f.endsWith('.sql')).sort().map((f) => `sql/${f}`) : []),
  ];
  const numbered = readdirSync(join(root, 'supabase/migrations'))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith('_rls_test.sql'))
    .sort()
    .map((f) => `supabase/migrations/${f}`);
  return [...frozen, ...numbered];
}

/** Text with -- line comments and /* *\/ blocks blanked, keeping string and dollar-quoted bodies intact. */
function stripSqlComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; }
        if (text[j] === "'") break;
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end < 0 ? text.length : end + tag.length;
        out += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Split a parenthesised argument list on top-level commas. */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let quote = false;
  for (const ch of s) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth += 1;
    if (!quote && ch === ')') depth -= 1;
    if (!quote && ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const TYPE_ALIASES = new Map([
  ['int', 'integer'], ['int4', 'integer'], ['int8', 'bigint'], ['int2', 'smallint'],
  ['bool', 'boolean'], ['float8', 'double precision'], ['float4', 'real'],
  ['timestamptz', 'timestamp with time zone'], ['timestamp', 'timestamp without time zone'],
  ['varchar', 'character varying'], ['character varying', 'character varying'], ['decimal', 'numeric'],
]);

/** A type as format_type() spells it, as near as text allows. */
export function normType(t) {
  let s = t.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^public\./, '');
  let arr = '';
  while (s.endsWith('[]')) { arr += '[]'; s = s.slice(0, -2).trim(); }
  s = s.replace(/\(.*\)$/, '').trim();
  return (TYPE_ALIASES.get(s) ?? s) + arr;
}

function parseArg(raw) {
  let s = raw.trim();
  let hasDefault = false;
  const d = /\s+(default\b|=)\s*/i.exec(s);
  if (d) { hasDefault = true; s = s.slice(0, d.index).trim(); }
  let mode = 'in';
  const mm = /^(in|out|inout|variadic)\s+/i.exec(s);
  if (mm) { mode = mm[1].toLowerCase(); s = s.slice(mm[0].length).trim(); }
  // "name type" or just "type"
  const m = /^([a-z_][a-z0-9_]*)\s+(.+)$/i.exec(s);
  let name = null;
  let type = s;
  if (m && !/^(double|character|timestamp|time|bit)$/i.test(m[1])) { name = m[1].toLowerCase(); type = m[2]; }
  return { name, type: normType(type), mode, hasDefault };
}

const CREATE = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?)([a-z_][a-z0-9_]*)\1\s*\(/gi;
const DROP = /drop\s+function\s+(?:if\s+exists\s+)?([^;]+);/gi;

/** Every public function the chain ends with: Map<signature, fn>. */
export function readChain(root = ROOT) {
  const fns = new Map();
  for (const file of chainFiles(root)) {
    const text = stripSqlComments(readFileSync(join(root, file), 'utf8'));
    // Interleave creates and drops in file order.
    const events = [];
    for (const m of text.matchAll(CREATE)) {
      const before = text.slice(Math.max(0, m.index - 0), m.index + m[0].length);
      if (/pg_temp\./i.test(before)) continue;
      // only schema public, or unqualified (search_path public in this repo)
      const qualified = /function\s+([a-z_]+)\./i.exec(m[0]);
      if (qualified && qualified[1].toLowerCase() !== 'public') continue;
      events.push({ at: m.index, kind: 'create', name: m[2].toLowerCase(), open: m.index + m[0].length });
    }
    for (const m of text.matchAll(DROP)) events.push({ at: m.index, kind: 'drop', spec: m[1] });
    events.sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (e.kind === 'drop') {
        for (const one of splitTop(e.spec.replace(/\s+(cascade|restrict)\s*$/i, ''))) {
          const mm = /^(?:public\.)?([a-z_][a-z0-9_]*)\s*(?:\(([^)]*)\))?/i.exec(one.trim());
          if (!mm) continue;
          const name = mm[1].toLowerCase();
          if (mm[2] === undefined) {
            for (const k of [...fns.keys()]) if (k.startsWith(`${name}(`)) fns.delete(k);
          } else {
            const types = splitTop(mm[2]).map((a) => parseArg(a)).filter((a) => a.mode !== 'out').map((a) => a.type);
            fns.delete(`${name}(${types.join(',')})`);
          }
        }
        continue;
      }
      // the argument list, to the matching paren
      let depth = 1;
      let j = e.open;
      while (j < text.length && depth > 0) {
        if (text[j] === '(') depth += 1;
        else if (text[j] === ')') depth -= 1;
        j += 1;
      }
      const argText = text.slice(e.open, j - 1);
      const rest = text.slice(j, j + 400000);
      const tagM = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(rest);
      const header = tagM ? rest.slice(0, tagM.index) : rest.slice(0, 2000);
      let body = '';
      if (tagM) {
        const start = tagM.index + tagM[0].length;
        const end = rest.indexOf(tagM[1], start);
        body = end < 0 ? rest.slice(start) : rest.slice(start, end);
      }
      // Options may also follow the body (`$fn$ language sql security definer;`),
      // up to the statement's semicolon and no further.
      let trailer = '';
      if (tagM) {
        const afterBody = tagM.index + tagM[0].length + body.length + tagM[1].length;
        const semi = rest.indexOf(';', afterBody);
        trailer = rest.slice(afterBody, semi < 0 ? afterBody + 200 : semi);
      }
      const all = header + ' ' + trailer;
      const returnsM = /returns\s+(setof\s+|table\s*\(([\s\S]*?)\)\s*(?=language|security|stable|volatile|immutable|set|as|$))?([a-z_][a-z0-9_. \[\]]*?)?(?=\s+(language|security|stable|volatile|immutable|strict|set\s+search_path|as|parallel|cost)\b|\s*$)/i.exec(header);
      let returns = 'void';
      let retset = false;
      if (returnsM) {
        if (returnsM[1] && /^table/i.test(returnsM[1])) { returns = 'table'; retset = true; }
        else if (returnsM[1] && /^setof/i.test(returnsM[1])) { returns = normType(returnsM[3] ?? ''); retset = true; }
        else returns = normType(returnsM[3] ?? 'void');
      }
      const definer = /security\s+definer/i.test(all);
      const args = splitTop(argText).map(parseArg);
      const inArgs = args.filter((a) => a.mode !== 'out');
      const sig = `${e.name}(${inArgs.map((a) => a.type).join(',')})`;
      fns.set(sig, {
        name: e.name,
        signature: sig,
        args: inArgs.map((a) => ({ name: a.name, type: a.type, has_default: a.hasDefault })),
        returns,
        retset,
        definer,
        file,
        body,
      });
    }
  }
  return fns;
}

/** Every public function name the chain ends with. */
export function chainNames(root = ROOT) {
  return new Set([...readChain(root).values()].map((f) => f.name));
}

/** Bodies by name (one per overload), for the gate and write analysis. */
export function bodiesByName(chain) {
  const out = new Map();
  for (const f of chain.values()) {
    if (!out.has(f.name)) out.set(f.name, []);
    out.get(f.name).push(f.body);
  }
  return out;
}
