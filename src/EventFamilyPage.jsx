import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ALLERGENS, STEPS, createSaver, fmtDate, fmtDay, fmtTime, formDays, isoToZoned, missingFor, needsSeat,
  nightOptions, sameNights, statusLine, zonedToIso,
} from './eventHub'
import { CarpoolBoard, EventInfo, FoodBoard, Seg } from './EventHubBoards'
import './EventHub.css'

// The event family hub's FAMILY PAGE, /e/<token>: one page per student, for a
// parent who has no account. Public by design, like /parent/<token>: the
// emailed token is the only credential, the route sits outside
// ProtectedLayout (no NavBar, no feedback widget, no notification code), and
// this page NEVER touches a table. Every read and write goes to the
// event-family Edge Function, which calls public.hub_family_call
// (supabase/migrations/0005), where every rule lives.
//
// The same FamilyHub component edits any family from the mentor page, with a
// transport that goes through public.hub_staff_call instead.
//
// AUTOSAVE: every answer saves as it changes (text after a short pause, a tap
// at once). Each field shows "Saved 2:41 PM"; a failed save keeps what was
// typed, says "Not saved, retrying" and retries until it lands, and a value
// that never landed is kept on this device and sent on the next visit. There
// is no submit button, and the deadlines lock nothing.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-family`

async function callFn(payload) {
  try {
    const res = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    let data = null
    try { data = await res.json() } catch { /* empty body */ }
    if (res.status === 404) return { kind: 'invalid' }
    if (res.status === 409 || res.status === 400) return { kind: 'refused', code: data?.error, message: data?.message }
    if (!res.ok) return { kind: 'error' }
    return { kind: 'ok', data }
  } catch {
    return { kind: 'offline' }
  }
}

export function familyTransport(token) {
  return {
    viewer: 'family',
    storageKey: `techmen:hub-pending:${token}`,
    load: () => callFn({ token, action: 'fetch' }),
    save: (p) => callFn({ token, action: 'save', args: p }),
    act: (action, args) => callFn({ token, action, args }),
  }
}

function localStore(key) {
  return {
    get() { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } },
    set(v) {
      try {
        if (Object.keys(v).length) localStorage.setItem(key, JSON.stringify(v))
        else localStorage.removeItem(key)
      } catch { /* private window: retries still run while the page is open */ }
    },
  }
}

// Answers whose change moves the board or the plan: reload the page's data
// after they save.
const RELOAD_FIELDS = new Set(['attending', 'staying_nights', 'to_mode', 'home_mode', 'school_mode', 'pickup',
  'car_seats', 'car_description', 'car_leave_by', 'car_takes_pickups', 'driver_25', 'driver_licensed',
  'driver_phone_consent', 'rider_phone_consent', 'allergens', 'allergies_none', 'allergy_other', 'adults'])

// The page's copy of an answer changes the moment it is chosen; the server's
// answer replaces it when the save lands.
function applyLocal(view, p) {
  if (!view) return view
  const answers = view.answers
  if (p.day_id) {
    const day = { ...(answers.days[p.day_id] ?? {}) }
    if (p.field === 'pickup') day.pickup = p.value?.consent && p.value?.spot ? { ...(day.pickup ?? {}), ...p.value } : null
    else day[p.field] = p.value
    if (p.field === 'to_mode') day.eff_to = p.value ?? day.eff_to
    if (p.field === 'home_mode') day.eff_home = p.value ?? day.eff_home
    return { ...view, answers: { ...answers, days: { ...answers.days, [p.day_id]: day } } }
  }
  return { ...view, answers: { ...answers, response: { ...answers.response, [p.field]: p.value } } }
}

// ── small controls ──────────────────────────────────────────────────────────

function SaveNote({ s, tz }) {
  if (!s) return null
  const text = s.state === 'saving' ? 'Saving'
    : s.state === 'saved' ? `Saved ${fmtTime(s.at, tz)}`
      : s.state === 'retrying' ? 'Not saved, retrying'
        : s.message
  return <span className={`eh-save eh-save-${s.state}`} aria-live="polite" data-testid="eh-save">{text}</span>
}

function Choice({ k, label, hint, options, value, onPick, ctx, disabled, children, testid }) {
  return (
    <fieldset className="eh-q" data-testid={testid}>
      <legend className="eh-q-label">{label}</legend>
      {hint && <p className="eh-hint">{hint}</p>}
      <div className="eh-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.on ?? value === o.value
          return (
            <button key={o.key ?? String(o.value)} type="button" role="radio" aria-checked={on}
                    className={`eh-chip${on ? ' eh-chip-on' : ''}`} disabled={disabled}
                    onClick={() => onPick(o.value)}>
              {o.label}
            </button>
          )
        })}
      </div>
      <SaveNote s={ctx.states[k]} tz={ctx.tz} />
      {children}
    </fieldset>
  )
}

