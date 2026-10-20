// tools/connector/gates.mjs
//
// WHAT A DATABASE FUNCTION DOES, read off its body (tools/connector/sqlchain.mjs),
// never off its name: whether it writes, transitively, and which staff gates
// it reaches. Ported from idea-app tools/connector/gates.mjs.
//
// SCOPE IS EVERY OPERATION HIS ACCOUNT CAN PERFORM, not only staff-gated ones
// (ledger 0013), so a gate does not decide whether a function gets a tool.
// The gates are recorded on each generated entry so a reader can see what the
// function itself checks; the database decides, as him, every time.

export const STAFF_GATES = Object.freeze([
  'is_admin',
  'is_staff',
  'has_role',
  'has_capability',
  'can_approve_signouts',
  '_can_see_member',
  '_hub_member_ok',
  'connector_may_connect',
]);

const GATE_SET = new Set(STAFF_GATES);

/** The staff gates a body calls by name. */
export function gatesIn(body) {
  const found = new Set();
  for (const m of String(body ?? '').matchAll(/(?:\bpublic\.|(?<![a-z0-9_.]))([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const name = m[1].toLowerCase();
    if (GATE_SET.has(name)) found.add(name);
  }
  return [...found].sort();
}

/**
 * Whether a body writes on its own: a DML statement, dynamic SQL, a cron
 * schedule, or an outbound request (pg_net). Conservative on purpose: a write
 * asks first, which is the safe side to be wrong on.
 */
export function bodyWrites(body) {
  const text = String(body ?? '')
    // Dynamic SQL whose text is a literal select (and names no write) is a
    // read: `execute 'select exists (...)' into v using ...`.
    .replace(/\bexecute\s+'\s*select\b(?:[^']|'')*'/gi, (m) => (/\b(insert|update|delete|merge|truncate)\b/i.test(m) ? m : ' '));
  return /\b(insert\s+into|update\s+(?:only\s+)?[a-z_."]+(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+set|delete\s+from|merge\s+into|truncate|execute|cron\.schedule|cron\.unschedule|net\.http_(?:post|get)|nextval|setval)\b/i.test(text);
}

/** Every function a body calls by name (qualified or not). */
export function callsIn(body, known) {
  const out = new Set();
  for (const m of String(body ?? '').matchAll(/(?:\bpublic\.|(?<![a-z0-9_.$]))([a-z_][a-z0-9_]*)\s*\(/gi)) {
    const name = m[1].toLowerCase();
    if (known.has(name)) out.add(name);
  }
  return [...out];
}

/** The functions that write, transitively (a fixpoint over every body). */
export function writers(bodies) {
  const known = new Set(bodies.keys());
  const writes = new Set();
  for (const [name, list] of bodies) if (list.some(bodyWrites)) writes.add(name);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, list] of bodies) {
      if (writes.has(name)) continue;
      if (list.some((b) => callsIn(b, known).some((c) => writes.has(c)))) {
        writes.add(name);
        grew = true;
      }
    }
  }
  return writes;
}

/** The gates each function reaches, directly or through a private `_helper`. */
export function reachedGates(bodies) {
  const known = new Set(bodies.keys());
  const memo = new Map();
  const visit = (name, seen) => {
    if (memo.has(name)) return memo.get(name);
    const out = new Set((bodies.get(name) ?? []).flatMap(gatesIn));
    for (const body of bodies.get(name) ?? []) {
      for (const c of callsIn(body, known)) {
        if (!c.startsWith('_') || seen.has(c) || GATE_SET.has(c)) continue;
        for (const g of visit(c, new Set([...seen, c]))) out.add(g);
      }
    }
    if (seen.size === 1) memo.set(name, out);
    return out;
  };
  const result = new Map();
  for (const name of bodies.keys()) result.set(name, [...visit(name, new Set([name]))].sort());
  return result;
}
