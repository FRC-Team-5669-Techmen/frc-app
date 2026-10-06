import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { createSaver, fmtDate, fmtDay, statusLine } from './eventHub'
import { supabase } from './supabase'
import { EventInfo } from './EventHubBoards'
import { PARTS, PartContacts, PartDays, PartFood, PartRides, Summary, hasV8, seatsMissing } from './EventFamilyParts'
import {
  IconArrowLeft, IconArrowRight, IconCalendar, IconCheck, IconClock, IconFlag, IconInfo, IconPin, IconUserPlus, IconUsers, IconWifiOff,
} from './eventIcons'
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
    token,
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
const RELOAD_FIELDS = new Set(['attending', 'staying_nights', 'to_mode', 'home_mode', 'school_mode', 'pickup', 'drive_to', 'drive_home',
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

// ── the hub ─────────────────────────────────────────────────────────────────

/** Where a family lands: the first part with something left, else the
 *  summary. Decided once, at the first load, so a page never jumps under a
 *  parent's thumb when an answer saves. */
function landing(view) {
  if (view.event?.over || view.progress?.phase1_done) return 'summary'
  const left = new Set((view.progress?.missing ?? []).map((m) => m.step))
  return (PARTS.find((pt) => left.has(pt.progressKey)) ?? PARTS[0]).key
}

/** A part counts as done when nothing is missing from it. Rides has nothing
 *  to ask until a day is answered, so it is not done before Who is coming,
 *  and it is not done while a carpool run still has no seat (the database
 *  does not require one, since mentors place students, but a green "Done"
 *  above "still needs a seat" was read as all clear). */
function partDone(view, pt) {
  const steps = view.progress?.steps ?? {}
  if (!steps[pt.progressKey]) return false
  if (pt.key !== 'rides') return true
  return !!steps.days && seatsMissing(view).length === 0
}

function tileState(view, pt) {
  if (partDone(view, pt)) return 'Done'
  const n = (view.progress?.missing ?? []).filter((m) => m.step === pt.progressKey).length
  if (n) return `${n} left`
  if (pt.key === 'rides' && seatsMissing(view).length) return 'No seat'
  return 'To do'
}

/** Only while a save is failing: each question already says "Saved 2:41 PM",
 *  and a pill that popped up after every tap covered the buttons. */
function SaveBar({ states }) {
  const retrying = Object.values(states).some((s) => s.state === 'retrying')
  if (!retrying) return null
  return (
    <div className="eh-savebar" aria-live="polite">
      <span className="eh-savebar-pill eh-savebar-bad" data-testid="eh-savebar">
        <IconWifiOff size={16} />Not saved yet, retrying
      </span>
    </div>
  )
}

function Hero({ view, standalone, onInfo }) {
  const ev = view.event
  const days = [...(view.board.days ?? [])].sort((x, y) => String(x.date).localeCompare(String(y.date)))
  const dates = days.length === 0 ? ''
    : days.length === 1 ? fmtDate(days[0].date, 'medium')
      : `${fmtDate(days[0].date, 'medium')} to ${fmtDate(days[days.length - 1].date, 'medium')}`
  return (
    <header className="eh-hero">
      {standalone && <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />}
      <div className="eh-hero-text">
        <p className="eh-kicker">{ev.title}</p>
        <h1 className="eh-title" data-testid="eh-student">{view.student.name}</h1>
        <p className="eh-hero-meta">
          {ev.venue_name && <span><IconPin size={16} />{ev.venue_name}</span>}
          {dates && <span><IconCalendar size={16} />{dates}</span>}
        </p>
        <p className="eh-status" data-testid="eh-status">{statusLine(view)}</p>
      </div>
      <button type="button" className="eh-btn eh-hero-info" onClick={onInfo} data-testid="eh-info-open">
        <IconInfo size={18} />Event info
      </button>
    </header>
  )
}

function Tracker({ view, part, go }) {
  const ev = view.event
  const done = PARTS.filter((pt) => partDone(view, pt)).length
  // Finish: Review until sign-up is done, Confirm while the final check is
  // open and not done, then Done.
  const p = view.progress ?? {}
  const finish = !p.phase1_done ? 'Review' : ev.lockin_open && !p.lockin_done ? 'Confirm' : 'Done'
  return (
    <nav className="eh-tracker" aria-label="Sign-up progress" data-testid="eh-tracker">
      <div className="eh-tracker-top">
        <span className="eh-tracker-count" data-testid="eh-tracker-count">{done} of {PARTS.length} parts done</span>
        {ev.phase1_due_at && !view.progress?.phase1_done && (
          <span className="eh-tracker-due"><IconClock size={16} />Due {fmtDay(ev.phase1_due_at, ev.timezone)}</span>
        )}
      </div>
      <div className="eh-bar" role="progressbar" aria-valuemin={0} aria-valuemax={PARTS.length} aria-valuenow={done}
           aria-label={`${done} of ${PARTS.length} parts done`}>
        <span style={{ width: `${(done / PARTS.length) * 100}%` }} />
      </div>
      <ol className="eh-tiles">
        {PARTS.map((pt, i) => {
          const ok = partDone(view, pt)
          const state = tileState(view, pt)
          const I = pt.icon
          return (
            <li key={pt.key}>
              <button type="button" className={`eh-tile eh-tone-${pt.tone}${part === pt.key ? ' eh-tile-on' : ''}${ok ? ' eh-tile-done' : ''}`}
                      aria-current={part === pt.key ? 'step' : undefined} onClick={() => go(pt.key)} data-testid="eh-part-tile"
                      aria-label={`Part ${i + 1}, ${pt.label}: ${state}`}>
                <span className="eh-tile-icon"><I size={22} />{ok && <span className="eh-tile-check"><IconCheck size={12} /></span>}</span>
                <span className="eh-tile-label">{pt.short}</span>
                <span className={`eh-tile-state${state === 'No seat' ? ' eh-tile-warn' : ''}`}>{state}</span>
              </button>
            </li>
          )
        })}
        <li>
          <button type="button" className={`eh-tile eh-tone-gold${part === 'summary' ? ' eh-tile-on' : ''}${finish === 'Done' ? ' eh-tile-done' : ''}`}
                  aria-current={part === 'summary' ? 'step' : undefined} onClick={() => go('summary')} data-testid="eh-part-tile"
                  aria-label={`Finish: ${finish}`}>
            <span className="eh-tile-icon"><IconFlag size={22} />{finish === 'Done' && <span className="eh-tile-check"><IconCheck size={12} /></span>}</span>
            <span className="eh-tile-label">Finish</span>
            <span className={`eh-tile-state${finish === 'Confirm' ? ' eh-tile-warn' : ''}`}>{finish}</span>
          </button>
        </li>
      </ol>
    </nav>
  )
}

/** Event info and the parent GroupMe, on every page of the form (Mr. Pina,
 *  2026-10-06: the header button took a while to notice, and the GroupMe link
 *  is how families talk to each other, so neither may hide in a list). */
function InfoBar({ view, onInfo }) {
  const chat = view.event.links?.parent_channel
  return (
    <div className="eh-infobar" data-testid="eh-infobar">
      <button type="button" className="eh-infobar-btn eh-infobar-info" onClick={onInfo} data-testid="eh-infobar-open">
        <IconInfo size={22} /><span><strong>Event info</strong><small>Times, places, hotel, links</small></span><IconArrowRight size={18} />
      </button>
      {chat && (
        <a className="eh-infobar-btn eh-infobar-chat" href={chat} target="_blank" rel="noopener noreferrer" data-testid="eh-groupme">
          <IconUsers size={22} /><span><strong>Parent GroupMe</strong><small>Join the parents' chat</small></span><IconArrowRight size={18} />
        </a>
      )}
    </div>
  )
}

function PartHead({ pt, index, first }) {
  const I = pt.icon
  return (
    <div className={`eh-part-head eh-tone-${pt.tone}`}>
      <span className="eh-part-icon"><I size={28} /></span>
      <div>
        <p className="eh-part-kicker" data-testid="eh-step-count">Part {index + 1} of {PARTS.length}</p>
        <h2 className="eh-part-title">{pt.label}</h2>
        <p className="eh-part-intro">{pt.intro(first)}</p>
      </div>
    </div>
  )
}

function PartNav({ index, go }) {
  const prev = PARTS[index - 1]
  const next = PARTS[index + 1]
  return (
    <>
      <div className="eh-part-nav">
        {prev
          ? <button type="button" className="eh-btn eh-btn-big" onClick={() => go(prev.key)}><IconArrowLeft size={18} />Back</button>
          : <span />}
        {next
          ? <button type="button" className="eh-btn eh-btn-primary eh-btn-big" onClick={() => go(next.key)} data-testid="eh-next">
              Next: {next.label}<IconArrowRight size={18} /></button>
          : <button type="button" className="eh-btn eh-btn-primary eh-btn-big" onClick={() => go('summary')} data-testid="eh-finish">
              Review and finish<IconArrowRight size={18} /></button>}
      </div>
      <p className="eh-hint eh-center">Your answers save as you go. You can come back and change them any time.</p>
    </>
  )
}

/** A parent with more than one student on the trip (0009): each student has
 *  their own page; this card lists the others and moves between them. A
 *  page is listed when the families share an email; it can be opened from
 *  here when the email on this link is on it. */
function Household({ view, family, compact = false }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)
  const hh = view.household ?? []
  const first = (n) => String(n ?? '').split(' ')[0]
  const open = async (h) => {
    setBusy(h.invite_id); setNote(null)
    const tok = await family.openSibling(h.invite_id)
    setBusy(null)
    if (!tok.token) { setNote(tok.message); return }
    navigate(`/e/${tok.token}`)
  }
  const me = view.me ?? view.answers.response.parent_email ?? ''
  const myName = (view.guardians ?? []).find((g) => g.email === me)?.name ?? view.answers.response.parent_name ?? ''
  if (compact) {
    if (!hh.length) return null
    return (
      <div className="eh-household-line" data-testid="eh-household-line">
        <IconUsers size={16} /><span>Also on this trip:</span>
        {hh.filter((h) => h.can_open).map((h) => (
          <button key={h.invite_id} type="button" className="eh-btn eh-btn-quiet" disabled={!!busy} onClick={() => open(h)}>
            {first(h.student)}<IconArrowRight size={14} /></button>
        ))}
        {note && <span className="eh-note eh-note-bad">{note}</span>}
      </div>
    )
  }
  const add = () => navigate(`/join/${view.event.id}`, { state: { another: { name: myName, email: me, from: view.student.name } } })
  // Most families have one student: a single line, not a card.
  if (!hh.length) {
    return (
      <div className="eh-household-line eh-household-solo" data-testid="eh-household">
        <IconUsers size={16} /><span>More than one student on the team?</span>
        <button type="button" className="eh-btn eh-btn-quiet" onClick={add} data-testid="eh-household-add"><IconUserPlus size={16} />Add another student</button>
      </div>
    )
  }
  return (
    <section className="eh-card eh-household" data-testid="eh-household">
      <h2 className="eh-card-title eh-with-icon"><IconUsers size={20} />Your students on this trip</h2>
      {(
          <ul className="eh-household-list">
            <li className="eh-household-item eh-household-here"><span className="eh-household-name">{view.student.name}</span><span className="eh-tag">This page</span></li>
            {hh.map((h) => (
              <li key={h.invite_id} className="eh-household-item" data-testid="eh-household-item">
                <span className="eh-household-name">{h.student}</span>
                {h.can_open
                  ? <button type="button" className="eh-btn eh-btn-primary" disabled={!!busy} onClick={() => open(h)} data-testid="eh-household-open">
                      Open {first(h.student)}'s page<IconArrowRight size={16} /></button>
                  : <span className="eh-hint">Use the link emailed for {first(h.student)}</span>}
              </li>
            ))}
          </ul>
        )}
      <button type="button" className="eh-btn" data-testid="eh-household-add" onClick={add}>
        <IconUserPlus size={18} />Add another student
      </button>
      {note && <p className="eh-note eh-note-bad" role="alert">{note}</p>}
    </section>
  )
}

export function FamilyHub({ transport, standalone = true, onInvalid, onOver }) {
  const [view, setView] = useState(null)
  const [mode, setMode] = useState('loading')   // loading | ready | invalid | offline | removed | left
  const [part, setPart] = useState(null)        // days | rides | food | contacts | summary | info
  const [infoBack, setInfoBack] = useState('summary')
  const [states, setStates] = useState({})
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
      setMode((m) => (m === 'removed' || m === 'left' ? m : 'ready'))
      setPart((pt) => pt ?? landing(r.data))
    }
    else if (r.kind === 'invalid') { setMode((m) => (m === 'removed' || m === 'left' ? m : 'invalid')); onInvalid?.() }
    else setMode((m) => (m === 'ready' ? m : 'offline'))
    if (r.kind === 'ok' && r.data?.event?.over) onOver?.()
    return r
  }, [transport, onInvalid, onOver])

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

  // Scroll to the top of the form when the part CHANGES, never when it is
  // first set: on the mentor page the form sits under the family's Delete
  // card, and scrolling on load jumped past it into the form.
  const firstPart = useRef(true)
  useEffect(() => {
    if (!part) return
    if (firstPart.current) { firstPart.current = false; return }
    topRef.current?.scrollIntoView?.({ block: 'start' })
  }, [part])

  if (mode === 'removed' || mode === 'left') {
    return (
      <div className="eh-page">
        <section className="eh-card eh-lost" data-testid={mode === 'removed' ? 'eh-removed' : 'eh-left'}>
          <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />
          <h1 className="eh-card-title">{mode === 'removed' ? 'Your family is off this trip' : 'You were removed from this page'}</h1>
          <p>{mode === 'removed'
            ? 'Drivers and mentors have been told. If that was a mistake, open the sign-up form again and pick your student.'
            : 'Your link no longer works. The rest of your family still has theirs.'}</p>
          {standalone && <Link className="eh-btn eh-btn-primary" to="/join">Open the sign-up form</Link>}
        </section>
      </div>
    )
  }
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
  // 0008 is live when the page carries its fields (drive_to on a day).
  const v8 = hasV8(view)
  const ctx = {
    tz, states, locked: !!ev.over, v8,
    // 0009: the cars a brother or sister's family drives; their first seat is
    // this student's to take.
    householdCars: new Set((view.household ?? []).flatMap((h) => h.cars ?? [])),
    household: view.household ?? null,
    save: (k, payload) => { setView((v) => applyLocal(v, payload)); saver.save(k, payload) },
  }
  const go = (k) => setPart(k)
  const goInfo = () => { setInfoBack(part === 'info' ? 'summary' : part); setPart('info') }
  const family = transport.token ? {
    token: transport.token, locked: !!ev.over, canLeave: v8 && !ev.over,
    sendMail: sendQueuedMail, reload: load,
    household: Array.isArray(view.household) ? view.household : null,
    openSibling: (invite) => openSibling(transport.token, invite),
    siblingView: async (invite) => {
      const t = await openSibling(transport.token, invite)
      if (!t.token) return null
      const r = await familyTransport(t.token).load()
      return r.kind === 'ok' ? r.data : null
    },
    onRemoved: () => setMode('removed'), onRemovedSelf: () => setMode('left'),
  } : null
  const index = PARTS.findIndex((pt) => pt.key === part)
  const pt = PARTS[index]
  const first = view.student.first

  return (
    <div className={`eh-page${standalone ? '' : ' eh-embedded'}`} ref={topRef}>
      <SaveBar states={states} />
      <Hero view={view} standalone={standalone} onInfo={goInfo} />
      {family?.household && !ev.over && part !== 'info' && (
        <Household view={view} family={family} compact={part !== 'days' && part !== 'summary'} />
      )}
      {!ev.over && part !== 'info' && <Tracker view={view} part={part} go={go} />}
      {part !== 'info' && <InfoBar view={view} onInfo={goInfo} />}

      {pt && (
        <div className={`eh-part eh-tone-${pt.tone}`} data-testid="eh-steps">
          <PartHead pt={pt} index={index} first={first} />
          {pt.key === 'days' && <PartDays view={view} ctx={ctx} />}
          {pt.key === 'rides' && <PartRides view={view} ctx={ctx} act={act} viewer={transport.viewer} />}
          {pt.key === 'food' && <PartFood view={view} ctx={ctx} act={act} viewer={transport.viewer} />}
          {pt.key === 'contacts' && <PartContacts view={view} ctx={ctx} family={family} />}
          <PartNav index={index} go={go} />
        </div>
      )}
      {part === 'summary' && <Summary view={view} ctx={ctx} act={act} goPart={go} goInfo={goInfo} family={family} />}
      {part === 'info' && (
        <div className="eh-part" data-testid="eh-info-page">
          <button type="button" className="eh-btn eh-btn-big" onClick={() => setPart(infoBack || 'summary')} data-testid="eh-info-back">
            <IconArrowLeft size={18} />Back to {infoBack === 'summary' ? 'my answers' : (PARTS.find((x) => x.key === infoBack)?.label ?? 'my answers')}
          </button>
          <EventInfo event={ev} />
        </div>
      )}
    </div>
  )
}

