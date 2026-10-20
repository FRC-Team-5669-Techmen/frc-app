#!/usr/bin/env node
// tools/connector/build.mjs -- `npm run connector:build`
//
// WRITES THE ONE GENERATED FILE THE CONNECTOR SERVES FROM:
// api/_lib/connector/registry.generated.js. Four layers, one builder:
//
//   1. the inventory (inventory.mjs): every function, Edge Function, route,
//      table write and storage write the app makes, read off src/ and api/
//   2. the schema (sqlchain.mjs): every public function the SQL chain ends
//      with, read off the files (no database, no credential)
//   3. the hand overlay (registry/*.yaml): the voice tools, the function
//      entries that replace generated ones, and the written exclusions
//   4. the generated layer, written here: a `call_app` entry for every
//      function the app calls that the overlay does not name, `read` when its
//      body writes nothing (transitively), otherwise `confirm`
//
// .github/workflows/connector.yml runs this on every push to main and commits
// what changed, so a new operation in the app gets its tool on the push that
// adds it. tests/connector-coverage.test.js fails on a stale file.
//
//   node tools/connector/build.mjs           write the file
//   node tools/connector/build.mjs --check   exit 1 when the file is stale

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT, readChain, bodiesByName } from './sqlchain.mjs';
import { buildInventory } from './inventory.mjs';
import { reachedGates, writers } from './gates.mjs';

export const REGISTRY_PATH = join(ROOT, 'api/_lib/connector/registry.generated.js');
const OVERLAY_DIR = join(ROOT, 'tools/connector/registry');

export function readOverlay(dir = OVERLAY_DIR) {
  const load = (f) => (existsSync(join(dir, f)) ? YAML.parse(readFileSync(join(dir, f), 'utf8')) ?? {} : {});
  return { tools: load('tools.yaml'), functions: load('functions.yaml'), exclusions: load('exclusions.yaml') };
}

/** `p_member` -> `member`; the spoken name of an argument. */
export const spoken = (name) => (name ?? '').replace(/^p_/, '').replace(/^target_/, '');

const words = (name) => name.replace(/^_+/, '').split('_').filter(Boolean);

