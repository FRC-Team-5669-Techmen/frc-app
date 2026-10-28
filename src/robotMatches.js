// The robot match log (migration 0038, ledger 0028). Pure: parsing a robot
// match file, the numbers people compare, matching the robot's typed names to
// members, batteries and auto routines, and the trend math. The pages and the
// connector read this one module. The SERVER copies the same columns from the
// same paths (0038's _rm_extract); tests/robot-matches.test.js holds the two
// lists equal, and the match label and event rules too.
//
// The robot's file (FRC-Team-5669-Techmen/2026-5669-Official,
// src/main/java/frc/robot/practice/MatchTelemetry.java, schema 1) is kept
// whole: unknown fields are never rejected, the schema will grow.

export const KINDS = Object.freeze(['practice', 'qual', 'playoff', 'practice_fms', 'auto_test', 'teleop_session', 'fms'])
export const KIND_LABELS = Object.freeze({ practice: 'Practice', qual: 'Qualification', playoff: 'Playoff', practice_fms: 'Practice (field)', auto_test: 'Auto test', teleop_session: 'Teleop session', fms: 'Field match' })
/** Matches played on a real field: the battery run is a match run, the drive session a match. */
export const REAL_KINDS = Object.freeze(['qual', 'playoff', 'practice_fms', 'fms'])
export const ROBOT_REPO = Object.freeze({ owner: 'FRC-Team-5669-Techmen', repo: '2026-5669-Official', dir: 'match-data/matches', branch: 'main' })
export const FILE_NAME = /^[A-Za-z0-9._-]{1,120}\.json$/
export const SIM_MERGE_SECONDS = 300

// column -> path in the file. 0038's _rm_extract reads exactly these.
export const COLUMN_PATHS = Object.freeze([
  ['schema_version', ['schema']], ['robot_match', ['robotMatch']], ['fms_match_number', ['fmsMatchNumber']], ['station', ['station']],
  ['auto_balls', ['scoring', 'autoBalls']], ['open_balls', ['scoring', 'ballsHubOpen']], ['closed_balls', ['scoring', 'ballsHubClosed']],
  ['passes', ['scoring', 'passes']], ['balls_total', ['scoring', 'ballsTotal']], ['ready_pct', ['scoring', 'readyWhileRtHeldPct']],
  ['battery_start', ['battery', 'start']], ['battery_min', ['battery', 'min']], ['battery_end', ['battery', 'end']], ['brownouts', ['battery', 'brownouts']],
  ['hang_at_seconds', ['climb', 'hangAtSeconds']], ['distance_m', ['drive', 'distanceMeters']], ['duration_s', ['durationSeconds']],
])
const INT_COLUMNS = new Set(['schema_version', 'robot_match', 'fms_match_number', 'station', 'auto_balls', 'open_balls', 'closed_balls', 'passes', 'balls_total', 'brownouts'])
const VOLT_COLUMNS = new Set(['battery_start', 'battery_min', 'battery_end'])

const at = (obj, path) => path.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

/** The label people use, the same rule as 0038's _rm_label: qm12, pm3, playoff 4, practice 7. */
export function matchLabel(kind, fmsNumber, robotMatch) {
  const n = Number(fmsNumber) || 0
  if (kind === 'qual' && n > 0) return `qm${n}`
  if (kind === 'practice_fms' && n > 0) return `pm${n}`
  if (kind === 'playoff' && n > 0) return `playoff ${n}`
  const k = String(kind ?? '').replace(/_/g, ' ')
  return robotMatch !== null && robotMatch !== undefined ? `${k} ${robotMatch}` : k
}

/**
 * The robot writes startedAt as its local wall-clock time with no zone (the
 * Driver Station sets the roboRIO clock from the laptop). Read as Los Angeles,
 * as 0038 does. Answers epoch ms, or null.
 */
export function startedAtMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(s ?? ''))
  if (!m) return null
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi, se)
  // The Los Angeles offset at that wall time (DST-aware), found by formatting.
  for (const off of [-7, -8]) {
    const t = guess - off * 3600e3
    const la = new Date(t).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const [md, hms] = la.split(', ')
    const [mm, dd, yy] = md.split('/').map(Number)
    const [hh, mn, ss] = hms.split(':').map(Number)
    if (yy === y && mm === mo && dd === d && (hh % 24) === h && mn === mi && ss === se) return t
  }
  return guess + 8 * 3600e3
}