// A link that does not work. Since the open link (0007) a family that lost
// its page opens the team's sign-up link again and picks its student.
function LostLink({ invalid = false }) {
  return (
    <div className="eh-page">
      <section className="eh-card eh-lost" data-testid="eh-lost">
        <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />
        <h1 className="eh-card-title">{invalid ? 'This link does not work' : 'Family sign-up'}</h1>
        <p>{invalid ? 'It may be old or mistyped. ' : ''}Open the sign-up form and pick your student to get back to your family&rsquo;s page.</p>
        <Link className="eh-btn eh-btn-primary" to="/join">Open the sign-up form</Link>
      </section>
    </div>
  )
}

// Shown right after a parent comes in through the open link.
function Welcome({ joined }) {
  return (
    <div className="eh-page eh-welcome-wrap">
      <section className="eh-card eh-welcome" role="status" data-testid="eh-welcome">
        <h2 className="eh-card-title">You are signed up{joined.student ? ` for ${joined.student}` : ''}</h2>
        <p>This is your family&rsquo;s page. <strong>Bookmark it</strong> or add it to your home screen: you will come back before the event to confirm the carpool and food, and you can change any answer until then.</p>
        {joined.email && <p className="eh-hint">We are also emailing this link to {joined.email}.</p>}
      </section>
    </div>
  )
}

