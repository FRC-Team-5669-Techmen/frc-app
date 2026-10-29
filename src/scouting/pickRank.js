// The pick board's automatic ranking (ledger 0032). Pure: the board, the
// replay tool (tools/scouting/replay.mjs) and the tests all call these.
//
// What each number is, and where it comes from:
//   - FUEL points per match: an OPR fit on The Blue Alliance's alliance HUB
//     points (hubScore.totalPoints), regularized toward the team's season
//     prior, so 2 matches cannot swing a team wildly. The robot cannot be
//     credited a ball by anyone; this is the alliance total split by least
//     squares, the same idea as OPR.
//   - TOWER points per match: EXACT, per robot, from autoTowerRobotN and
//     endGameTowerRobotN in TBA's 2026 score breakdown.
//   - Without a breakdown (an event page with scores only): one OPR on the
//     match score, toward the prior.
//   - Our scouting adds what TBA cannot see: breakdowns (died, broke, stuck,
//     tipped), defense, and a small weight on hand counts, which untrained
//     scouts get wrong (1678 and 3128 measured about 10 percent even when
//     trained, 2026), so counts never carry more than 30 percent.
//   - People's input: scouts' tier votes (median, a few percent), and the
//     strategy lead's Must pick, Avoid and bump, shown separately from the
//     automatic number so the board never hides what the data says.

export const TOWER_POINTS = Object.freeze({
  auto: Object.freeze({ Level1: 15, Level2: 15, Level3: 15 }),
  end: Object.freeze({ Level1: 10, Level2: 20, Level3: 30 }),
})
const LEVEL_POINTS = [0, 10, 20, 30]

const finite = v => typeof v === 'number' && Number.isFinite(v)
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const round1 = v => (finite(v) ? Math.round(v * 10) / 10 : null)

/**
 * Least squares with a pull toward a prior: minimize
 *   sum (y - sum x_team)^2 + lambda * sum (x_team - prior_team)^2
 * rows: [{ teams: [id, id, id], y }]. Answers Map id -> { value, n }.
 * A team in no row keeps its prior (n 0).
 */
export function solveRidge(rows, { lambda = 2, prior = new Map(), fallback = null } = {}) {
  const ids = [...new Set(rows.flatMap(r => r.teams))]
  const index = new Map(ids.map((id, i) => [id, i]))
  const n = ids.length
  const ys = rows.map(r => r.y).filter(finite)
  const avgShare = fallback ?? (ys.length ? mean(ys) / 3 : 0)
  const p = ids.map(id => (finite(prior.get(id)) ? prior.get(id) : avgShare))
  const A = Array.from({ length: n }, () => new Float64Array(n))
  const b = new Float64Array(n)
  const count = new Array(n).fill(0)
  for (const r of rows) {
    if (!finite(r.y)) continue
    const idx = r.teams.map(t => index.get(t))
    for (const i of idx) { count[i]++; b[i] += r.y; for (const j of idx) A[i][j] += 1 }
  }
  for (let i = 0; i < n; i++) { A[i][i] += lambda; b[i] += lambda * p[i] }
  const x = gauss(A, b)
  return new Map(ids.map((id, i) => [id, { value: x[i], n: count[i] }]))
}

function gauss(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) continue
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]))
}

const level = (v) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, '') : ''
  return /^level[123]$/i.test(s) ? `Level${s.slice(-1)}` : null
}

/**
 * Matches as the scouting import returns them (supabase/functions/
 * scouting-import normalizeMatches: { key, alliances: { red: { teams, score,
 * score_breakdown } } }) to the board's compact shape:
 *   { key, level: 'qm' | 'po' | 'other', red: { teams, score, fuel, tower: [per robot], rp, fouls }, blue }
 * fuel, tower, rp and fouls are null where the provider gave no breakdown.
 */