/**
 * One robot file, checked the way 0038 checks it, with the compared numbers
 * pulled out for the preview. Never drops a field: `raw` is the file as read.
 * Answers { ok: true, fileName, raw, cols } or { ok: false, fileName, error }.
 */
export function parseMatchFile(input, fileName) {
  const name = String(fileName ?? '').split(/[\\/]/).pop()
  if (!FILE_NAME.test(name)) return { ok: false, fileName: name, error: 'A match file name ends in .json and has no spaces or slashes.' }
  let raw = input
  if (typeof input === 'string') {
    try { raw = JSON.parse(input) } catch { return { ok: false, fileName: name, error: 'This file is not valid JSON.' } }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, fileName: name, error: 'The match file must be a JSON object.' }
  if (!(Number.isInteger(raw.schema) && raw.schema >= 1)) return { ok: false, fileName: name, error: 'This is not a robot match file (no schema version).' }
  if (!KINDS.includes(raw.kind)) return { ok: false, fileName: name, error: `Unknown match kind ${raw.kind}.` }
  const started = startedAtMs(raw.startedAt)
  if (started === null) return { ok: false, fileName: name, error: 'The match file has no readable startedAt.' }
  const cols = { kind: raw.kind, started_at: new Date(started).toISOString(), fms: typeof raw.fms === 'boolean' ? raw.fms : null,
    event_code: text(raw.event, 40), fms_match_type: text(raw.fmsMatchType, 40), alliance: ['red', 'blue'].includes(raw.alliance) ? raw.alliance : null,
    auto_name: text(raw.autoName, 120), auto_winner: ['red', 'blue'].includes(raw.autoWinner) ? raw.autoWinner : null,
    auto_winner_random: typeof raw.autoWinnerRandom === 'boolean' ? raw.autoWinnerRandom : null,
    crew_typed: Object.fromEntries([['driver', text(raw.driver, 80)], ['operator', text(raw.operator, 80)], ['coach', text(raw.coach, 80)], ['battery', text(raw.batteryLabel, 40)]].filter(([, v]) => v)) }
  for (const [col, path] of COLUMN_PATHS) {
    let v = num(at(raw, path))
    if (v !== null && INT_COLUMNS.has(col)) v = Math.abs(v) < 1e6 ? Math.round(v) : null
    if (v !== null && VOLT_COLUMNS.has(col) && (v < 0 || v > 16)) v = null
    cols[col] = v
  }
  cols.match_label = matchLabel(cols.kind, cols.fms_match_number, cols.robot_match)
  return { ok: true, fileName: name, raw, cols }
}

// ---- matching the robot's typed names ----

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The member a typed crew name means. exact: the full name, nickname or
 * display name, ignoring case and punctuation. Otherwise every member whose
 * name has a word starting with each typed word ("Mathias" -> Mathias
 * Garcia), offered for confirmation, never applied silently.
 * members: [{ id, name, full_name, nickname }]
 */
export function matchMember(typed, members) {
  const t = norm(typed)
  if (!t) return { status: 'blank', member: null, candidates: [] }
  const names = (m) => [m.name, m.full_name, m.nickname].map(norm).filter(Boolean)
  const exact = (members ?? []).filter((m) => names(m).includes(t))
  if (exact.length === 1) return { status: 'exact', member: exact[0], candidates: exact }
  const words = t.split(' ')
  const loose = (members ?? []).filter((m) => names(m).some((n) => { const w = n.split(' '); return words.every((x) => w.some((y) => y.startsWith(x))) }))
  const candidates = exact.length > 1 ? exact : loose
  return { status: candidates.length ? 'confirm' : 'none', member: candidates.length === 1 ? candidates[0] : null, candidates }
}

/**
 * matchMember, plus the choices made on earlier imports: once someone picks
 * who "Sam S" is, the next file typed "Sam S" links to them without asking
 * (status 'remembered'), so imports between matches stay one tap. remembered:
 * { [nameKey(typed)]: memberId }; a member who is no longer listed is ignored.
 */