// A fresh link to a brother or sister's family page (0009), for the email on
// this link. Refused unless that email is on the other family.
async function openSibling(token, invite) {
  const { data, error } = await supabase.rpc('hub_household_open', { p_token: token, p_invite: invite })
  if (error || !data?.token) {
    return { message: /^hub:/.test(error?.message ?? '') ? error.details : 'Could not open that page. Check your connection and try again.' }
  }
  return { token: data.token }
}

// The rules queue the email; the deployed event-family function sends what is
// queued. Its "lost your link" action with a blank address sends the queue and
// nothing else, so this needs no new function. Best effort: the hourly tick
// sends it anyway.
function sendQueuedMail() {
  fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resend_link', email: '' }) })
    .catch(() => { /* the hourly tick sends it */ })
}

export default function EventFamilyPage() {
  const { token } = useParams()
  const location = useLocation()
  const transport = useMemo(() => (token ? familyTransport(token) : null), [token])
  const [invalid, setInvalid] = useState(false)
  const [over, setOver] = useState(false)
  const onInvalid = useCallback(() => setInvalid(true), [])
  const onOver = useCallback(() => setOver(true), [])
  if (!transport) return <Navigate to="/join" replace />
  const joined = location.state?.joined
  return (
    <>
      {joined && !invalid && <Welcome joined={joined} />}
      <FamilyHub key={token} transport={transport} onInvalid={onInvalid} onOver={onOver} />
    </>
  )
}
