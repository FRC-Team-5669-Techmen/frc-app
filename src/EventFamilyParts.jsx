// The family page's four parts and its summary (event family hub). Plain
// language for someone who rarely fills in forms online: one subject per part,
// every question says what it is for in an (i) card, rides are planned and
// seats picked in ONE place, and nothing here decides a rule. Each control
// sends an answer; the database (0005, 0007, 0008) decides and the page shows
// what it said.
import { Fragment, useState } from 'react'
import { supabase } from './supabase'
import {
  ALLERGENS, fmtDate, fmtDay, fmtPhone, fmtTime, formDays, isoToZoned, needsSeat, nightOptions, sameNights, zonedToIso,
} from './eventHub'
import { CarCard, CarpoolBoard, FoodBoard, PickupRequests } from './EventHubBoards'
import { Choice, CountPicker, Fold, InfoTip, Options, Q, Text, Tick } from './EventHubControls'
import {
  IconAlert, IconBed, IconCalendar, IconCar, IconCheck, IconCheckCircle, IconClipboard, IconClock, IconEdit, IconFlag,
  IconHeart, IconHome, IconInfo, IconMail, IconPhone, IconPill, IconPin, IconSchool, IconShield, IconTrash, IconUserPlus, IconUsers,
  IconUtensils,
} from './eventIcons'

// ── the parts ───────────────────────────────────────────────────────────────

/** The four parts of sign-up. `progressKey` is the step name the database's
 *  _hub_progress uses for it. */
export const PARTS = Object.freeze([
  { key: 'days', progressKey: 'days', label: 'Who is coming', short: 'Who', icon: IconCalendar, tone: 'blue',
    intro: (f) => `Which days ${f} is coming, and who from your family comes along. Saying Coming adds a few questions for that day.` },
  { key: 'rides', progressKey: 'getting', label: 'Rides', short: 'Rides', icon: IconCar, tone: 'green',
    intro: (f) => `How ${f} gets to the venue and back each day. Pick a seat in a car right here.` },
  { key: 'food', progressKey: 'food', label: 'Food and health', short: 'Food', icon: IconUtensils, tone: 'orange',
    intro: (f) => `Allergies and medicine, so mentors keep ${f} safe. Bringing food is optional.` },
  { key: 'contacts', progressKey: 'contacts', label: 'Contacts and forms', short: 'Contacts', icon: IconPhone, tone: 'violet',
    intro: () => 'How to reach you, an emergency contact, the forms, and who else can use this page.' },
])

export const partByKey = (k) => PARTS.find((p) => p.key === k)

/** 0008 is live when the page carries its fields (drive_to on a day). */
export const hasV8 = (view) => Object.values(view?.answers?.days ?? {}).some((d) => d && 'drive_to' in d)

/** Each run a student still needs a seat for: the family chose the carpool
 *  (before 0008, was left on it) and no car has the student yet. */
export function seatsMissing(view) {
  const v8 = hasV8(view)
  const out = []
  for (const d of view.board?.days ?? []) {
    const ad = view.answers.days[d.id]
    for (const run of ['to', 'home']) {
      if (!needsSeat(ad, run)) continue
      if (v8 && (run === 'to' ? ad.to_mode : ad.home_mode) == null) continue
      if ((d.runs?.find((x) => x.run === run)?.cars ?? []).some((c) => c.my_seat)) continue
      out.push({ day: d, run })
    }
  }
  return out
}
export const partOfStep = (step) => PARTS.find((p) => p.progressKey === step)

/** One missing answer, in words. */
export function missingLabel(m, view) {
  const day = m.day_id ? (view.board.days ?? []).find((d) => d.id === m.day_id) : null
  const on = day ? ` on ${fmtDate(day.date, 'medium')}` : ''
  const first = view.student?.first ?? 'Your student'
  switch (m.key) {
    case 'ride_to': return `How ${first} gets there${on}`
    case 'ride_home': return `How ${first} gets home${on}`
    case 'staying': return 'Staying near the venue?'
    case 'attending': return `Coming${on}?`
    case 'adults': return `Adults coming${on}`
    case 'pit_setup': return `Pit setup${on}`
    case 'school_mode': return `Getting to Bosco Tech${on}`
    case 'pickup': return `Pickup spot${on}`
    case 'car': return `Your car's details${on}`
    case 'driver_checks': return 'The two driver checks'
    case 'allergies': return 'Food allergies'
    case 'medication': return 'Medicine during the event'
    case 'parent_name': return 'Your name'
    case 'parent_phone': return 'Your phone'
    case 'parent_email': return 'Your email'
    case 'emergency_name': return 'Emergency contact name'
    case 'emergency_phone': return 'Emergency contact phone'
    case 'first_reg': return 'FIRST registration'
    case 'school_form': return 'School permission form'
    default: return 'An answer'
  }
}

function DayHead({ d, tz, children }) {
  return (
    <header className="eh-dayq-head">
      <span className="eh-day-badge"><IconCalendar size={18} /><span>{fmtDate(d.date)}</span></span>
      {d.title && <span className="eh-day-title">{d.title}</span>}
      {d.over && <span className="eh-pill eh-pill-left">Over</span>}
      {children}
      {d.meet_at && (
        <span className="eh-day-meet"><IconClock size={16} />
          Be at {d.meet_place || 'the meeting spot'} by {fmtTime(d.meet_at, tz)}.
          {d.last_car_out_at ? ` Cars leave at ${fmtTime(d.last_car_out_at, tz)}.` : ''}</span>
      )}
    </header>
  )
}

// ── part 1: who is coming ───────────────────────────────────────────────────

const ATTEND = [
  { value: 'yes', label: 'Coming', tone: 'ok' },
  { value: 'no', label: 'Not coming' },
  { value: 'unsure', label: 'Not sure yet' },
]

