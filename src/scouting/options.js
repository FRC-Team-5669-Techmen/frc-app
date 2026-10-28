// Observation options (migration 0037, ledger 0029). Mr. Pina, 2026-10-28:
// scouting is more than FUEL and the field obstacles; does the robot pass,
// from where, does the passing work, does it defend, does it handle phase
// shifts. The scouting lead decides which options scouts see; scouts ask for
// options; a one-off note about one robot can become one. This module is the
// one place the client knows their rules. The server's rules are 0037's
// scouting_private.validate_custom; tests/scouting-options.test.js holds the
// two in step on the same cases.
//
// THE MODULE RULE STANDS: a skipped option is ABSENT from payload.custom,
// never zero; did_not_see is an explicit limitation; null is refused.
import { currentObservations } from './model.js'
import { matchIdentity } from './provenance.js'

export const OPTION_TYPES = Object.freeze([
  { value: 'yesno', label: 'Yes / No', hint: 'Did it happen? Yes, No or Did not see.' },
  { value: 'choice', label: 'Pick one', hint: 'One answer from a short list, such as where it passes from.' },
  { value: 'count', label: 'Count', hint: 'How many times, with +1 and +5 buttons.' },
  { value: 'rating', label: 'Rating 1 to 5', hint: 'How well, from 1 (poor) to 5 (excellent).' },
  { value: 'note', label: 'Short note', hint: 'A few words when nothing else fits.' },
])
export const OPTION_PHASES = Object.freeze([['auto', 'Auto'], ['teleop', 'Teleop'], ['endgame', 'Endgame'], ['reliability', 'Reliability'], ['strategy', 'Strategy']])
export const OPTION_STATUS = Object.freeze({ requested: 'Waiting for the scouting lead', active: 'On', declined: 'Declined', retired: 'Retired' })
export const MAX_CHOICES = 8
export const MAX_COUNT = 500
export const OPTIONS_DRAFT = 'options:list'

const phaseRank = Object.fromEntries(OPTION_PHASES.map(([p], i) => [p, i]))
export const typeLabel = (t) => OPTION_TYPES.find((x) => x.value === t)?.label ?? t

/** The options a scout answers now: active only, by phase then position then name. */
export function activeOptions(list) {
  return (list ?? []).filter((o) => o?.status === 'active' && o.key)
    .sort((a, b) => (phaseRank[a.phase] ?? 9) - (phaseRank[b.phase] ?? 9) || (a.position ?? 100) - (b.position ?? 100) || String(a.label).localeCompare(String(b.label)))
}
/** Options whose saved answers still validate (active or retired), for reading old records. */
export const readableOptions = (list) => (list ?? []).filter((o) => ['active', 'retired'].includes(o?.status))

/** The answers a choice offers, did not see last. */
export const choiceAnswers = (o) => [...(o?.choices ?? []).map(([v, l]) => [v, l]), ['did_not_see', 'Did not see']]

/** Is v an answer the server accepts for option o? */
export function validAnswer(o, v) {
  if (v === undefined || v === null || !o) return false
  if (o.type === 'yesno') return ['yes', 'no', 'did_not_see'].includes(v)
  if (o.type === 'choice') return choiceAnswers(o).some(([x]) => x === v)
  if (o.type === 'count') return Number.isInteger(v) && v >= 0 && v <= MAX_COUNT
  if (o.type === 'rating') return [1, 2, 3, 4, 5].includes(v)
  if (o.type === 'note') return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 500
  return false
}

/** payload.custom with only recorded, valid answers to options that are active or retired. */
export function cleanCustom(custom, list) {
  const known = new Map(readableOptions(list).map((o) => [o.key, o]))
  const out = {}
  for (const [k, raw] of Object.entries(custom ?? {})) {
    const o = known.get(k)
    const v = o?.type === 'note' && typeof raw === 'string' ? raw.trim() : raw
    if (o && validAnswer(o, v)) out[k] = v
  }
  return out
}

