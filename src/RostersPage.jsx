import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { displayName } from './names'
import { isSchemaMissing } from './schemaMissing'
import { errText } from './standing'
import './Standing.css'

// /rosters and /rosters/:id: event roles, eligibility, event-day attendance,
// conflicts and the family sign-up reminder (migration 0016, handbook
// Sections 13, 16 and 18). The database decides who is eligible
// (event_role_blocker) and refuses an ineligible assignment; this page asks
// it first so a mentor sees why before trying.

export const ROLES = Object.freeze([
  { key: 'driver', label: 'Driver' },
  { key: 'operator', label: 'Operator' },
  { key: 'human_player', label: 'Human player' },
  { key: 'drive_coach', label: 'Drive coach' },
  { key: 'pit_crew', label: 'Pit crew' },
  { key: 'impact_presenter', label: 'Impact presenter' },
  { key: 'pit_speaker', label: 'Pit speaker' },
  { key: 'scouting_lead', label: 'Scouting lead' },
  { key: 'scout', label: 'Scout' },
  { key: 'media', label: 'Media' },
  { key: 'safety_captain', label: 'Safety captain' },
])
const roleLabel = (k) => ROLES.find((r) => r.key === k)?.label ?? k
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const laDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function eventDays(ev) {
  const out = []
  let d = laDate(ev.starts_at)
  const end = laDate(ev.ends_at)
  while (d <= end && out.length < 7) {
    out.push(d)
    const n = new Date(`${d}T12:00:00Z`); n.setUTCDate(n.getUTCDate() + 1); d = n.toISOString().slice(0, 10)
  }
  return out
}

export default function RostersPage({ session, hasRole = () => false }) {
  const { id } = useParams()
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  return id ? <RosterDetail id={id} uid={session?.user?.id} isStaff={isStaff} /> : <RosterList />
}

function RosterList() {
  const [events, setEvents] = useState(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    Promise.all([
      supabase.from('events').select('id, title, kind, starts_at, ends_at, mandatory').gte('ends_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('starts_at'),
      supabase.from('event_rosters').select('event_id, posted_at'),
    ]).then(([e, r]) => {
      if (r.error && isSchemaMissing(r.error)) { setMissing(true); return }
      const posted = new Set((r.data ?? []).map((x) => x.event_id))
      setEvents((e.data ?? []).filter((x) => x.kind === 'competition' || x.mandatory).map((x) => ({ ...x, posted: posted.has(x.id) })))
    })
  }, [])
  if (missing) return <div className="st-wrap"><h1 className="st-title">Event rosters</h1><p className="st-muted">Not set up yet. Rosters start when migration 0016 is pasted.</p></div>
  if (!events) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  return (
    <div className="st-wrap">
      <div className="st-head"><div><h1 className="st-title">Event rosters</h1><p className="st-sub">Competitions and mandatory events. Rosters are posted at least 10 days ahead.</p></div></div>
      {events.length === 0 ? <p className="st-muted">No competitions or mandatory events coming up.</p> : (
        <ul className="st-list">{events.map((e) => (
          <li key={e.id} className="st-row-between" data-event={e.id}>
            <span><Link to={`/rosters/${e.id}`}><b>{e.title}</b></Link> <span className="st-muted">{fmtWhen(e.starts_at)}</span></span>
            <span className={`st-chip${e.posted ? '' : ' st-chip-pending'}`}>{e.posted ? 'Posted' : 'Not posted'}</span>
          </li>))}</ul>
      )}
    </div>
  )
}