export function PartDays({ view, ctx }) {
  const first = view.student.first
  const days = formDays(view.board.days)
  const a = view.answers
  const nights = nightOptions(view.board.days)
  const coming = days.filter((d) => a.days[d.id]?.attending === 'yes')
  return (
    <div className="eh-part-body">
      {days.map((d) => {
        const ad = a.days[d.id] ?? {}
        const off = ctx.locked || d.over
        return (
          <section key={d.id} className="eh-card eh-dayq" data-testid="eh-day-q">
            <DayHead d={d} tz={ctx.tz} />
            {d.intro && (
              <div className="eh-intro" data-testid="eh-day-intro">
                {d.intro.split('\n').map((l, i) => <p key={i}>{l}</p>)}
              </div>
            )}
            <Choice k={`attending:${d.id}`} ctx={ctx} disabled={off} label={`Is ${first} coming?`} testid="eh-attending"
                    info={`Choose Not sure yet if you do not know. You can change this until the day itself. At lock-in, a few days before the event, you will be asked to decide.`}
                    options={ATTEND} value={ad.attending ?? null}
                    onPick={(v) => ctx.save(`attending:${d.id}`, { field: 'attending', value: v, day_id: d.id })} />
            {ad.attending === 'yes' && d.ask_pit_setup && (
              <Choice k={`pit_setup:${d.id}`} ctx={ctx} disabled={off} label={`Will ${first} help set up the pit?`}
                      info="The pit is the team's work area at the venue, where the robot is kept and fixed. Setting it up is optional and happens at the start of this day."
                      options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]} value={ad.pit_setup ?? null}
                      onPick={(v) => ctx.save(`pit_setup:${d.id}`, { field: 'pit_setup', value: v, day_id: d.id })} />
            )}
            {ad.attending === 'yes' && d.home_options?.length > 0 && (
              <Choice k={`home_option:${d.id}`} ctx={ctx} disabled={off} label="When does the day end for you?"
                      info={`This day has more than one way to end. It sets when ${first} needs a ride home.`}
                      options={d.home_options.map((o) => ({ key: o.key, value: o.key, label: o.label,
                        on: (ad.home_option ?? d.home_options.find((x) => x.default)?.key) === o.key }))}
                      onPick={(v) => ctx.save(`home_option:${d.id}`, { field: 'home_option', value: v, day_id: d.id })} />
            )}
          </section>
        )
      })}

      <section className="eh-card">
        <Choice k="staying_nights" ctx={ctx} disabled={ctx.locked} label="Is your family staying near the venue overnight?"
                info={`Some families book a hotel near the venue so they do not drive back and forth. If you stay nearby, no carpool seat is planned for ${first} on those mornings and evenings. The Event info page has the team's hotel rate.`}
                options={nights.map((o) => ({ key: o.key, value: o.value, label: o.label, on: sameNights(a.response.staying_nights, o.value) }))}
                onPick={(v) => ctx.save('staying_nights', { field: 'staying_nights', value: v })} />
      </section>

      {coming.length > 0 && (
        <section className="eh-card" data-testid="eh-adults">
          <h3 className="eh-card-title eh-with-icon"><IconUsers size={20} />Adults from your family</h3>
          <p className="eh-hint">Parents, guardians and other grown-ups from your family who will be there. Count yourself if you are going; pick 0 if only {first} goes. It sets how much food is planned.</p>
          {coming.map((d) => (
            <CountPicker key={d.id} k={`adults:${d.id}`} ctx={ctx} disabled={ctx.locked || d.over} label={fmtDate(d.date)}
                         max={ctx.v8 ? 30 : 4} value={a.days[d.id]?.adults ?? null}
                         info={d === coming[0] ? 'Count yourself too. Zero is fine if nobody from your family is coming along.' : undefined}
                         onPick={(v) => ctx.save(`adults:${d.id}`, { field: 'adults', value: v, day_id: d.id })} />
          ))}
          {!ctx.v8 && <p className="eh-hint">More than 4? Choose 4 and tell a mentor the number.</p>}
        </section>
      )}
    </div>
  )
}

// ── part 2: rides ───────────────────────────────────────────────────────────

/** The Salesian one-child rule, said once at the top of Rides. */
export function OneChildRule() {
  return (
    <aside className="eh-rule" data-testid="eh-one-child-rule">
      <span className="eh-rule-icon"><IconShield size={22} /></span>
      <div>
        <p className="eh-rule-title">Safety rule: the one-child rule (Salesian safe environment)</p>
        <p>An adult is never alone in a car with one student who is not their own child. So a car without the driver's own student takes two or more students, and a mentor seats the first two. The carpool checks this for you; you do not need to do anything.</p>
      </div>
    </aside>
  )
}

function modeOptions(first, run, nearby) {
  const there = run === 'to'
  return [
    { value: 'driving', icon: IconCar, label: `We drive ${first}, and can take others`,
      sub: 'Our car also takes other students who need a ride' },
    { value: 'carpool', icon: IconUsers, label: `${first} rides with another driver`,
      sub: "In another family's car or a mentor's car. You pick the car" },
    { value: 'self', icon: nearby ? IconBed : IconFlag, label: nearby ? 'We are staying nearby' : `We drive ${first} ourselves, no one else`,
      sub: there ? (nearby ? 'We are already near the venue' : `Or ${first} gets there another way. No seat needed`)
        : (nearby ? 'We stay near the venue tonight' : `Or ${first} gets home another way. No seat needed`) },
  ]
}

const MODE_INFO = 'Choose the one that fits this trip. "We drive, and can take others" lists your car for other students and asks a few questions about it. "Rides with another driver" lets you pick a seat in a car just below. "We drive ourselves, no one else" means no seat is planned and your car is not listed. You can change this until the car leaves.'

function PickupBlock({ d, ad, ctx, off, first }) {
  const saved = ad.pickup
  const [spot, setSpot] = useState(saved?.spot ?? '')
  const [consent, setConsent] = useState(!!saved)
  const [covers, setCovers] = useState(saved?.covers_home ?? true)
  const k = `pickup:${d.id}`
  const send = (next) => ctx.save(k, { field: 'pickup', day_id: d.id, value: next })
  return (
    <div className="eh-sub">
      <Q as="div" label="About where should the driver pick up?" className="eh-field"
         info="Write cross streets or a landmark near your home, for example Rosemead and Valley. Never a street address. Only a driver who offered pickups that day and the mentors see it, and it is deleted 14 days after the event.">
        <input className="eh-input" value={spot} maxLength={160} disabled={off} data-testid="eh-pickup-spot" aria-label="Pickup spot"
               placeholder="Cross streets or a landmark"
               onChange={(e) => setSpot(e.target.value)}
               onBlur={() => { if (consent && spot.trim()) send({ spot, consent: true, covers_home: covers }) }} />
      </Q>
      <Tick k={k} ctx={ctx} disabled={off} checked={consent} testid="eh-pickup-consent"
            label="Share this spot with the driver who picks up, and with mentors."
            onToggle={(v) => { setConsent(v); send({ spot, consent: v, covers_home: covers }) }} />
      {!consent && spot.trim() && <p className="eh-hint eh-hint-warn">Tick the box to save this spot. Without it, nothing is stored.</p>}
      {consent && (
        <Tick k={`${k}:covers`} ctx={ctx} disabled={off} checked={covers} label={`Bring ${first} home the same way.`}
              onToggle={(v) => { setCovers(v); send({ spot, consent: true, covers_home: v }) }} />
      )}
      {saved?.accepted && <p className="eh-ok-line"><IconCheckCircle size={18} />Accepted by {saved.driver}.</p>}
    </div>
  )
}