function Tick({ k, label, checked, onToggle, ctx, disabled, hint, testid }) {
  return (
    <div className="eh-tick-wrap">
      <button type="button" role="checkbox" aria-checked={!!checked} className={`eh-tick${checked ? ' eh-tick-on' : ''}`}
              disabled={disabled} onClick={() => onToggle(!checked)} data-testid={testid}>
        <span className="eh-tick-box" aria-hidden="true">{checked ? '✓' : ''}</span>
        <span>{label}</span>
      </button>
      {hint && <p className="eh-hint">{hint}</p>}
      <SaveNote s={ctx.states[k]} tz={ctx.tz} />
    </div>
  )
}

function Text({ k, label, hint, value, onCommit, ctx, disabled, type = 'text', inputMode, autoComplete, placeholder,
  multiline = false, maxLength, testid, wait = 800 }) {
  const [local, setLocal] = useState(value ?? '')
  const focused = useRef(false)
  const last = useRef(value ?? '')
  const timer = useRef(null)
  useEffect(() => {
    if (!focused.current && !timer.current) { setLocal(value ?? ''); last.current = value ?? '' }
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  const commit = (v) => {
    clearTimeout(timer.current)
    timer.current = null
    if (v === last.current) return
    last.current = v
    onCommit(v)
  }
  const change = (v) => {
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => commit(v), wait)
  }
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <label className="eh-field">
      <span className="eh-q-label">{label}</span>
      {hint && <span className="eh-hint">{hint}</span>}
      <Tag className="eh-input" type={multiline ? undefined : type} inputMode={inputMode} autoComplete={autoComplete}
           placeholder={placeholder} maxLength={maxLength} disabled={disabled} value={local} data-testid={testid}
           rows={multiline ? 2 : undefined}
           onFocus={() => { focused.current = true }}
           onBlur={(e) => { focused.current = false; commit(e.target.value) }}
           onChange={(e) => change(e.target.value)} />
      <SaveNote s={ctx.states[k]} tz={ctx.tz} />
    </label>
  )
}

const YES_NO = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }]
const ATTEND = [{ value: 'yes', label: 'Coming' }, { value: 'no', label: 'Not coming' }, { value: 'unsure', label: 'Not sure yet' }]

// ── steps ───────────────────────────────────────────────────────────────────

function StepDays({ view, ctx }) {
  const days = formDays(view.board.days)
  const a = view.answers
  const nights = nightOptions(view.board.days)
  const coming = days.filter((d) => a.days[d.id]?.attending === 'yes')
  return (
    <div className="eh-step-body">
      {days.map((d) => {
        const ad = a.days[d.id] ?? {}
        const off = ctx.locked || d.over
        return (
          <section key={d.id} className="eh-card eh-day-q" data-testid="eh-day-q">
            {d.intro && (
              <div className="eh-intro" data-testid="eh-day-intro">
                {d.intro.split('\n').map((l, i) => <p key={i}>{l}</p>)}
              </div>
            )}
            <Choice k={`attending:${d.id}`} ctx={ctx} disabled={off} label={`${fmtDate(d.date)}${d.title ? `, ${d.title.toLowerCase()}` : ''}`}
                    options={ATTEND} value={ad.attending ?? null} testid="eh-attending"
                    onPick={(v) => ctx.save(`attending:${d.id}`, { field: 'attending', value: v, day_id: d.id })} />
            {ad.attending === 'yes' && d.ask_pit_setup && (
              <Choice k={`pit_setup:${d.id}`} ctx={ctx} disabled={off} label="Help with pit setup?" options={YES_NO}
                      value={ad.pit_setup ?? null}
                      onPick={(v) => ctx.save(`pit_setup:${d.id}`, { field: 'pit_setup', value: v, day_id: d.id })} />
            )}
            {ad.attending === 'yes' && d.home_options?.length > 0 && (
              <Choice k={`home_option:${d.id}`} ctx={ctx} disabled={off} label="Ride home"
                      options={d.home_options.map((o) => ({ key: o.key, value: o.key, label: o.label,
                        on: (ad.home_option ?? d.home_options.find((x) => x.default)?.key) === o.key }))}
                      onPick={(v) => ctx.save(`home_option:${d.id}`, { field: 'home_option', value: v, day_id: d.id })} />
            )}
          </section>
        )
      })}

      <section className="eh-card">
        <Choice k="staying_nights" ctx={ctx} disabled={ctx.locked} label="Staying near the venue?"
                hint="Families arrange their own lodging. The Event info tab lists the hotel."
                options={nights.map((o) => ({ key: o.key, value: o.value, label: o.label, on: sameNights(a.response.staying_nights, o.value) }))}
                onPick={(v) => ctx.save('staying_nights', { field: 'staying_nights', value: v })} />
      </section>

      {coming.length > 0 && (
        <section className="eh-card">
          <h3 className="eh-label">Adults from your family attending</h3>
          <p className="eh-hint">For the food headcount.</p>
          {coming.map((d) => (
            <Choice key={d.id} k={`adults:${d.id}`} ctx={ctx} disabled={ctx.locked || d.over} label={fmtDate(d.date)}
                    options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
                    value={a.days[d.id]?.adults ?? null}
                    onPick={(v) => ctx.save(`adults:${d.id}`, { field: 'adults', value: v, day_id: d.id })} />
          ))}
        </section>
      )}
    </div>
  )
}