/** Choices typed as lines ("Neutral zone\nAlliance zone") become [[value, label]] pairs; null when unusable. */
export function choicesFromText(text) {
  const labels = [...new Set(String(text ?? '').split(/\n|,/).map((s) => s.trim()).filter(Boolean))].slice(0, MAX_CHOICES)
  if (labels.length < 2) return null
  const used = new Set()
  return labels.map((label) => {
    let v = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
    if (!/^[a-z]/.test(v)) v = `c_${v}`.slice(0, 24)
    if (v === 'did_not_see' || v.length < 1) v = 'answer'
    let k = v, n = 1
    while (used.has(k)) { n += 1; k = `${v}_${n}` }
    used.add(k)
    return [k, label.slice(0, 60)]
  })
}
export const choicesToText = (choices) => (choices ?? []).map(([, l]) => l).join('\n')

/** What is wrong with an option draft before it is sent, or null. Same limits as 0037. */
export function optionProblem({ label, type, choices }) {
  const l = String(label ?? '').trim()
  if (l.length < 2 || l.length > 120) return 'Name what to watch for in 2 to 120 characters.'
  if (!OPTION_TYPES.some((t) => t.value === type)) return 'Choose an answer type.'
  if (type === 'choice' && (!Array.isArray(choices) || choices.length < 2 || choices.length > MAX_CHOICES)) return `A pick-one option needs 2 to ${MAX_CHOICES} different answers, one per line.`
  return null
}

const median = (values) => {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return null
  const i = Math.floor(a.length / 2)
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}

/**
 * Per-team summary of one option, by the module's projection rules (confirmed
 * current observations, one latest per author per match), one value per
 * MATCH: counts and ratings take the median of the scouts in that match; a
 * yes/no or a choice where scouts disagree is disputed and left out.
 */
export function optionSummary(records, team, o) {
  const rows = currentObservations(records, team)
  const groups = new Map()
  for (const r of rows) {
    const v = r.payload?.custom?.[o.key]
    if (v === undefined || v === null) continue
    const g = `${r.event_id}:${matchIdentity(r)}`
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(v)
  }
  const list = [...groups.values()]
  if (o.type === 'count' || o.type === 'rating') {
    const values = list.map((g) => median(g.filter((v) => typeof v === 'number'))).filter((v) => v !== null)
    return { type: o.type, median: median(values), n: values.length }
  }
  if (o.type === 'note') return { type: 'note', notes: rows.map((r) => r.payload?.custom?.[o.key]).filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()), n: list.length }
  const counts = {}
  let disputed = 0, unseen = 0
  for (const g of list) {
    const decisive = new Set(g.filter((v) => v !== 'did_not_see'))
    if (decisive.size > 1) { disputed += 1; continue }
    if (!decisive.size) { unseen += 1; continue }
    const [v] = decisive
    counts[v] = (counts[v] ?? 0) + 1
  }
  const n = Object.values(counts).reduce((a, b) => a + b, 0)
  if (o.type === 'yesno') return { type: 'yesno', yes: counts.yes ?? 0, no: counts.no ?? 0, n, rate: n ? (counts.yes ?? 0) / n : null, unseen, disputed }
  return { type: 'choice', counts, n, top: n ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : null, unseen, disputed }
}

/** One short line for a team card: "70% (7 matches)", "Median 3", "Mostly Neutral zone (4)". */
export function summaryText(o, s) {
  if (!s || !s.n) return '--'
  if (s.type === 'yesno') return `${Math.round(s.rate * 100)}% yes (${s.n})`
  if (s.type === 'count' || s.type === 'rating') return `Median ${Number.isInteger(s.median) ? s.median : s.median.toFixed(1)} (${s.n})`
  if (s.type === 'choice') return `Mostly ${choiceAnswers(o).find(([v]) => v === s.top)?.[1] ?? s.top} (${s.counts[s.top]} of ${s.n})`
  return `${s.notes.length} note${s.notes.length === 1 ? '' : 's'}`
}

/** A spreadsheet cell for one observation's answer: the label of a choice, the value otherwise, empty when not recorded. */
export function answerCell(o, v) {
  if (v === undefined || v === null) return ''
  if (o.type === 'choice' || o.type === 'yesno') return (o.type === 'choice' ? choiceAnswers(o) : [['yes', 'Yes'], ['no', 'No'], ['did_not_see', 'Did not see']]).find(([x]) => x === v)?.[1] ?? String(v)
  return String(v)
}