export const nameKey = (typed) => norm(typed)
export function recallMember(typed, members, remembered = {}) {
  const m = matchMember(typed, members)
  if (m.status === 'exact' || m.status === 'blank') return m
  const id = remembered?.[nameKey(typed)]
  const hit = id ? (members ?? []).find((x) => x.id === id) : null
  return hit ? { status: 'remembered', member: hit, candidates: [hit] } : m
}

const batteryKey = (s) => { const m = /^([a-z]*)\s*0*(\d+)$/.exec(norm(s).replace(/ /g, '')); return m ? `${m[1] || 'b'}${m[2]}` : norm(s).replace(/ /g, '') }
/** B7, b07 and "B 07" are B07. exact or none; never a guess. */
export function matchBattery(label, batteries) {
  if (!norm(label)) return { status: 'blank', battery: null }
  const hit = (batteries ?? []).filter((b) => batteryKey(b.label) === batteryKey(label))
  return hit.length === 1 ? { status: 'exact', battery: hit[0] } : { status: 'none', battery: null }
}
/** The auto routine by name, ignoring case and spacing; none means offer to add it. */
export function matchRoutine(name, routines) {
  if (!norm(name)) return { status: 'blank', routine: null }
  const hit = (routines ?? []).filter((r) => norm(r.name) === norm(name))
  return hit.length === 1 ? { status: 'exact', routine: hit[0] } : { status: 'missing', routine: null }
}
/** The one Match Sim row with no file, within 5 minutes on the same alliance (0038's merge rule), or null. */
export function simCandidate(cols, rows) {
  const t = Date.parse(cols.started_at)
  const hits = (rows ?? []).filter((r) => r.source === 'sim_page' && !r.file_name && Math.abs(Date.parse(r.started_at) - t) <= SIM_MERGE_SECONDS * 1000 && (!r.alliance || r.alliance === cols.alliance))
  return hits.length === 1 ? hits[0] : null
}
/** The one competition running (a day either side) when the match started, as 0038's _rm_event; real matches only. */
export function eventFor(cols, events) {
  if (!REAL_KINDS.includes(cols.kind) && cols.fms !== true) return null
  const t = Date.parse(cols.started_at)
  const hits = (events ?? []).filter((e) => e.kind === 'competition' && t >= Date.parse(e.starts_at) - 864e5 && t <= Date.parse(e.ends_at) + 864e5)
  return hits.length === 1 ? hits[0] : null
}

/**
 * The import plan for one parsed file, shown before saving: what will link,
 * what needs a confirmation, and the rows it will write. existing: the file
 * names already imported.
 */
export function planImport(parsed, { members = [], batteries = [], routines = [], events = [], simRows = [], existing = new Set(), remembered = {} } = {}) {
  if (!parsed.ok) return { fileName: parsed.fileName, status: 'error', error: parsed.error }
  if (existing.has(parsed.fileName)) return { fileName: parsed.fileName, status: 'already', cols: parsed.cols }
  const c = parsed.cols
  const crew = Object.fromEntries(['driver', 'operator', 'coach'].map((role) => [role, recallMember(c.crew_typed[role], members, remembered)]))
  const battery = matchBattery(c.crew_typed.battery, batteries)
  const routine = matchRoutine(c.auto_name, routines)
  const sim = simCandidate(c, simRows)
  const event = eventFor(c, events)
  const confirm = [...Object.entries(crew).filter(([, m]) => m.status === 'confirm').map(([r, m]) => `${r} "${c.crew_typed[r]}" could be ${m.candidates.map((x) => x.name).join(' or ')}`),
    ...(c.crew_typed.battery && battery.status === 'none' ? [`battery "${c.crew_typed.battery}" is not in the battery log`] : []),
    ...(routine.status === 'missing' ? [`auto "${c.auto_name}" is not an auto routine yet`] : [])]
  return {
    fileName: parsed.fileName, status: 'new', cols: c, raw: parsed.raw, crew, battery, routine, sim, event, confirm,
    writes: { batteryRun: !!battery.battery && !sim?.battery_run_id, driveSession: ['exact', 'remembered'].includes(crew.driver.status) || (crew.driver.status === 'confirm' && !!crew.driver.member) },
  }
}