function PickupBlock({ d, ad, ctx, off }) {
  const saved = ad.pickup
  const [spot, setSpot] = useState(saved?.spot ?? '')
  const [consent, setConsent] = useState(!!saved)
  const [covers, setCovers] = useState(saved?.covers_home ?? true)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const k = `pickup:${d.id}`
  const send = (next) => ctx.save(k, { field: 'pickup', day_id: d.id, value: next })
  return (
    <div className="eh-sub">
      <label className="eh-field">
        <span className="eh-q-label">Approximate pickup spot</span>
        <span className="eh-hint">Cross streets or a landmark, not a street address.</span>
        <input className="eh-input" value={spot} maxLength={160} disabled={off} data-testid="eh-pickup-spot"
               onChange={(e) => {
                 const v = e.target.value
                 setSpot(v)
                 clearTimeout(timer.current)
                 if (consent) timer.current = setTimeout(() => send({ spot: v, consent: true, covers_home: covers }), 800)
               }} />
      </label>
      <Tick k={k} ctx={ctx} disabled={off} checked={consent} testid="eh-pickup-consent"
            label="Share this spot with the driver who accepts and with mentors."
            onToggle={(v) => { setConsent(v); send({ spot, consent: v, covers_home: covers }) }} />
      {!consent && spot.trim() && <p className="eh-hint eh-hint-warn">Tick the box to save this spot. Without it, nothing is stored.</p>}
      {consent && (
        <Tick k={`${k}:covers`} ctx={ctx} disabled={off} checked={covers} label="Bring my student home the same way."
              onToggle={(v) => { setCovers(v); send({ spot, consent: true, covers_home: v }) }} />
      )}
      {saved?.accepted && <p className="eh-ok-line">Accepted by {saved.driver}.</p>}
    </div>
  )
}

function CarOffer({ d, ad, ctx, off, tz }) {
  const leave = ad.car_leave_by ? isoToZoned(ad.car_leave_by, tz).time : ''
  return (
    <div className="eh-sub eh-offer" data-testid="eh-car-offer">
      <h4 className="eh-label">Your car</h4>
      <Choice k={`car_seats:${d.id}`} ctx={ctx} disabled={off} label="Seats besides your own student"
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} value={ad.car_seats ?? null}
              onPick={(v) => ctx.save(`car_seats:${d.id}`, { field: 'car_seats', value: v, day_id: d.id })} />
      <Text k={`car_description:${d.id}`} ctx={ctx} disabled={off} label="Car description" hint="So students find it in the lot."
            placeholder="Silver Odyssey" maxLength={80} value={ad.car_description ?? ''} testid="eh-car-desc"
            onCommit={(v) => ctx.save(`car_description:${d.id}`, { field: 'car_description', value: v, day_id: d.id })} />
      <Text k={`car_leave_by:${d.id}`} ctx={ctx} disabled={off} type="time" label="Latest time you can leave the venue"
            value={leave} wait={400}
            onCommit={(v) => ctx.save(`car_leave_by:${d.id}`, { field: 'car_leave_by', value: zonedToIso(d.date, v, tz), day_id: d.id })} />
      <Choice k={`car_takes_pickups:${d.id}`} ctx={ctx} disabled={off} label="Will you take home pickups?" options={YES_NO}
              value={ad.car_takes_pickups ?? null}
              onPick={(v) => ctx.save(`car_takes_pickups:${d.id}`, { field: 'car_takes_pickups', value: v, day_id: d.id })} />
    </div>
  )
}