export function compactMatches(matches) {
  return (Array.isArray(matches) ? matches : []).flatMap(m => {
    if (typeof m?.key !== 'string' || !m.alliances) return []
    const lvl = /_qm\d+$/i.test(m.key) ? 'qm' : /_(sf|f|qf|ef)\d+m\d+$/i.test(m.key) ? 'po' : 'other'
    const side = color => {
      const a = m.alliances[color] ?? {}
      const bd = a.score_breakdown && typeof a.score_breakdown === 'object' ? a.score_breakdown : null
      const teams = Array.isArray(a.teams) ? a.teams : []
      const tower = bd ? teams.map((_, i) => (TOWER_POINTS.auto[level(bd[`autoTowerRobot${i + 1}`])] ?? 0) + (TOWER_POINTS.end[level(bd[`endGameTowerRobot${i + 1}`])] ?? 0)) : null
      const fuel = bd && finite(bd.hubScore?.totalPoints) ? bd.hubScore.totalPoints : null
      return { teams, score: finite(a.score) && a.score >= 0 ? a.score : null, fuel, tower, rp: bd && finite(bd.rp) ? bd.rp : null, fouls: bd && finite(bd.foulPoints) ? bd.foulPoints : null }
    }
    return [{ key: m.key, level: lvl, red: side('red'), blue: side('blue') }]
  })
}

/** Played qualification alliances: [{ teams, score, fuel, tower, rp, fouls }]. */
export function playedQuals(matches) {
  return (matches ?? []).filter(m => m.level === 'qm' && finite(m.red?.score) && finite(m.blue?.score)
    && !(m.red.score === 0 && m.blue.score === 0 && m.red.rp == null)).flatMap(m => [m.red, m.blue]).filter(a => a.teams?.length)
}

/**
 * Qualification ranking from match results: average ranking points, then
 * average match score (the manual's later tiebreakers are not in the data).
 * Without a breakdown's RP, a win is 3 and a tie 1. The board shows this
 * as a starting order the operator can fix; TBA's own rank wins when known.
 */
export function rankingFromMatches(matches) {
  const by = new Map()
  for (const m of (matches ?? []).filter(x => x.level === 'qm' && finite(x.red?.score) && finite(x.blue?.score))) {
    for (const [mine, theirs] of [[m.red, m.blue], [m.blue, m.red]]) {
      const rp = finite(mine.rp) ? mine.rp : mine.score > theirs.score ? 3 : mine.score === theirs.score ? 1 : 0
      for (const t of mine.teams) {
        const r = by.get(t) ?? { team: t, rp: 0, score: 0, n: 0 }
        r.rp += rp; r.score += mine.score; r.n++
        by.set(t, r)
      }
    }
  }
  return [...by.values()].map(r => ({ ...r, avgRp: r.rp / r.n, avgScore: r.score / r.n }))
    .sort((a, b) => b.avgRp - a.avgRp || b.avgScore - a.avgScore || String(a.team).localeCompare(String(b.team), undefined, { numeric: true }))
}

/**
 * Per-team estimate of points a robot adds per match, from TBA and the prior.
 * prior: Map id -> { total, fuel?, tower?, source }. Answers Map id -> {
 *   points, fuel, tower, matches, source: 'event' | 'prior' | 'none', priorTotal }.
 */