/** The links object 0038's robot_match_import takes, from a plan and the choices made on it. */
export function importLinks(plan, choice = {}) {
  const pick = (role) => (choice[role] !== undefined ? choice[role] : ['exact', 'remembered'].includes(plan.crew[role]?.status) ? plan.crew[role].member.id : null)
  const links = { driver: pick('driver'), operator: pick('operator'), coach: pick('coach'), human_player: choice.human_player ?? null,
    battery: choice.battery !== undefined ? choice.battery : plan.battery?.battery?.id ?? null,
    routine: choice.routine !== undefined ? choice.routine : plan.routine?.routine?.id ?? null,
    sim_match: choice.sim_match !== undefined ? choice.sim_match : plan.sim?.id ?? null,
    event: choice.event !== undefined ? choice.event : plan.event?.id ?? null }
  if (!links.routine && choice.addRoutine && plan.cols?.auto_name) links.new_routine = plan.cols.auto_name.slice(0, 60)
  return Object.fromEntries(Object.entries(links).filter(([, v]) => v !== undefined))
}

// ---- trends and comparison ----

/**
 * Shots the robot fired at an active HUB (auto + open hub), from its own count
 * of balls leaving the shooter. The robot cannot see whether a ball went in;
 * nobody counts by hand. null when the robot recorded nothing.
 */
export const shots = (m) => ((m.auto_balls ?? null) === null && (m.open_balls ?? null) === null ? null : (m.auto_balls ?? 0) + (m.open_balls ?? 0))
/** Balls in, only when someone counted them (from video, or on the Match Sim page). Never estimated. */
export const counted = (m) => m.scorer_balls_in ?? null
/** Shots fired while our HUB was inactive: they score nothing. */
export const wasted = (m) => m.closed_balls ?? null
const mean = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined && Number.isFinite(Number(x))).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
const byTime = (a, b) => String(a.started_at).localeCompare(String(b.started_at))

/** Per driver, oldest match first: shots at an active HUB, shots at a closed one, ready %, hang time, counted balls in, with averages. A missing number is never 0. */
export function driverTrends(matches, nameOf = () => '') {
  const out = new Map()
  for (const m of [...(matches ?? [])].sort(byTime)) {
    if (!m.driver_id) continue
    if (!out.has(m.driver_id)) out.set(m.driver_id, { id: m.driver_id, name: nameOf(m.driver_id), points: [] })
    out.get(m.driver_id).points.push({ id: m.id, at: m.started_at, label: m.match_label, shots: shots(m), counted: counted(m), wasted: wasted(m), ready: m.ready_pct === null || m.ready_pct === undefined ? null : Number(m.ready_pct), hang: m.hang_at_seconds === null || m.hang_at_seconds === undefined ? null : Number(m.hang_at_seconds) })
  }
  return [...out.values()].map((d) => ({ ...d, matches: d.points.length, avg: { shots: mean(d.points.map((p) => p.shots)), counted: mean(d.points.map((p) => p.counted)), wasted: mean(d.points.map((p) => p.wasted)), ready: mean(d.points.map((p) => p.ready)), hang: mean(d.points.map((p) => p.hang)) } }))
    .sort((a, b) => b.matches - a.matches || String(a.name).localeCompare(String(b.name)))
}

/** Per battery, oldest run first: minimum voltage and brownouts, with the lowest minimum and total brownouts. */
export function batteryTrends(matches, labelOf = () => '') {
  const out = new Map()
  for (const m of [...(matches ?? [])].sort(byTime)) {
    if (!m.battery_id) continue
    if (!out.has(m.battery_id)) out.set(m.battery_id, { id: m.battery_id, label: labelOf(m.battery_id), points: [] })
    out.get(m.battery_id).points.push({ id: m.id, at: m.started_at, label: m.match_label, min: m.battery_min === null || m.battery_min === undefined ? null : Number(m.battery_min), brownouts: m.brownouts ?? null })
  }
  return [...out.values()].map((b) => {
    const mins = b.points.map((p) => p.min).filter((x) => x !== null)
    const bo = b.points.map((p) => p.brownouts).filter((x) => x !== null)
    return { ...b, runs: b.points.length, lowest: mins.length ? Math.min(...mins) : null, avgMin: mean(mins), brownouts: bo.length ? bo.reduce((a, x) => a + x, 0) : null }
  }).sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
}