function StepGetting({ view, ctx }) {
  const tz = ctx.tz
  const days = [...view.board.days].sort((x, y) => String(x.date).localeCompare(String(y.date)))
  const a = view.answers
  const coming = days.filter((d) => a.days[d.id]?.attending === 'yes')
  const unsure = days.filter((d) => a.days[d.id]?.attending === 'unsure')
  const anyDriving = coming.some((d) => [a.days[d.id]?.eff_to, a.days[d.id]?.eff_home].includes('driving'))
  const anyCarpool = coming.some((d) => [a.days[d.id]?.eff_to, a.days[d.id]?.eff_home].includes('carpool'))
  const r = a.response
  if (coming.length === 0) {
    return <p className="eh-empty">Nothing to plan yet. Mark a day as Coming on the Days step.</p>
  }
  return (
    <div className="eh-step-body">
      {coming.map((d) => {
        const ad = a.days[d.id] ?? {}
        const off = ctx.locked || d.over
        const showSchool = d.ask_school_ride && !ad.nearby_before && ad.eff_to === 'carpool'
        return (
          <section key={d.id} className="eh-card" data-testid="eh-getting-day">
            <h3 className="eh-card-title">{fmtDate(d.date)}</h3>
            {showSchool && (
              <Choice k={`school_mode:${d.id}`} ctx={ctx} disabled={off} label="Getting to Bosco Tech"
                      options={[{ value: 'self', label: 'We get there ourselves' }, { value: 'pickup', label: 'Needs a ride from home' }]}
                      value={ad.school_mode ?? null}
                      onPick={(v) => ctx.save(`school_mode:${d.id}`, { field: 'school_mode', value: v, day_id: d.id })}>
                {ad.school_mode === 'pickup' && <PickupBlock d={d} ad={ad} ctx={ctx} off={off} />}
              </Choice>
            )}
            <Choice k={`to_mode:${d.id}`} ctx={ctx} disabled={off} label="Bosco Tech to the venue" testid="eh-to-mode"
                    options={[{ value: 'carpool', label: 'Team carpool' }, { value: 'driving', label: 'I am driving' },
                      { value: 'self', label: 'We go straight to the venue' }]}
                    value={ad.eff_to}
                    onPick={(v) => ctx.save(`to_mode:${d.id}`, { field: 'to_mode', value: v, day_id: d.id })} />
            <Choice k={`home_mode:${d.id}`} ctx={ctx} disabled={off} label="Getting home"
                    hint={ad.nearby_after ? 'You are staying near the venue tonight.' : null}
                    options={[{ value: 'carpool', label: 'Team carpool' }, { value: 'driving', label: 'I am driving' },
                      { value: 'self', label: ad.nearby_after ? 'We stay nearby' : 'We get home ourselves' }]}
                    value={ad.eff_home}
                    onPick={(v) => ctx.save(`home_mode:${d.id}`, { field: 'home_mode', value: v, day_id: d.id })} />
            {[ad.eff_to, ad.eff_home].includes('driving') && <CarOffer d={d} ad={ad} ctx={ctx} off={off} tz={tz} />}
          </section>
        )
      })}

      {anyDriving && (
        <section className="eh-card" data-testid="eh-driver-checks">
          <h3 className="eh-label">Driver checks</h3>
          <p className="eh-hint">The school handbook requires both for anyone who drives students.</p>
          <Tick k="driver_25" ctx={ctx} disabled={ctx.locked} checked={r.driver_25} label="I am 25 or older."
                onToggle={(v) => ctx.save('driver_25', { field: 'driver_25', value: v })} />
          <Tick k="driver_licensed" ctx={ctx} disabled={ctx.locked} checked={r.driver_licensed}
                label="I have a valid California license and insurance."
                onToggle={(v) => ctx.save('driver_licensed', { field: 'driver_licensed', value: v })} />
          <Tick k="driver_phone_consent" ctx={ctx} disabled={ctx.locked} checked={r.driver_phone_consent} testid="eh-driver-consent"
                label="Share my phone number with families riding in my car."
                hint="Without this, riders see Contact through mentors."
                onToggle={(v) => ctx.save('driver_phone_consent', { field: 'driver_phone_consent', value: v })} />
          {view.event.driver_paperwork_required && (
            <p className={r.driver_paperwork_on_file ? 'eh-ok-line' : 'eh-hint eh-hint-warn'}>
              {r.driver_paperwork_on_file ? 'Your license and insurance are on file.'
                : 'A mentor needs a copy of your license and insurance on file. Until then your car shows Pending.'}
            </p>
          )}
        </section>
      )}

      {anyCarpool && (
        <section className="eh-card">
          <Tick k="rider_phone_consent" ctx={ctx} disabled={ctx.locked} checked={r.rider_phone_consent}
                label="Share our phone number with our student's driver."
                onToggle={(v) => ctx.save('rider_phone_consent', { field: 'rider_phone_consent', value: v })} />
        </section>
      )}

      {unsure.length > 0 && (
        <p className="eh-hint">{unsure.map((d) => fmtDate(d.date, 'medium')).join(' and ')}: not sure yet. Plan {unsure.length === 1 ? 'it' : 'them'} once you choose Coming.</p>
      )}
    </div>
  )
}

