// tools/connector/inventory.mjs
//
// LAYER 1 OF THE CONNECTOR REGISTRY (docs/subsystems/connector.md): every way
// the app writes or calls the database, read off src/ and api/.
//
//   functions     every public function the app calls: a literal
//                 `.rpc('name')`, AND any quoted string in the app code
//                 (comments stripped) naming a public function the SQL chain
//                 creates. Most of the standing, rosters and hub pages call
//                 through a helper that passes the name along
//                 (`rpc(supabase, 'decide_absence', ...)`), which a `.rpc(`
//                 scan never sees.
//   edge          every Supabase Edge Function the app invokes, by name.
//   routes        every Vercel function under api/ (the connector own aside).
//   table_writes  every direct `.from('table').insert/update/upsert/delete`
//                 in src/ and api/, multi-line ones included, with file and
//                 line. The connector calls functions, never tables; each one
//                 is excluded by tools/connector/registry/exclusions.yaml.
//   storage       every `storage.from('bucket').upload/remove`.
//
// The connector own files, the fixture engine (src/dev/) and generated files
// are not the app calling anything, and are skipped.
//
//   node tools/connector/inventory.mjs   print the counts

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT, chainNames } from './sqlchain.mjs';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const rel = (f) => relative(ROOT, f).split(sep).join('/');

/** Files that are not the app calling the database. */
export function skipped(file) {
  const r = rel(file);
  return r.startsWith('src/dev/')
    || r.startsWith('api/_lib/connector/')
    || r === 'api/mcp.js'
    || r.startsWith('api/connector/')
    || /^src\/Connector[^/]*$/.test(r)
    || r.startsWith('src/lib/design-system/')
    || /\.generated\./.test(r);
}

/**
 * Code with comments blanked to spaces (line and column positions kept). A
 * small scanner rather than a regex: a `/*` inside a string, or a `//` in a
 * URL, is not a comment. Template literals are kept whole (their `${}` holes
 * included), which over-keeps rather than under-keeps.
 */
export function stripComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        else if (c !== '`' && text[j] === '\n') break;
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const RPC_LITERAL = /\.rpc\(\s*(['"`])([A-Za-z0-9_]+)\1/g;
const QUOTED = /(['"`])([a-z_][a-z0-9_]*)\1/g;
const INVOKE = /functions\.invoke\(\s*(['"`])([a-z0-9-]+)\1/g;
const FN_URL = /functions\/v1\/([a-z0-9-]+)/g;
const WRITE = /\.from\(\s*(['"`])([A-Za-z0-9_]+)\1\s*\)((?:\s*\.[a-zA-Z]+\((?:[^()]|\([^()]*\))*\))*?)\s*\.(insert|update|upsert|delete)\s*\(/g;
const STORAGE = /storage\s*\.from\(\s*(['"`])([A-Za-z0-9_-]+)\1\s*\)\s*\.(upload|remove|update|move)\s*\(/g;

export function buildInventory(root = ROOT) {
  const known = chainNames(root);
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'api'))].filter((f) => !skipped(f)).sort();
  const functions = new Map(); // name -> Set(files)
  const edge = new Map();
  const tableWrites = [];
  const storage = [];
  let literalCount = 0;
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const text = stripComments(raw);
    const r = rel(file);
    const lineOf = (i) => text.slice(0, i).split('\n').length;
    const add = (map, name) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(r); };
    for (const m of text.matchAll(RPC_LITERAL)) { add(functions, m[2]); literalCount += 1; }
    for (const m of text.matchAll(QUOTED)) if (known.has(m[2])) add(functions, m[2]);
    for (const m of text.matchAll(INVOKE)) add(edge, m[2]);
    for (const m of text.matchAll(FN_URL)) add(edge, m[1]);
    for (const m of text.matchAll(WRITE)) tableWrites.push({ file: r, line: lineOf(m.index), table: m[2], op: m[4] });
    for (const m of text.matchAll(STORAGE)) storage.push({ file: r, line: lineOf(m.index), bucket: m[2], op: m[3] });
  }
  const routes = readdirSync(join(root, 'api'), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js') && e.name !== 'mcp.js')
    .map((e) => `api/${e.name}`)
    .sort();
  const sortObj = (map) => [...map.keys()].sort().map((name) => ({ name, files: [...map.get(name)].sort() }));
  return {
    functions: sortObj(functions),
    edge: sortObj(edge),
    routes,
    table_writes: tableWrites,
    storage,
    counts: {
      functions: functions.size,
      rpc_literal_call_sites: literalCount,
      edge_functions: edge.size,
      routes: routes.length,
      table_writes: tableWrites.length,
      table_writes_by_op: tableWrites.reduce((o, w) => ({ ...o, [w.op]: (o[w.op] ?? 0) + 1 }), {}),
      table_write_files: new Set(tableWrites.map((w) => w.file)).size,
      storage_writes: storage.length,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inv = buildInventory();
  console.log(JSON.stringify(inv.counts, null, 2));
}
