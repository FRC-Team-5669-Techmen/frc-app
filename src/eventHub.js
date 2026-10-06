// The event family hub's pure helpers: formatting, the status line, the
// Event info line format, time-zone math, the autosave queue, and the
// printable day sheet. No React, no Supabase, no clock of its own (callers
// pass `now`), so tests/event-hub.test.js drives every function here.
//
// NOTHING HERE DECIDES A RULE. Seat capacity, the one-minor rule, who may see
// a phone or a pickup spot, edit windows and phase completeness are all
// decided in Postgres (supabase/migrations/0005_event_family_hub.sql) and
// arrive already applied: a car's `status` and `problem`, a rider's `spot`
// (present or absent), `progress.phase1_done`. This module only words them.

// The allergen vocabulary. MUST equal the CHECK on hub_responses.allergens
// in 0005; tests/event-hub.test.js reads the SQL and fails on any drift.
export const ALLERGENS = Object.freeze([
  { key: 'peanut', label: 'Peanut' },
  { key: 'tree_nut', label: 'Tree nut' },
  { key: 'milk', label: 'Milk' },
  { key: 'egg', label: 'Egg' },
  { key: 'wheat', label: 'Wheat' },
  { key: 'soy', label: 'Soy' },
  { key: 'fish', label: 'Fish' },
  { key: 'shellfish', label: 'Shellfish' },
  { key: 'sesame', label: 'Sesame' },
])
const ALLERGEN_LABEL = Object.fromEntries([...ALLERGENS.map((a) => [a.key, a.label]), ['other', 'Other']])
export const allergenLabel = (key) => ALLERGEN_LABEL[key] ?? key

// The resource links an event can carry, in the order the mentor page lists
// them. The keys are 0005's hub_events.links keys.
export const LINK_KEYS = Object.freeze([
  ['site', 'Event site'],
  ['agenda', 'Agenda'],
  ['halloween', 'Halloween sheet'],
  ['rules', 'Rule changes'],
  ['awards', 'Judged awards'],
  ['shirt', 'Event shirt'],
  ['store', 'Event store'],
  ['volunteer', 'Volunteer registration'],
  ['stream', 'Live stream'],
  ['hotel', 'Hotel group rate'],
  ['first_registration', 'FIRST registration'],
  ['school_form', 'School activity permission form'],
  ['medication_form', 'Medication form'],
  ['team_list', 'Team list'],
  ['parent_channel', 'Parent chat (GroupMe)'],
])

export const STEPS = Object.freeze([
  { key: 'days', label: 'Days' },
  { key: 'getting', label: 'Getting there' },
  { key: 'food', label: 'Food and health' },
  { key: 'contacts', label: 'Contacts and paperwork' },
])

export const DEFAULT_TZ = 'America/Los_Angeles'

// ── time ────────────────────────────────────────────────────────────────────

const fmtCache = new Map()
function formatter(tz, opts) {
  const k = tz + JSON.stringify(opts)
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }))
  return fmtCache.get(k)
}

/** "6:02 AM" in the event's time zone; '' for nothing. */
export function fmtTime(iso, tz = DEFAULT_TZ) {
  if (!iso) return ''
  return formatter(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** A ten-digit US number as (555) 555-0101; anything else as typed. */
export function fmtPhone(raw) {
  const s = String(raw ?? '').trim()
  const d = s.replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : s
}

/** "Wed, Oct 28" for an instant, in the event's time zone. */
export function fmtDay(iso, tz = DEFAULT_TZ) {
  if (!iso) return ''
  return formatter(tz, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
}

/** "Wed, Oct 28, 6:02 AM". */
export function fmtDayTime(iso, tz = DEFAULT_TZ) {
  if (!iso) return ''
  return `${fmtDay(iso, tz)}, ${fmtTime(iso, tz)}`
}

/** A calendar date ('2026-10-31') as "Saturday, Oct 31", with no time zone shift. */
export function fmtDate(dateStr, style = 'long') {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  const opts = style === 'short'
    ? { weekday: 'short', timeZone: 'UTC' }
    : { weekday: style === 'medium' ? 'short' : 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

function zoneParts(ms, tz) {
  const p = {}
  for (const { type, value } of formatter(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))) p[type] = value
  return p
}

// How far the zone is ahead of UTC at instant ms, in ms.
function zoneOffset(ms, tz) {
  const p = zoneParts(ms, tz)
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return asUtc - Math.floor(ms / 1000) * 1000
}

/**
 * A wall-clock time on a date in a time zone, as an ISO instant. '2026-11-01'
 * '05:45' in Los Angeles is 13:45Z, after the clocks fall back; the same time
 * the day before is 12:45Z. null for an empty or malformed time.
 */
export function zonedToIso(dateStr, hhmm, tz = DEFAULT_TZ) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? ''))
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim())
  if (!dm || !tm) return null
  const guess = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]))
  let t = guess - zoneOffset(guess, tz)
  t = guess - zoneOffset(t, tz)
  return new Date(t).toISOString()
}