function StepFood({ view, ctx, goFood }) {
  const r = view.answers.response
  const links = view.event.links ?? {}
  const has = new Set(r.allergens ?? [])
  return (
    <div className="eh-step-body">
      <section className="eh-card" data-testid="eh-allergies">
        <fieldset className="eh-q">
          <legend className="eh-q-label">Food allergies</legend>
          <div className="eh-chips">
            <button type="button" role="checkbox" aria-checked={!!r.allergies_none} disabled={ctx.locked}
                    className={`eh-chip${r.allergies_none ? ' eh-chip-on' : ''}`}
                    onClick={() => ctx.save('allergies_none', { field: 'allergies_none', value: !r.allergies_none })}>None</button>
            {ALLERGENS.map((x) => (
              <button key={x.key} type="button" role="checkbox" aria-checked={has.has(x.key)} disabled={ctx.locked}
                      className={`eh-chip${has.has(x.key) ? ' eh-chip-on' : ''}`}
                      onClick={() => {
                        const next = has.has(x.key) ? [...has].filter((k) => k !== x.key) : [...has, x.key]
                        ctx.save('allergens', { field: 'allergens', value: next })
                      }}>
                {x.label}
              </button>
            ))}
          </div>
          <SaveNote s={ctx.states.allergens ?? ctx.states.allergies_none} tz={ctx.tz} />
        </fieldset>
        <Text k="allergy_other" ctx={ctx} disabled={ctx.locked} label="Other allergy" placeholder="Describe it"
              value={r.allergy_other ?? ''} maxLength={300}
              onCommit={(v) => ctx.save('allergy_other', { field: 'allergy_other', value: v })} />
      </section>
      <section className="eh-card">
        <Text k="dietary" ctx={ctx} disabled={ctx.locked} label="Other dietary needs (optional)" placeholder="Vegetarian, halal"
              value={r.dietary ?? ''} maxLength={300}
              onCommit={(v) => ctx.save('dietary', { field: 'dietary', value: v })} />
      </section>
      <section className="eh-card">
        <Choice k="medication" ctx={ctx} disabled={ctx.locked} label="Medication needed during the event?" options={YES_NO}
                value={r.medication ?? null} onPick={(v) => ctx.save('medication', { field: 'medication', value: v })}>
          {r.medication === true && (links.medication_form
            ? <a className="eh-link" href={links.medication_form} target="_blank" rel="noopener noreferrer">Medication form</a>
            : <p className="eh-hint">A mentor will follow up about the medication form.</p>)}
        </Choice>
      </section>
      <button type="button" className="eh-btn" onClick={goFood}>See the food board</button>
      <p className="eh-hint">Bringing food is optional and never holds up sign-up.</p>
    </div>
  )
}

function StepContacts({ view, ctx }) {
  const r = view.answers.response
  const links = view.event.links ?? {}
  return (
    <div className="eh-step-body">
      <section className="eh-card">
        <h3 className="eh-label">Parent or guardian</h3>
        <Text k="parent_name" ctx={ctx} disabled={ctx.locked} label="Name" autoComplete="name" value={r.parent_name ?? ''} maxLength={120}
              onCommit={(v) => ctx.save('parent_name', { field: 'parent_name', value: v })} />
        <Text k="parent_phone" ctx={ctx} disabled={ctx.locked} label="Phone" type="tel" inputMode="tel" autoComplete="tel"
              value={r.parent_phone ?? ''} maxLength={40} testid="eh-parent-phone"
              onCommit={(v) => ctx.save('parent_phone', { field: 'parent_phone', value: v })} />
        <Text k="parent_email" ctx={ctx} disabled={ctx.locked} label="Email" type="email" inputMode="email" autoComplete="email"
              value={r.parent_email ?? ''} maxLength={200}
              onCommit={(v) => ctx.save('parent_email', { field: 'parent_email', value: v })} />
      </section>
      <section className="eh-card">
        <h3 className="eh-label">Emergency contact during the event</h3>
        <Text k="emergency_name" ctx={ctx} disabled={ctx.locked} label="Name" value={r.emergency_name ?? ''} maxLength={120}
              onCommit={(v) => ctx.save('emergency_name', { field: 'emergency_name', value: v })} />
        <Text k="emergency_phone" ctx={ctx} disabled={ctx.locked} label="Phone" type="tel" inputMode="tel"
              value={r.emergency_phone ?? ''} maxLength={40}
              onCommit={(v) => ctx.save('emergency_phone', { field: 'emergency_phone', value: v })} />
      </section>
      <section className="eh-card">
        <h3 className="eh-label">Paperwork</h3>
        <Choice k="first_reg_done" ctx={ctx} disabled={ctx.locked} label="FIRST registration for this season"
                options={[{ value: true, label: 'Done' }, { value: false, label: 'Not done' }]} value={r.first_reg_done ?? null}
                onPick={(v) => ctx.save('first_reg_done', { field: 'first_reg_done', value: v })}>
          {links.first_registration && <a className="eh-link" href={links.first_registration} target="_blank" rel="noopener noreferrer">FIRST registration</a>}
        </Choice>
        {links.school_form && (
          <Choice k="school_form_done" ctx={ctx} disabled={ctx.locked} label="School activity permission form"
                  options={[{ value: true, label: 'Done' }, { value: false, label: 'Not done' }]} value={r.school_form_done ?? null}
                  onPick={(v) => ctx.save('school_form_done', { field: 'school_form_done', value: v })}>
            <a className="eh-link" href={links.school_form} target="_blank" rel="noopener noreferrer">School permission form</a>
          </Choice>
        )}
      </section>
    </div>
  )
}

// ── summaries: done, and lock-in ────────────────────────────────────────────