/** A generated entry's one sentence, from its name and what it does. */
function generatedDescribe(name, writes) {
  const w = words(name);
  const lead = w[0] === 'staff' || w[0] === 'admin' ? w.slice(1) : w;
  const text = lead.join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${writes ? ' (a change: asks first)' : ' (a read)'}.`;
}

export function buildRegistry(root = ROOT) {
  const inv = buildInventory(root);
  const chain = readChain(root);
  const bodies = bodiesByName(chain);
  const writes = writers(bodies);
  const gates = reachedGates(bodies);
  const overlay = readOverlay(join(root, 'tools/connector/registry'));
  const handFns = overlay.functions ?? {};
  const excludedFns = overlay.exclusions.functions ?? {};

  const formsOf = (name) => [...chain.values()].filter((f) => f.name === name)
    .map((f) => ({ args: f.args.map((a) => ({ name: a.name, spoken: spoken(a.name), type: a.type, optional: a.has_default })), returns: f.returns, retset: f.retset }));

  // Every function the registry answers for: the app calls it, or a hand entry names it.
  const names = new Set(inv.functions.map((f) => f.name));
  for (const n of Object.keys(handFns)) names.add(n);
  for (const t of Object.values(overlay.tools ?? {})) if (t?.function) names.add(t.function);
  for (const e of Object.values(handFns)) for (const u of e?.undo ?? []) names.add(u.function);

  const functions = {};
  for (const name of [...names].sort()) {
    const hand = handFns[name];
    const calledBy = inv.functions.find((f) => f.name === name)?.files ?? [];
    const entry = {
      name,
      source: hand ? 'hand' : 'generated',
      forms: formsOf(name),
      writes: writes.has(name),
      gates: gates.get(name) ?? [],
      called_from: calledBy,
    };
    if (excludedFns[name] && !hand) {
      entry.excluded = excludedFns[name];
    } else if (hand) {
      entry.describe = hand.describe;
      if (hand.level_when) entry.level_when = hand.level_when;
      entry.level = hand.level ?? (hand.level_when ? 'confirm' : writes.has(name) ? 'confirm' : 'read');
      if (hand.undo) entry.undo = hand.undo;
      if (hand.before) entry.before = hand.before;
      if (hand.connector_only) entry.connector_only = true;
    } else {
      entry.describe = generatedDescribe(name, writes.has(name));
      entry.level = writes.has(name) ? 'confirm' : 'read';
    }
    functions[name] = entry;
  }

  const tools = {};
  for (const [name, t] of Object.entries(overlay.tools ?? {})) {
    tools[name] = {
      name,
      describe: t.describe,
      say: t.say ?? [],
      kind: t.kind,
      args: t.args ?? {},
      ...(t.function ? { function: t.function, map: t.map ?? {} } : {}),
      ...(t.gap ? { gap: t.gap } : {}),
    };
  }

  // Table writes, with their lines, grouped as the exclusions key them.
  const groups = new Map();
  for (const w of inv.table_writes) {
    const k = `${w.file}|${w.table}|${w.op}`;
    if (!groups.has(k)) groups.set(k, { file: w.file, table: w.table, op: w.op, lines: [] });
    groups.get(k).lines.push(w.line);
  }
  const tableExcl = new Map((overlay.exclusions.table_writes ?? []).map((x) => [`${x.file}|${x.table}|${x.op}`, x]));
  const table_writes = [...groups.values()].map((g) => {
    const x = tableExcl.get(`${g.file}|${g.table}|${g.op}`);
    return { ...g, excluded: x && x.count === g.lines.length ? x.reason : null };
  });
  const sGroups = new Map();
  for (const w of inv.storage) {
    const k = `${w.file}|${w.bucket}|${w.op}`;
    if (!sGroups.has(k)) sGroups.set(k, { file: w.file, bucket: w.bucket, op: w.op, lines: [] });
    sGroups.get(k).lines.push(w.line);
  }
  const storExcl = new Map((overlay.exclusions.storage ?? []).map((x) => [`${x.file}|${x.bucket}|${x.op}`, x]));
  const storage = [...sGroups.values()].map((g) => {
    const x = storExcl.get(`${g.file}|${g.bucket}|${g.op}`);
    return { ...g, excluded: x && x.count === g.lines.length ? x.reason : null };
  });
  const edge = inv.edge.map((e) => ({ ...e, excluded: overlay.exclusions.edge?.[e.name] ?? null }));
  const routes = inv.routes.map((r) => ({ file: r, excluded: overlay.exclusions.routes?.[r] ?? null }));

  const live = Object.values(functions).filter((f) => !f.excluded);
  const counts = {
    functions_called: inv.functions.length,
    registry_functions: Object.keys(functions).length,
    reachable: live.length,
    read: live.filter((f) => f.level === 'read' && !f.level_when).length,
    undo: live.filter((f) => f.level === 'undo' && !f.level_when).length,
    confirm: live.filter((f) => f.level === 'confirm' && !f.level_when).length,
    by_argument: live.filter((f) => f.level_when).length,
    generated: live.filter((f) => f.source === 'generated').length,
    excluded_functions: Object.values(functions).filter((f) => f.excluded).length,
    tools: Object.keys(tools).length,
    edge_functions: edge.length,
    routes: routes.length,
    table_writes: inv.table_writes.length,
    table_writes_by_op: inv.counts.table_writes_by_op,
    table_write_files: inv.counts.table_write_files,
    storage_writes: inv.storage.length,
  };
  return { counts, tools, functions, edge, routes, table_writes, storage };
}

/** The comparable part of a registry: everything but the date. */
export const registryKey = (r) => JSON.stringify({ ...r, measured: undefined, note: undefined });

export function renderRegistry(today = new Date(), root = ROOT) {
  const built = buildRegistry(root);
  let measured = today.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const path = join(root, 'api/_lib/connector/registry.generated.js');
  if (existsSync(path)) {
    const prior = parseModule(readFileSync(path, 'utf8'));
    if (registryKey({ ...prior }) === registryKey({ ...built })) measured = prior.measured;
  }
  return {
    note: 'Generated by tools/connector/build.mjs (npm run connector:build) from the app code, the SQL files and tools/connector/registry/*.yaml. Do not edit by hand.',
    measured,
    ...built,
  };
}

const HEAD = '// GENERATED by tools/connector/build.mjs (npm run connector:build). Do not edit by hand.\n// The source is the app code, the SQL files and tools/connector/registry/*.yaml.\nexport default ';
export const serialize = (r) => HEAD + JSON.stringify(r, null, 1) + '\n';
export const parseModule = (text) => JSON.parse(text.slice(text.indexOf('export default ') + 'export default '.length));

if (import.meta.url === `file://${process.argv[1]}`) {
  const next = renderRegistry();
  if (process.argv.includes('--check')) {
    const prior = existsSync(REGISTRY_PATH) ? readFileSync(REGISTRY_PATH, 'utf8') : '';
    if (prior !== serialize(next)) {
      console.error('api/_lib/connector/registry.generated.js is stale: run npm run connector:build');
      process.exit(1);
    }
    console.log('connector registry is current');
  } else {
    writeFileSync(REGISTRY_PATH, serialize(next));
    const c = next.counts;
    console.log(`connector registry: ${c.functions_called} functions called, ${c.reachable} reachable (${c.read} read, ${c.undo} undo, ${c.confirm} confirm, ${c.by_argument} by argument; ${c.generated} generated), ${c.excluded_functions} excluded; ${c.tools} tools; ${c.table_writes} direct table writes in ${c.table_write_files} files (measured ${next.measured})`);
  }
}
