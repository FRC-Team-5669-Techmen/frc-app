import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { boardView, roleLabel, DAY_FMT, TIME_FMT, ROLE_ORDER } from './roleBoard'
import './RoleBoard.css'

// The role interest board (0028, ledger 0017, part D1). Mr. Pina: "anyone
// should be able to open up this page and put in a request for a role during
// the day for any time slot, and they can see who else has put in a request
// and how much interest there is." Tap a cell to ask; tap again to withdraw.
// Staff assign from a request in one tap (staff_assign_from_request, which
// runs the roster's eligibility check), add slots, or apply a template.

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The role board is not set up yet. Nothing was saved.' }
  return r.data
}
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'

export default function RoleBoardPage({ session, hasRole = () => false }) {
  const { eventId } = useParams()
  const uid = session?.user?.id
  const parentOnly = hasRole('parent') && !['mentor', 'lead', 'admin'].some(hasRole)
  const [board, setBoard] = useState(null)
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(null) // { slotId, role } for the staff detail
  const [day, setDay] = useState(null)

  const load = useCallback(async () => {
    const r = await supabase.rpc('role_board', { p_event: eventId })
    if (r.error) { setState(isSchemaMissing(r.error) ? 'missing' : 'error'); setMsg(isSchemaMissing(r.error) ? '' : errText(r.error)); return }
    setBoard(r.data); setState('ready')
  }, [eventId])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  const view = board ? boardView(board, uid) : null
  const staff = !!board?.can_manage
  const curDay = view?.days.find((d) => d.day === day) ?? view?.days[0]

  async function toggle(slot, cell) {
    if (busy) return
    setBusy(`${slot.id}:${cell.role}`); setMsg('')
    try {
      if (cell.mine) { done(await writeVia(supabase, 'role_withdraw', { p_slot: slot.id, p_role: cell.role })); setMsg(`Withdrawn: ${roleLabel(cell.role)}, ${slot.label}.`) }
      else { done(await writeVia(supabase, 'role_request', { p_slot: slot.id, p_role: cell.role })); setMsg(`Requested: ${roleLabel(cell.role)}, ${slot.label}.`) }
      await load()
    } catch (e) { setMsg(errText(e)) }
    setBusy('')
  }
  async function assign(req, slot) {
    setBusy(req.id); setMsg('')
    try { done(await writeVia(supabase, 'staff_assign_from_request', { p_request: req.id, p_reason: null })); setMsg(`${req.name} assigned ${roleLabel(req.role)}. It is on the event roster.`); await load() } catch (e) { setMsg(errText(e)) }
    setBusy('')
  }
  async function applyTemplate() {
    setBusy('template'); setMsg('')
    try { const n = done(await writeVia(supabase, 'staff_apply_slot_template', { p_event: eventId, p_template: 'beach_blitz_2026' })); setMsg(`${n} slot${n === 1 ? '' : 's'} added from the Beach Blitz template.`); await load() } catch (e) { setMsg(errText(e)) }
    setBusy('')
  }

  if (parentOnly) return <main className="rb-wrap"><h1 className="rb-title">Role board</h1><p className="rb-muted">The role board is for students and staff.</p></main>
  if (state === 'loading') return <main className="rb-wrap"><h1 className="rb-title">Role board</h1><p className="rb-muted" role="status">Loading…</p></main>
  if (state === 'missing') return <main className="rb-wrap"><Link className="rb-back" to={`/rosters/${eventId}`}>← Event roster</Link><h1 className="rb-title">Role board</h1><div className="rb-empty"><h2>Not set up yet</h2><p>The role board starts when migration 0028 is pasted into Supabase.</p></div></main>
  if (state === 'error') return <main className="rb-wrap"><h1 className="rb-title">Role board</h1><p className="rb-error" role="alert">{msg}</p></main>

  const openCell = open ? curDay?.slots.find((s) => s.id === open.slotId)?.cells.find((c) => c.role === open.role) : null
  const openSlot = open ? curDay?.slots.find((s) => s.id === open.slotId) : null
  return (
    <main className="rb-wrap" data-page="role-board">
      <Link className="rb-back" to={`/rosters/${eventId}`}>← Event roster</Link>
      <header className="rb-head">
        <div>
          <span className="rb-eyebrow">Role board</span>
          <h1 className="rb-title">{board.event.title}</h1>
          <p className="rb-sub">Tap a box to ask for that role in that time. Tap again to take it back. Everyone sees who asked.</p>
        </div>
        {staff && !view.days.length && <button className="rb-primary" disabled={busy === 'template'} onClick={applyTemplate}>Use the Beach Blitz slots</button>}
      </header>

      <section className="rb-summary" aria-label="Coverage">
        <div className="rb-summary-num"><b className="hud-tnum">{view.unfilledCells}</b><span>unfilled</span></div>
        <div className="rb-summary-num"><b className="hud-tnum">{view.mine}</b><span>your requests</span></div>
        <div className="rb-summary-days">{view.days.map((d) => (
          <button key={d.day} className="rb-day" aria-pressed={curDay?.day === d.day} onClick={() => setDay(d.day)}>
            {DAY_FMT(d.day)} <span className={d.unfilled.length ? 'rb-day-bad' : 'rb-day-ok'}>{d.unfilled.length ? `${d.unfilled.length} open` : 'all covered'}</span>
          </button>))}</div>
      </section>
      {msg && <p className="rb-msg" role="status">{msg}</p>}

      {!view.days.length ? (
        <div className="rb-empty"><h2>No time slots yet</h2><p>{staff ? 'Start from the Beach Blitz slots, or add your own below.' : 'A mentor adds the time slots for this event.'}</p></div>
      ) : (<>
        {curDay.unfilled.length > 0 && (
          <details className="rb-unfilled" open>
            <summary>Still unfilled on {DAY_FMT(curDay.day)} <span className="hud-tnum">{curDay.unfilled.length}</span></summary>
            <ul>{curDay.unfilled.map((u) => <li key={`${u.slotId}:${u.role}`}><b>{u.slot}</b> {roleLabel(u.role)} <span className="hud-tnum">needs {u.short} more</span></li>)}</ul>
          </details>
        )}
        <div className="rb-grid-scroll">
          <table className="rb-grid">
            <thead><tr><th scope="col" className="rb-slot-col">Time</th>{view.roles.map((r) => <th key={r} scope="col">{roleLabel(r)}</th>)}</tr></thead>
            <tbody>{curDay.slots.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="rb-slot-col"><span className="rb-slot-label">{s.label}</span><span className="rb-slot-time hud-mono">{TIME_FMT(s.starts_at)}{s.ends_at ? `–${TIME_FMT(s.ends_at)}` : ''}</span></th>
                {s.cells.map((c) => c.state === 'none' ? <td key={c.role} className="rb-cell-none" aria-label="Not needed" /> : (
                  <td key={c.role}>
                    <button className={`rb-cell rb-${c.state}${c.mine ? ' rb-mine' : ''}`} disabled={busy === `${s.id}:${c.role}`}
                      aria-pressed={c.mine} aria-label={`${s.label}, ${roleLabel(c.role)}: ${c.requested} of ${c.needed}${c.mine ? ', you asked' : ''}`}
                      onClick={() => toggle(s, c)} data-cell={`${s.label}|${c.role}`}>
                      <span className="rb-count hud-tnum">{c.requested}<i>/{c.needed}</i></span>
                      <span className="rb-names">{c.requests.slice(0, 3).map((r) => r.name.split(' ')[0]).join(', ')}{c.requests.length > 3 ? ` +${c.requests.length - 3}` : ''}</span>
                    </button>
                    {staff && c.requested > 0 && <button className="rb-more" onClick={() => setOpen({ slotId: s.id, role: c.role })} aria-label={`Assign ${roleLabel(c.role)} for ${s.label}`}>Assign</button>}
                  </td>))}
              </tr>))}</tbody>
          </table>
        </div>
        <p className="rb-legend"><span className="rb-key rb-unfilled">Unfilled</span><span className="rb-key rb-covered">Covered</span><span className="rb-key rb-over">More than needed</span><span className="rb-key rb-mine">You asked</span></p>
      </>)}

      {openCell && (
        <div className="rb-assign" role="dialog" aria-label="Assign from requests">
          <div className="rb-assign-head"><h2>{roleLabel(openCell.role)} · {openSlot.label}</h2><button className="rb-btn" onClick={() => setOpen(null)}>Close</button></div>
          <p className="rb-muted">{openCell.requested} asked, {openCell.needed} needed. Assigning runs the roster's eligibility check and puts the role on the event roster.</p>
          <ul className="rb-assign-list">{openCell.requests.map((r) => (
            <li key={r.id}><span>{r.name}</span>{r.assigned ? <span className="rb-assigned">Assigned</span>
              : <button className="rb-primary" disabled={busy === r.id} onClick={() => assign(r, openSlot)}>Assign</button>}</li>))}</ul>
        </div>
      )}

      {staff && <SlotEditor eventId={eventId} event={board.event} onSaved={async (t) => { setMsg(t); await load() }} />}
    </main>
  )
}