function runText(view, d, run) {
  const ad = view.answers.days[d.id] ?? {}
  const mode = run === 'to' ? ad.eff_to : ad.eff_home
  const nearby = run === 'to' ? ad.nearby_before : ad.nearby_after
  const car = (d.runs?.find((x) => x.run === run)?.cars ?? []).find((c) => c.my_seat || c.mine)
  if (mode === 'driving') return 'You drive'
  if (nearby) return 'Staying nearby'
  if (mode === 'self') return 'On your own'
  return car ? `${car.driver}'s car` : 'Needs a seat'
}

function DaySummary({ view, d }) {
  const ad = view.answers.days[d.id] ?? {}
  const meals = (view.board.meals ?? []).filter((m) => m.day_id === d.id)
  const claims = (view.answers.food ?? []).filter((f) => meals.some((m) => m.id === f.meal_id))
  return (
    <dl className="eh-facts eh-summary">
      <div><dt>To venue</dt><dd>{runText(view, d, 'to')}</dd></div>
      <div><dt>Home</dt><dd>{runText(view, d, 'home')}</dd></div>
      {ad.pickup && <div><dt>Pickup</dt><dd>{ad.pickup.accepted ? `With ${ad.pickup.driver}` : 'Asked, not accepted yet'}</dd></div>}
      {ad.adults != null && <div><dt>Adults</dt><dd>{ad.adults}</dd></div>}
      {claims.length > 0 && <div><dt>Food</dt><dd>{claims.map((c) => c.what).join(', ')}</dd></div>}
    </dl>
  )
}

function LockIn({ view, ctx, act, onEdit }) {
  const ev = view.event
  const days = [...view.board.days].sort((x, y) => String(x.date).localeCompare(String(y.date)))
  const [note, setNote] = useState(null)
  return (
    <div className="eh-step-body" data-testid="eh-lockin">
      <section className="eh-card eh-banner">
        <h2 className="eh-card-title">Lock-in: confirm each day</h2>
        <p>{ev.lockin_due_at ? `Due ${fmtDay(ev.lockin_due_at, ctx.tz)}. ` : ''}A day with no changes is one tap. Changes are still fine after that.</p>
      </section>
      {days.map((d) => {
        const ad = view.answers.days[d.id] ?? {}
        const off = ctx.locked || d.over
        return (
          <section key={d.id} className="eh-card" data-testid="eh-lockin-day">
            <h3 className="eh-card-title">{fmtDate(d.date)}</h3>
            {ad.attending === 'unsure' || ad.attending == null ? (
              <Choice k={`attending:${d.id}`} ctx={ctx} disabled={off} label="Not sure yet. Coming?"
                      options={ATTEND.slice(0, 2)} value={ad.attending ?? null}
                      onPick={(v) => ctx.save(`attending:${d.id}`, { field: 'attending', value: v, day_id: d.id })} />
            ) : ad.attending === 'no' ? (
              <p className="eh-quiet">Not coming.</p>
            ) : (
              <>
                <DaySummary view={view} d={d} />
                {ad.confirmed
                  ? <p className="eh-ok-line" data-testid="eh-confirmed">Confirmed</p>
                  : <button type="button" className="eh-btn eh-btn-primary" disabled={off} data-testid="eh-confirm-day"
                            onClick={async () => {
                              const res = await act('confirm_day', { day_id: d.id })
                              setNote(res?.kind === 'ok' ? null : { text: res?.message || 'Not saved. Try again.', bad: true })
                            }}>Confirm this day</button>}
              </>
            )}
          </section>
        )
      })}
      {note && <p className="eh-note eh-note-bad" role="alert">{note.text}</p>}
      <button type="button" className="eh-btn" onClick={onEdit}>Change an answer</button>
    </div>
  )
}

function Done({ view, ctx, onEdit, goCarpool }) {
  const ev = view.event
  const days = [...view.board.days].sort((x, y) => String(x.date).localeCompare(String(y.date)))
  const needs = days.some((d) => {
    const ad = view.answers.days[d.id]
    return ['to', 'home'].some((run) => needsSeat(ad, run)
      && !(d.runs?.find((x) => x.run === run)?.cars ?? []).some((c) => c.my_seat))
  })
  const next = ev.over ? null
    : !ev.lockin_open && ev.lockin_opens_at ? `Lock-in opens ${fmtDay(ev.lockin_opens_at, ctx.tz)}.`
      : view.progress.lockin_done ? `All set. See you ${fmtDate(ev.starts_on, 'medium')}.` : null
  return (
    <div className="eh-step-body" data-testid="eh-done">
      <section className="eh-card eh-banner">
        <h2 className="eh-card-title">{ev.over ? 'This event is over' : view.progress.lockin_done ? 'You are locked in' : 'You are done with sign-up'}</h2>
        {next && <p>{next}</p>}
        {ev.over && <p>Everything here is read-only now. Thank you!</p>}
      </section>
      {days.map((d) => {
        const ad = view.answers.days[d.id] ?? {}
        return (
          <section key={d.id} className="eh-card">
            <h3 className="eh-card-title">{fmtDate(d.date)}: {ad.attending === 'yes' ? 'Coming' : ad.attending === 'no' ? 'Not coming' : 'Not sure yet'}</h3>
            {ad.attending === 'yes' && <DaySummary view={view} d={d} />}
          </section>
        )
      })}
      {needs && !ev.over && <button type="button" className="eh-btn eh-btn-primary" onClick={goCarpool}>Pick a seat on the carpool board</button>}
      {!ev.over && <button type="button" className="eh-btn" onClick={onEdit}>Change an answer</button>}
    </div>
  )
}

