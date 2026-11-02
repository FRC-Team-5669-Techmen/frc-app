// The Blue Alliance's PUBLIC pages, parsed (no API key). One parser for every
// reader: api/tba.js (the app's live event feed), tools/scouting/tba-pages.mjs
// (season priors and the replay judge), and tests/tba-pages.test.js, which
// pins it against saved Beach Blitz 2026 pages.
//
//   parseEvent(html, key)      matches with six teams and both scores, the
//                              team list (with names), final alliances, dates
//   parseTeamEvents(html, y)   the event keys a team page lists for one season
//   parseMatchBreakdown(html)  one match's 2026 score breakdown per alliance,
//                              in the TBA API's field names (hubScore,
//                              autoTowerRobotN, endGameTowerRobotN, ...)
//   toImportShape(ev, bds)     the shape scouting-import returns, so
//                              compactMatches (pickRank.js) reads both alike
//
// Team ids stay strings here so offseason B robots ("4414B") survive parsing.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TEAM_LINK = /<a href="\/team\/(\d+[A-Z]?)\/\d+">\s*([0-9]+[A-Z]?)(?:<br>([^<]*))?<\/a>/g
const text = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()

export const levelOf = key => (/_qm\d+$/.test(key) ? 'qm' : /_(sf|f|qf|ef)\d+m\d+$/.test(key) ? 'po' : /_pm\d+$/.test(key) ? 'pm' : 'other')

