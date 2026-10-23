import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { boardView, roleLabel, countLine, STATUS_LABELS, DAY_FMT, TIME_FMT, ROLE_ORDER } from './roleBoard'
import './RoleBoard.css'

// The role board (0028, reworked by 0031, ledger 0023). A member taps a box
// to open it and taps "I can do this" to ask; as many boxes as they want.
// Staff mark each person in a box Assigned, Backup or remove them, add anyone
// who did not ask, and overfill freely. Nothing here blocks a staff decision:
// no eligibility check runs from the board. A box is filled by ASSIGNED
// people only (src/roleBoard.js cellState).

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The role board is not set up yet. Nothing was saved.' }
  return r.data
}
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const when = (s) => `${TIME_FMT(s.starts_at)}${s.ends_at ? `–${TIME_FMT(s.ends_at)}` : ''}`

export default function RoleBoardPage({ session, hasRole = () => false }) {
  const { eventId } = useParams()
  const uid = session?.user?.id
  const parentOnly = hasRole('parent') && !['mentor', 'lead', 'admin'].some(hasRole)
  const [board, setBoard] = useState(null)
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(null) // { slotId, role }
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

  async function act(key, fn, text) {
    if (busy) return
    setBusy(key); setMsg('')
    // The message lands after the board reloads, so what it says is already on screen.
    try { await fn(); await load(); setMsg(text) } catch (e) { setMsg(errText(e)) }
    setBusy('')
  }
  const ask = (slot, cell) => act('me', async () => done(await writeVia(supabase, 'role_request', { p_slot: slot.id, p_role: cell.role })), `You asked for ${roleLabel(cell.role)}, ${slot.label}.`)
  const takeBack = (slot, cell) => act('me', async () => done(await writeVia(supabase, 'role_withdraw', { p_slot: slot.id, p_role: cell.role })), `Request taken back: ${roleLabel(cell.role)}, ${slot.label}.`)
  const setStatus = (req, status) => act(req.id, async () => done(await writeVia(supabase, 'staff_set_request_status', { p_request: req.id, p_status: status })),
    status === 'removed' ? `${req.name} removed.` : `${req.name}: ${STATUS_LABELS[status]}.`)
  const addPerson = (slot, cell, member, status) => act('add', async () => done(await writeVia(supabase, 'staff_add_to_slot', { p_slot: slot.id, p_member: member.id, p_role: cell.role, p_status: status })),
    `${member.name} added as ${STATUS_LABELS[status].toLowerCase()}.`)
  async function applyTemplate() {
    const tpl = (board.templates ?? []).find((t) => /beach blitz/i.test(t.name)) ?? board.templates?.[0]
    if (!tpl) { setMsg('No saved template yet.'); return }
    await act('template', async () => { const n = done(await writeVia(supabase, 'staff_apply_slot_template', { p_event: eventId, p_template: tpl.id })); setMsg(`${n} slots added.`) }, `Slots added from ${tpl.name}.`)
  }

  if (parentOnly) return <main className="rb-wrap"><h1 className="rb-title">Role board</h1><p className="rb-muted">The role board is for students and staff.</p></main>
  if (state === 'loading') return <main className="rb-wrap"><h1 className="rb-title">Role board</h1><p className="rb-muted" role="status">Loading…</p></main>
  if (state === 'missing') return <main className="rb-wrap"><Link className="rb-back" to={`/rosters/${eventId}`}>← Event roster</Link><h1 className="rb-title">Role board</h1><div className="rb-empty"><h2>Not set up yet</h2><p>The role board starts when its migration reaches the database.</p></div></main>
  if (state === 'error') return <main className="rb-wrap"><h1 className="rb-title">Role board</h1><p className="rb-error" role="alert">{msg}</p></main>

  const openSlot = open ? curDay?.slots.find((s) => s.id === open.slotId) : null
  const openCell = openSlot?.cells.find((c) => c.role === open.role) ?? null
  return (
    <main className="rb-wrap" data-page="role-board">
      <Link className="rb-back" to={`/rosters/${eventId}`}>← Event roster</Link>
      <header className="rb-head">
        <div>
          <span className="rb-eyebrow">Role board</span>
          <h1 className="rb-title">{board.event.title}</h1>
          <p className="rb-sub" data-explainer>Tap a box, then <b>I can do this</b>. Ask for as many as you want. Mr. Pina assigns; backups cover emergencies.</p>
        </div>
        {staff && !view.days.length && <button className="rb-primary" disabled={busy === 'template'} onClick={applyTemplate}>Use the Beach Blitz slots</button>}
      </header>

      <section className="rb-shifts" aria-label="My shifts" data-myshifts>
        <h2 className="rb-h2">My shifts</h2>
        {view.myShifts.length ? (
          <ul className="rb-shift-list">{view.myShifts.map((m) => (
            <li key={`${m.slotId}:${m.role}`} className={`rb-shift rb-shift-${m.status}`}>
              <span className="rb-shift-when hud-mono">{DAY_FMT(m.day)} · {when(m)}</span>
              <span className="rb-shift-what"><b>{roleLabel(m.role)}</b> {m.label}</span>
              <span className={`rb-chip rb-chip-${m.status}`}>{STATUS_LABELS[m.status]}</span>
            </li>))}</ul>
        ) : <p className="rb-muted">Nothing assigned yet. You have {view.mine} request{view.mine === 1 ? '' : 's'} in. Your assignments show up here.</p>}
      </section>

      <section className="rb-summary" aria-label="Coverage">
        <div className="rb-summary-num"><b className="hud-tnum">{view.unfilledCells}</b><span>boxes unfilled</span></div>
        <div className="rb-summary-num"><b className="hud-tnum">{view.mine}</b><span>your requests</span></div>
        <div className="rb-summary-days">{view.days.map((d) => (
          <button key={d.day} className="rb-day" aria-pressed={curDay?.day === d.day} onClick={() => { setDay(d.day); setOpen(null) }}>
            {DAY_FMT(d.day)} <span className={d.unfilled.length ? 'rb-day-bad' : 'rb-day-ok'}>{d.unfilled.length ? `${d.unfilled.length} open` : 'all filled'}</span>
          </button>))}</div>
      </section>
      {msg && <p className="rb-msg" role="status">{msg}</p>}

      {!view.days.length ? (
        <div className="rb-empty"><h2>No time slots yet</h2><p>{staff ? 'Start from the Beach Blitz slots, or add your own below.' : 'A mentor adds the time slots for this event.'}</p></div>
      ) : (<>
        <p className="rb-swipe hud-mono">Swipe the grid sideways for every role →</p>
        <div className="rb-grid-scroll">
          <table className="rb-grid">
            <thead><tr><th scope="col" className="rb-slot-col">Time</th>{view.roles.map((r) => <th key={r} scope="col">{roleLabel(r)}</th>)}</tr></thead>
            <tbody>{curDay.slots.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="rb-slot-col"><span className="rb-slot-label">{s.label}</span><span className="rb-slot-time hud-mono">{when(s)}</span></th>
                {s.cells.map((c) => c.state === 'none' ? <td key={c.role} className="rb-cell-none" aria-label="Not needed" /> : (
                  <td key={c.role}>
                    <button className={`rb-cell rb-${c.state}${c.mine ? ' rb-mine' : ''}`} aria-haspopup="dialog"
                      aria-label={`${s.label}, ${roleLabel(c.role)}: ${countLine(c)}${c.myStatus ? `, you: ${STATUS_LABELS[c.myStatus]}` : ''}`}
                      onClick={() => setOpen({ slotId: s.id, role: c.role })} data-cell={`${s.label}|${c.role}`}>
                      <span className="rb-count hud-tnum">{c.assigned}<i>/{c.needed}</i></span>
                      <span className="rb-sub-count hud-mono">{c.asked} asked{c.backup ? ` · ${c.backup} bk` : ''}</span>
                      {c.myStatus && <span className={`rb-chip rb-chip-${c.myStatus}`}>You: {STATUS_LABELS[c.myStatus]}</span>}
                    </button>
                  </td>))}
              </tr>))}</tbody>
          </table>
        </div>
        <p className="rb-legend"><span>Big number: assigned / needed.</span><span className="rb-key rb-unfilled">Needs people</span><span className="rb-key rb-covered">Filled</span><span className="rb-key rb-over">Extra assigned</span><span className="rb-key rb-mine">You are in it</span></p>
        {curDay.unfilled.length > 0 && (
          <details className="rb-unfilled">
            <summary>Still unfilled on {DAY_FMT(curDay.day)} <span className="hud-tnum">{curDay.unfilled.length}</span></summary>
            <ul>{curDay.unfilled.map((u) => <li key={`${u.slotId}:${u.role}`}><b>{u.slot}</b> {roleLabel(u.role)} <span className="hud-tnum">needs {u.short} more</span></li>)}</ul>
          </details>
        )}
      </>)}

      {openCell && <CellSheet slot={openSlot} cell={openCell} staff={staff} uid={uid} busy={busy}
        onClose={() => setOpen(null)} onAsk={() => ask(openSlot, openCell)} onTakeBack={() => takeBack(openSlot, openCell)}
        onStatus={setStatus} onAdd={(m, st) => addPerson(openSlot, openCell, m, st)} />}

      {staff && <SlotEditor eventId={eventId} event={board.event} onSaved={async (t) => { setMsg(t); await load() }} />}
    </main>
  )
}