export function dataRatings(teams, matches, prior = new Map(), { lambda = 2 } = {}) {
  const played = playedQuals(matches)
  const priorTotal = id => (finite(prior.get(id)?.total) ? prior.get(id).total : null)
  const known = teams.map(priorTotal).filter(finite)
  const fallbackTotal = known.length ? mean(known) : null
  const towerPrior = id => (finite(prior.get(id)?.tower) ? prior.get(id).tower : finite(priorTotal(id)) ? Math.min(30, 0.2 * priorTotal(id)) : null)
  const fuelPrior = id => (finite(prior.get(id)?.fuel) ? prior.get(id).fuel : finite(priorTotal(id)) ? priorTotal(id) - towerPrior(id) : null)
  const withBreakdown = played.filter(a => finite(a.fuel) && Array.isArray(a.tower))
  const out = new Map()
  if (withBreakdown.length) {
    const fuelRows = withBreakdown.map(a => ({ teams: a.teams, y: a.fuel }))
    const fp = new Map(teams.map(t => [t, fuelPrior(t)]))
    const fuel = solveRidge(fuelRows, { lambda, prior: fp })
    const towerBy = new Map()
    for (const a of withBreakdown) a.teams.forEach((t, i) => { if (!towerBy.has(t)) towerBy.set(t, []); towerBy.get(t).push(a.tower[i] ?? 0) })
    for (const t of teams) {
      const f = fuel.get(t), tw = towerBy.get(t) ?? [], tp = towerPrior(t)
      const towerValue = tw.length ? (tw.reduce((s, x) => s + x, 0) + 2 * (tp ?? mean(tw))) / (tw.length + 2) : tp
      const fuelValue = f ? f.value : fuelPrior(t)
      out.set(t, { fuel: round1(fuelValue), tower: round1(towerValue), points: finite(fuelValue) || finite(towerValue) ? round1((fuelValue ?? 0) + (towerValue ?? 0)) : null,
        towerExact: tw.length > 0, matches: Math.max(f?.n ?? 0, tw.length), climbs: tw.length ? tw.filter(x => x > 0).length : null, source: f?.n ? 'event' : finite(priorTotal(t)) ? 'prior' : 'none', priorTotal: priorTotal(t) })
    }
    return out
  }
  if (played.length) {
    const total = solveRidge(played.map(a => ({ teams: a.teams, y: a.score })), { lambda, prior: new Map(teams.map(t => [t, priorTotal(t)])), fallback: fallbackTotal })
    for (const t of teams) {
      const r = total.get(t)
      const v = r ? r.value : priorTotal(t)
      out.set(t, { fuel: null, tower: null, points: round1(v), matches: r?.n ?? 0, climbs: null, source: r?.n ? 'event' : finite(priorTotal(t)) ? 'prior' : 'none', priorTotal: priorTotal(t) })
    }
    return out
  }
  for (const t of teams) {
    const v = priorTotal(t)
    out.set(t, { fuel: round1(fuelPrior(t)), tower: round1(towerPrior(t)), points: round1(v), matches: 0, climbs: null, source: finite(v) ? 'prior' : 'none', priorTotal: v })
  }
  return out
}

/**
 * What our scouting adds, from a teamMatchSummary (match.js), a superSummary
 * (superscout.js) and the aggregated pick-list vote (model.js), each optional.
 */
export function scoutSignals({ match, superS, vote } = {}) {
  const trouble = match?.troubleRate
  const tn = trouble?.n ?? 0
  // Shrink toward a 10 percent breakdown rate: 2 bad matches out of 2 is
  // not "breaks every match".
  const troubleRate = (((trouble?.bad ?? 0) + 0.4) / (tn + 4))
  const defenseParts = [match?.defense_rating?.median, superS?.defense?.mean].filter(finite).map(v => v / 5)
  const playedDefense = (match?.defense?.played ?? 0) > 0 || finite(superS?.defense?.mean)
  const driverParts = [match?.driver_skill?.median, superS?.driver_skill?.mean].filter(finite)
  const fuelCount = match?.totalFuel?.median
  const towerScout = match?.tower?.median
  return {
    troubleRate, troubleN: tn, troubleBad: trouble?.bad ?? 0,
    defense: playedDefense && defenseParts.length ? mean(defenseParts) : null,
    driver: driverParts.length ? mean(driverParts) : null,
    fuelCount: finite(fuelCount) ? fuelCount : null, fuelN: match?.totalFuel?.n ?? 0,
    towerScout: finite(towerScout) ? LEVEL_POINTS[Math.round(towerScout)] ?? null : null, towerN: match?.tower?.n ?? 0,
    matches: match?.matches ?? 0,
    voteTier: vote && vote.rankedVotes > 0 ? vote.tier : null, voteN: vote?.support ?? 0,
    voteAvoid: !!vote && vote.support >= 2 && vote.dnpFraction >= 0.5,
    failures: superS?.failures?.length ?? 0,
  }
}

const TIER_MULT = { 1: 1.06, 1.5: 1.03, 2: 1, 2.5: 0.97, 3: 0.94 }