/** The cars a student can sit in on one run, right under the answer. */
function SeatPicker({ d, run, ad, ctx, act, viewer, first }) {
  const r = (d.runs ?? []).find((x) => x.run === run) ?? {}
  const cars = r.cars ?? []
  const mine = cars.find((c) => c.my_seat)
  const others = cars.filter((c) => !c.my_seat && !c.mine && c.status !== 'left' && c.status !== 'arrived')
  const roomy = others.filter((c) => c.status !== 'full' && c.status !== 'pending')
  return (
    <div className="eh-seats" data-testid="eh-seat-picker">
      <div className="eh-q-head">
        <span className="eh-q-label">{mine ? `${first}'s seat for the drive ${run === 'to' ? 'there' : 'home'}` : `Pick a seat for the drive ${run === 'to' ? 'there' : 'home'}`}</span>
        <InfoTip>Tap Claim a seat on a car with room. You can leave it and pick another until the car leaves. If no car has room yet, check back later. Mentors make sure every student has a seat before the event.</InfoTip>
      </div>
      {mine && <CarCard car={mine} day={d} tz={ctx.tz} viewer={viewer} myDay={ad} runKey={run} unplaced={[]} act={act} locked={ctx.locked} />}
      {!mine && roomy.length === 0 && (
        <p className="eh-wait" data-testid="eh-no-room"><IconClock size={18} />No car has room yet. Check back soon; mentors place every student before the event.</p>
      )}
      {!mine && others.map((c) => (
        <CarCard key={c.id} car={c} day={d} tz={ctx.tz} viewer={viewer} myDay={ad} runKey={run} unplaced={[]} act={act} locked={ctx.locked} />
      ))}
    </div>
  )
}

/** A driver's own car on one run: who is in it, Leaving now, pickups. */
function MyCar({ d, run, ctx, act, viewer }) {
  const r = (d.runs ?? []).find((x) => x.run === run) ?? {}
  const car = (r.cars ?? []).find((c) => c.mine)
  if (!car) return null
  return (
    <div className="eh-seats" data-testid="eh-my-car">
      <div className="eh-q-head"><span className="eh-q-label">Your car {run === 'to' ? 'going there' : 'coming home'}</span></div>
      <CarCard car={car} day={d} tz={ctx.tz} viewer={viewer} myDay={null} runKey={run} unplaced={[]} act={act} locked={ctx.locked} />
      {Array.isArray(r.pickups) && <PickupRequests pickups={r.pickups} cars={r.cars ?? []} viewer={viewer} act={act} locked={ctx.locked} day={d} />}
    </div>
  )
}

function driveValue(ad) {
  if (ad.drive_to && ad.drive_home) return 'both'
  if (ad.drive_to) return 'to'
  if (ad.drive_home) return 'home'
  if (ad.drive_to === false || ad.drive_home === false) return 'no'
  return null
}

/** "Can a parent drive other students?" (0008): a car without the family's
 *  own student, so the one-child rule applies to it. */
function DriveExtra({ d, ad, ctx, off, first, coming }) {
  const toFree = !coming || ad.eff_to !== 'driving'
  const homeFree = !coming || ad.eff_home !== 'driving'
  if (!toFree && !homeFree) return null
  const opts = [{ value: 'no', label: 'No' }]
  if (toFree) opts.push({ value: 'to', label: 'Yes, going there' })
  if (homeFree) opts.push({ value: 'home', label: 'Yes, coming home' })
  if (toFree && homeFree) opts.push({ value: 'both', label: 'Yes, both ways' })
  const pick = (v) => {
    const to = v === 'to' || v === 'both'
    const home = v === 'home' || v === 'both'
    if (toFree) ctx.save(`drive_to:${d.id}`, { field: 'drive_to', value: to, day_id: d.id })
    if (homeFree) ctx.save(`drive_home:${d.id}`, { field: 'drive_home', value: home, day_id: d.id })
  }
  const v = driveValue(ad)
  const day = fmtDate(d.date).split(',')[0]
  // Optional, so it waits behind a heading until someone opens it; it opens
  // by itself once a parent has said yes.
  return (
    <Fold icon={IconCar} testid="eh-drive-fold" defaultOpen={v === 'to' || v === 'home' || v === 'both'}
          title={coming ? `Driving to the event anyway on ${day}?` : `Can a parent still drive students on ${day}?`}
          sub={coming ? `Optional. Offer your empty seats while ${first} rides with someone else.` : `Optional. ${first} is not coming that day.`}>
      <Choice k={`drive_to:${d.id}`} ctx={ctx} disabled={off} testid="eh-drive-extra"
              label={coming ? `Will a parent drive other students on ${day}, without ${first} in the car?` : `Will a parent drive students on ${day}?`}
              info={`Extra drivers help the whole team. If ${first} rides with you, choose "We drive ${first}, and can take others" above instead. Because ${first} would not be in this car, the one-child rule applies: it takes two or more students together, and a mentor seats the first two. You will be asked about the car below.`}
              options={opts} value={v} onPick={pick} />
    </Fold>
  )
}