/** The rows of a side-by-side comparison: one per metric, one value per match, best marked where higher or lower is better. */
export const COMPARE_ROWS = Object.freeze([
  ['shots', 'Shots at an active HUB', shots, 'high'], ['wasted', 'Shots at a closed HUB', wasted, 'low'], ['counted', 'Balls in (counted)', counted, 'high'], ['passes', 'Passes', (m) => m.passes ?? null, 'high'],
  ['auto', 'Auto balls', (m) => m.auto_balls ?? null, 'high'], ['ready', 'Ready while RT held %', (m) => (m.ready_pct ?? null) === null ? null : Number(m.ready_pct), 'high'],
  ['hang', 'Hung at (s into teleop)', (m) => (m.hang_at_seconds ?? null) === null ? null : Number(m.hang_at_seconds), 'low'],
  ['bmin', 'Battery minimum V', (m) => (m.battery_min ?? null) === null ? null : Number(m.battery_min), 'high'], ['brownouts', 'Brownouts', (m) => m.brownouts ?? null, 'low'],
  ['distance', 'Distance m', (m) => (m.distance_m ?? null) === null ? null : Number(m.distance_m), null], ['score', 'Alliance score', (m) => m.match_score ?? null, 'high'],
])
export function compareMatches(matches) {
  return COMPARE_ROWS.map(([key, label, get, better]) => {
    const values = matches.map((m) => get(m))
    const known = values.filter((v) => v !== null)
    const best = !better || known.length < 2 ? null : better === 'high' ? Math.max(...known) : Math.min(...known)
    return { key, label, values, best: known.every((v) => v === best) ? null : best }
  })
}

/** Not-ready reasons, longest first, without the "-" placeholder. */
export function notReadyReasons(raw) {
  const r = raw?.scoring?.notReadySecondsByReason
  if (!r || typeof r !== 'object') return []
  return Object.entries(r).filter(([k, v]) => k !== '-' && typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1]).map(([reason, seconds]) => ({ reason, seconds }))
}

/** Filter the log: kind, event, driver, battery, and a date range (LA days, inclusive). */
export function filterMatches(matches, f = {}) {
  const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  return (matches ?? []).filter((m) => (!f.kind || (f.kind === 'real' ? REAL_KINDS.includes(m.kind) : m.kind === f.kind))
    && (!f.event || m.event_id === f.event) && (!f.driver || m.driver_id === f.driver) && (!f.battery || m.battery_id === f.battery)
    && (!f.from || day(m.started_at) >= f.from) && (!f.to || day(m.started_at) <= f.to))
}

// ---- the robot repo ----

/** Where one match file is downloaded from (public repo, no token). */
export const rawFileUrl = (name) => `https://raw.githubusercontent.com/${ROBOT_REPO.owner}/${ROBOT_REPO.repo}/${ROBOT_REPO.branch}/${ROBOT_REPO.dir}/${encodeURIComponent(name)}`

/**
 * The robot repo's match files, newest name first, through the public GitHub
 * contents API. Answers { files: [{ name, url }] }, { files: [], empty: true }
 * when the folder does not exist yet, or { error }.
 */
export async function listRobotFiles(fetchImpl = globalThis.fetch) {
  const url = `https://api.github.com/repos/${ROBOT_REPO.owner}/${ROBOT_REPO.repo}/contents/${ROBOT_REPO.dir}?ref=${ROBOT_REPO.branch}`
  let r
  try { r = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } }) } catch { return { error: 'GitHub could not be reached. Check the connection and try again.' } }
  if (r.status === 404) return { files: [], empty: true }
  if (r.status === 403 || r.status === 429) return { error: 'GitHub is limiting requests from this network for now. Try again in an hour, or drop the files instead.' }
  if (!r.ok) return { error: `GitHub answered ${r.status}. Nothing was imported.` }
  const list = await r.json().catch(() => [])
  return { files: (Array.isArray(list) ? list : []).filter((f) => f.type === 'file' && FILE_NAME.test(f.name)).map((f) => ({ name: f.name, url: f.download_url || rawFileUrl(f.name) })).sort((a, b) => b.name.localeCompare(a.name)) }
}

export const fmt = (v, digits = 0) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '--' : Number(v).toFixed(digits))

