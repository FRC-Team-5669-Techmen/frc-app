// The auto routine log (migration 0028, ledger 0017, part D2). Mr. Pina:
// "Autos have to work more than twice in a row." Pure: the page and the
// connector use the same streak and readiness rule.

// PROPOSED DEFAULT, not team policy yet: a routine is competition-ready at
// this many successes in a row (partial and fail both break a streak).
export const AUTO_READY_STREAK = 5
export const RATE_WINDOW = 10

export const RESULTS = Object.freeze([
  { key: 'success', label: 'Success' },
  { key: 'partial', label: 'Partial' },
  { key: 'fail', label: 'Fail' },
])
export const resultLabel = (k) => RESULTS.find((r) => r.key === k)?.label ?? k

const t = (r) => Date.parse(r?.ran_at ?? r?.created_at ?? '') || 0

/** One routine's numbers from its runs. */
export function routineStats(routine, allRuns, ready = AUTO_READY_STREAK) {
  const runs = allRuns.filter((r) => r.routine_id === routine.id).sort((a, b) => t(b) - t(a))
  let streak = 0
  for (const r of runs) { if (r.result === 'success') streak++; else break }
  let best = 0, cur = 0
  for (const r of [...runs].reverse()) { cur = r.result === 'success' ? cur + 1 : 0; best = Math.max(best, cur) }
  const window = runs.slice(0, RATE_WINDOW)
  const successes = window.filter((r) => r.result === 'success').length
  return {
    ...routine, runs, runCount: runs.length, streak, best,
    rate: window.length ? successes / window.length : null, rateN: window.length, successes,
    ready: routine.active !== false && streak >= ready,
    last: runs[0] ?? null,
  }
}

/** Ready first, then longest streak, then best rate; retired last. */
export function routineBoard(routines, runs, ready = AUTO_READY_STREAK) {
  return (routines ?? []).map((r) => routineStats(r, runs ?? [], ready)).sort((a, b) =>
    (a.active === false) - (b.active === false) || Number(b.ready) - Number(a.ready) || b.streak - a.streak
    || (b.rate ?? -1) - (a.rate ?? -1) || String(a.name).localeCompare(String(b.name)))
}