function RosterDetail({ id, uid, isStaff }) {
  const [ev, setEv] = useState(null)
  const [roles, setRoles] = useState([])
  const [posted, setPosted] = useState(null)
  const [members, setMembers] = useState([])
  const [names, setNames] = useState(new Map())
  const [attendance, setAttendance] = useState([])
  const [conflicts, setConflicts] = useState([])
  const [hub, setHub] = useState({ linked: null, all: [] })
  const [msg, setMsg] = useState(null)
  const [missing, setMissing] = useState(false)

  const load = useCallback(async () => {
    const [e, r, p, prof, roleRows, att, con] = await Promise.all([
      supabase.from('events').select('id, title, kind, starts_at, ends_at, mandatory, location').eq('id', id).maybeSingle(),
      supabase.from('event_roles').select('id, member_id, role, reason, assigned_at').eq('event_id', id),
      supabase.from('event_rosters').select('*').eq('event_id', id).maybeSingle(),
      supabase.from('profiles').select('id, full_name, nickname, status, approved'),
      supabase.from('member_roles').select('member_id, role'),
      supabase.from('event_attendance').select('*').eq('event_id', id),
      supabase.from('member_conflicts').select('*').eq('event_id', id).is('withdrawn_at', null),
    ])
    if (r.error && isSchemaMissing(r.error)) { setMissing(true); return }
    setEv(e.data)
    setRoles(r.data ?? [])
    setPosted(p.data ?? null)
    const byMember = new Map()
    for (const x of roleRows.data ?? []) byMember.set(x.member_id, [...(byMember.get(x.member_id) ?? []), x.role])
    const ps = prof.data ?? []
    setNames(new Map(ps.map((x) => [x.id, displayName(x)])))
    setMembers(ps.filter((x) => x.approved && (x.status ?? 'active') === 'active'
      && (byMember.get(x.id) ?? []).includes('student') && !(byMember.get(x.id) ?? []).some((rr) => rr === 'mentor' || rr === 'admin'))
      .map((x) => ({ id: x.id, name: displayName(x) })).sort((a, b) => a.name.localeCompare(b.name)))
    setAttendance(att.data ?? [])
    setConflicts(con.data ?? [])
    if (isStaff) {
      const h = await supabase.from('hub_events').select('id, title, event_id').order('created_at', { ascending: false })
      if (!h.error) setHub({ linked: (h.data ?? []).find((x) => x.event_id === id) ?? null, all: h.data ?? [] })
    }
  }, [id, isStaff])
  useEffect(() => { load() }, [load])

  async function act(fn, done) {
    setMsg(null)
    try { const r = await fn(); setMsg(typeof done === 'function' ? done(r) : done) } catch (err) { setMsg(errText(err)) }
    await load()
  }

  if (missing) return <div className="st-wrap"><h1 className="st-title">Event roster</h1><p className="st-muted">Not set up yet. Rosters start when migration 0016 is pasted.</p></div>
  if (!ev) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  const nameOf = (m) => names.get(m) ?? 'Member'
  const daysAhead = Math.floor((Date.parse(ev.starts_at) - Date.now()) / 864e5)
  const mineConflict = conflicts.find((c) => c.member_id === uid)

  return (
    <div className="st-wrap st-wide">
      <div className="st-head">
        <div>
          <h1 className="st-title">{ev.title}</h1>
          <p className="st-sub">{fmtWhen(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ''}. Every member attends every day.</p>
        </div>
        <span className={`st-badge${posted ? '' : ' st-badge-probation'}`} data-posted={posted ? 'yes' : 'no'}>{posted ? 'Roster posted' : 'Not posted'}</span>
      </div>
      {msg && <p className="st-msg" role="status">{msg}</p>}

      <section className="st-card" data-card="roles">
        <h2 className="st-h2">Roles</h2>
        {roles.length === 0 ? <p className="st-muted">{isStaff || posted ? 'No roles yet.' : 'The roster is not posted yet.'}</p> : (
          <ul className="st-list">{ROLES.filter((r) => roles.some((x) => x.role === r.key)).map((r) => (
            <li key={r.key}><b>{r.label}</b>
              <ul className="st-sublist">{roles.filter((x) => x.role === r.key).map((x) => (
                <li key={x.id} className="st-row-between" data-role={x.role}>
                  <span>{nameOf(x.member_id)}{isStaff && <span className="st-muted"> · {x.reason}</span>}</span>
                  {isStaff && <button className="st-link" onClick={() => act(() => rpcCall('staff_unassign_role', { p_role: x.id }), 'Removed.')}>Remove</button>}
                </li>))}</ul>
            </li>))}</ul>
        )}
        {isStaff && <AssignForm eventId={id} members={members} act={act} />}
        {isStaff && (
          <div className="st-row">
            <button className="st-btn st-btn-primary" onClick={() => act(() => rpcCall('staff_post_roster', { p_event: id, p_note: null }),
              (d) => `Posted ${d} days ahead${d < 10 ? '. The handbook asks for at least 10.' : '.'} Everyone with a role was told.`)}>{posted ? 'Post again' : 'Post the roster'}</button>
            {!posted && daysAhead < 10 && daysAhead >= 0 && <span className="st-warn">{daysAhead} days out: post it now.</span>}
          </div>
        )}
      </section>

      {isStaff && <AttendanceCard ev={ev} members={members} attendance={attendance} act={act} />}

      <section className="st-card" data-card="conflicts">
        <h2 className="st-h2">Conflicts</h2>
        <p className="st-muted">Declare a conflict as soon as you know: by February 1 for spring events, at sign-up for fall events. A declared conflict never excuses a mandatory event.</p>
        {isStaff ? (
          conflicts.length === 0 ? <p className="st-muted">None declared.</p> : (
            <ul className="st-list">{conflicts.map((c) => <li key={c.id}><b>{nameOf(c.member_id)}</b>: {c.note}</li>)}</ul>)
        ) : <ConflictForm eventId={id} mine={mineConflict} act={act} past={Date.parse(ev.starts_at) < Date.now()} />}
      </section>

      {isStaff && (
        <section className="st-card" data-card="signups">
          <h2 className="st-h2">Family sign-up</h2>
          {hub.all.length === 0 ? <p className="st-muted">No event family hub set up. Every event needs a family sign-up.</p> : (
            <>
              <select className="st-input" aria-label="Family sign-up hub" value={hub.linked?.id ?? ''}
                onChange={(e) => act(async () => {
                  if (hub.linked) { const { error } = await supabase.from('hub_events').update({ event_id: null }).eq('id', hub.linked.id); if (error) throw error }
                  if (e.target.value) { const { error } = await supabase.from('hub_events').update({ event_id: id }).eq('id', e.target.value); if (error) throw error }
                }, 'Linked.')}>
                <option value="">Not linked</option>
                {hub.all.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}
              </select>
              {hub.linked && (
                <button className="st-btn" onClick={() => act(() => rpcCall('staff_remind_signups', { p_hub_event: hub.linked.id }),
                  (n) => `${n} famil${n === 1 ? 'y' : 'ies'} reminded. Still missing 48 hours from now counts as an unexcused absence.`)}>Remind families who have not signed up</button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}

async function rpcCall(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

function AssignForm({ eventId, members, act }) {
  const [member, setMember] = useState('')
  const [role, setRole] = useState('scout')
  const [reason, setReason] = useState('')
  const [blocker, setBlocker] = useState(undefined)
  useEffect(() => {
    if (!member) { setBlocker(undefined); return }
    let live = true
    supabase.rpc('event_role_blocker', { p_member: member, p_event: eventId, p_role: role })
      .then(({ data, error }) => { if (live) setBlocker(error ? undefined : data ?? null) })
    return () => { live = false }
  }, [member, role, eventId])
  return (
    <div className="st-form" data-form="assign">
      <div className="st-row">
        <select className="st-input" aria-label="Member" value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="">Pick a member</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="st-input" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>
      {blocker && <p className="st-error" role="alert" data-blocker>Not eligible: {blocker}</p>}
      <input className="st-input" placeholder="Why (reliability, hours, attendance, conduct, safety, team needs)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="st-btn st-btn-primary" disabled={!member || !!blocker || reason.trim().length < 3}
        onClick={() => act(() => rpcCall('staff_assign_role', { p_event: eventId, p_member: member, p_role: role, p_reason: reason.trim() }), () => { setReason(''); return 'Assigned.' })}>Assign</button>
    </div>
  )
}

function AttendanceCard({ ev, members, attendance, act }) {
  const days = eventDays(ev)
  const [day, setDay] = useState(days[0])
  const mark = (m) => attendance.find((a) => a.member_id === m && a.day === day)?.status
  return (
    <section className="st-card" data-card="attendance">
      <h2 className="st-h2">Attendance</h2>
      <div className="st-chips">{days.map((d) => <button key={d} className={`st-pick${d === day ? ' on' : ''}`} onClick={() => setDay(d)}>{fmtDay(d)}</button>)}</div>
      <p className="st-muted">Absent without an approved absence puts the member on probation.</p>
      <ul className="st-list">{members.map((m) => (
        <li key={m.id} className="st-row-between" data-attend={m.id}>
          <span>{m.name}</span>
          <span className="st-chips">{['present', 'absent', 'excused'].map((s) => (
            <button key={s} className={`st-pick${mark(m.id) === s ? ' on' : ''}`}
              onClick={() => act(() => rpcCall('staff_mark_event_day', { p_event: ev.id, p_day: day, p_member: m.id, p_status: s, p_note: null }), null)}>{s[0].toUpperCase() + s.slice(1)}</button>))}</span>
        </li>))}</ul>
    </section>
  )
}

function ConflictForm({ eventId, mine, act, past }) {
  const [note, setNote] = useState(mine?.note ?? '')
  if (past) return <p className="st-muted">This event has started.</p>
  return (
    <div className="st-form">
      <input className="st-input" placeholder="What conflicts, and which day" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="st-row">
        <button className="st-btn st-btn-primary" disabled={note.trim().length < 3}
          onClick={() => act(() => rpcCall('declare_conflict', { p_event: eventId, p_note: note.trim() }), 'Conflict declared. Mentors see it when they plan.')}>{mine ? 'Update my conflict' : 'Declare a conflict'}</button>
        {mine && <button className="st-btn" onClick={() => act(() => rpcCall('withdraw_conflict', { p_conflict: mine.id }), 'Withdrawn.')}>Withdraw</button>}
      </div>
    </div>
  )
}