// ── the hub ─────────────────────────────────────────────────────────────────

export function FamilyHub({ transport, standalone = true, onInvalid }) {
  const [view, setView] = useState(null)
  const [mode, setMode] = useState('loading')   // loading | ready | invalid | offline
  const [tab, setTab] = useState('plan')
  const [states, setStates] = useState({})
  // On the form or not. Decided once, from the first load: a family that has
  // not finished sign-up starts on the form and STAYS there until it presses
  // Finish, even when its last required answer saves mid-step (jumping to the
  // lock-in screen under a parent's thumb was the first version, found by the
  // event-hub e2e spec).
  const [editing, setEditing] = useState(null)
  const [step, setStep] = useState(0)
  const [banner, setBanner] = useState(null)
  const reloadTimer = useRef(null)
  const topRef = useRef(null)

  const load = useCallback(async () => {
    const r = await transport.load()
    // A 200 that is not a family page (a function deployed before 0005 was
    // applied answers something else) is treated as unreachable, never drawn.
    if (r.kind === 'ok' && !(r.data?.event && r.data?.answers && r.data?.board)) {
      setMode((m) => (m === 'ready' ? m : 'offline'))
      return { kind: 'error' }
    }
    if (r.kind === 'ok') {
      setView(r.data)
      setMode('ready')
      setEditing((e) => (e === null ? !r.data.progress?.phase1_done : e))
    }
    else if (r.kind === 'invalid') { setMode('invalid'); onInvalid?.() }
    else setMode((m) => (m === 'ready' ? m : 'offline'))
    return r
  }, [transport, onInvalid])

  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => { load() }, 500)
  }, [load])

  const saver = useMemo(() => createSaver({
    send: (p) => transport.save(p),
    onState: (k, s) => {
      setStates((prev) => ({ ...prev, [k]: s }))
      if (s.state === 'refused') scheduleReload()
    },
    onSaved: (k, data, payload) => {
      setView((v) => (v && data?.progress ? { ...v, progress: data.progress } : v))
      if (RELOAD_FIELDS.has(payload.field)) scheduleReload()
    },
    store: transport.storageKey ? localStore(transport.storageKey) : null,
  }), [transport, scheduleReload])

  // No saver.stop() on cleanup: under StrictMode an effect is cleaned up and
  // run again on the same memoized saver, and a stopped saver never saves.
  // A save still in flight when the page goes away keeps retrying, which is
  // the "nothing is ever lost" rule, not a leak.
  useEffect(() => {
    load().then((r) => { if (r.kind === 'ok') saver.replay() })
    return () => { clearTimeout(reloadTimer.current) }
  }, [load, saver])

  const act = useCallback(async (action, args) => {
    const r = await transport.act(action, args)
    if (r.kind === 'ok') {
      if (r.data?.event && r.data?.answers) setView(r.data)
      else await load()
    } else if (r.kind === 'invalid') {
      setMode('invalid')
    }
    return r
  }, [transport, load])

  useEffect(() => { topRef.current?.scrollIntoView?.({ block: 'start' }) }, [step, tab])

  if (mode === 'loading') return <div className="eh-page"><p className="eh-empty">Loading your family page.</p></div>
  if (mode === 'invalid') return standalone ? <LostLink invalid /> : <p className="eh-empty">That family is not part of this event.</p>
  if (mode === 'offline' && !view) {
    return (
      <div className="eh-page">
        <section className="eh-card"><h2 className="eh-card-title">Cannot reach the team server</h2>
          <p>Check your connection and try again.</p>
          <button type="button" className="eh-btn eh-btn-primary" onClick={() => { setMode('loading'); load() }}>Try again</button></section>
      </div>
    )
  }

  const ev = view.event
  const tz = ev.timezone
  const ctx = {
    tz, states, locked: !!ev.over,
    save: (k, payload) => { setView((v) => applyLocal(v, payload)); saver.save(k, payload) },
  }
  const p = view.progress
  const showSteps = !ev.over && !!editing
  const lockin = !ev.over && !showSteps && ev.lockin_open && !p.lockin_done

  return (
    <div className={`eh-page${standalone ? '' : ' eh-embedded'}`} ref={topRef}>
      <header className="eh-head">
        {standalone && <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />}
        <div className="eh-head-text">
          <p className="eh-kicker">{ev.title}</p>
          <h1 className="eh-title" data-testid="eh-student">{view.student.name}</h1>
          <p className="eh-status" data-testid="eh-status">{statusLine(view)}</p>
        </div>
      </header>

      <Seg className="eh-tabs" label="Sections" value={tab} onPick={setTab}
           items={[{ key: 'plan', label: 'Our plan' }, { key: 'carpool', label: 'Carpool' }, { key: 'food', label: 'Food' }, { key: 'info', label: 'Event info' }]} />

      {banner && <p className="eh-note" role="status">{banner}</p>}

      {tab === 'plan' && (showSteps ? (
        <div data-testid="eh-steps">
          <nav className="eh-stepper" aria-label="Sign-up steps">
            {STEPS.map((s, i) => {
              // "Getting there" has nothing to ask until a day is answered, so
              // it is not shown as done before the Days step is.
              const ok = p.steps?.[s.key] && (s.key !== 'getting' || p.steps?.days)
              return (
                <button key={s.key} type="button" className={`eh-stepdot${i === step ? ' eh-stepdot-on' : ''}${ok ? ' eh-stepdot-done' : ''}`}
                        aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}
                        aria-label={`Step ${i + 1}: ${s.label}${ok ? ', done' : ''}`} data-testid="eh-stepdot">
                  <span className="eh-stepdot-n">{ok ? '✓' : i + 1}</span>
                  <span className="eh-stepdot-l">{s.label}</span>
                </button>
              )
            })}
          </nav>
          <p className="eh-step-count" data-testid="eh-step-count">
            Step {step + 1} of {STEPS.length}: {STEPS[step].label}
            {(() => { const n = missingFor(p, STEPS[step].key).length; return n ? ` · ${n} to go` : ' · done' })()}
          </p>
          {step === 0 && <StepDays view={view} ctx={ctx} />}
          {step === 1 && <StepGetting view={view} ctx={ctx} />}
          {step === 2 && <StepFood view={view} ctx={ctx} goFood={() => setTab('food')} />}
          {step === 3 && <StepContacts view={view} ctx={ctx} />}
          <div className="eh-step-nav">
            {step > 0 && <button type="button" className="eh-btn" onClick={() => setStep(step - 1)}>Back</button>}
            {step < STEPS.length - 1
              ? <button type="button" className="eh-btn eh-btn-primary" onClick={() => setStep(step + 1)} data-testid="eh-next">Next: {STEPS[step + 1].label}</button>
              : <button type="button" className="eh-btn eh-btn-primary" data-testid="eh-finish"
                        onClick={() => {
                          if (p.phase1_done) { setEditing(false); setBanner(null) }
                          else {
                            const first = STEPS.findIndex((s) => missingFor(p, s.key).length)
                            setBanner(`${p.missing.length} ${p.missing.length === 1 ? 'answer' : 'answers'} still to go.`)
                            setStep(Math.max(0, first))
                          }
                        }}>Finish</button>}
          </div>
        </div>
      ) : lockin ? (
        <LockIn view={view} ctx={ctx} act={act} onEdit={() => { setEditing(true); setStep(0) }} />
      ) : (
        <Done view={view} ctx={ctx} onEdit={() => { setEditing(true); setStep(0) }} goCarpool={() => setTab('carpool')} />
      ))}

      {tab === 'carpool' && (
        <CarpoolBoard board={view.board} tz={tz} viewer={transport.viewer} myDays={view.answers.days} act={act} locked={ev.over} />
      )}
      {tab === 'food' && (
        <>
          <p className="eh-hint">Claiming food is optional. Edit or drop a claim until its meal starts.</p>
          <FoodBoard board={view.board} tz={tz} viewer={transport.viewer} act={act} locked={ev.over} />
        </>
      )}
      {tab === 'info' && <EventInfo event={ev} />}
    </div>
  )
}

// "Lost your link?" The answer is the same whether or not the address is on
// file; a link goes out only to an address an invite carries.
function LostLink({ invalid = false }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  return (
    <div className="eh-page">
      <section className="eh-card eh-lost" data-testid="eh-lost">
        <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />
        <h1 className="eh-card-title">{invalid ? 'This link does not work' : 'Get your family link'}</h1>
        {invalid && <p>It may be old or mistyped. Enter the email the team has for you, and we will send a fresh link.</p>}
        {sent ? (
          <p className="eh-ok-line" role="status">If that email is on file, a new link is on its way. Check your inbox in a few minutes.</p>
        ) : (
          <form onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            await callFn({ action: 'resend_link', email: email.trim() })
            setBusy(false)
            setSent(true)
          }}>
            <label className="eh-field"><span className="eh-q-label">Email</span>
              <input className="eh-input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button type="submit" className="eh-btn eh-btn-primary" disabled={busy || !email.trim()}>Send me a link</button>
          </form>
        )}
      </section>
    </div>
  )
}

export default function EventFamilyPage() {
  const { token } = useParams()
  const transport = useMemo(() => (token ? familyTransport(token) : null), [token])
  if (!transport) return <LostLink />
  return <FamilyHub key={token} transport={transport} />
}