function CellSheet({ slot, cell, staff, uid, busy, onClose, onAsk, onTakeBack, onStatus, onAdd }) {
  const [members, setMembers] = useState(null)
  const [pick, setPick] = useState('')
  useEffect(() => {
    if (!staff || members) return
    supabase.from('profiles').select('id, full_name, nickname, approved, status').eq('approved', true).then((r) => {
      setMembers((r.data ?? []).filter((p) => (p.status ?? 'active') === 'active')
        .map((p) => ({ id: p.id, name: (p.nickname || '').trim() || (p.full_name || '').trim() || 'Member' }))
        .sort((a, b) => a.name.localeCompare(b.name)))
    })
  }, [staff, members])
  const inBox = new Set(cell.requests.map((r) => r.member_id))
  const choices = (members ?? []).filter((m) => !inBox.has(m.id))
  const chosen = choices.find((m) => m.id === pick)
  return (
    <div className="rb-assign" role="dialog" aria-label={`${roleLabel(cell.role)}, ${slot.label}`} data-sheet>
      <div className="rb-assign-head">
        <div><h2>{roleLabel(cell.role)} · {slot.label}</h2><span className="rb-slot-time hud-mono">{DAY_FMT(slot.day)} · {when(slot)}</span></div>
        <button className="rb-btn" onClick={onClose}>Close</button>
      </div>
      <p className="rb-countline hud-mono" data-countline>{countLine(cell)}</p>
      {!cell.mine && <button className="rb-big" disabled={busy === 'me'} onClick={onAsk}>I can do this</button>}
      {cell.myStatus === 'asked' && <button className="rb-big rb-big-off" disabled={busy === 'me'} onClick={onTakeBack}>Take back my request</button>}
      {(cell.myStatus === 'assigned' || cell.myStatus === 'backup') && (
        <p className="rb-locked">You are <b>{STATUS_LABELS[cell.myStatus].toLowerCase()}</b> here. To change it, ask a mentor.</p>)}
      {cell.requests.length ? (
        <ul className="rb-assign-list">{cell.requests.map((r) => (
          <li key={r.id} data-person={r.name}>
            <span className="rb-person">{r.name}{r.member_id === uid ? ' (you)' : ''}</span>
            <span className={`rb-chip rb-chip-${r.status}`}>{STATUS_LABELS[r.status]}</span>
            {staff && <span className="rb-person-acts">
              {r.status !== 'assigned' && <button className="rb-act rb-act-assign" disabled={busy === r.id} onClick={() => onStatus(r, 'assigned')}>Assign</button>}
              {r.status !== 'backup' && <button className="rb-act" disabled={busy === r.id} onClick={() => onStatus(r, 'backup')}>Backup</button>}
              <button className="rb-act rb-act-remove" disabled={busy === r.id} onClick={() => onStatus(r, 'removed')} aria-label={`Remove ${r.name}`}>Remove</button>
            </span>}
          </li>))}</ul>
      ) : <p className="rb-muted">Nobody has asked yet.</p>}
      {staff && (
        <div className="rb-add">
          <label>Add someone who did not ask
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{members ? 'Pick a member' : 'Loading members…'}</option>
              {choices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <div className="rb-add-acts">
            <button className="rb-act rb-act-assign" disabled={!chosen || busy === 'add'} onClick={() => { onAdd(chosen, 'assigned'); setPick('') }}>Add as assigned</button>
            <button className="rb-act" disabled={!chosen || busy === 'add'} onClick={() => { onAdd(chosen, 'backup'); setPick('') }}>Add as backup</button>
          </div>
        </div>
      )}
    </div>
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