// ---- power (migration 0041, ledger 0031) ----
//
// The robot's "power" object (subsystems/PowerMonitor.java matchFinished):
// rested voltage before the match, resistance of battery PLUS the robot's
// main wiring fitted from its own load, the lowest moment and what drew the
// current then, brownout snapshots, and a verdict. The robot code is still
// growing, so every field is optional and unknown ones are kept. Older files
// have no "power" at all.

/** column -> field of `power`. 0041's _rm_extract_power reads exactly these (tests hold them equal). */
export const POWER_COLUMN_PATHS = Object.freeze([
  ['rest_volts_before', 'restVoltsBefore'], ['robot_resistance_mohm', 'resistanceMilliOhm'], ['min_volts', 'minVolts'],
  ['amps_at_min', 'ampsAtMin'], ['peak_amps', 'peakAmps'], ['dips_below_7v', 'dipsBelow7V'],
])
const inRange = (v, lo, hi) => (v !== null && v >= lo && v <= hi ? v : null)
const int = (v) => (v !== null && Math.abs(v) < 1e6 ? Math.round(v) : null)

/** The power object of a file (or a stored row's raw), or null. */
export const powerOf = (raw) => (raw && typeof raw.power === 'object' && raw.power && !Array.isArray(raw.power) ? raw.power : null)

/** The typed power columns, the same rules as 0041's _rm_extract_power: out of range or not a number is null, never 0. */
export function powerColumns(raw) {
  const p = powerOf(raw)
  const g = (k) => num(p?.[k])
  return {
    power: p,
    rest_volts_before: inRange(g('restVoltsBefore'), 0, 16),
    robot_resistance_mohm: inRange(g('resistanceMilliOhm'), 0, 500),
    min_volts: inRange(g('minVolts'), 0, 16) ?? inRange(g('pdhMinVolts'), 0, 16),
    amps_at_min: int(g('ampsAtMin')),
    peak_amps: int(g('peakAmps')),
    dips_below_7v: int(g('dipsBelow7V')),
    verdict: text(p?.verdict, 2000),
  }
}

const sortedEntries = (o) => (o && typeof o === 'object' && !Array.isArray(o)
  ? Object.entries(o).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => b[1] - a[1]) : [])

/**
 * Everything the match detail and the connector show about power, read
 * defensively from the object (a missing field is null or empty, never 0).
 * Answers null when the file has no power section.
 */
export function readPower(power) {
  if (!power || typeof power !== 'object' || Array.isArray(power)) return null
  const c = powerColumns({ power })
  const snaps = Array.isArray(power.brownoutSnapshots) ? power.brownoutSnapshots.filter((s) => s && typeof s === 'object') : []
  const sticky = Array.isArray(power.stickyFaults) ? power.stickyFaults.filter((s) => s && typeof s === 'object') : []
  return {
    restVolts: c.rest_volts_before, resistance: c.robot_resistance_mohm, fits: num(power.resistanceFits), openCircuitVolts: num(power.openCircuitVolts),
    minVolts: c.min_volts, pdhMinVolts: num(power.pdhMinVolts), rioMinVolts: num(power.rioMinVolts),
    ampsAtMin: c.amps_at_min, topDraw: sortedEntries(power.topDrawAtMin).map(([mechanism, amps]) => ({ mechanism, amps })),
    branchDrop: sortedEntries(power.branchDropAtMin).map(([mechanism, volts]) => ({ mechanism, volts })),
    peakAmps: c.peak_amps, ampHours: num(power.ampHours), dipsBelow7V: c.dips_below_7v, brownouts: int(num(power.brownouts)),
    snapshots: snaps.map((s) => ({ t: num(s.t), matchTime: num(s.matchTime), lowestVolts: num(s.lowestVolts), amps: num(s.ampsThen),
      topDraw: sortedEntries(s.topDraw).map(([mechanism, amps]) => ({ mechanism, amps })), resistance: num(s.resistanceMilliOhm) })),
    stickyFaults: sticky.map((s) => ({ device: text(s.device, 80) ?? 'device', faults: Array.isArray(s.faults) ? s.faults.filter((f) => typeof f === 'string') : [] })),
    sameBatteryAsLastMatch: typeof power.sameBatteryAsLastMatch === 'boolean' ? power.sameBatteryAsLastMatch : null,
    verdict: c.verdict,
  }
}

