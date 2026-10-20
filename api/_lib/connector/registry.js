// THE REGISTRY, as the server reads it. One source of tools:
// registry.generated.js (written by `npm run connector:build` from the app
// code, the SQL files and tools/connector/registry/*.yaml). Nothing here
// names a function or a level of its own.
import REGISTRY from './registry.generated.js'

export { REGISTRY }

export const TOOLS = REGISTRY.tools
export const FUNCTIONS = REGISTRY.functions

/** A live (not excluded) function entry, or null. */
export function liveFunction(name) {
  const e = FUNCTIONS[name]
  return e && !e.excluded ? e : null
}

/** Evaluate one `level_when` condition (`p_amount > 0`, `p_grant = true`) on the call's arguments. */
export function conditionHolds(cond, args) {
  const m = /^\s*([a-z_][a-z0-9_]*)\s*(>=|<=|!=|=|>|<)\s*(.+?)\s*$/.exec(cond ?? '')
  if (!m) return false
  const [, key, op, rawRight] = m
  const left = args?.[key]
  if (left === undefined || left === null) return false
  let right = rawRight.replace(/^['"]|['"]$/g, '')
  if (right === 'true' || right === 'false') {
    const l = left === true || left === 'true'
    const r = right === 'true'
    return op === '=' ? l === r : op === '!=' ? l !== r : false
  }
  const ln = Number(left)
  const rn = Number(right)
  if (Number.isFinite(ln) && Number.isFinite(rn)) {
    return { '>': ln > rn, '<': ln < rn, '>=': ln >= rn, '<=': ln <= rn, '=': ln === rn, '!=': ln !== rn }[op]
  }
  return op === '=' ? String(left) === right : op === '!=' ? String(left) !== right : false
}

/** The level the server enforces for this call: the entry's, or its level_when branch. */
export function levelFor(entry, args) {
  if (entry.level_when?.length) {
    for (const branch of entry.level_when) {
      if (branch.if && conditionHolds(branch.if, args)) return branch.level
      if (branch.else) return branch.else
    }
    return 'confirm'
  }
  return entry.level ?? 'confirm'
}

/** The rows connector_registry holds, synced by the server (no migration needed for a new entry). */
export function registryRows() {
  return Object.values(FUNCTIONS)
    .filter((f) => !f.excluded)
    .map((f) => ({
      function_name: f.name,
      tool: Object.values(TOOLS).find((t) => t.function === f.name)?.name ?? 'call_app',
      level: f.level_when ? 'confirm' : f.level,
    }))
}

/** One form of a function the given arguments fit (every key known, every required one present). */
export function fitForm(entry, args) {
  const keys = Object.keys(args ?? {})
  const fits = (entry.forms ?? []).filter((form) => {
    const names = form.args.map((a) => a.name)
    return keys.every((k) => names.includes(k)) && form.args.every((a) => a.optional || keys.includes(a.name))
  })
  return fits.length === 1 ? { ok: true, form: fits[0] } : { ok: false, count: fits.length }
}