function CarDetails({ d, ad, ctx, off, first, own }) {
  const leave = ad.car_leave_by ? isoToZoned(ad.car_leave_by, ctx.tz).time : ''
  return (
    <div className="eh-sub eh-offer" data-testid="eh-car-offer">
      <h4 className="eh-sub-title eh-with-icon"><IconCar size={20} />Your car on {fmtDate(d.date, 'medium')}</h4>
      <Choice k={`car_seats:${d.id}`} ctx={ctx} disabled={off}
              label={own ? `How many other students fit? (not counting ${first})` : 'How many students fit?'}
              info="Count seat belts you can give to students, after the adults in your car. A student only sits where there is a seat belt."
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))} value={ad.car_seats ?? null}
              onPick={(v) => ctx.save(`car_seats:${d.id}`, { field: 'car_seats', value: v, day_id: d.id })} />
      <Text k={`car_description:${d.id}`} ctx={ctx} disabled={off} label="What does your car look like?"
            info="So students find it in the parking lot. Color and model is enough." placeholder="Silver Honda Odyssey"
            maxLength={80} value={ad.car_description ?? ''} testid="eh-car-desc"
            onCommit={(v) => ctx.save(`car_description:${d.id}`, { field: 'car_description', value: v, day_id: d.id })} />
      <Text k={`car_leave_by:${d.id}`} ctx={ctx} disabled={off} type="time" label="What is the latest you can leave the venue?"
            info="Students who ride home with you leave when you do. If you must leave before the day ends, families see that before they pick your car."
            value={leave} wait={400}
            onCommit={(v) => ctx.save(`car_leave_by:${d.id}`, { field: 'car_leave_by', value: zonedToIso(d.date, v, ctx.tz), day_id: d.id })} />
      <Choice k={`car_takes_pickups:${d.id}`} ctx={ctx} disabled={off} label="Could you pick up a student near their home on the way?"
              info="Some students cannot get to Bosco Tech in the morning. If you say yes, you will see their rough pickup spots (cross streets, never addresses) on this page and can choose to take one. Nothing is assigned to you; you decide each one."
              options={[{ value: true, label: 'Yes, I can' }, { value: false, label: 'No' }]} value={ad.car_takes_pickups ?? null}
              onPick={(v) => ctx.save(`car_takes_pickups:${d.id}`, { field: 'car_takes_pickups', value: v, day_id: d.id })} />
    </div>
  )
}

function RunPlan({ d, ad, run, ctx, act, viewer, first }) {
  const off = ctx.locked || d.over
  const there = run === 'to'
  const eff = there ? ad.eff_to : ad.eff_home
  const nearby = there ? ad.nearby_before : ad.nearby_after
  const field = there ? 'to_mode' : 'home_mode'
  // With 0008 the way there and home are answers: nothing is picked until the
  // family picks it (staying nearby answers it). Before 0008 the carpool
  // default stands and the page says it was assumed.
  const raw = ad[field]
  const value = ctx.v8 && raw == null && !nearby ? null : eff
  const carpool = value === 'carpool'
  const showSchool = there && carpool && d.ask_school_ride && !ad.nearby_before
  return (
    <div className={`eh-run eh-run-${run}`}>
      <p className="eh-run-tag">{there ? <><IconPin size={16} />Going there</> : <><IconHome size={16} />Coming home</>}</p>
      <Options k={`${field}:${d.id}`} ctx={ctx} disabled={off} testid={there ? 'eh-to-mode' : 'eh-home-mode'}
               label={there ? `How will ${first} get to the venue?` : `How will ${first} get home?`}
               info={MODE_INFO} options={modeOptions(first, run, nearby)} value={value}
               hint={value == null ? 'Choose one.' : null}
               assumed={raw == null && value != null
                 ? (nearby ? 'Filled in from your answer about staying nearby. Tap another card if that is not right.'
                   : `We started you on "${first} rides with another driver". Tap the card that is right.`)
                 : null}
               onPick={(v) => ctx.save(`${field}:${d.id}`, { field, value: v, day_id: d.id })} />
      {showSchool && (
        <Options k={`school_mode:${d.id}`} ctx={ctx} disabled={off} testid="eh-school-mode"
                 label={`How will ${first} get to Bosco Tech${d.meet_at ? ` by ${fmtTime(d.meet_at, ctx.tz)}` : ''}?`}
                 info="Team carpool cars leave from Bosco Tech. If your student cannot get there, ask for a ride from home; a driver who offered pickups may pick them up on the way."
                 options={[
                   { value: 'self', icon: IconSchool, label: 'We drop off at Bosco Tech', sub: d.meet_place || 'At the meeting spot' },
                   { value: 'pickup', icon: IconHome, label: 'Needs a ride from home', sub: 'A driver may pick up near your home' },
                 ]}
                 value={ad.school_mode ?? null}
                 onPick={(v) => ctx.save(`school_mode:${d.id}`, { field: 'school_mode', value: v, day_id: d.id })}>
          {ad.school_mode === 'pickup' && <PickupBlock d={d} ad={ad} ctx={ctx} off={off} first={first} />}
        </Options>
      )}
      {carpool && <SeatPicker d={d} run={run} ad={ad} ctx={ctx} act={act} viewer={viewer} first={first} />}
      {!there && carpool && d.drive_home_range && (
        <p className="eh-hint">The drive home takes about {d.drive_home_range}. Each car shows when it heads home.</p>
      )}
      <MyCar d={d} run={run} ctx={ctx} act={act} viewer={viewer} />
    </div>
  )
}

function DriverChecks({ view, ctx }) {
  const r = view.answers.response
  return (
    <section className="eh-card eh-tone-green" data-testid="eh-driver-checks">
      <h3 className="eh-card-title eh-with-icon"><IconShield size={20} />For drivers</h3>
      <p className="eh-hint">The school requires the first two for every driver. Until both are ticked and your car's details are filled in, other families cannot see your car.</p>
      <Tick k="driver_25" ctx={ctx} disabled={ctx.locked} checked={r.driver_25} label="I am 25 or older."
            onToggle={(v) => ctx.save('driver_25', { field: 'driver_25', value: v })} />
      <Tick k="driver_licensed" ctx={ctx} disabled={ctx.locked} checked={r.driver_licensed}
            label="I have a valid California driver's license and car insurance."
            onToggle={(v) => ctx.save('driver_licensed', { field: 'driver_licensed', value: v })} />
      <Tick k="driver_phone_consent" ctx={ctx} disabled={ctx.locked} checked={r.driver_phone_consent} testid="eh-driver-consent"
            label="Share my phone number with the families of students riding with me."
            info="Riders' families can call you on the day. If you leave this off, they are told to contact you through the mentors."
            onToggle={(v) => ctx.save('driver_phone_consent', { field: 'driver_phone_consent', value: v })} />
      {view.event.driver_paperwork_required && (
        <p className={r.driver_paperwork_on_file ? 'eh-ok-line' : 'eh-hint eh-hint-warn'}>
          {r.driver_paperwork_on_file ? 'Your license and insurance are on file.'
            : 'A mentor needs a copy of your license and insurance. Until then your car shows Not ready.'}
        </p>
      )}
    </section>
  )
}

