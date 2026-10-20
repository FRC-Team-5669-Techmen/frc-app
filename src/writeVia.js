// Every write the app makes goes through a database function, so Claude can
// make it too (docs/subsystems/connector.md). This is the one place a page's
// write may still touch a table directly, and only as the fallback while the
// function's migration has not been pasted yet.
//
//   const { data, error } = await writeVia(supabase, 'schedule_delete_event', { p_event: id },
//     { table: 'events', op: 'delete', eq: { id } })
//
// WHY THE FALLBACK. SQL reaches the live database only when Mr. Pina pastes it
// in the Supabase SQL editor, and every push to main deploys to students who
// may be mid check-in (CLAUDE.md). Between the push and the paste the function
// does not exist, and the page must behave exactly as it did before: so when
// the call answers "no such function" (PGRST202 / 42883, src/schemaMissing.js)
// the page's old direct write runs instead, described as data below. After
// the paste the function runs and the fallback is never read.
//
// tests/connector-coverage.test.js fails on any `.from(...)` insert, update,
// upsert or delete anywhere under src/ outside this file (and the fixture
// engine), which is what makes a new page-level write impossible to ship.
//
// A FALLBACK is one step, an array of steps, or { steps, result }:
//
//   step   { table, op: 'insert' | 'update' | 'upsert' | 'delete',
//            values,                     the row(s) or patch (insert/update/upsert)
//            options,                    passed to insert/upsert ({ onConflict, ignoreDuplicates })
//            eq: { col: v }, in: { col: [..] }, match: { .. },   filters, in that order
//            select: 'id' | '*',         RETURNING, only where the page read it back
//            single: true,               .single() after the select
//            keepGoing: true }           a failure here does not stop the later steps
//   A step may be a function (ctx) => step | null (null skips it), and
//   `values` may be a function (ctx) => values; ctx.results holds every
//   earlier step's { data, error }.
//   result (ctx) => data              shapes the fallback's data like the
//                                     function's return (defaults to the last
//                                     step's data)
//
// Answers { data, error, via: 'function' | 'direct' }, supabase-js shaped. The
// first error a fallback meets is the error answered; a step without keepGoing
// stops there, as the page's own sequence used to.
//
// Pure apart from the client passed in: tests/write-via.test.js drives it with
// a stand-in that answers the way PostgREST does.

import { isMissingFunction } from './schemaMissing.js'

// Functions this tab has already seen missing. The check-in path pays the
// failed call once per page load, not once per write. A paste mid-session is
// picked up on the next load; until then the tab writes as it always did.
const missing = new Set()

export function _resetWriteVia() { missing.clear() }

function asSteps(fallback) {
  if (!fallback) return { steps: [], result: null }
  if (Array.isArray(fallback)) return { steps: fallback, result: null }
  if (typeof fallback === 'function' || fallback.table) return { steps: [fallback], result: null }
  return { steps: fallback.steps ?? [], result: fallback.result ?? null }
}

function build(client, step, ctx) {
  const values = typeof step.values === 'function' ? step.values(ctx) : step.values
  const table = client.from(step.table)
  let q
  if (step.op === 'insert') q = step.options ? table.insert(values, step.options) : table.insert(values)
  else if (step.op === 'upsert') q = step.options ? table.upsert(values, step.options) : table.upsert(values)
  else if (step.op === 'update') q = table.update(values)
  else if (step.op === 'delete') q = table.delete()
  else throw new Error(`writeVia: unknown op ${step.op}`)
  for (const [k, v] of Object.entries(step.eq ?? {})) q = q.eq(k, v)
  for (const [k, v] of Object.entries(step.in ?? {})) q = q.in(k, v)
  if (step.match) q = q.match(step.match)
  if (step.select) q = q.select(step.select === true ? '*' : step.select)
  if (step.single) q = q.single()
  return q
}

export async function runDirect(client, fallback) {
  const { steps, result } = asSteps(fallback)
  const ctx = { results: [] }
  let firstError = null
  let last = { data: null, error: null }
  for (const raw of steps) {
    const step = typeof raw === 'function' ? raw(ctx) : raw
    if (!step) { ctx.results.push(null); continue }
    if (step.when && !step.when(ctx)) { ctx.results.push(null); continue }
    let res
    try {
      res = await build(client, step, ctx)
    } catch (err) {
      res = { data: null, error: err }
    }
    last = { data: res?.data ?? null, error: res?.error ?? null }
    ctx.results.push(last)
    if (last.error) {
      firstError ??= last.error
      if (!step.keepGoing) break
    }
  }
  const data = firstError && !result ? last.data : (result ? result(ctx) : last.data)
  return { data: data ?? null, error: firstError, via: 'direct' }
}

export async function writeVia(client, fn, args, fallback) {
  if (!missing.has(fn)) {
    const res = await client.rpc(fn, args ?? {})
    const error = res?.error ?? null
    if (!error || !isMissingFunction(error)) return { data: res?.data ?? null, error, via: 'function' }
    missing.add(fn)
  }
  return runDirect(client, fallback)
}