// ---- the robot's battery history (match-data/battery-history.csv) ----

export const HISTORY_PATH = 'match-data/battery-history.csv'
export const HISTORY_COLUMNS = Object.freeze(['time', 'kind', 'battery', 'rest_v', 'resistance_mohm', 'min_v', 'amps_at_min', 'brownouts', 'verdict'])
export const historyFileUrl = () => `https://raw.githubusercontent.com/${ROBOT_REPO.owner}/${ROBOT_REPO.repo}/${ROBOT_REPO.branch}/${HISTORY_PATH}`

/** CSV as the robot writes it: commas, double-quoted fields with "" for a quote. */
export function parseCsv(textIn) {
  const out = []
  let row = [], field = '', q = false
  const s = String(textIn ?? '')
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i += 1 } else if (ch === '"') q = false
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some((x) => x !== '')) out.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((x) => x !== '')) out.push(row)
  return out
}

/** The history file's rows as objects, by its header (a column it does not have is ''). */
export function parseBatteryHistory(textIn) {
  const rows = parseCsv(textIn)
  if (!rows.length) return { rows: [] }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  if (!head.includes('time') || !head.includes('kind') || !head.includes('battery')) return { rows: [], error: 'This is not the robot battery history (no time, kind and battery columns).' }
  return { rows: rows.slice(1).map((r) => Object.fromEntries(HISTORY_COLUMNS.map((c) => [c, (r[head.indexOf(c)] ?? '').trim()]))) }
}

const reading = (s, lo, hi) => { const n = /^[0-9]+(\.[0-9]+)?$/.test(String(s ?? '')) ? Number(s) : null; return n !== null && n >= lo && n <= hi ? n : null }

/**
 * The pit load tests in the history, each with what 0041's
 * battery_import_load_tests will do with it: new, already (that battery has a
 * bench test at that second), or skipped with the reason. Match rows are not
 * here: those arrive with their match files.
 */
export function planLoadTests(rows, { batteries = [], runs = [], now = Date.now() } = {}) {
  return (rows ?? []).filter((r) => r.kind === 'load_test').map((r) => {
    const at = startedAtMs(r.time)
    const resistance = reading(r.resistance_mohm, 0, 500)
    const base = { time: r.time, at: at === null ? null : new Date(at).toISOString(), typed: r.battery, resistance, restVolts: reading(r.rest_v, 0, 16), minVolts: reading(r.min_v, 0, 16), verdict: r.verdict || null, row: r }
    if (at === null) return { ...base, status: 'skip', reason: 'no readable time' }
    if (!norm(r.battery)) return { ...base, status: 'skip', reason: 'no battery typed on the robot' }
    if (resistance === null) return { ...base, status: 'skip', reason: 'no resistance reading' }
    const hit = matchBattery(r.battery, batteries)
    if (!hit.battery) return { ...base, status: 'skip', reason: 'not one battery in the log' }
    const b = hit.battery
    if ((runs ?? []).some((x) => x.battery_id === b.id && x.kind === 'bench_test' && Date.parse(x.ran_at) === at)) return { ...base, battery: b, status: 'already' }
    if (b.status === 'retired') return { ...base, battery: b, status: 'skip', reason: 'retired' }
    if (at < now - 60 * 864e5 || at > now + 600e3) return { ...base, battery: b, status: 'skip', reason: 'more than 60 days old' }
    return { ...base, battery: b, status: 'new' }
  })
}

/** The rows battery_import_load_tests takes: the new ones, as the robot wrote them. */
export const loadTestRows = (plans) => (plans ?? []).filter((p) => p.status === 'new').map((p) => ({ ...p.row }))

/** The history file from the public robot repo: { text }, { missing: true } before the robot pushes one, or { error }. */
export async function fetchBatteryHistory(fetchImpl = globalThis.fetch) {
  let r
  try { r = await fetchImpl(historyFileUrl()) } catch { return { error: 'GitHub could not be reached. Check the connection and try again.' } }
  if (r.status === 404) return { missing: true }
  if (!r.ok) return { error: `GitHub answered ${r.status}. Nothing was imported.` }
  return { text: await r.text() }
}
