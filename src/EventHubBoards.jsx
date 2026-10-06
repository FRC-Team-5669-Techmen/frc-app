import { useMemo, useState } from 'react'
import {
  ALLERGENS, allergyStrip, carStatus, defaultDayIndex, fmtDate, fmtPhone, fmtTime, gapLine, headcountLine, leavesEarly,
  needsSeat, parseInfoLine, visibleSections, allergenLabel,
} from './eventHub'
import { Fold } from './EventHubControls'
import { IconBed, IconCar, IconClipboard, IconClock, IconFlag, IconInfo, IconLink, IconPin, IconShield, IconStar, IconUsers, IconUtensils } from './eventIcons'
import './EventHub.css'

// The event family hub's three boards, shared by the family page
// (/e/<token>), the student view (/trips/<id>) and the mentor page. Each board
// renders the board JSON the database built for THIS viewer
// (supabase/migrations/0005, _hub_board): a phone, a pickup spot or an allergy
// name appears here only because the database put it in. Nothing here decides
// who may see what, or whether a claim is allowed; an action is sent and the
// database's answer is shown.
//
// Props shared by the boards:
//   board    the board JSON ({ days, meals })
//   tz       the event's time zone
//   viewer   'family' | 'member' | 'staff'
//   myDays   (family) answers.days, to know whether this student needs a seat
//   act      (family, staff) (action, args) => Promise<{ kind, data?, message? }>
//   locked   the event is over: nothing is offered

