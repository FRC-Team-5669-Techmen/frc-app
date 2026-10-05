import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import {
  DEFAULT_TZ, LINK_KEYS, daySheetHtml, exportColumns, exportRecords, fmtDate, fmtDayTime, isoToZoned, linesToText,
  runTitle, textToLines, zonedToIso,
} from './eventHub'
import { toCsv } from './csv'
import { CarpoolBoard, FoodBoard, Seg } from './EventHubBoards'
import { FamilyHub } from './EventFamilyPage'
import './EventHub.css'

// The event family hub's MENTOR PAGE, /trips/<id>/manage (staff only; the
// database refuses anyone else at hub_staff_call). Five readiness lines, each
// opening its detail; full staff edit of any family through the SAME family
// page component, whose writes go through public.hub_staff_call and so pass
// the same rules a family's do (a move that breaks the one-minor rule needs a
// reason); the staff carpool and food boards; event setup; and the exports.
//
// Setup (the event, its days, meals, food needs and info sections) is written
// directly to the hub tables, which RLS lets staff write. Everything about a
// family is written through hub_staff_call.

// A staff RPC of its own (0008's removals), answering like staffCall.
async function staffRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const m = /^hub:([a-z_]+)$/.exec(error.message ?? '')
    if (m) return { kind: 'refused', code: m[1], message: error.details }
    if (isSchemaMissing(error)) return { kind: 'missing' }
    return { kind: 'error', message: error.message }
  }
  return { kind: 'ok', data }
}

async function staffCall(action, args = {}) {
  const { data, error } = await supabase.rpc('hub_staff_call', { p_action: action, p_args: args })
  if (error) {
    const m = /^hub:([a-z_]+)$/.exec(error.message ?? '')
    if (m) return { kind: 'refused', code: m[1], message: error.details }
    if (isSchemaMissing(error)) return { kind: 'missing' }
    return { kind: 'error', message: error.message }
  }
  return { kind: 'ok', data }
}

// The family page, as staff: same component, staff transport.
function staffTransport(inviteId) {
  const call = (action, args = {}) => staffCall(action, { invite_id: inviteId, ...args })
  return {
    viewer: 'staff',
    storageKey: null,
    load: () => call('family'),
    save: (p) => call('save', p),
    act: async (action, args = {}) => {
      const r = await call(action, args)
      if (r.kind !== 'ok') return r
      const v = await call('family')
      return v.kind === 'ok' ? { kind: 'ok', data: { ...v.data, result: r.data } } : v
    },
  }
}

function TwoStep({ label, confirmLabel, count, onGo, disabled }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!armed) {
    return <button type="button" className="eh-btn eh-btn-primary" disabled={disabled} onClick={() => setArmed(true)}>{label}</button>
  }
  return (
    <span className="eh-inline ehm-confirm" data-testid="ehm-confirm">
      <span>{confirmLabel(count)}</span>
      <button type="button" className="eh-btn eh-btn-primary" disabled={busy || !count}
              onClick={async () => { setBusy(true); await onGo(); setBusy(false); setArmed(false) }}>Yes, send</button>
      <button type="button" className="eh-btn" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  )
}

function Line({ n, title, headline, ok, open, onToggle, children, testid }) {
  return (
    <section className={`eh-card ehm-line${ok ? ' ehm-line-ok' : ''}`} data-testid={testid}>
      <button type="button" className="ehm-line-head" aria-expanded={open} onClick={onToggle}>
        <span className="ehm-line-n">{n}</span>
        <span className="ehm-line-title">{title}</span>
        <span className="ehm-line-headline">{headline}</span>
      </button>
      {open && <div className="ehm-line-body">{children}</div>}
    </section>
  )
}

function Names({ list, onPick }) {
  if (!list?.length) return <p className="eh-quiet">None.</p>
  return (
    <ul className="eh-names">
      {list.map((x, i) => (
        <li key={x.invite_id ?? i}>
          {onPick && x.invite_id ? <button type="button" className="ehm-name-btn" onClick={() => onPick(x.invite_id)}>{x.name}</button> : x.name}
        </li>
      ))}
    </ul>
  )
}

// ── readiness ───────────────────────────────────────────────────────────────