/** An instant as { date: 'YYYY-MM-DD', time: 'HH:MM' } on the zone's wall clock. */
export function isoToZoned(iso, tz = DEFAULT_TZ) {
  if (!iso) return { date: '', time: '' }
  const p = zoneParts(new Date(iso).getTime(), tz)
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

// ── the status line ─────────────────────────────────────────────────────────

/**
 * One line at the top of the family page, from the progress the database
 * computed. Clock dates only, no em dashes. No running count of answers:
 * saying Coming adds that day's questions, so a count went UP after an
 * answer and read as a mistake. The tracker under it says what is left.
 * "Final check" is the family's word for lock-in.
 */
export function statusLine(view) {
  const ev = view?.event ?? {}
  const p = view?.progress ?? {}
  const tz = ev.timezone || DEFAULT_TZ
  if (ev.over) return `${ev.title || 'This event'} is over. Thank you!`
  if (!p.phase1_done) return ev.phase1_due_at ? `Sign-up due ${fmtDay(ev.phase1_due_at, tz)}.` : 'Sign-up is open.'
  if (!ev.lockin_open) {
    return ev.lockin_opens_at ? `Sign-up done. Final check opens ${fmtDay(ev.lockin_opens_at, tz)}.` : 'Sign-up done.'
  }
  if (!p.lockin_done) {
    return ev.lockin_due_at ? `Sign-up done. Final check due ${fmtDay(ev.lockin_due_at, tz)}.` : 'Sign-up done. Please do the final check.'
  }
  return ev.starts_on ? `All set. See you ${fmtDate(ev.starts_on, 'medium')}.` : 'All set.'
}

/** The progress entries still missing for one step. */
export function missingFor(progress, step) {
  return (progress?.missing ?? []).filter((m) => m.step === step)
}

// ── days and runs ───────────────────────────────────────────────────────────

/** Days in the order of the sign-up form (position), not the calendar. */
export function formDays(days) {
  return [...(days ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.date).localeCompare(String(b.date)))
}

/** The day to open a board on: the first that is not over, else the last. */
export function defaultDayIndex(days) {
  const i = (days ?? []).findIndex((d) => !d.over)
  return i >= 0 ? i : Math.max(0, (days?.length ?? 1) - 1)
}

export const runTitle = (run) => (run === 'to' ? 'To venue' : 'Home')

/**
 * "Staying near the venue?" choices, built from the event's days: every night
 * but the last day's, alone, and all of them together.
 */
export function nightOptions(days) {
  const dates = [...(days ?? [])].map((d) => String(d.date)).sort()
  const nights = dates.slice(0, -1)
  const opts = [{ key: 'none', value: [], label: 'No, we go home each night' }]
  const name = (n) => fmtDate(n, 'long').split(',')[0]
  for (const n of nights) opts.push({ key: n, value: [n], label: `${name(n)} night` })
  if (nights.length > 1) opts.push({ key: 'all', value: nights, label: nights.length === 2 ? `${name(nights[0])} and ${name(nights[1])} nights` : 'Every night' })
  return opts
}

export function sameNights(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  const x = [...a].map(String).sort()
  const y = [...b].map(String).sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** Does this family's student need a team-carpool seat on this run? */
export function needsSeat(dayAnswers, run) {
  if (!dayAnswers || dayAnswers.attending !== 'yes') return false
  return (run === 'to' ? dayAnswers.eff_to : dayAnswers.eff_home) === 'carpool'
}

/** Not ready / Has room / Full / Departed 6:02 AM / Arrived 6:58 AM, in words
 *  a parent reads at a glance ("Left" read as "seats left"). */
export function carStatus(car, tz = DEFAULT_TZ) {
  switch (car?.status) {
    case 'pending': return { key: 'pending', label: 'Not ready' }
    case 'left': return { key: 'left', label: `Departed ${fmtTime(car.left_at, tz)}` }
    case 'arrived': return { key: 'arrived', label: `Arrived ${fmtTime(car.arrived_at, tz)}` }
    case 'full': return { key: 'full', label: 'Full' }
    default: return { key: 'filling', label: 'Has room' }
  }
}

/** "Needs a seat: 3 · Open seats: 5", green when every student has a seat. */
export function gapLine(run) {
  const needs = run?.needs_seat ?? 0
  const open = run?.open_seats ?? 0
  return { text: `Needs a seat: ${needs} · Open seats: ${open}`, covered: needs <= open, needs, open }
}

/** The time a car leaves the venue when that is before the day ends, else null. */
export function leavesEarly(car, day, tz = DEFAULT_TZ) {
  if (!car?.leave_by || !day?.venue_closes_at) return null
  return new Date(car.leave_by) < new Date(day.venue_closes_at) ? fmtTime(car.leave_by, tz) : null
}

/** "Peanut (2), Shellfish (1)", or '' when nobody coming that day listed one. */
export function allergyStrip(counts) {
  return (counts ?? []).filter((c) => c.count > 0).map((c) => `${allergenLabel(c.allergen)} (${c.count})`).join(', ')
}

/** "14 students + 6 adults, estimate". */
export function headcountLine(hc) {
  if (!hc) return ''
  const s = hc.students ?? 0
  const a = hc.adults ?? 0
  return `${s} ${s === 1 ? 'student' : 'students'} + ${a} ${a === 1 ? 'adult' : 'adults'}, ${hc.firm ? 'firm' : 'estimate'}`
}

// ── Event info ──────────────────────────────────────────────────────────────

const URL_RE = /^https?:\/\/\S+$/i

/**
 * One line of an info section. "label | value" is a row; a value that is a
 * URL, or "link:<key>" naming one of the event's links, is a link; a link
 * that is not set yet reads "Not posted yet". Anything else is plain text.
 */
export function parseInfoLine(line, links = {}) {
  const s = String(line ?? '').trim()
  const bar = s.indexOf(' | ')
  if (bar < 0) {
    if (URL_RE.test(s)) return { kind: 'link', label: s, href: s }
    return { kind: 'text', text: s }
  }
  const label = s.slice(0, bar).trim()
  const value = s.slice(bar + 3).trim()
  if (value.startsWith('link:')) {
    const href = String(links?.[value.slice(5)] ?? '').trim()
    return href ? { kind: 'link', label, href } : { kind: 'row', label, value: 'Not posted yet', missing: true }
  }
  if (URL_RE.test(value)) return { kind: 'link', label, href: value }
  return { kind: 'row', label, value }
}

/** The sections to show: a section with `if_link` shows only when that link is set. */
export function visibleSections(info, links = {}) {
  return (info?.sections ?? []).filter((s) => !s.if_link || String(links?.[s.if_link] ?? '').trim())
}

/** Section lines <-> the mentor page's textarea, one line per line. */
export const linesToText = (lines) => (lines ?? []).join('\n')
export const textToLines = (text) => String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean)

// ── autosave ────────────────────────────────────────────────────────────────

/**
 * A save queue with one slot per field. The LATEST value of a field always
 * wins: a value typed while an earlier one is in flight is sent next, and an
 * older value is never sent after a newer one. A network or server failure
 * keeps the value and retries with backoff, forever, until it lands ("Not
 * saved, retrying"); a rule's refusal is not retried (it would only be
 * refused again) and its sentence is shown. Pending values are mirrored into
 * `store` (localStorage on the page) so a closed tab replays them.
 *
 *   send(payload) -> { kind: 'ok', data } | { kind: 'refused', message } |
 *                    { kind: 'error' } | { kind: 'offline' } | { kind: 'invalid' }
 *   onState(key, { state: 'saving' | 'saved' | 'retrying' | 'refused', at?, message? })
 */
export function createSaver({ send, onState = () => {}, onSaved = () => {}, wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  backoff = [2000, 4000, 8000, 15000, 30000], store = null, now = () => Date.now() }) {
  const pending = new Map(read())
  const running = new Set()
  let stopped = false

  function read() {
    try { return Object.entries(store?.get() ?? {}) } catch { return [] }
  }
  function persist() {
    try { store?.set(Object.fromEntries(pending)) } catch { /* storage refused: retries still run */ }
  }

  async function run(key) {
    if (running.has(key)) return
    running.add(key)
    let attempt = 0
    try {
      while (pending.has(key) && !stopped) {
        const payload = pending.get(key)
        onState(key, { state: attempt ? 'retrying' : 'saving' })
        let res
        try { res = await send(payload) } catch { res = { kind: 'offline' } }
        if (pending.get(key) !== payload) { attempt = 0; continue } // a newer value arrived: send that
        if (res?.kind === 'ok') {
          pending.delete(key)
          persist()
          onState(key, { state: 'saved', at: res.data?.saved_at ?? new Date(now()).toISOString() })
          onSaved(key, res.data, payload)
          return
        }
        if (res?.kind === 'refused' || res?.kind === 'invalid') {
          pending.delete(key)
          persist()
          onState(key, { state: 'refused', message: res.message || 'Not saved.' })
          return
        }
        onState(key, { state: 'retrying' })
        await wait(backoff[Math.min(attempt, backoff.length - 1)])
        attempt += 1
      }
    } finally {
      running.delete(key)
    }
  }

  return {
    save(key, payload) {
      pending.set(key, payload)
      persist()
      return run(key)
    },
    /** Values saved in an earlier visit that never landed: send them again. */
    replay() {
      return Promise.all([...pending.keys()].map((k) => run(k)))
    },
    pendingValue: (key) => pending.get(key),
    hasPending: () => pending.size > 0,
    stop() { stopped = true },
  }
}

// ── the printable day sheet (staff) ─────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/**
 * One page per day, printed at the lot: cars and riders, phones where
 * consented (the staff board already carries only those), pickup notes,
 * allergies WITH names, the meet captain. Built from the staff board, so it
 * shows nothing the board does not.
 */
export function daySheetHtml({ event, day, meals = [], printedAt }) {
  const tz = event?.timezone || DEFAULT_TZ
  const runs = (day?.runs ?? []).map((r) => {
    const cars = (r.cars ?? []).map((c) => `
      <tr>
        <td><b>${esc(c.driver)}</b><br>${esc(c.description)}${c.driver_phone ? `<br>${esc(c.driver_phone)}` : ''}</td>
        <td>${esc(carStatus(c, tz).label)}${c.leave_by ? `<br>leaves venue by ${esc(fmtTime(c.leave_by, tz))}` : ''}${c.problem ? '<br><b>NEEDS A SECOND RIDER</b>' : ''}</td>
        <td>${(c.riders ?? []).map((x) => `${esc(x.name)}${x.pickup ? ` (pickup${x.spot ? `: ${esc(x.spot)}` : ''})` : ''}${x.parent_phone ? `, ${esc(x.parent_phone)}` : ''}`).join('<br>') || '&nbsp;'}</td>
        <td>${c.riders_count} / ${c.seats}</td>
      </tr>`).join('')
    return `
      <h2>${esc(runTitle(r.run))}</h2>
      <p>${esc(gapLine(r).text)}${r.unplaced?.length ? `. Not yet placed: ${esc(r.unplaced.map((u) => u.name).join(', '))}` : ''}${r.nearby?.length ? `. Staying nearby: ${esc(r.nearby.join(', '))}` : ''}</p>
      <table><thead><tr><th>Driver</th><th>Status</th><th>Riders</th><th>Seats</th></tr></thead><tbody>${cars || '<tr><td colspan="4">No cars yet.</td></tr>'}</tbody></table>`
  }).join('')
  const allergies = meals.filter((m) => m.day_id === day?.id).map((m) => `
      <h3>${esc(m.label)} (${esc(fmtTime(m.starts_at, tz))})</h3>
      <p>${(m.allergy_names ?? []).map((a) => `${esc(a.name)}: ${esc([...(a.allergens ?? []).map(allergenLabel), a.other, a.dietary].filter(Boolean).join(', '))}`).join('<br>') || 'No allergies listed.'}</p>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(event?.title)} ${esc(day?.label)}</title>
<style>
  body { font: 12px/1.35 -apple-system, 'Segoe UI', sans-serif; color: #000; margin: 18px; }
  h1 { font-size: 18px; margin: 0 0 4px; } h2 { font-size: 14px; margin: 14px 0 4px; } h3 { font-size: 12px; margin: 8px 0 2px; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  .meta { margin: 0 0 8px; } .foot { margin-top: 12px; color: #444; font-size: 10px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>${esc(event?.title)}: ${esc(day?.label)}</h1>
  <p class="meta">Meet ${esc(fmtTime(day?.meet_at, tz))}${day?.meet_place ? ` at ${esc(day.meet_place)}` : ''}${day?.last_car_out_at ? `, last car out ${esc(fmtTime(day.last_car_out_at, tz))}` : ''}. Meet captain: ${esc(day?.captain || 'not set')}.
  ${day?.headcount ? `Coming: ${esc(headcountLine(day.headcount))}.` : ''}</p>
  ${runs}
  <h2>Allergies and dietary needs (staff only)</h2>
  ${allergies || '<p>No meals this day.</p>'}
  <p class="foot">Printed ${esc(fmtDayTime(printedAt, tz))}. Phones appear only where the family consented.</p>
</body></html>`
}

/** One CSV row per family from the staff export (0005 _hub_export). */
export function exportColumns(rows) {
  const dayNames = [...new Set((rows ?? []).flatMap((r) => (r.days ?? []).map((d) => d.day)))]
  const base = [
    ['student', 'Student'], ['emails', 'Invite emails'], ['invite', 'Invite'], ['phase1_done', 'Sign-up done'],
    ['lockin_done', 'Lock-in done'], ['parent_name', 'Parent'], ['parent_phone', 'Parent phone'],
    ['parent_email', 'Parent email'], ['emergency_name', 'Emergency contact'], ['emergency_phone', 'Emergency phone'],
    ['staying_nights', 'Staying nearby'], ['allergies_none', 'No allergies'], ['allergens', 'Allergens'],
    ['allergy_other', 'Other allergy'], ['dietary', 'Dietary'], ['medication', 'Medication'],
    ['first_reg_done', 'FIRST registration'], ['school_form_done', 'School form'], ['driver_25', 'Driver 25+'],
    ['driver_licensed', 'Driver licensed'], ['driver_paperwork_on_file', 'Driver paperwork on file'],
    ['driver_phone_consent', 'Driver phone consent'], ['rider_phone_consent', 'Rider phone consent'],
  ]
  const perDay = dayNames.flatMap((d) => [
    [`${d}:attending`, `${d} coming`], [`${d}:adults`, `${d} adults`], [`${d}:confirmed`, `${d} confirmed`],
    [`${d}:pit_setup`, `${d} pit setup`], [`${d}:home_option`, `${d} ride home`], [`${d}:to`, `${d} to venue`],
    [`${d}:home`, `${d} home`], [`${d}:school`, `${d} to Bosco Tech`], [`${d}:pickup_spot`, `${d} pickup spot`],
    [`${d}:to_car`, `${d} car to venue`], [`${d}:home_car`, `${d} car home`],
  ])
  return [...base, ...perDay, ['food', 'Food']]
}

export function exportRecords(rows) {
  return (rows ?? []).map((r) => {
    const out = { ...r }
    for (const d of r.days ?? []) for (const [k, v] of Object.entries(d)) if (k !== 'day') out[`${d.day}:${k}`] = v
    delete out.days
    return out
  })
}