export function Seg({ items, value, onPick, label, className = '' }) {
  return (
    <div className={`eh-seg ${className}`} role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={value === it.key}
          className={`eh-seg-btn${value === it.key ? ' eh-seg-on' : ''}`}
          onClick={() => onPick(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** Today's date (YYYY-MM-DD) in the event's time zone. */
function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) } catch { return '' }
}

function Note({ note }) {
  if (!note) return null
  return <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`} role={note.bad ? 'alert' : 'status'}>{note.text}</p>
}

// ── Carpool ─────────────────────────────────────────────────────────────────

export function CarpoolBoard({ board, tz, viewer = 'member', myDays = {}, act, locked = false }) {
  const days = board?.days ?? []
  const [dayIdx, setDayIdx] = useState(() => defaultDayIndex(days))
  const [run, setRun] = useState('to')
  const day = days[Math.min(dayIdx, Math.max(0, days.length - 1))]
  if (!day) return <p className="eh-empty">No days are set up for this event yet.</p>
  const r = (day.runs ?? []).find((x) => x.run === run) ?? {}
  const myDay = myDays?.[day.id]
  const gap = gapLine(r)

  return (
    <div className="eh-board">
      <div className="eh-board-controls">
        <Seg label="Day" value={day.id} onPick={(id) => setDayIdx(days.findIndex((d) => d.id === id))}
             items={days.map((d) => ({ key: d.id, label: d.short }))} />
        <Seg label="Run" value={run} onPick={setRun} items={[{ key: 'to', label: 'To venue' }, { key: 'home', label: 'Home' }]} />
      </div>

      <DayHeader day={day} tz={tz} run={run} />

      <p className={`eh-gap ${gap.covered ? 'eh-gap-ok' : 'eh-gap-short'}`} data-testid="eh-gap">{gap.text}</p>

      {viewer === 'family' && <MyRunLine myDay={myDay} day={day} run={r} runKey={run} />}

      {r.unplaced?.length > 0 && (
        <section className="eh-people">
          <h3 className="eh-label">Not yet placed</h3>
          <ul className="eh-names">
            {r.unplaced.map((u, i) => <li key={u.invite_id ?? i} className={u.mine ? 'eh-name-mine' : ''}>{u.name}</li>)}
          </ul>
        </section>
      )}
      {r.nearby?.length > 0 && (
        <section className="eh-people">
          <h3 className="eh-label">Staying nearby</h3>
          <ul className="eh-names eh-names-quiet">{r.nearby.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      )}
      {(r.self_count > 0 || r.driving_count > 0 || r.unsure_count > 0) && (
        <p className="eh-mono eh-quiet">
          {[r.self_count ? `${r.self_count} on their own` : '', r.driving_count ? `${r.driving_count} with their own driver` : '',
            r.unsure_count ? `${r.unsure_count} not sure yet` : ''].filter(Boolean).join(' · ')}
        </p>
      )}

      {Array.isArray(r.pickups) && (
        <PickupRequests pickups={r.pickups} cars={r.cars ?? []} viewer={viewer} act={act} locked={locked} day={day} />
      )}

      <div className="eh-cars">
        {(r.cars ?? []).length === 0 && <p className="eh-empty">No cars on this run yet.</p>}
        {(r.cars ?? []).map((c) => (
          <CarCard key={c.id} car={c} day={day} tz={tz} viewer={viewer} myDay={myDay} runKey={run}
                   unplaced={r.unplaced ?? []} act={act} locked={locked} />
        ))}
      </div>

      {viewer === 'staff' && !locked && <AddStaffCar day={day} run={run} act={act} />}
    </div>
  )
}

function DayHeader({ day, tz, run }) {
  return (
    <div className="eh-dayhead">
      <div className="eh-dayhead-title">
        <strong>{day.label}</strong>
        {day.title && <span className="eh-quiet"> · {day.title}</span>}
      </div>
      <dl className="eh-facts">
        {day.meet_at && (
          <div><dt>Meet</dt><dd>{fmtTime(day.meet_at, tz)}{day.meet_place ? `, ${day.meet_place}` : ''}
            {day.last_car_out_at ? `. Last car out ${fmtTime(day.last_car_out_at, tz)}` : ''}</dd></div>
        )}
        <div><dt>Meet captain</dt><dd>{day.captain || 'Not set yet'}</dd></div>
        {day.doors_at && <div><dt>Doors open</dt><dd>{fmtTime(day.doors_at, tz)}</dd></div>}
        {(day.drive_to_range || day.miles_to) && (
          <div className={run === 'to' ? 'eh-fact-on' : ''}><dt>Drive there</dt>
            <dd>{[day.drive_to_range, day.miles_to ? `${day.miles_to} mi` : ''].filter(Boolean).join(', ')}</dd></div>
        )}
        {(day.drive_home_range || day.miles_home) && (
          <div className={run === 'home' ? 'eh-fact-on' : ''}><dt>Drive home</dt>
            <dd>{[day.drive_home_range, day.miles_home ? `${day.miles_home} mi` : ''].filter(Boolean).join(', ')}</dd></div>
        )}
      </dl>
      {day.notes && <p className="eh-quiet eh-small">{day.notes}</p>}
    </div>
  )
}

function MyRunLine({ myDay, day, run, runKey }) {
  if (!myDay || myDay.attending !== 'yes') {
    return <p className="eh-mine-line">Your student is {myDay?.attending === 'unsure' ? 'not sure yet' : 'not coming'} this day.</p>
  }
  const mode = runKey === 'to' ? myDay.eff_to : myDay.eff_home
  const nearby = runKey === 'to' ? myDay.nearby_before : myDay.nearby_after
  const seated = (run.cars ?? []).find((c) => c.my_seat)
  let text
  if (mode === 'driving') text = 'You are driving this run.'
  else if (nearby) text = 'Your student is staying nearby.'
  else if (mode === 'self') text = runKey === 'to' ? 'Your student gets to the venue on their own.' : 'Your student gets home on their own.'
  else if (seated) text = `Your student rides in ${seated.driver}'s car.`
  else text = 'Your student needs a seat. Pick a car below.'
  return <p className={`eh-mine-line${!seated && mode === 'carpool' && !nearby ? ' eh-mine-need' : ''}`} data-testid="eh-mine-line">{text}{day.over ? ' This day is over.' : ''}</p>
}

function SeatDots({ seats, filled }) {
  return (
    <span className="eh-dots" aria-label={`${filled} of ${seats} seats taken`}>
      {Array.from({ length: seats }, (_, i) => <span key={i} className={`eh-dot${i < filled ? ' eh-dot-on' : ''}`} />)}
    </span>
  )
}

export function CarCard({ car, day, tz, viewer, myDay, runKey, unplaced = [], act, locked, ours = false }) {
  const [confirm, setConfirm] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [override, setOverride] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const status = carStatus(car, tz)
  const early = leavesEarly(car, day, tz)
  const frozen = car.status === 'left' || car.status === 'arrived'
  // A family sees Leaving now and Arrived only on the day itself; weeks
  // ahead they were a puzzle. Mentors keep them every day.
  const dayOf = viewer === 'staff' || day.date === todayIn(tz)
  const canClaim = viewer === 'family' && !locked && !frozen && !car.mine && needsSeat(myDay, runKey)
  // An empty car without its driver's own student aboard takes its first two
  // riders together (the one-child rule). A family claim of the first seat
  // would be refused, so it is not offered; a mentor seats two at once.
  // A brother or sister's family car (0009) takes this student alone: the
  // driver is their parent too.
  const emptyPair = !!car.needs_two && car.riders_count === 0 && !ours
  const [pairA, setPairA] = useState('')
  const [pairB, setPairB] = useState('')

  async function go(action, args, okText) {
    setBusy(true)
    setNote(null)
    const res = await act(action, args)
    setBusy(false)
    setConfirm(null)
    if (res?.kind === 'ok') {
      const home = res.data?.result?.home
      let text = okText
      if (home === 'placed') text = `${okText} The same car takes your student home.`
      if (home === 'not_placed') text = `${okText} No seat home in this car${res.data?.result?.home_message ? `: ${res.data.result.home_message}` : ''}. Pick one on the Home run.`
      setNote(text ? { text } : null)
    } else {
      setNote({ text: res?.message || 'That did not go through. Try again.', bad: true })
    }
  }

  return (
    <article className={`eh-car${car.problem ? ' eh-car-red' : ''}${car.my_seat ? ' eh-car-mine' : ''}`} data-testid="eh-car" data-car-id={car.id}>
      <header className="eh-car-head">
        <div>
          <div className="eh-car-driver">{car.driver}</div>
          <div className="eh-car-desc">{car.description}</div>
        </div>
        <span className={`eh-pill eh-pill-${status.key}`} data-testid="eh-car-status">{status.label}</span>
      </header>

      <div className="eh-car-line">
        <SeatDots seats={car.seats} filled={car.riders_count} />
        <span className="eh-mono">{car.riders_count} of {car.seats} seats taken</span>
        {car.leave_by && <span className="eh-mono">Heads home at {fmtTime(car.leave_by, tz)}</span>}
      </div>

      {car.problem && (
        <p className="eh-car-problem" data-testid="eh-car-problem">
          {car.problem === 'single_pickup' ? 'Needs a second pickup rider' : 'Needs a second rider'}
        </p>
      )}
      {ours && viewer === 'family' && <p className="eh-ok-line" data-testid="eh-our-car">Your family's car</p>}
      {car.needs_two && !car.problem && viewer !== 'member' && !ours && (
        <p className="eh-pair-note" data-testid="eh-needs-two"><IconShield size={16} />
          <span>{viewer === 'staff'
            ? (emptyPair ? 'Needs two students together (one-child rule). Seat two at once below.' : 'Takes two or more riders (one-child rule).')
            : car.mine
              ? 'Your car takes two or more students together (one-child rule). A mentor seats the first two, then families can pick it.'
              : emptyPair ? 'Not open yet. A mentor puts the first two students in this car (one-child rule). After that you can pick a seat here.'
                : 'Takes two or more riders (one-child rule).'}</span>
        </p>
      )}
      {car.override_reason && <p className="eh-quiet eh-small">Override: {car.override_reason}</p>}

      {car.riders?.length > 0 && (
        <ul className="eh-riders" aria-label="Riding in this car">
          <li className="eh-riders-label">Riding</li>
          {car.riders.map((x, i) => (
            <li key={x.invite_id ?? i} className={x.mine ? 'eh-name-mine' : ''} data-testid="eh-rider">
              <span>{x.name}</span>
              {x.pickup && <span className="eh-tag">Pickup</span>}
              {x.spot && <span className="eh-rider-detail" data-testid="eh-spot">{x.spot}</span>}
              {x.parent_phone && <span className="eh-rider-detail">Parent <a href={`tel:${x.parent_phone}`} data-testid="eh-rider-phone">{fmtPhone(x.parent_phone)}</a></span>}
              {viewer === 'staff' && !frozen && !locked && x.invite_id && (
                <button type="button" className="eh-mini" disabled={busy}
                        onClick={() => go('move', { invite_id: x.invite_id, day_id: day.id, run: runKey, car_id: null }, 'Taken out of the car.')}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {car.driver_phone && !car.mine && (
        <p className="eh-phone">Driver: <a href={`tel:${car.driver_phone}`} data-testid="eh-driver-phone">{fmtPhone(car.driver_phone)}</a></p>
      )}
      {!car.driver_phone && car.phone_note === 'contact_mentors' && <p className="eh-phone eh-quiet">Contact through mentors</p>}

      <div className="eh-car-actions">
        {canClaim && car.my_seat && confirm !== 'leave' && (
          <button type="button" className="eh-btn" disabled={busy} data-testid="eh-give-up"
                  onClick={() => setConfirm('leave')}>Give up this seat</button>
        )}
        {confirm === 'leave' && (
          <div className="eh-confirm" data-testid="eh-give-up-confirm">
            <p className="eh-confirm-text">Give up this seat? Your student will need another one.</p>
            <button type="button" className="eh-btn eh-btn-primary" disabled={busy} data-testid="eh-give-up-yes"
                    onClick={() => go('unclaim_seat', { car_id: car.id }, 'Seat given up.')}>Yes, give it up</button>
            <button type="button" className="eh-btn" onClick={() => setConfirm(null)}>Keep the seat</button>
          </div>
        )}
        {canClaim && !car.my_seat && !emptyPair && car.status !== 'pending' && car.status !== 'full' && confirm !== 'claim' && (
          <button type="button" className="eh-btn eh-btn-primary" disabled={busy} data-testid="eh-claim"
                  onClick={() => (early ? setConfirm('claim')
                    : go('claim_seat', { car_id: car.id, day_id: day.id, run: runKey }, 'Seat claimed.'))}>
            Claim a seat
          </button>
        )}
        {confirm === 'claim' && (
          <div className="eh-confirm" data-testid="eh-claim-confirm">
            <p className="eh-confirm-text">This car leaves the venue at {early}, before the day ends.</p>
            <button type="button" className="eh-btn eh-btn-primary" disabled={busy} data-testid="eh-claim-yes"
                    onClick={() => go('claim_seat', { car_id: car.id, day_id: day.id, run: runKey }, 'Seat claimed.')}>
              Claim it
            </button>
            <button type="button" className="eh-btn" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        )}
        {(car.mine || viewer === 'staff') && dayOf && !locked && !frozen && (
          <button type="button" className="eh-btn eh-btn-primary" disabled={busy} data-testid="eh-leaving"
                  onClick={() => go('mark', { car_id: car.id, what: 'left', override_reason: override || undefined }, 'Marked as left. Riders’ families were emailed.')}>
            Leaving now
          </button>
        )}
        {(car.mine || viewer === 'staff') && dayOf && !locked && car.status === 'left' && (
          <button type="button" className="eh-btn eh-btn-primary" disabled={busy}
                  onClick={() => go('mark', { car_id: car.id, what: 'arrived' }, 'Marked as arrived. Riders’ families were emailed.')}>
            Arrived
          </button>
        )}
        {viewer === 'staff' && frozen && !locked && (
          <button type="button" className="eh-btn" disabled={busy} onClick={() => go('undo_mark', { car_id: car.id }, 'Left and arrived cleared.')}>Undo left</button>
        )}
      </div>

      {viewer === 'staff' && !locked && !frozen && (car.problem || unplaced.some((u) => u.invite_id)) && (
        <div className="eh-staff-tools">
          {car.problem && (
            <label className="eh-field">
              <span className="eh-q-label">Override reason (one-minor rule)</span>
              <input className="eh-input" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Why this car may leave as it is" />
            </label>
          )}
          {emptyPair && unplaced.filter((u) => u.invite_id).length >= 2 && (
            <div className="eh-pair" data-testid="eh-pair">
              <span className="eh-q-label">Seat two students together</span>
              <div className="eh-inline">
                <select className="eh-input" value={pairA} onChange={(e) => setPairA(e.target.value)} aria-label="First student">
                  <option value="">First student</option>
                  {unplaced.filter((u) => u.invite_id && u.invite_id !== pairB).map((u) => <option key={u.invite_id} value={u.invite_id}>{u.name}</option>)}
                </select>
                <select className="eh-input" value={pairB} onChange={(e) => setPairB(e.target.value)} aria-label="Second student">
                  <option value="">Second student</option>
                  {unplaced.filter((u) => u.invite_id && u.invite_id !== pairA).map((u) => <option key={u.invite_id} value={u.invite_id}>{u.name}</option>)}
                </select>
                <button type="button" className="eh-btn eh-btn-primary" disabled={!pairA || !pairB || busy} data-testid="eh-pair-go"
                        onClick={() => go('place_pair', { car_id: car.id, first: pairA, second: pairB }, 'Both seated.').then(() => { setPairA(''); setPairB('') })}>
                  Seat both
                </button>
              </div>
            </div>
          )}
          {unplaced.length > 0 && !emptyPair && (
            <div className="eh-inline">
              <select className="eh-input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move a student into this car">
                <option value="">Move a student here</option>
                {unplaced.filter((u) => u.invite_id).map((u) => <option key={u.invite_id} value={u.invite_id}>{u.name}</option>)}
              </select>
              <button type="button" className="eh-btn" disabled={!moveTo || busy}
                      onClick={() => go('move', { invite_id: moveTo, day_id: day.id, run: runKey, car_id: car.id, override_reason: override || undefined }, 'Moved.')}>
                Move
              </button>
            </div>
          )}
        </div>
      )}
      <Note note={note} />
    </article>
  )
}

export function PickupRequests({ pickups, cars, viewer, act, locked, day }) {
  const [note, setNote] = useState(null)
  const [carFor, setCarFor] = useState({})
  const myCar = cars.find((c) => c.mine)
  if (pickups.length === 0) return null
  async function accept(p) {
    const car = viewer === 'staff' ? carFor[p.id] : myCar?.id
    if (!car) return
    const res = await act('pickup_accept', { pickup_id: p.id, car_id: car, day_id: day.id })
    setNote(res?.kind === 'ok' ? { text: `${p.name} is in the car.` } : { text: res?.message || 'That did not go through.', bad: true })
  }
  return (
    <section className="eh-pickups" data-testid="eh-pickups">
      <h3 className="eh-label">Ride-from-home requests</h3>
      <ul className="eh-pickup-list">
        {pickups.map((p) => (
          <li key={p.id} className="eh-pickup">
            <div><strong>{p.name}</strong> <span className="eh-quiet">near</span> <span data-testid="eh-spot">{p.spot}</span></div>
            <div className="eh-quiet eh-small">{p.covers_home ? 'Ride back home too' : 'Only to Bosco Tech'}</div>
            {!locked && viewer === 'staff' && (
              <div className="eh-inline">
                <select className="eh-input" value={carFor[p.id] ?? ''} onChange={(e) => setCarFor({ ...carFor, [p.id]: e.target.value })} aria-label="Car">
                  <option value="">Pick a car</option>
                  {cars.filter((c) => c.status !== 'left' && c.status !== 'arrived').map((c) => <option key={c.id} value={c.id}>{c.driver}, {c.description}</option>)}
                </select>
                <button type="button" className="eh-btn" disabled={!carFor[p.id]} onClick={() => accept(p)}>Accept</button>
              </div>
            )}
            {!locked && viewer === 'family' && myCar && (
              <button type="button" className="eh-btn eh-btn-primary" onClick={() => accept(p)}>Accept into my car</button>
            )}
          </li>
        ))}
      </ul>
      <p className="eh-quiet eh-small">Shown only to drivers who offered pickups and to mentors.</p>
      <Note note={note} />
    </section>
  )
}

function AddStaffCar({ day, run, act }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ driver_label: '', description: '', seats: 4 })
  const [note, setNote] = useState(null)
  if (!open) return <button type="button" className="eh-btn" onClick={() => setOpen(true)}>Add a mentor car</button>
  async function add() {
    const res = await act('add_car', { day_id: day.id, run, ...f, seats: Number(f.seats) })
    if (res?.kind === 'ok') { setOpen(false); setF({ driver_label: '', description: '', seats: 4 }) }
    else setNote({ text: res?.message || 'Not added.', bad: true })
  }
  return (
    <div className="eh-card eh-form">
      <label className="eh-field"><span className="eh-q-label">Driver</span>
        <input className="eh-input" value={f.driver_label} onChange={(e) => setF({ ...f, driver_label: e.target.value })} /></label>
      <label className="eh-field"><span className="eh-q-label">Car</span>
        <input className="eh-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="white van" /></label>
      <label className="eh-field"><span className="eh-q-label">Seats for students</span>
        <input className="eh-input" type="number" min="1" max="7" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></label>
      <div className="eh-inline">
        <button type="button" className="eh-btn eh-btn-primary" disabled={!f.driver_label.trim() || !f.description.trim()} onClick={add}>Add car</button>
        <button type="button" className="eh-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Note note={note} />
    </div>
  )
}

// ── Food ────────────────────────────────────────────────────────────────────

export function FoodBoard({ board, tz, viewer = 'member', act, locked = false }) {
  const days = board?.days ?? []
  const meals = board?.meals ?? []
  const groups = useMemo(() => days.map((d) => ({ day: d, meals: meals.filter((m) => m.day_id === d.id) })).filter((g) => g.meals.length), [days, meals])
  if (groups.length === 0) return <p className="eh-empty">No meals are set up for this event yet.</p>
  return (
    <div className="eh-board">
      {groups.map(({ day, meals: ms }) => (
        <section key={day.id} className="eh-food-day">
          <header className="eh-food-dayhead">
            <h3 className="eh-food-daytitle">{day.label}</h3>
            <p className="eh-mono" data-testid="eh-headcount">{headcountLine(day.headcount)}</p>
          </header>
          {ms.map((m) => <MealCard key={m.id} meal={m} tz={tz} viewer={viewer} act={act} locked={locked} />)}
        </section>
      ))}
    </div>
  )
}

const ALLERGEN_CHOICE = [{ key: 'no', label: 'No' }, { key: 'yes', label: 'Yes' }, { key: 'unsure', label: 'Not sure' }]

function ClaimForm({ initial, onSubmit, onCancel, submitLabel, strip }) {
  const [what, setWhat] = useState(initial.what ?? '')
  const [serves, setServes] = useState(initial.serves ?? '')
  const [allergen, setAllergen] = useState(initial.allergen ?? '')
  const [busy, setBusy] = useState(false)
  return (
    <div className="eh-claim-form">
      <label className="eh-field"><span className="eh-q-label">What exactly?</span>
        <input className="eh-input" value={what} onChange={(e) => setWhat(e.target.value)} maxLength={120} placeholder="Chicken tray from Costco" /></label>
      <label className="eh-field"><span className="eh-q-label">About how many it serves</span>
        <input className="eh-input" type="number" inputMode="numeric" min="1" max="500" value={serves} onChange={(e) => setServes(e.target.value)} /></label>
      <fieldset className="eh-q">
        <legend className="eh-q-label">Contains any listed allergen?</legend>
        {strip && <p className="eh-hint">Listed for this day: {strip}</p>}
        <div className="eh-chips">
          {ALLERGEN_CHOICE.map((o) => (
            <button key={o.key} type="button" role="radio" aria-checked={allergen === o.key}
                    className={`eh-chip${allergen === o.key ? ' eh-chip-on' : ''}`} onClick={() => setAllergen(o.key)}>{o.label}</button>
          ))}
        </div>
      </fieldset>
      <div className="eh-inline">
        <button type="button" className="eh-btn eh-btn-primary" disabled={busy || !what.trim() || !Number(serves) || !allergen}
                onClick={async () => { setBusy(true); await onSubmit({ what: what.trim(), serves: Number(serves), allergen }); setBusy(false) }}>
          {submitLabel}
        </button>
        <button type="button" className="eh-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function MealCard({ meal, tz, viewer, act, locked }) {
  const [open, setOpen] = useState(null)   // { kind: 'need'|'extra'|'edit', id }
  const [note, setNote] = useState(null)
  const strip = allergyStrip(meal.allergy_counts)
  const canAct = (viewer === 'family' || viewer === 'staff') && !locked && (!meal.started || viewer === 'staff')

  async function run(action, args, ok) {
    const res = await act(action, args)
    if (res?.kind === 'ok') { setOpen(null); setNote(ok ? { text: ok } : null) }
    else setNote({ text: res?.message || 'That did not go through.', bad: true })
  }
  const claimRow = (c, label) => (
    <div className="eh-claim">
      <span className="eh-claim-who">{label}</span>
      <span>{c.what}, serves {c.serves}{c.allergen === 'yes' ? ' (has a listed allergen)' : c.allergen === 'unsure' ? ' (allergen not sure)' : ''}</span>
      {c.mine && canAct && open?.id !== c.id && (
        <span className="eh-inline">
          <button type="button" className="eh-mini" onClick={() => setOpen({ kind: 'edit', id: c.id, c })}>Edit</button>
          <button type="button" className="eh-mini" onClick={() => run('food_drop', { claim_id: c.id }, 'Dropped.')}>Drop</button>
        </span>
      )}
      {viewer === 'staff' && !c.mine && !locked && (
        <button type="button" className="eh-mini" onClick={() => run('food_drop', { claim_id: c.id }, 'Dropped.')}>Drop</button>
      )}
    </div>
  )

  return (
    <article className="eh-meal" data-testid="eh-meal">
      <header className="eh-meal-head">
        <strong>{meal.label}</strong>
        <span className="eh-mono">{fmtTime(meal.starts_at, tz)}</span>
        {meal.started && <span className="eh-pill eh-pill-left">Started</span>}
      </header>
      <p className="eh-allergy-strip" data-testid="eh-allergy-strip">{strip ? `Allergies: ${strip}` : 'No allergies listed for this day.'}</p>
      {/* Names arrive only in a staff board (the SQL decides); the page renders
          what it is given, so a leak would show here rather than hide. */}
      {meal.allergy_names?.length > 0 && (
        <ul className="eh-allergy-names" data-testid="eh-allergy-names">
          {meal.allergy_names.map((a, i) => (
            <li key={i}><strong>{a.name}</strong>: {[...(a.allergens ?? []).map(allergenLabel), a.other, a.dietary].filter(Boolean).join(', ')}</li>
          ))}
        </ul>
      )}

      <ul className="eh-needs">
        {(meal.needs ?? []).map((n) => (
          <li key={n.id} className="eh-need" data-testid="eh-need">
            <div className="eh-need-line">
              <span>{n.label}{n.quantity > 1 ? ` x${n.quantity}` : ''}</span>
              {n.starter && <span className="eh-tag eh-tag-warn">Starter, review before sending</span>}
              {!n.claim && <span className="eh-pill eh-pill-filling">Open</span>}
              {!n.claim && canAct && open?.id !== n.id && (
                <button type="button" className="eh-btn eh-btn-small" onClick={() => setOpen({ kind: 'need', id: n.id })}>Claim</button>
              )}
            </div>
            {n.claim && claimRow(n.claim, `Claimed by ${n.claim.family}`)}
            {open?.kind === 'need' && open.id === n.id && (
              <ClaimForm initial={{ what: n.label }} strip={strip} submitLabel="Claim it" onCancel={() => setOpen(null)}
                         onSubmit={(v) => run('food_claim', { meal_id: meal.id, need_id: n.id, ...v }, 'Claimed. Thank you!')} />
            )}
            {open?.kind === 'edit' && n.claim && open.id === n.claim.id && (
              <ClaimForm initial={n.claim} strip={strip} submitLabel="Save" onCancel={() => setOpen(null)}
                         onSubmit={(v) => run('food_edit', { claim_id: n.claim.id, ...v }, 'Saved.')} />
            )}
          </li>
        ))}
        {(meal.extras ?? []).map((c) => (
          <li key={c.id} className="eh-need">
            {claimRow(c, `${c.family[0].toUpperCase()}${c.family.slice(1)}`)}
            {open?.kind === 'edit' && open.id === c.id && (
              <ClaimForm initial={c} strip={strip} submitLabel="Save" onCancel={() => setOpen(null)}
                         onSubmit={(v) => run('food_edit', { claim_id: c.id, ...v }, 'Saved.')} />
            )}
          </li>
        ))}
      </ul>

      {canAct && open?.kind !== 'extra' && (
        <button type="button" className="eh-btn" onClick={() => setOpen({ kind: 'extra', id: 'extra' })}>Add something else</button>
      )}
      {open?.kind === 'extra' && (
        <ClaimForm initial={{}} strip={strip} submitLabel="Add it" onCancel={() => setOpen(null)}
                   onSubmit={(v) => run('food_claim', { meal_id: meal.id, ...v }, 'Added. Thank you!')} />
      )}
      {meal.truck_note && <p className="eh-footnote">{meal.truck_note}</p>}
      <Note note={note} />
    </article>
  )
}

// ── Event info ──────────────────────────────────────────────────────────────

// Which icon a section of the Event info page carries, by its key.
function infoIcon(key = '') {
  if (/drive|route|parking/.test(key)) return IconCar
  if (/agenda|schedule|fri|sat|sun/.test(key)) return IconClock
  if (/truck|food|meal|vendor/.test(key)) return IconUtensils
  if (/hotel|stay|lodg/.test(key)) return IconBed
  if (/rule|halloween|safety|conduct/.test(key)) return IconShield
  if (/parent|channel|group/.test(key)) return IconUsers
  if (/team|award/.test(key)) return IconFlag
  if (/watch|stream/.test(key)) return IconStar
  if (/bring|pack|shirt|store/.test(key)) return IconClipboard
  return IconInfo
}

export function EventInfo({ event }) {
  const links = event?.links ?? {}
  const sections = visibleSections(event?.info, links).filter((s) => s.key !== 'where')
  return (
    <div className="eh-event-info">
      {(event?.venue_name || event?.venue_address) && (
        <section className="eh-card eh-where">
          <span className="eh-where-icon"><IconPin size={26} /></span>
          <div>
            <p className="eh-info-venue">{event.venue_name}</p>
            {event.venue_address && <p className="eh-quiet">{event.venue_address}</p>}
            {event.map_url && <a className="eh-btn eh-btn-primary" href={event.map_url} target="_blank" rel="noopener noreferrer"><IconPin size={18} />Open the map</a>}
          </div>
        </section>
      )}
      <p className="eh-hint">Tap a heading to open it.</p>
      {sections.map((s, i) => (
        <Fold key={s.key} title={s.title} icon={infoIcon(s.key)} testid="eh-info-section" defaultOpen={i === 0 && sections.length <= 3}>
          <ul className="eh-info-lines">
            {(s.lines ?? []).map((line, j) => {
              const l = parseInfoLine(line, links)
              if (l.kind === 'text') return <li key={j} className="eh-info-text">{l.text}</li>
              if (l.kind === 'link') return <li key={j} className="eh-info-row"><a className="eh-link eh-with-icon" href={l.href} target="_blank" rel="noopener noreferrer"><IconLink size={16} />{l.label}</a></li>
              return (
                <li key={j} className="eh-info-row">
                  <span className="eh-info-k">{l.label}</span>
                  <span className={`eh-info-v${l.missing ? ' eh-quiet' : ''}`}>{l.value}</span>
                </li>
              )
            })}
          </ul>
        </Fold>
      ))}
    </div>
  )
}

export { ALLERGENS, fmtDate }