function Readiness({ ov, eventId, reload, openFamily }) {
  const [open, setOpen] = useState(null)
  const [preview, setPreview] = useState(null)
  const [phase, setPhase] = useState(ov.event.lockin_open ? 'lockin' : 'phase1')
  const [remindCount, setRemindCount] = useState(null)
  const [note, setNote] = useState(null)
  const fam = ov.families ?? []
  const p1 = fam.filter((f) => f.phase1_done).length
  const lk = fam.filter((f) => f.lockin_done).length
  const toggle = (k) => setOpen(open === k ? null : k)

  useEffect(() => {
    staffCall('invite_preview', { event_id: eventId }).then((r) => r.kind === 'ok' && setPreview(r.data))
  }, [eventId, ov])
  useEffect(() => {
    staffCall('remind_preview', { event_id: eventId, phase }).then((r) => r.kind === 'ok' && setRemindCount(r.data.count))
  }, [eventId, phase, ov])

  async function drain() {
    const { data, error } = await supabase.functions.invoke('event-family', { body: { action: 'drain', event_id: eventId } })
    if (error) setNote({ text: 'The mail function did not answer. Emails stay queued and go out on the next hourly run.', bad: true })
    else if (data?.skipped) setNote({ text: 'Gmail is not set up on the function yet. Emails stay queued until it is.', bad: true })
    else setNote({ text: `Sent ${data?.sent ?? 0}${data?.failed ? `, ${data.failed} failed` : ''}.` })
    reload()
  }

  const carHeadline = (() => {
    const short = (ov.carpool ?? []).flatMap((d) => d.runs.map((r) => r.needs_seat)).reduce((a, b) => a + b, 0)
    const red = (ov.carpool ?? []).flatMap((d) => d.runs.flatMap((r) => r.red)).length
    return short === 0 && red === 0 ? 'Everyone placed' : [short ? `${short} not placed` : '', red ? `${red} red car${red === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
  })()
  const openNeeds = (ov.food ?? []).reduce((a, m) => a + m.open.length, 0)
  const starters = (ov.food ?? []).reduce((a, m) => a + m.starter, 0)
  const firstDone = fam.filter((f) => f.first_reg_done === true).length

  return (
    <div className="ehm-readiness">
      <Line n="1" title="Responses" testid="ehm-line-responses" open={open === 'r'} onToggle={() => toggle('r')}
            ok={fam.length > 0 && lk === fam.length}
            headline={`Sign-up ${p1} of ${fam.length} · Lock-in ${lk} of ${fam.length}`}>
        {ov.roster_without_invite > 0 && (
          <p className="eh-inline">
            <span>{ov.roster_without_invite} {ov.roster_without_invite === 1 ? 'student' : 'students'} on the roster without an invite.</span>
            <button type="button" className="eh-btn" onClick={async () => { await staffCall('sync_invites', { event_id: eventId }); reload() }}>Add them</button>
          </p>
        )}
        <div className="eh-inline">
          <TwoStep label="Send invites" count={preview?.to_send ?? 0} disabled={!preview?.to_send}
                   confirmLabel={(n) => `Email ${n} ${n === 1 ? 'family' : 'families'}? ${preview?.already ?? 0} already sent are skipped.`}
                   onGo={async () => { const r = await staffCall('send_invites', { event_id: eventId }); setNote({ text: `Queued ${r.data?.queued ?? 0} invites.` }); await drain() }} />
          <span className="eh-mono">Remind about</span>
          <Seg label="Remind about" value={phase} onPick={setPhase} className="ehm-seg-inline"
               items={[{ key: 'phase1', label: 'Sign-up' }, { key: 'lockin', label: 'Lock-in' }]} />
          <TwoStep label="Remind not-done" count={remindCount ?? 0} disabled={!remindCount}
                   confirmLabel={(n) => `Remind ${n} ${n === 1 ? 'family' : 'families'} that ${phase === 'phase1' ? 'sign-up' : 'lock-in'} is not done?`}
                   onGo={async () => { const r = await staffCall('remind', { event_id: eventId, phase }); setNote({ text: `Queued ${r.data?.queued ?? 0} reminders.` }); await drain() }} />
        </div>
        {preview?.no_email?.length > 0 && (
          <>
            <h4 className="eh-label">No parent email on file</h4>
            <ul className="eh-names">{preview.no_email.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </>
        )}
        <h4 className="eh-label">Sign-up not done</h4>
        <Names list={fam.filter((f) => !f.phase1_done).map((f) => ({ invite_id: f.invite_id, name: `${f.name} (${f.missing} to go)` }))} onPick={openFamily} />
        <h4 className="eh-label">Lock-in not done</h4>
        <Names list={fam.filter((f) => f.phase1_done && !f.lockin_done)} onPick={openFamily} />
        <p className="eh-mono">Email: {ov.outbox?.pending ?? 0} waiting · {ov.outbox?.sent ?? 0} sent · {ov.outbox?.failed ?? 0} failed</p>
        <div className="eh-inline">
          {(ov.outbox?.pending ?? 0) > 0 && <button type="button" className="eh-btn" onClick={drain}>Send waiting emails now</button>}
          {(ov.outbox?.failed ?? 0) > 0 && (
            <button type="button" className="eh-btn" onClick={async () => { await staffCall('retry_failed', { event_id: eventId }); await drain() }}>Retry failed</button>
          )}
        </div>
        {note && <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`}>{note.text}</p>}
      </Line>

      <Line n="2" title="Attendance" testid="ehm-line-attendance" open={open === 'a'} onToggle={() => toggle('a')} ok
            headline={(ov.attendance ?? []).map((d) => `${d.label.split(',')[0].slice(0, 3)} ${d.yes} coming`).join(' · ') || 'No days yet'}>
        <table className="ehm-table">
          <thead><tr><th>Day</th><th>Coming</th><th>Not coming</th><th>Not sure</th><th>No answer</th></tr></thead>
          <tbody>{(ov.attendance ?? []).map((d) => (
            <tr key={d.day_id}><td>{d.label}</td><td>{d.yes}</td><td>{d.no}</td><td>{d.unsure}</td><td>{d.none}</td></tr>
          ))}</tbody>
        </table>
      </Line>

      <Line n="3" title="Carpool" testid="ehm-line-carpool" open={open === 'c'} onToggle={() => toggle('c')}
            ok={carHeadline === 'Everyone placed'} headline={carHeadline}>
        {(ov.carpool ?? []).map((d) => (
          <div key={d.day_id} className="ehm-carpool-day">
            <h4 className="eh-label">{d.label}</h4>
            {d.runs.map((r) => (
              <div key={r.run} className="ehm-run">
                <strong>{runTitle(r.run)}:</strong>{' '}
                {r.needs_seat === 0 ? 'everyone placed' : `${r.needs_seat} not placed (${r.unplaced.map((u) => u.name).join(', ')})`}
                {r.pending.length > 0 && <span> · pending drivers: {r.pending.map((x) => x.driver).join(', ')}</span>}
                {r.open_pickups > 0 && <span> · {r.open_pickups} open pickup request{r.open_pickups === 1 ? '' : 's'}</span>}
                {r.red.length > 0 && <span className="eh-note-bad"> · red: {r.red.map((x) => x.driver).join(', ')}</span>}
              </div>
            ))}
          </div>
        ))}
      </Line>

      <Line n="4" title="Food" testid="ehm-line-food" open={open === 'f'} onToggle={() => toggle('f')} ok={openNeeds === 0}
            headline={`${openNeeds} open need${openNeeds === 1 ? '' : 's'}${starters ? ` · ${starters} starter, review before sending` : ''}`}>
        {(ov.food ?? []).map((m) => (
          <div key={m.meal_id} className="ehm-run"><strong>{m.label}:</strong> {m.open.length ? m.open.join(', ') : 'all claimed'}
            {m.starter > 0 && <span className="eh-tag eh-tag-warn">{m.starter} starter</span>}</div>
        ))}
      </Line>

      <Line n="5" title="Paperwork" testid="ehm-line-paperwork" open={open === 'p'} onToggle={() => toggle('p')}
            ok={firstDone === fam.length && (ov.drivers ?? []).every((d) => d.on_file || !ov.event.driver_paperwork_required)}
            headline={`FIRST ${firstDone} of ${fam.length}${ov.school_form_on ? ` · School form ${fam.filter((f) => f.school_form_done).length} of ${fam.length}` : ''} · Drivers on file ${(ov.drivers ?? []).filter((d) => d.on_file).length} of ${(ov.drivers ?? []).length}`}>
        <h4 className="eh-label">FIRST registration not done</h4>
        <Names list={fam.filter((f) => f.first_reg_done !== true)} onPick={openFamily} />
        {ov.school_form_on && (<><h4 className="eh-label">School form not done</h4>
          <Names list={fam.filter((f) => f.school_form_done !== true)} onPick={openFamily} /></>)}
        <h4 className="eh-label">Drivers{ov.event.driver_paperwork_required ? '' : ' (paperwork not required for this event)'}</h4>
        <ul className="ehm-drivers">
          {(ov.drivers ?? []).map((d) => (
            <li key={d.invite_id} className="eh-inline">
              <span>{d.driver} <span className="eh-quiet">({d.student}){d.checks ? '' : ', driver checks not ticked'}</span></span>
              <button type="button" role="switch" aria-checked={d.on_file} className={`eh-chip${d.on_file ? ' eh-chip-on' : ''}`}
                      onClick={async () => { await staffCall('paperwork', { invite_id: d.invite_id, on: !d.on_file }); reload() }}>
                {d.on_file ? 'On file' : 'Not on file'}
              </button>
            </li>
          ))}
          {(ov.drivers ?? []).length === 0 && <li className="eh-quiet">No family is driving yet.</li>}
        </ul>
      </Line>
    </div>
  )
}