export function PartRides({ view, ctx, act, viewer }) {
  const first = view.student.first
  const days = [...view.board.days].sort((x, y) => String(x.date).localeCompare(String(y.date)))
  const a = view.answers
  const r = a.response
  const hasCar = (ad, coming) => (coming && [ad.eff_to, ad.eff_home].includes('driving')) || !!ad.drive_to || !!ad.drive_home
  const anyCar = days.some((d) => hasCar(a.days[d.id] ?? {}, a.days[d.id]?.attending === 'yes'))
  const anyCarpool = days.some((d) => ['to', 'home'].some((run) => needsSeat(a.days[d.id], run)))
  const answered = days.some((d) => a.days[d.id]?.attending)
  // The driver checks sit right under the first day with a car, where the
  // parent who just said they drive is looking, not at the foot of the page.
  const firstCarDay = days.find((d) => hasCar(a.days[d.id] ?? {}, a.days[d.id]?.attending === 'yes'))?.id
  return (
    <div className="eh-part-body">
      <OneChildRule />
      {!answered && <p className="eh-empty">Answer Who is coming first, then plan rides here.</p>}
      {days.map((d) => {
        const ad = a.days[d.id] ?? {}
        const off = ctx.locked || d.over
        const coming = ad.attending === 'yes'
        if (!ad.attending) return null
        return (
          <Fragment key={d.id}>
          <section className={`eh-card eh-dayq${coming ? '' : ' eh-dayq-quiet'}`} data-testid="eh-getting-day">
            <DayHead d={d} tz={ctx.tz}>
              {!coming && <span className="eh-pill">{ad.attending === 'no' ? `${first} is not coming` : 'Not sure yet'}</span>}
            </DayHead>
            {coming && (
              <div className="eh-runs">
                <RunPlan d={d} ad={ad} run="to" ctx={ctx} act={act} viewer={viewer} first={first} />
                <RunPlan d={d} ad={ad} run="home" ctx={ctx} act={act} viewer={viewer} first={first} />
              </div>
            )}
            {ad.attending === 'unsure' && <p className="eh-hint">Plan this day once you choose Coming in Who is coming.</p>}
            {ctx.v8 && ad.attending !== 'unsure' && <DriveExtra d={d} ad={ad} ctx={ctx} off={off} first={first} coming={coming} />}
            {hasCar(ad, coming) && (
              <>
                <CarDetails d={d} ad={ad} ctx={ctx} off={off} first={first} own={coming && [ad.eff_to, ad.eff_home].includes('driving')} />
                {!coming && <MyCar d={d} run="to" ctx={ctx} act={act} viewer={viewer} />}
                {!coming && <MyCar d={d} run="home" ctx={ctx} act={act} viewer={viewer} />}
              </>
            )}
          </section>
          {anyCar && d.id === firstCarDay && <DriverChecks view={view} ctx={ctx} />}
          </Fragment>
        )
      })}

      {anyCarpool && (
        <section className="eh-card">
          <Tick k="rider_phone_consent" ctx={ctx} disabled={ctx.locked} checked={r.rider_phone_consent}
                label={`Share our phone number with ${first}'s driver.`}
                hint="If you leave this off, the driver cannot call you if plans change."
                info="So the driver can call you if they are running late or cannot find your student."
                onToggle={(v) => ctx.save('rider_phone_consent', { field: 'rider_phone_consent', value: v })} />
        </section>
      )}

      <Fold title="See every car on the team carpool" icon={IconUsers} testid="eh-board-fold">
        <CarpoolBoard board={view.board} tz={ctx.tz} viewer={viewer} myDays={a.days} act={act} locked={ctx.locked} />
      </Fold>
    </div>
  )
}

// ── part 3: food and health ─────────────────────────────────────────────────

export function PartFood({ view, ctx, act, viewer }) {
  const first = view.student.first
  const r = view.answers.response
  const links = view.event.links ?? {}
  const has = new Set(r.allergens ?? [])
  return (
    <div className="eh-part-body">
      <section className="eh-card" data-testid="eh-allergies">
        <Q label={`Does ${first} have any food allergies?`} s={ctx.states.allergens ?? ctx.states.allergies_none} tz={ctx.tz}
           hint={has.size ? `Tap every one that applies. Picked: ${ALLERGENS.filter((x) => has.has(x.key)).map((x) => x.label).join(', ')}.` : 'Tap every one that applies.'}
           info="Mentors see who has which allergy so team meals are safe. Other families only ever see how many people have each allergy, never names.">
          <div className="eh-chips">
            <button type="button" role="checkbox" aria-checked={!!r.allergies_none} disabled={ctx.locked}
                    className={`eh-chip${r.allergies_none ? ' eh-chip-on' : ''}`}
                    onClick={() => ctx.save('allergies_none', { field: 'allergies_none', value: !r.allergies_none })}>
              {r.allergies_none && <IconCheck size={16} />}No allergies
            </button>
            {ALLERGENS.map((x) => (
              <button key={x.key} type="button" role="checkbox" aria-checked={has.has(x.key)} disabled={ctx.locked}
                      className={`eh-chip${has.has(x.key) ? ' eh-chip-on' : ''}`}
                      onClick={() => {
                        const next = has.has(x.key) ? [...has].filter((k) => k !== x.key) : [...has, x.key]
                        ctx.save('allergens', { field: 'allergens', value: next })
                      }}>
                {has.has(x.key) && <IconCheck size={16} />}{x.label}
              </button>
            ))}
          </div>
        </Q>
        <Text k="allergy_other" ctx={ctx} disabled={ctx.locked} label="Another allergy not listed" placeholder="Describe it"
              value={r.allergy_other ?? ''} maxLength={300}
              onCommit={(v) => ctx.save('allergy_other', { field: 'allergy_other', value: v })} />
      </section>
      <section className="eh-card">
        <Text k="dietary" ctx={ctx} disabled={ctx.locked} label="Any other food needs? (optional)" placeholder="Vegetarian, halal"
              info="Not an allergy, but something the people planning meals should know."
              value={r.dietary ?? ''} maxLength={300}
              onCommit={(v) => ctx.save('dietary', { field: 'dietary', value: v })} />
      </section>
      <section className="eh-card">
        <Choice k="medication" ctx={ctx} disabled={ctx.locked} label={`Does ${first} need to take medicine during the event?`}
                info="If yes, the school needs its medication form so a staff member may help. Medicine your student carries for emergencies (an inhaler, an EpiPen) counts too."
                options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]}
                value={r.medication ?? null} onPick={(v) => ctx.save('medication', { field: 'medication', value: v })}>
          {r.medication === true && (links.medication_form
            ? <a className="eh-link eh-with-icon" href={links.medication_form} target="_blank" rel="noopener noreferrer"><IconPill size={18} />Open the medication form</a>
            : <p className="eh-hint">A mentor will follow up about the medication form.</p>)}
        </Choice>
      </section>
      <Fold title="Bring food for a team meal (optional)" icon={IconUtensils} testid="eh-food-fold"
            sub="Pick a dish, or say what you will bring. Change or drop it until that meal starts.">
        <FoodBoard board={view.board} tz={ctx.tz} viewer={viewer} act={act} locked={ctx.locked} />
      </Fold>
    </div>
  )
}