export function parseEvent(html, key) {
  const matches = []
  const seen = new Set()
  const rowRe = /<tr class="visible-lg">([\s\S]*?)<\/tr>/g
  let m
  while ((m = rowRe.exec(html))) {
    const row = m[1]
    const km = /href="\/match\/([a-z0-9_]+)"/i.exec(row)
    if (!km || seen.has(km[1])) continue
    const cells = [...row.matchAll(/<td[^>]*class="(red|blue)[^"]*"[^>]*>[\s\S]*?<a href="\/team\/\d+\/\d+"[^>]*>([0-9]+[A-Z]?)<\/a>/g)]
    const red = cells.filter(c => c[1] === 'red').map(c => c[2])
    const blue = cells.filter(c => c[1] === 'blue').map(c => c[2])
    const score = color => { const s = new RegExp(`<td[^>]*class="${color}Score[^"]*"[^>]*>[\\s\\S]*?<span[^>]*>(-?\\d+)<\\/span>`).exec(row); return s ? Number(s[1]) : null }
    if (!red.length || !blue.length) continue
    seen.add(km[1])
    const k = km[1]
    const lv = levelOf(k)
    matches.push({ key: k, level: lv === 'pm' ? 'other' : lv, red: { teams: red, score: score('red') }, blue: { teams: blue, score: score('blue') } })
  }
  const alliances = []
  const table = /<table[^>]*id="event-alliances"[^>]*>([\s\S]*?)<\/table>/.exec(html)
  if (table) {
    for (const r of table[1].matchAll(/<tr>\s*<td>Alliance (\d+)<\/td>([\s\S]*?)<\/tr>/g)) {
      alliances[Number(r[1]) - 1] = [...r[2].matchAll(/<a href="\/team\/\d+\/\d+"[^>]*>([0-9]+[A-Z]?)<\/a>/g)].map(x => x[1])
    }
  }
  // The Teams tab: number and nickname of every registered team, before any schedule exists.
  const teams = []
  const tab = html.indexOf('id="teams"')
  if (tab >= 0) {
    const names = new Map()
    for (const t of html.slice(tab).matchAll(TEAM_LINK)) if (t[3] !== undefined && !names.has(t[1])) names.set(t[1], text(t[3]))
    for (const [n, name] of names) teams.push({ n, name })
  }
  const times = [...html.matchAll(/<time datetime="(\d{4}-\d{2}-\d{2})/g)].map(x => x[1])
  let start = times[0] ?? null
  const end = times[1] ?? start
  if (!start) {
    const dm = new RegExp(`(${MONTHS.join('|')}) (\\d+)(?:[^<]{0,30}?(${MONTHS.join('|')})? ?(\\d+))?, (20\\d\\d)`).exec(html)
    start = dm ? `${dm[5]}-${String(MONTHS.indexOf(dm[1]) + 1).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}` : null
  }
  const title = text(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').replace(/\s*-\s*The Blue Alliance\s*$/, '').trim() || key
  return { key, title, start, end: end ?? start, teams, matches, alliances: alliances.filter(Boolean) }
}

/** The event keys a team page lists for one season. */
export function parseTeamEvents(html, year = 2026) {
  return [...new Set([...html.matchAll(new RegExp(`/event/(${year}[a-z0-9]+)`, 'g'))].map(x => x[1]))]
}

const LEVEL = v => { const s = text(v).replace(/\s+/g, ''); return /^level[123]$/i.test(s) ? `Level${s.slice(-1)}` : 'None' }
const num = v => { const m = /-?\d+/.exec(text(v)); return m ? Number(m[0]) : null }

/**
 * One match page's breakdown table -> { red, blue } in the TBA API's 2026
 * field names, or null when the page has no breakdown (not played yet).
 * FUEL is one point each, so hubScore counts equal its points.
 */
export function parseMatchBreakdown(html) {
  const rows = new Map()
  const re = /<tr[^>]*>\s*<td class="(?:red|redScore)"[^>]*>([\s\S]*?)<\/td>\s*<t[dh][^>]*>([^<]+)<\/t[dh]>\s*<td class="(?:blue|blueScore)"[^>]*>([\s\S]*?)<\/td>/g
  for (const m of html.matchAll(re)) rows.set(text(m[2]), [m[1], m[3]])
  if (!rows.has('Total Score')) return null
  const side = i => {
    const cell = label => rows.get(label)?.[i]
    const autoFuel = num(cell('Auto Fuel'))
    const teleop = num(cell('Teleop Fuel Points'))
    const total = num(cell('Total Fuel Points'))
    const shifts = ['Transition Shift Fuel', 'Shift 1 Fuel', 'Shift 2 Fuel', 'Shift 3 Fuel', 'Shift 4 Fuel'].map(l => num(cell(l)))
    const bd = {
      hubScore: { autoCount: autoFuel, autoPoints: autoFuel, transitionCount: shifts[0], shift1Count: shifts[1], shift2Count: shifts[2], shift3Count: shifts[3], shift4Count: shifts[4],
        endgameCount: num(cell('Endgame Fuel')), teleopPoints: teleop, totalPoints: total, totalCount: total },
      autoTowerPoints: num(cell('Auto Tower Points')), endGameTowerPoints: num(cell('Endgame Tower Points')), totalTowerPoints: num(cell('Total Tower Points')),
      foulPoints: num(cell('Foul Points')), adjustPoints: num(cell('Adjustments')), totalPoints: num(cell('Total Score')),
      rp: num(cell('Ranking Points')),
    }
    // Auto TOWER: an ok/remove icon per robot, in robot order.
    const icons = [...String(cell('Auto Tower') ?? '').matchAll(/glyphicon-(ok|remove)/g)].map(x => x[1])
    icons.forEach((v, r) => { bd[`autoTowerRobot${r + 1}`] = v === 'ok' ? 'Level1' : 'None' })
    for (let r = 1; r <= 3; r++) if (rows.has(`Robot ${r} Endgame`)) bd[`endGameTowerRobot${r}`] = LEVEL(cell(`Robot ${r} Endgame`))
    return bd
  }
  return { red: side(0), blue: side(1) }
}

/** parseEvent's result (+ breakdowns by match key) in scouting-import's shape. */
export function toImportShape(ev, breakdowns = {}) {
  const asNum = t => (/^\d+$/.test(t) ? Number(t) : t)
  const names = new Map((ev.teams ?? []).map(t => [String(t.n), t.name]))
  for (const m of ev.matches ?? []) for (const t of [...m.red.teams, ...m.blue.teams]) if (!names.has(t)) names.set(t, '')
  return {
    event_key: ev.key, title: ev.title, start: ev.start, end: ev.end,
    teams: [...names].map(([n, name]) => ({ team_number: asNum(n), payload: { name, source: 'tba' } })),
    matches: (ev.matches ?? []).map(m => ({ key: m.key, teams: [...m.red.teams, ...m.blue.teams].map(asNum), alliances: Object.fromEntries(['red', 'blue'].map(c => [c, {
      teams: m[c].teams.map(asNum), score: m[c].score ?? -1, score_breakdown: breakdowns[m.key]?.[c] ?? null,
    }])) })),
    alliances: (ev.alliances ?? []).map(a => a.map(asNum)),
  }
}