// ── families ────────────────────────────────────────────────────────────────

// Removing a parent or guardian (their link stops working) and taking a
// family off the trip (0008: hub_staff_remove_guardian, hub_staff_remove_family).
function Removals({ selected, inviteId, onGone, reload }) {
  const [arm, setArm] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)
  const say = (r, ok) => setNote(r.kind === 'ok' ? { text: ok }
    : r.kind === 'missing' ? { text: 'Removing needs the 0008 update pasted first.', bad: true }
      : { text: r.message || 'Not done.', bad: true })
  async function dropEmail(email) {
    setBusy(true)
    const r = await staffRpc('hub_staff_remove_guardian', { p_invite: inviteId, p_email: email })
    setBusy(false); setArm(null)
    say(r, `${email} removed. Their link no longer works.`)
    if (r.kind === 'ok') reload()
  }
  async function dropFamily() {
    setBusy(true)
    const r = await staffRpc('hub_staff_remove_family', { p_invite: inviteId })
    setBusy(false); setArm(null)
    if (r.kind === 'ok') { onGone(); return }
    say(r, '')
  }
  return (
    <section className="eh-card" data-testid="ehm-removals">
      <h3 className="eh-label">Parents and guardians on this family</h3>
      <ul className="eh-people-list">
        {(selected.emails ?? []).map((e) => (
          <li key={e} className="eh-person">
            <span className="eh-person-text"><span className="eh-person-name">{e}</span></span>
            {arm !== e
              ? <button type="button" className="eh-btn eh-btn-quiet" disabled={busy} onClick={() => setArm(e)}>Remove</button>
              : (
                <span className="eh-confirm-inline">
                  <span>Remove {e}? Their link stops working.</span>
                  <button type="button" className="eh-btn eh-btn-danger" disabled={busy} onClick={() => dropEmail(e)} data-testid="ehm-remove-email-yes">Yes, remove</button>
                  <button type="button" className="eh-btn" onClick={() => setArm(null)}>Keep</button>
                </span>
              )}
          </li>
        ))}
        {(selected.emails ?? []).length === 0 && <li className="eh-quiet">No email on this family.</li>}
      </ul>
      {arm !== 'family'
        ? <button type="button" className="eh-btn eh-btn-danger" disabled={busy} onClick={() => setArm('family')} data-testid="ehm-remove-family">Remove this family from the trip</button>
        : (
          <div className="eh-confirm-inline">
            <span>Remove {selected.name}'s family? Their answers, seats, car and food claims go; drivers and mentors are told. They can sign up again on the open link.</span>
            <button type="button" className="eh-btn eh-btn-danger" disabled={busy} onClick={dropFamily} data-testid="ehm-remove-family-yes">Yes, remove the family</button>
            <button type="button" className="eh-btn" onClick={() => setArm(null)}>Keep them</button>
          </div>
        )}
      {note && <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`} role="status">{note.text}</p>}
    </section>
  )
}

function Families({ ov, inviteId, setInviteId, reload }) {
  const [q, setQ] = useState('')
  const fam = (ov.families ?? []).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()))
  const selected = (ov.families ?? []).find((f) => f.invite_id === inviteId)
  const transport = useMemo(() => (inviteId ? staffTransport(inviteId) : null), [inviteId])
  const [emails, setEmails] = useState('')
  const [note, setNote] = useState(null)
  useEffect(() => { setEmails((selected?.emails ?? []).join(', ')); setNote(null) }, [selected?.invite_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (selected && transport) {
    return (
      <div data-testid="ehm-family">
        <button type="button" className="eh-btn" onClick={() => { setInviteId(null); reload() }}>All families</button>
        <section className="eh-card">
          <h3 className="eh-label">Invite emails</h3>
          <div className="eh-inline">
            <input className="eh-input" value={emails} onChange={(e) => setEmails(e.target.value)} aria-label="Invite emails" />
            <button type="button" className="eh-btn" onClick={async () => {
              const r = await staffCall('set_emails', { invite_id: inviteId, emails: emails.split(/[,;\s]+/).filter(Boolean) })
              setNote(r.kind === 'ok' ? { text: 'Saved.' } : { text: r.message || 'Not saved.', bad: true })
              reload()
            }}>Save emails</button>
            <button type="button" className="eh-btn" onClick={async () => {
              const r = await staffCall('reset_links', { invite_id: inviteId })
              setNote(r.kind === 'ok' ? { text: `${r.data.revoked} old link${r.data.revoked === 1 ? '' : 's'} turned off. Send a reminder for a new one.` } : { text: 'Not done.', bad: true })
            }}>Turn off old links</button>
          </div>
          <p className="eh-mono">Invite: {selected.invite_status}</p>
          {note && <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`}>{note.text}</p>}
        </section>
        <Removals selected={selected} inviteId={inviteId} onGone={() => { setInviteId(null); reload() }} reload={reload} />
        <FamilyHub key={inviteId} transport={transport} standalone={false} />
      </div>
    )
  }
  return (
    <div>
      <input className="eh-input ehm-search" placeholder="Search students" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
      <table className="ehm-table" data-testid="ehm-families">
        <thead><tr><th>Student</th><th>Sign-up</th><th>Lock-in</th><th>Invite</th></tr></thead>
        <tbody>
          {fam.map((f) => (
            <tr key={f.invite_id}>
              <td><button type="button" className="ehm-name-btn" onClick={() => setInviteId(f.invite_id)}>{f.name}</button></td>
              <td>{f.phase1_done ? 'Done' : `${f.missing} to go`}</td>
              <td>{f.lockin_done ? 'Done' : '-'}</td>
              <td>{f.emails.length ? f.invite_status : 'No email'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(ov.families ?? []).length === 0 && <p className="eh-empty">No families yet. Use Responses, Add them.</p>}
    </div>
  )
}

// ── boards and food needs ───────────────────────────────────────────────────

function StaffBoards({ eventId, which }) {
  const [state, setState] = useState(null)
  const load = useCallback(async () => {
    const r = await staffCall('board', { event_id: eventId })
    if (r.kind === 'ok') setState(r.data)
  }, [eventId])
  useEffect(() => { load() }, [load])
  const act = useCallback(async (action, args) => {
    // Seating two at once is its own RPC (0008); everything else is hub_staff_call.
    const r = action === 'place_pair'
      ? await staffRpc('hub_staff_place_pair', { p_car: args.car_id, p_first: args.first, p_second: args.second })
      : await staffCall(action, args)
    await load()
    return r.kind === 'missing' && action === 'place_pair' ? { ...r, message: 'Seating two together needs the 0008 update pasted first.' } : r
  }, [load])
  if (!state) return <p className="eh-empty">Loading.</p>
  const tz = state.event.timezone
  if (which === 'carpool') return <CarpoolBoard board={state.board} tz={tz} viewer="staff" act={act} locked={false} />
  return (
    <>
      <NeedsEditor board={state.board} reload={load} />
      <FoodBoard board={state.board} tz={tz} viewer="staff" act={act} locked={false} />
    </>
  )
}

function NeedsEditor({ board, reload }) {
  const [mealId, setMealId] = useState('')
  const [label, setLabel] = useState('')
  const [qty, setQty] = useState(1)
  const [err, setErr] = useState('')
  const meals = board.meals ?? []
  const starters = meals.flatMap((m) => (m.needs ?? []).filter((n) => n.starter))
  return (
    <section className="eh-card">
      <h3 className="eh-label">Food needs</h3>
      {starters.length > 0 && (
        <p className="eh-inline">
          <span className="eh-hint-warn">{starters.length} starter needs: review before sending.</span>
          <button type="button" className="eh-btn" onClick={async () => {
            const { error } = await supabase.from('hub_food_needs').update({ starter: false }).in('id', starters.map((n) => n.id))
            setErr(error ? error.message : '')
            reload()
          }}>Mark all reviewed</button>
        </p>
      )}
      <div className="eh-inline">
        <select className="eh-input" value={mealId} onChange={(e) => setMealId(e.target.value)} aria-label="Meal">
          <option value="">Meal</option>
          {meals.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <input className="eh-input" placeholder="Need, e.g. Main dish" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="eh-input ehm-num" type="number" min="1" max="99" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
        <button type="button" className="eh-btn" disabled={!mealId || !label.trim()} onClick={async () => {
          const { error } = await supabase.from('hub_food_needs').insert({ meal_id: mealId, label: label.trim(), quantity: Number(qty) || 1, position: 99 })
          setErr(error ? error.message : '')
          if (!error) { setLabel(''); setQty(1) }
          reload()
        }}>Add need</button>
      </div>
      <ul className="ehm-needs-edit">
        {meals.flatMap((m) => (m.needs ?? []).map((n) => (
          <li key={n.id} className="eh-inline">
            <span>{m.label}: {n.label} x{n.quantity}{n.starter ? ' (starter)' : ''}{n.claim ? `, claimed by ${n.claim.family}` : ''}</span>
            <button type="button" className="eh-mini" onClick={async () => {
              const { error } = await supabase.from('hub_food_needs').delete().eq('id', n.id)
              setErr(error ? error.message : '')
              reload()
            }}>Remove</button>
          </li>
        )))}
      </ul>
      {err && <p className="eh-note eh-note-bad">{err}</p>}
    </section>
  )
}

// ── setup ───────────────────────────────────────────────────────────────────

function TimeIn({ label, date, iso, tz, onChange }) {
  return (
    <label className="eh-field ehm-time"><span className="eh-q-label">{label}</span>
      <input className="eh-input" type="time" value={iso ? isoToZoned(iso, tz).time : ''}
             onChange={(e) => onChange(e.target.value ? zonedToIso(date, e.target.value, tz) : null)} /></label>
  )
}

function DateTimeIn({ label, iso, tz, onChange }) {
  const z = isoToZoned(iso, tz)
  const [d, setD] = useState(z.date)
  const [t, setT] = useState(z.time)
  return (
    <div className="eh-field"><span className="eh-q-label">{label}</span>
      <div className="eh-inline">
        <input className="eh-input" type="date" value={d} onChange={(e) => { setD(e.target.value); onChange(zonedToIso(e.target.value, t || '23:59', tz)) }} aria-label={`${label} date`} />
        <input className="eh-input" type="time" value={t} onChange={(e) => { setT(e.target.value); onChange(zonedToIso(d, e.target.value, tz)) }} aria-label={`${label} time`} />
      </div>
    </div>
  )
}

const homeOptionsToText = (opts) => (opts ?? []).map((o) => `${o.label}${o.default ? ' (default)' : ''}`).join('\n')
function textToHomeOptions(text) {
  return textToLines(text).map((l, i) => {
    const def = /\(default\)\s*$/.test(l)
    const label = l.replace(/\(default\)\s*$/, '').trim()
    return { key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `option-${i + 1}`, label, default: def }
  })
}

function Setup({ eventId, ov, reload }) {
  const [ev, setEv] = useState(null)
  const [days, setDays] = useState([])
  const [meals, setMeals] = useState([])
  const [staff, setStaff] = useState([])
  const [note, setNote] = useState(null)
  const tz = ev?.timezone || DEFAULT_TZ

  const load = useCallback(async () => {
    const [e, d, m, roles] = await Promise.all([
      supabase.from('hub_events').select('*').eq('id', eventId).single(),
      supabase.from('hub_days').select('*').eq('event_id', eventId).order('day_date'),
      supabase.from('hub_meals').select('*').eq('event_id', eventId).order('starts_at'),
      supabase.from('member_roles').select('member_id, role').in('role', ['mentor', 'lead', 'admin']),
    ])
    if (e.data) setEv(e.data)
    setDays(d.data ?? [])
    setMeals(m.data ?? [])
    const ids = [...new Set((roles.data ?? []).map((r) => r.member_id))]
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id, full_name, nickname').in('id', ids)
      setStaff((people ?? []).map((p) => ({ id: p.id, name: p.full_name || p.nickname || 'Staff' })).sort((a, b) => a.name.localeCompare(b.name)))
    }
  }, [eventId])
  useEffect(() => { load() }, [load])

  const done = async (p, ok = 'Saved.') => {
    const { error } = await p
    setNote(error ? { text: error.message, bad: true } : { text: ok })
    await load()
    reload()
  }
  if (!ev) return <p className="eh-empty">Loading.</p>
  const setE = (k, v) => setEv({ ...ev, [k]: v })
  const sections = ev.info?.sections ?? []

  return (
    <div className="ehm-setup">
      {note && <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`} role="status">{note.text}</p>}
      <section className="eh-card">
        <h3 className="eh-label">Event</h3>
        <label className="eh-field"><span className="eh-q-label">Title</span>
          <input className="eh-input" value={ev.title} onChange={(e) => setE('title', e.target.value)} /></label>
        <label className="eh-field"><span className="eh-q-label">Venue</span>
          <input className="eh-input" value={ev.venue_name ?? ''} onChange={(e) => setE('venue_name', e.target.value)} /></label>
        <label className="eh-field"><span className="eh-q-label">Address</span>
          <input className="eh-input" value={ev.venue_address ?? ''} onChange={(e) => setE('venue_address', e.target.value)} /></label>
        <label className="eh-field"><span className="eh-q-label">Map link</span>
          <input className="eh-input" value={ev.map_url ?? ''} onChange={(e) => setE('map_url', e.target.value)} /></label>
        <DateTimeIn label="Sign-up due" iso={ev.phase1_due_at} tz={tz} onChange={(v) => setE('phase1_due_at', v)} />
        <DateTimeIn label="Lock-in opens" iso={ev.lockin_opens_at} tz={tz} onChange={(v) => setE('lockin_opens_at', v)} />
        <DateTimeIn label="Lock-in due" iso={ev.lockin_due_at} tz={tz} onChange={(v) => setE('lockin_due_at', v)} />
        <div className="eh-chips">
          {/* The Salesian one-child rule is enforced for every event (0008
              makes it impossible to switch off), so it is shown, not offered. */}
          <span className="eh-chip eh-chip-on" aria-disabled="true" data-testid="ehm-one-child">One-child rule: always on</span>
          <button type="button" role="switch" aria-checked={ev.driver_paperwork_required} className={`eh-chip${ev.driver_paperwork_required ? ' eh-chip-on' : ''}`}
                  onClick={() => setE('driver_paperwork_required', !ev.driver_paperwork_required)}>Driver paperwork required {ev.driver_paperwork_required ? 'on' : 'off'}</button>
        </div>
        <label className="eh-field"><span className="eh-q-label">Who gets mentor alerts</span>
          <span className="eh-hint">Emails, separated by commas. Blank: every admin.</span>
          <input className="eh-input" value={(ev.alert_emails ?? []).join(', ')}
                 onChange={(e) => setE('alert_emails', e.target.value.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))} /></label>
        <h3 className="eh-label">Links</h3>
        {LINK_KEYS.map(([k, label]) => (
          <label key={k} className="eh-field"><span className="eh-q-label">{label}</span>
            <input className="eh-input" value={ev.links?.[k] ?? ''} placeholder="Blank: not set"
                   onChange={(e) => setE('links', { ...(ev.links ?? {}), [k]: e.target.value.trim() })} /></label>
        ))}
        <button type="button" className="eh-btn eh-btn-primary" onClick={() => done(supabase.from('hub_events').update({
          title: ev.title, venue_name: ev.venue_name, venue_address: ev.venue_address, map_url: ev.map_url,
          phase1_due_at: ev.phase1_due_at, lockin_opens_at: ev.lockin_opens_at, lockin_due_at: ev.lockin_due_at,
          one_minor_rule: ev.one_minor_rule, driver_paperwork_required: ev.driver_paperwork_required,
          alert_emails: ev.alert_emails ?? [], links: ev.links ?? {}, updated_at: new Date().toISOString(),
        }).eq('id', eventId))}>Save event</button>
      </section>

      {days.map((d, i) => {
        const setD = (k, v) => setDays(days.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
        return (
          <section key={d.id} className="eh-card" data-testid="ehm-day-setup">
            <h3 className="eh-label">{fmtDate(d.day_date)}</h3>
            <div className="ehm-grid">
              <label className="eh-field"><span className="eh-q-label">Title</span>
                <input className="eh-input" value={d.title ?? ''} onChange={(e) => setD('title', e.target.value)} /></label>
              <label className="eh-field"><span className="eh-q-label">Form order</span>
                <input className="eh-input" type="number" value={d.position} onChange={(e) => setD('position', Number(e.target.value))} /></label>
              <label className="eh-field"><span className="eh-q-label">Meet captain</span>
                <select className="eh-input" value={d.captain_id ?? ''} onChange={(e) => setD('captain_id', e.target.value || null)}>
                  <option value="">Not set</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              <label className="eh-field"><span className="eh-q-label">Meet place</span>
                <input className="eh-input" value={d.meet_place ?? ''} onChange={(e) => setD('meet_place', e.target.value)} /></label>
              <TimeIn label="Meet" date={d.day_date} iso={d.meet_at} tz={tz} onChange={(v) => setD('meet_at', v)} />
              <TimeIn label="Last car out" date={d.day_date} iso={d.last_car_out_at} tz={tz} onChange={(v) => setD('last_car_out_at', v)} />
              <TimeIn label="Target arrival" date={d.day_date} iso={d.target_arrival_at} tz={tz} onChange={(v) => setD('target_arrival_at', v)} />
              <TimeIn label="Doors open" date={d.day_date} iso={d.doors_at} tz={tz} onChange={(v) => setD('doors_at', v)} />
              <TimeIn label="Venue opens" date={d.day_date} iso={d.venue_opens_at} tz={tz} onChange={(v) => setD('venue_opens_at', v)} />
              <TimeIn label="Venue closes" date={d.day_date} iso={d.venue_closes_at} tz={tz} onChange={(v) => v && setD('venue_closes_at', v)} />
              <TimeIn label="Pits close" date={d.day_date} iso={d.pits_close_at} tz={tz} onChange={(v) => setD('pits_close_at', v)} />
              <label className="eh-field"><span className="eh-q-label">Drive there</span>
                <input className="eh-input" value={d.drive_to_range ?? ''} onChange={(e) => setD('drive_to_range', e.target.value)} /></label>
              <label className="eh-field"><span className="eh-q-label">Drive home</span>
                <input className="eh-input" value={d.drive_home_range ?? ''} onChange={(e) => setD('drive_home_range', e.target.value)} /></label>
              <label className="eh-field"><span className="eh-q-label">Miles there / home</span>
                <span className="eh-inline">
                  <input className="eh-input ehm-num" type="number" step="0.1" value={d.miles_to ?? ''} onChange={(e) => setD('miles_to', e.target.value === '' ? null : Number(e.target.value))} aria-label="Miles there" />
                  <input className="eh-input ehm-num" type="number" step="0.1" value={d.miles_home ?? ''} onChange={(e) => setD('miles_home', e.target.value === '' ? null : Number(e.target.value))} aria-label="Miles home" />
                </span></label>
            </div>
            <label className="eh-field"><span className="eh-q-label">Card before the question</span>
              <textarea className="eh-input" rows={3} value={d.intro ?? ''} onChange={(e) => setD('intro', e.target.value || null)} /></label>
            <label className="eh-field"><span className="eh-q-label">Ride-home choices</span>
              <span className="eh-hint">One per line. Mark one with (default).</span>
              <textarea className="eh-input" rows={2} value={homeOptionsToText(d.home_options)} onChange={(e) => setD('home_options', textToHomeOptions(e.target.value))} /></label>
            <label className="eh-field"><span className="eh-q-label">Note for the day</span>
              <input className="eh-input" value={d.notes ?? ''} onChange={(e) => setD('notes', e.target.value || null)} /></label>
            <div className="eh-chips">
              <button type="button" role="switch" aria-checked={d.ask_pit_setup} className={`eh-chip${d.ask_pit_setup ? ' eh-chip-on' : ''}`} onClick={() => setD('ask_pit_setup', !d.ask_pit_setup)}>Ask about pit setup</button>
              <button type="button" role="switch" aria-checked={d.ask_school_ride} className={`eh-chip${d.ask_school_ride ? ' eh-chip-on' : ''}`} onClick={() => setD('ask_school_ride', !d.ask_school_ride)}>Ask about the ride to Bosco Tech</button>
            </div>
            <button type="button" className="eh-btn eh-btn-primary" onClick={() => done(supabase.from('hub_days').update({
              title: d.title, position: d.position, captain_id: d.captain_id, meet_place: d.meet_place, meet_at: d.meet_at,
              last_car_out_at: d.last_car_out_at, target_arrival_at: d.target_arrival_at, doors_at: d.doors_at,
              venue_opens_at: d.venue_opens_at, venue_closes_at: d.venue_closes_at, pits_close_at: d.pits_close_at,
              drive_to_range: d.drive_to_range, drive_home_range: d.drive_home_range, miles_to: d.miles_to, miles_home: d.miles_home,
              intro: d.intro, home_options: d.home_options ?? [], notes: d.notes, ask_pit_setup: d.ask_pit_setup, ask_school_ride: d.ask_school_ride,
            }).eq('id', d.id))}>Save day</button>
          </section>
        )
      })}
      <AddDay eventId={eventId} tz={tz} done={done} />

      <section className="eh-card">
        <h3 className="eh-label">Meals</h3>
        {meals.map((m, i) => {
          const setM = (k, v) => setMeals(meals.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
          const day = days.find((d) => d.id === m.day_id)
          return (
            <div key={m.id} className="ehm-meal-edit">
              <div className="ehm-grid">
                <label className="eh-field"><span className="eh-q-label">Label</span>
                  <input className="eh-input" value={m.label} onChange={(e) => setM('label', e.target.value)} /></label>
                <TimeIn label={`Starts (${day ? fmtDate(day.day_date, 'medium') : ''})`} date={day?.day_date} iso={m.starts_at} tz={tz} onChange={(v) => v && setM('starts_at', v)} />
              </div>
              <label className="eh-field"><span className="eh-q-label">Food truck footnote</span>
                <input className="eh-input" value={m.truck_note ?? ''} onChange={(e) => setM('truck_note', e.target.value || null)} /></label>
              <button type="button" className="eh-btn" onClick={() => done(supabase.from('hub_meals').update({ label: m.label, starts_at: m.starts_at, truck_note: m.truck_note }).eq('id', m.id))}>Save meal</button>
            </div>
          )
        })}
        <AddMeal eventId={eventId} days={days} tz={tz} done={done} />
      </section>

      <section className="eh-card">
        <h3 className="eh-label">Event info sections</h3>
        <p className="eh-hint">One line per line. "Label | value" makes a row; a value can be a link, or link:key for one of the links above.</p>
        {sections.map((s, i) => (
          <div key={`${s.key}-${i}`} className="ehm-section-edit">
            <div className="eh-inline">
              <input className="eh-input" value={s.title} aria-label="Section title"
                     onChange={(e) => setE('info', { ...ev.info, sections: sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <button type="button" className="eh-mini" disabled={i === 0} onClick={() => {
                const next = [...sections]; [next[i - 1], next[i]] = [next[i], next[i - 1]]
                setE('info', { ...ev.info, sections: next })
              }}>Up</button>
              <button type="button" className="eh-mini" onClick={() => setE('info', { ...ev.info, sections: sections.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            <textarea className="eh-input" rows={Math.min(10, Math.max(2, (s.lines ?? []).length + 1))} value={linesToText(s.lines)} aria-label={`${s.title} lines`}
                      onChange={(e) => setE('info', { ...ev.info, sections: sections.map((x, j) => (j === i ? { ...x, lines: e.target.value.split('\n') } : x)) })} />
          </div>
        ))}
        <div className="eh-inline">
          <button type="button" className="eh-btn" onClick={() => setE('info', { ...(ev.info ?? {}), sections: [...sections, { key: `s${Date.now()}`, title: 'New section', lines: [] }] })}>Add a section</button>
          <button type="button" className="eh-btn eh-btn-primary" onClick={() => done(supabase.from('hub_events').update({
            info: { ...(ev.info ?? {}), sections: sections.map((s) => ({ ...s, lines: textToLines(linesToText(s.lines)) })) },
            updated_at: new Date().toISOString(),
          }).eq('id', eventId))}>Save sections</button>
        </div>
      </section>
      {ov && <p className="eh-mono">Event ends {fmtDayTime(ov.event.ends_at, tz)}.</p>}
    </div>
  )
}

function AddDay({ eventId, tz, done }) {
  const [date, setDate] = useState('')
  return (
    <section className="eh-card eh-inline">
      <input className="eh-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="New day" />
      <button type="button" className="eh-btn" disabled={!date} onClick={() => {
        done(supabase.from('hub_days').insert({ event_id: eventId, day_date: date, position: 9, venue_closes_at: zonedToIso(date, '18:00', tz) }), 'Day added.')
        setDate('')
      }}>Add a day</button>
    </section>
  )
}

function AddMeal({ eventId, days, tz, done }) {
  const [dayId, setDayId] = useState('')
  const [label, setLabel] = useState('')
  const [time, setTime] = useState('12:00')
  const day = days.find((d) => d.id === dayId)
  return (
    <div className="eh-inline">
      <select className="eh-input" value={dayId} onChange={(e) => setDayId(e.target.value)} aria-label="Day">
        <option value="">Day</option>
        {days.map((d) => <option key={d.id} value={d.id}>{fmtDate(d.day_date, 'medium')}</option>)}
      </select>
      <input className="eh-input" placeholder="Sat lunch" value={label} onChange={(e) => setLabel(e.target.value)} />
      <input className="eh-input ehm-num" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Starts" />
      <button type="button" className="eh-btn" disabled={!day || !label.trim()} onClick={() => {
        done(supabase.from('hub_meals').insert({ event_id: eventId, day_id: dayId, label: label.trim(), starts_at: zonedToIso(day.day_date, time, tz) }), 'Meal added.')
        setLabel('')
      }}>Add a meal</button>
    </div>
  )
}

// ── exports ─────────────────────────────────────────────────────────────────

function Exports({ eventId, ov }) {
  const [note, setNote] = useState(null)
  async function csv() {
    const r = await staffCall('export', { event_id: eventId })
    if (r.kind !== 'ok') { setNote({ text: 'Export failed.', bad: true }); return }
    const text = toCsv(exportColumns(r.data), exportRecords(r.data))
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${ov.event.title.replace(/[^A-Za-z0-9]+/g, '-')}-families.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNote({ text: `${r.data.length} families exported.` })
  }
  async function sheet(dayId) {
    const r = await staffCall('board', { event_id: eventId })
    if (r.kind !== 'ok') return
    const day = r.data.board.days.find((d) => d.id === dayId)
    const html = daySheetHtml({ event: r.data.event, day, meals: r.data.board.meals, printedAt: new Date().toISOString() })
    const w = window.open('', '_blank')
    if (!w) { setNote({ text: 'Allow pop-ups to print the day sheet.', bad: true }); return }
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 250)
  }
  return (
    <div>
      <section className="eh-card">
        <h3 className="eh-label">Everything, as a spreadsheet</h3>
        <p className="eh-hint">One row per family, every answer. Cells that start with = + - or @ are written as text.</p>
        <button type="button" className="eh-btn eh-btn-primary" onClick={csv} data-testid="ehm-csv">Download CSV</button>
      </section>
      <section className="eh-card">
        <h3 className="eh-label">Day sheets, printed at the lot</h3>
        <p className="eh-hint">Cars, riders, phones where consented, pickup notes, allergies with names, the meet captain.</p>
        <div className="eh-inline">
          {(ov.attendance ?? []).map((d) => <button key={d.day_id} type="button" className="eh-btn" onClick={() => sheet(d.day_id)}>{d.label}</button>)}
        </div>
      </section>
      {note && <p className={`eh-note${note.bad ? ' eh-note-bad' : ''}`}>{note.text}</p>}
    </div>
  )
}

// ── the page ────────────────────────────────────────────────────────────────

// The open sign-up link (0007): what a mentor sends to every parent, like a
// Google Form link. Works for anyone; the family that already started gets an
// email instead of the page.
function OpenLink({ eventId }) {
  const url = `${window.location.origin}/join/${eventId}`
  const [copied, setCopied] = useState(false)
  return (
    <section className="eh-card ehm-openlink" data-testid="ehm-open-link">
      <h2 className="eh-label">Family sign-up link</h2>
      <p className="eh-hint">Send this to every parent and guardian (text, email, GroupMe). They pick their student and fill it out.</p>
      <div className="eh-inline">
        <input className="eh-input" readOnly value={url} aria-label="Family sign-up link" onFocus={(e) => e.target.select()} />
        <button type="button" className="eh-btn eh-btn-primary" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { /* select and copy by hand */ }
        }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </section>
  )
}

export default function TripsAdmin({ hasRole = () => false }) {
  const { id } = useParams()
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const [ov, setOv] = useState(null)
  const [status, setStatus] = useState('loading')
  const [tab, setTab] = useState('ready')
  const [inviteId, setInviteId] = useState(null)

  const reload = useCallback(async () => {
    const r = await staffCall('overview', { event_id: id })
    if (r.kind === 'ok') { setOv(r.data); setStatus('ready') }
    else setStatus(r.kind === 'missing' ? 'missing' : r.code === 'not_allowed' ? 'denied' : r.code === 'event_gone' ? 'gone' : 'error')
  }, [id])
  useEffect(() => { if (isStaff) reload() }, [isStaff, reload])

  if (!isStaff) return <div className="ehm ehm-page"><p className="eh-empty">Staff only.</p></div>
  if (status !== 'ready') {
    const text = { loading: 'Loading.', missing: 'Trips are not set up yet: migration 0005 has not been applied.', gone: 'That trip does not exist.', denied: 'Staff only.' }[status] ?? 'Could not load this trip.'
    return <div className="ehm ehm-page"><p className="eh-empty" data-testid="ehm-status">{text}</p><Link className="eh-link" to="/trips">All trips</Link></div>
  }
  const openFamily = (inv) => { setInviteId(inv); setTab('families') }

  return (
    <div className="ehm ehm-page" data-testid="ehm-page">
      <p className="eh-kicker"><Link className="eh-link" to="/trips">Trips</Link></p>
      <h1 className="ehm-title">{ov.event.title}</h1>
      <p className="eh-hint">{ov.event.venue_name}{ov.event.starts_on ? ` · ${fmtDate(ov.event.starts_on, 'medium')}` : ''} · Mentor page</p>
      <OpenLink eventId={id} />
      <Seg className="eh-tabs" label="Mentor page" value={tab} onPick={(t) => { setTab(t); if (t !== 'families') setInviteId(null) }}
           items={[{ key: 'ready', label: 'Readiness' }, { key: 'families', label: 'Families' }, { key: 'carpool', label: 'Carpool' },
             { key: 'food', label: 'Food' }, { key: 'setup', label: 'Setup' }, { key: 'exports', label: 'Exports' }]} />
      {tab === 'ready' && <Readiness ov={ov} eventId={id} reload={reload} openFamily={openFamily} />}
      {tab === 'families' && <Families ov={ov} inviteId={inviteId} setInviteId={setInviteId} reload={reload} />}
      {tab === 'carpool' && <StaffBoards eventId={id} which="carpool" />}
      {tab === 'food' && <StaffBoards eventId={id} which="food" />}
      {tab === 'setup' && <Setup eventId={id} ov={ov} reload={reload} />}
      {tab === 'exports' && <Exports eventId={id} ov={ov} />}
    </div>
  )
}