// ── part 4: contacts and forms ──────────────────────────────────────────────

function People({ view, family, onRemovedSelf }) {
  const guardians = view.guardians
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [arm, setArm] = useState(null)
  const err = (error) => {
    const m = /^hub:([a-z_]+)$/.exec(error?.message ?? '')
    return m ? (error.details || 'That did not work.') : 'Could not reach the team server. Try again.'
  }
  async function add(e) {
    e.preventDefault()
    setBusy(true)
    const args = { p_token: family.token, p_email: email.trim() }
    if (Array.isArray(guardians)) args.p_name = name.trim() || null
    const { error } = await supabase.rpc('hub_add_parent', args)
    setBusy(false)
    if (error) { setNote({ bad: true, text: err(error) }); return }
    family.sendMail()
    setNote({ text: `Sent a link to ${email.trim()}.` })
    setEmail(''); setName('')
    family.reload()
  }
  async function remove(g) {
    setBusy(true)
    const { data, error } = await supabase.rpc('hub_remove_guardian', { p_token: family.token, p_email: g.email })
    setBusy(false)
    setArm(null)
    if (error) { setNote({ bad: true, text: err(error) }); return }
    if (data?.self) { onRemovedSelf(); return }
    setNote({ text: `${g.name || g.email} was removed. Their link no longer works.` })
    family.reload()
  }
  return (
    <section className="eh-card" data-testid="eh-people">
      <h3 className="eh-card-title eh-with-icon"><IconUsers size={20} />Who can open this page</h3>
      <p className="eh-hint">Each person below has their own link and can change answers. Remove someone and their link stops working right away.</p>
      {Array.isArray(guardians) && (
        <ul className="eh-people-list">
          {guardians.map((g) => (
            <li key={g.email} className="eh-person" data-testid="eh-person">
              <span className="eh-person-icon"><IconMail size={18} /></span>
              <span className="eh-person-text">
                <span className="eh-person-name">{g.name || g.email}{g.email === view.me && <span className="eh-tag">You</span>}</span>
                {g.name && <span className="eh-person-email">{g.email}</span>}
              </span>
              {guardians.length > 1 && !arm && (
                <button type="button" className="eh-btn eh-btn-quiet" disabled={busy || family.locked} onClick={() => setArm(g.email)}
                        data-testid="eh-person-remove"><IconTrash size={18} />Remove</button>
              )}
              {arm === g.email && (
                <span className="eh-confirm-inline">
                  <span>{g.email === view.me ? 'Remove yourself? Your link stops working.' : 'Remove them? Their link stops working.'}</span>
                  <button type="button" className="eh-btn eh-btn-danger" disabled={busy} onClick={() => remove(g)} data-testid="eh-person-remove-yes">Yes, remove</button>
                  <button type="button" className="eh-btn" onClick={() => setArm(null)}>Keep</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!family.locked && (
        <form className="eh-add-person" onSubmit={add} data-testid="eh-add-parent">
          <p className="eh-sub-title eh-with-icon"><IconUserPlus size={18} />Add another parent or guardian</p>
          <p className="eh-hint">They get their own link to this same page, so either of you can fill it in.</p>
          {Array.isArray(guardians) && (
            <input className="eh-input" autoComplete="off" placeholder="Their name" value={name} maxLength={120}
                   onChange={(e) => setName(e.target.value)} aria-label="Their name" />
          )}
          <div className="eh-inline">
            <input className="eh-input" type="email" required autoComplete="off" placeholder="Their email" value={email}
                   onChange={(e) => setEmail(e.target.value)} aria-label="Email of another parent or guardian" />
            <button type="submit" className="eh-btn eh-btn-primary" disabled={busy || !email.trim()}>Send them a link</button>
          </div>
        </form>
      )}
      {note && <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`} role="status">{note.text}</p>}
    </section>
  )
}

function LeaveTrip({ view, family, onRemoved }) {
  const [arm, setArm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const first = view.student.first
  async function go() {
    setBusy(true)
    const { error } = await supabase.rpc('hub_remove_family', { p_token: family.token })
    setBusy(false)
    if (error) {
      const m = /^hub:([a-z_]+)$/.exec(error.message ?? '')
      setNote({ bad: true, text: m ? (error.details || 'That did not work.') : 'Could not reach the team server. Try again.' })
      setArm(false)
      return
    }
    family.sendMail()
    onRemoved()
  }
  return (
    <Fold title="Take our family off this trip" icon={IconTrash} tone="danger" testid="eh-leave-fold">
      <p>This removes {first} from {view.event.title}: every answer, any car seat, any car you offered and any food you claimed. Drivers and mentors are told. If you change your mind, open the sign-up link again and start over.</p>
      {!arm
        ? <button type="button" className="eh-btn eh-btn-danger" disabled={busy || family.locked} onClick={() => setArm(true)} data-testid="eh-leave">Remove our family</button>
        : (
          <div className="eh-confirm-inline">
            <span>Remove {first}'s family from this trip?</span>
            <button type="button" className="eh-btn eh-btn-danger" disabled={busy} onClick={go} data-testid="eh-leave-yes">Yes, remove us</button>
            <button type="button" className="eh-btn" onClick={() => setArm(false)}>Keep us on the trip</button>
          </div>
        )}
      {note && <p className="eh-note eh-note-bad" role="alert">{note.text}</p>}
    </Fold>
  )
}

export function PartContacts({ view, ctx, family }) {
  const r = view.answers.response
  const links = view.event.links ?? {}
  return (
    <div className="eh-part-body">
      <section className="eh-card">
        <h3 className="eh-card-title eh-with-icon"><IconPhone size={20} />How mentors reach you</h3>
        <Text k="parent_name" ctx={ctx} disabled={ctx.locked} label="Your name" autoComplete="name" value={r.parent_name ?? ''} maxLength={120}
              onCommit={(v) => ctx.save('parent_name', { field: 'parent_name', value: v })} />
        <Text k="parent_phone" ctx={ctx} disabled={ctx.locked} label="Your cell phone" type="tel" inputMode="tel" autoComplete="tel"
              info="Mentors call or text this number if they need you during the event." placeholder="(555) 555-1234"
              value={r.parent_phone ?? ''} maxLength={40} testid="eh-parent-phone" format={fmtPhone}
              onCommit={(v) => ctx.save('parent_phone', { field: 'parent_phone', value: v })} />
        <Text k="parent_email" ctx={ctx} disabled={ctx.locked} label="Your email" type="email" inputMode="email" autoComplete="email"
              info="Reminders and car updates come to this address."
              value={r.parent_email ?? ''} maxLength={200}
              onCommit={(v) => ctx.save('parent_email', { field: 'parent_email', value: v })} />
      </section>
      <section className="eh-card">
        <h3 className="eh-card-title eh-with-icon"><IconHeart size={20} />Emergency contact</h3>
        <p className="eh-hint">Someone other than you, ideally not at the event, whom we can call if we cannot reach you.</p>
        <Text k="emergency_name" ctx={ctx} disabled={ctx.locked} label="Their name" value={r.emergency_name ?? ''} maxLength={120}
              onCommit={(v) => ctx.save('emergency_name', { field: 'emergency_name', value: v })} />
        <Text k="emergency_phone" ctx={ctx} disabled={ctx.locked} label="Their phone" type="tel" inputMode="tel"
              value={r.emergency_phone ?? ''} maxLength={40} format={fmtPhone}
              onCommit={(v) => ctx.save('emergency_phone', { field: 'emergency_phone', value: v })} />
      </section>
      <section className="eh-card">
        <h3 className="eh-card-title eh-with-icon"><IconClipboard size={20} />Forms</h3>
        <Choice k="first_reg_done" ctx={ctx} disabled={ctx.locked} label={`Is ${view.student.first} registered with FIRST this season?`}
                hint="FIRST is the robotics program. A parent signs its consent online once a year."
                info="Every student must be registered with FIRST each season, with a parent's online consent. It is free and takes about ten minutes. Not sure? Choose Not yet and open the link below to check."
                options={[{ value: true, label: 'Yes, done' }, { value: false, label: 'Not yet' }]} value={r.first_reg_done ?? null}
                onPick={(v) => ctx.save('first_reg_done', { field: 'first_reg_done', value: v })}>
          {links.first_registration && <a className="eh-link eh-with-icon" href={links.first_registration} target="_blank" rel="noopener noreferrer"><IconFlag size={18} />Open FIRST registration</a>}
        </Choice>
        {links.school_form && (
          <Choice k="school_form_done" ctx={ctx} disabled={ctx.locked} label="School permission form"
                  info="Don Bosco Tech's form for an off-campus activity."
                  options={[{ value: true, label: 'Done' }, { value: false, label: 'Not done yet' }]} value={r.school_form_done ?? null}
                  onPick={(v) => ctx.save('school_form_done', { field: 'school_form_done', value: v })}>
            <a className="eh-link eh-with-icon" href={links.school_form} target="_blank" rel="noopener noreferrer"><IconSchool size={18} />Open the school form</a>
          </Choice>
        )}
      </section>
      {family && <People view={view} family={family} onRemovedSelf={family.onRemovedSelf} />}
      {family?.canLeave && <LeaveTrip view={view} family={family} onRemoved={family.onRemoved} />}
    </div>
  )
}

// ── the summary: done, lock-in, over ────────────────────────────────────────

function runText(view, d, run) {
  const ad = view.answers.days[d.id] ?? {}
  const mode = run === 'to' ? ad.eff_to : ad.eff_home
  const nearby = run === 'to' ? ad.nearby_before : ad.nearby_after
  if (hasV8(view) && !nearby && (run === 'to' ? ad.to_mode : ad.home_mode) == null) return { text: 'Not chosen yet', icon: IconAlert, warn: true }
  const car = (d.runs?.find((x) => x.run === run)?.cars ?? []).find((c) => c.my_seat || c.mine)
  if (mode === 'driving') return { text: 'In your car', icon: IconCar }
  if (nearby) return { text: 'Staying nearby', icon: IconBed }
  if (mode === 'self') return { text: 'On your own', icon: IconFlag }
  return car ? { text: `${car.driver}'s car`, icon: IconUsers } : { text: 'Needs a seat', icon: IconAlert, warn: true }
}

function DayPlan({ view, d }) {
  const ad = view.answers.days[d.id] ?? {}
  const meals = (view.board.meals ?? []).filter((m) => m.day_id === d.id)
  const claims = (view.answers.food ?? []).filter((f) => meals.some((m) => m.id === f.meal_id))
  const to = runText(view, d, 'to')
  const home = runText(view, d, 'home')
  return (
    <dl className="eh-plan">
      <div className={to.warn ? 'eh-plan-warn' : ''}><dt><IconPin size={16} />There</dt><dd><to.icon size={16} />{to.text}</dd></div>
      <div className={home.warn ? 'eh-plan-warn' : ''}><dt><IconHome size={16} />Home</dt><dd><home.icon size={16} />{home.text}</dd></div>
      {ad.pickup && <div><dt><IconHome size={16} />Pickup</dt><dd>{ad.pickup.accepted ? `With ${ad.pickup.driver}` : 'Asked, not taken yet'}</dd></div>}
      {ad.adults != null && <div><dt><IconUsers size={16} />Adults</dt><dd>{ad.adults}</dd></div>}
      {claims.length > 0 && <div><dt><IconUtensils size={16} />Food</dt><dd>{claims.map((c) => c.what).join(', ')}</dd></div>}
    </dl>
  )
}

export function Summary({ view, ctx, act, goPart, goInfo }) {
  const ev = view.event
  const p = view.progress
  const first = view.student.first
  const days = [...view.board.days].sort((x, y) => String(x.date).localeCompare(String(y.date)))
  const [note, setNote] = useState(null)
  const lockin = !ev.over && ev.lockin_open && p.phase1_done && !p.lockin_done
  const missingSeats = seatsMissing(view)
  const needs = missingSeats.length > 0
  // The list in page order: by part, then by day.
  const dayAt = Object.fromEntries(days.map((d, i) => [d.id, i]))
  const todo = [...(p.missing ?? [])].sort((x, y) =>
    PARTS.findIndex((pt) => pt.progressKey === x.step) - PARTS.findIndex((pt) => pt.progressKey === y.step)
    || (dayAt[x.day_id] ?? -1) - (dayAt[y.day_id] ?? -1))
  const state = ev.over ? 'over' : !p.phase1_done ? 'todo' : lockin ? 'lockin' : p.lockin_done ? 'locked' : 'signed'
  const banner = {
    over: { icon: IconFlag, title: `${ev.title} is over`, text: 'Everything here is read-only now. Thank you for helping the team!' },
    todo: { icon: IconAlert, title: `${p.missing.length} ${p.missing.length === 1 ? 'answer' : 'answers'} still needed`, text: 'Tap one below to answer it. Everything you entered is saved.' },
    lockin: { icon: IconCheckCircle, title: 'Final check: please confirm each day', text: `${ev.lockin_due_at ? `Due ${fmtDay(ev.lockin_due_at, ctx.tz)}. ` : ''}A day that is right is one tap. You can still change things afterward.` },
    locked: { icon: IconCheckCircle, title: 'You are all set', text: ev.starts_on ? `See you ${fmtDate(ev.starts_on, 'medium')}! You can still change answers until each day.` : 'You can still change answers until each day.' },
    signed: { icon: IconCheckCircle, title: 'Sign-up is done. Thank you!', text: ev.lockin_opens_at ? `Come back on ${fmtDay(ev.lockin_opens_at, ctx.tz)} for a final check of each day (we will email you). You can change answers any time before then.` : 'You can change answers any time.' },
  }[state]
  const B = banner.icon
  return (
    <div className="eh-part-body" data-testid="eh-done">
      <section className={`eh-card eh-banner eh-banner-${state}`} data-testid="eh-summary-banner">
        <span className="eh-banner-icon"><B size={30} /></span>
        <div>
          <h2 className="eh-banner-title">{banner.title}</h2>
          <p>{banner.text}</p>
        </div>
      </section>

      {state === 'todo' && (
        <section className="eh-card" data-testid="eh-todo">
          <ul className="eh-todo-list">
            {todo.map((m, i) => {
              const part = partOfStep(m.step)
              const I = part?.icon ?? IconEdit
              return (
                <li key={i}>
                  <button type="button" className={`eh-todo eh-tone-${part?.tone}`} onClick={() => goPart(part?.key ?? 'days')}>
                    <span className="eh-todo-icon"><I size={18} /></span>
                    <span className="eh-todo-text">{missingLabel(m, view)}<span className="eh-todo-part">{part?.label}</span></span>
                    <span className="eh-todo-go">Answer</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {needs && !ev.over && (
        <button type="button" className="eh-callout" onClick={() => goPart('rides')} data-testid="eh-needs-seat">
          <IconAlert size={20} /><span>{first} still needs {missingSeats.length === 1 ? 'a car seat' : `${missingSeats.length} car seats`}. Pick {missingSeats.length === 1 ? 'it' : 'them'} in Rides →</span>
        </button>
      )}

      {days.map((d) => {
        const ad = view.answers.days[d.id] ?? {}
        const off = ctx.locked || d.over
        return (
          <section key={d.id} className="eh-card eh-dayq" data-testid={lockin ? 'eh-lockin-day' : 'eh-summary-day'}>
            <DayHead d={d} tz={ctx.tz}>
              <span className={`eh-pill${ad.attending === 'yes' ? ' eh-pill-ok' : ''}`}>
                {ad.attending === 'yes' ? 'Coming' : ad.attending === 'no' ? 'Not coming' : ad.attending === 'unsure' ? 'Not sure yet' : 'Not answered yet'}
              </span>
            </DayHead>
            {lockin && (ad.attending === 'unsure' || ad.attending == null) && (
              <Choice k={`attending:${d.id}`} ctx={ctx} disabled={off} label={`Is ${first} coming?`}
                      options={ATTEND.slice(0, 2)} value={ad.attending ?? null}
                      onPick={(v) => ctx.save(`attending:${d.id}`, { field: 'attending', value: v, day_id: d.id })} />
            )}
            {ad.attending === 'yes' && <DayPlan view={view} d={d} />}
            {lockin && ad.attending === 'no' && <p className="eh-hint">Not coming. Nothing to confirm.</p>}
            {!ev.over && ad.attending === 'yes' && missingSeats.some((m) => m.day.id === d.id) && (
              <button type="button" className="eh-callout" onClick={() => goPart('rides')} data-testid="eh-day-needs-seat">
                <IconAlert size={18} /><span>No seat {missingSeats.filter((m) => m.day.id === d.id).map((m) => (m.run === 'to' ? 'there' : 'home')).join(' or ')} yet. Pick one in Rides →</span>
              </button>
            )}
            {ad.attending === 'yes' && ad.confirmed && <p className="eh-ok-line" data-testid="eh-confirmed"><IconCheckCircle size={18} />Confirmed</p>}
            {lockin && ad.attending === 'yes' && !ad.confirmed && (
                <button type="button" className="eh-btn eh-btn-primary eh-btn-wide" disabled={off} data-testid="eh-confirm-day"
                        onClick={async () => {
                          const res = await act('confirm_day', { day_id: d.id })
                          setNote(res?.kind === 'ok' ? null : { text: res?.message || 'Not saved. Try again.', bad: true })
                        }}><IconCheck size={18} />This day is right. Confirm it.</button>
            )}
          </section>
        )
      })}
      {note && <p className="eh-note eh-note-bad" role="alert">{note.text}</p>}

      <section className="eh-card" data-testid="eh-parts-review">
        <h3 className="eh-card-title">Your answers</h3>
        <ul className="eh-review">
          {PARTS.map((part) => {
            const n = (p.missing ?? []).filter((m) => m.step === part.progressKey).length
            const I = part.icon
            return (
              <li key={part.key} className={`eh-review-row eh-tone-${part.tone}`}>
                <span className="eh-review-icon"><I size={20} /></span>
                <span className="eh-review-text">{part.label}
                  <span className={n ? 'eh-review-left' : 'eh-review-ok'}>{n ? `${n} left` : 'Done'}</span>
                </span>
                {!ev.over && (
                  <button type="button" className="eh-btn" onClick={() => goPart(part.key)} data-testid="eh-review-change"
                          aria-label={`Go to ${part.label}`}>
                    <IconEdit size={18} />{n ? 'Answer' : 'Change'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <button type="button" className="eh-btn eh-btn-wide" onClick={goInfo}><IconInfo size={18} />Event info: times, places and links</button>
    </div>
  )
}