function SlotEditor({ eventId, event, onSaved }) {
  const first = new Date(event.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const [v, setV] = useState({ day: first, label: '', start: '09:00', end: '10:00', needs: { scout: 6, scouting_lead: 1, driver: 1, operator: 1, human_player: 1, drive_coach: 1, pit_crew: 3, battery_captain: 1 } })
  const [err, setErr] = useState('')
  async function save(e) {
    e.preventDefault(); setErr('')
    const at = (hm) => hm ? new Date(`${v.day}T${hm}:00${laOffset(v.day)}`).toISOString() : null
    try {
      done(await writeVia(supabase, 'staff_save_slot', { p_id: null, p_event: eventId, p_day: v.day, p_label: v.label, p_starts_at: at(v.start), p_ends_at: at(v.end), p_needs: v.needs, p_position: 0 }))
      await onSaved(`${v.label} added.`); setV({ ...v, label: '' })
    } catch (x) { setErr(errText(x)) }
  }
  return (
    <details className="rb-editor">
      <summary>Add a time slot <span className="rb-muted">staff</span></summary>
      <form onSubmit={save} className="rb-form">
        <div className="rb-form-row">
          <label>Day<input type="date" value={v.day} onChange={(e) => setV({ ...v, day: e.target.value })} required /></label>
          <label>Label<input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="Qualifications 9" maxLength={80} required /></label>
          <label>Start<input type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} required /></label>
          <label>End<input type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></label>
        </div>
        <div className="rb-needs">{ROLE_ORDER.map((r) => (
          <label key={r}>{roleLabel(r)}<input inputMode="numeric" value={v.needs[r] ?? 0} onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, '') || 0); const needs = { ...v.needs }; if (n) needs[r] = Math.min(99, n); else delete needs[r]; setV({ ...v, needs })
          }} /></label>))}</div>
        {err && <p className="rb-error" role="alert">{err}</p>}
        <button className="rb-primary" type="submit">Add slot</button>
      </form>
    </details>
  )
}

// The offset of Los Angeles on a date, as "-07:00" or "-08:00".
function laOffset(day) {
  const d = new Date(`${day}T12:00:00Z`)
  const la = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  const h = Math.round((la - utc) / 3600e3)
  return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`
}