/**
 * One team's value: the data estimate, adjusted by scouting, with every step
 * kept so the board can say why. Answers { value, parts, reasons }.
 */
export function teamValue(data, s = scoutSignals()) {
  let points = data?.points
  let fuel = data?.fuel, tower = data?.tower
  const reasons = []
  const split = finite(fuel) || finite(tower)
  if (split) {
    // Hand counts: at most 30 percent, and only with 2 or more matches.
    if (finite(s.fuelCount) && s.fuelN >= 2 && finite(fuel)) { const w = 0.3 * s.fuelN / (s.fuelN + 3); fuel = (1 - w) * fuel + w * s.fuelCount }
    // TOWER from scouts only where TBA has no per-robot climb yet.
    if (!data?.towerExact && finite(s.towerScout) && s.towerN >= 2) tower = finite(tower) ? (tower + s.towerScout * s.towerN / 2) / (1 + s.towerN / 2) : s.towerScout
    points = (fuel ?? 0) + (tower ?? 0)
  } else if (!finite(points) && (finite(s.fuelCount) || finite(s.towerScout))) {
    // Nothing from TBA or the season: our scouts are all there is.
    fuel = s.fuelCount; tower = s.towerScout
    points = (fuel ?? 0) + (tower ?? 0)
  }
  if (!finite(points)) return { value: null, points: null, fuel: null, tower: null, reliability: null, reasons: ['No data yet'] }
  const reliability = 1 - 0.5 * s.troubleRate
  const voteMult = s.voteTier != null ? (TIER_MULT[s.voteTier] ?? 1) : 1
  const avoidMult = s.voteAvoid ? 0.85 : 1
  const value = points * reliability * voteMult * avoidMult
  if (data?.source === 'event') reasons.push(`${round1(points)} pts a match over ${data.matches} matches`)
  else if (data?.source === 'prior') reasons.push(`${round1(points)} pts a match from the 2026 season`)
  else reasons.push(`${round1(points)} pts a match from our scouts`)
  if (finite(data?.climbs) && data.matches) reasons.push(`climbed ${data.climbs} of ${data.matches}`)
  if (s.troubleN) reasons.push(s.troubleBad ? `broke down in ${s.troubleBad} of ${s.troubleN} scouted` : `no breakdowns in ${s.troubleN} scouted`)
  if (finite(s.defense)) reasons.push(`defense ${Math.round(s.defense * 5 * 10) / 10}/5`)
  if (s.voteTier != null) reasons.push(`scouts: tier ${s.voteTier} (${s.voteN})`)
  if (s.voteAvoid) reasons.push('most scouts say do not pick')
  return { value: round1(value), points: round1(points), fuel: round1(fuel), tower: round1(tower), reliability: round1(reliability * 100), reasons }
}

/**
 * Score for adding a candidate to an alliance that already has `members`
 * (their values). Three robots play, so the gain is the change in the sum of
 * the three best; a quarter of the candidate's own value counts too (a
 * backup and a swap), plus defense, more when the alliance asks for it.
 */
export function roleScore(value, members = [], { defense = null, wantDefense = false } = {}) {
  if (!finite(value)) return null
  const top3 = list => [...list].sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0)
  const vals = members.filter(finite)
  const gain = top3([...vals, value]) - top3(vals)
  const d = finite(defense) ? defense * (wantDefense ? 15 : 4) : 0
  return round1(gain + 0.25 * value + d)
}

/**
 * The board order. teams: [{ id, value, score }], overrides: { [id]: { flag:
 * 'must' | 'avoid', bump } }. Must pick on top, Avoid at the bottom, the rest
 * by score plus the bump (points a person added), ties by team number.
 */
export function boardOrder(rows, overrides = {}) {
  const band = r => (overrides[r.id]?.flag === 'must' ? 0 : overrides[r.id]?.flag === 'avoid' ? 2 : 1)
  const adj = r => (finite(r.score) ? r.score : -1e9) + (finite(overrides[r.id]?.bump) ? overrides[r.id].bump : 0)
  return [...rows].sort((a, b) => band(a) - band(b) || adj(b) - adj(a) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
}
