import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { displayName } from './names'
import { STANDING_LABEL, KIND_LABEL, STATUS_LABEL, reasonLabel, fmtHours, loadOverview, rpc, errText, INCIDENT_KINDS } from './standing'
import './Standing.css'

// /standing/team: the mentors' side of member standing (migration 0015).
// Every write is an RPC that checks the role itself; this page only offers
// what the database will accept (admin-only actions show only to admins).

const TABS = ['Overview', 'Absences', 'Confirm', 'Log', 'Incidents', 'Weeks', 'Grades', 'FLL', 'Settings']
const SAFETY_RULES = ['No safety glasses', 'Unsafe clothing or hair', 'Machine without its certification', 'Horseplay', 'Left area dirty or tools out', 'Food or drink in the shop']
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const laToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

export default function StandingTeamPage({ hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const isAdmin = hasRole('admin')
  const [tab, setTab] = useState('Overview')
  const [ov, setOv] = useState(null)
  const [names, setNames] = useState(new Map())
  const [msg, setMsg] = useState(null)
  const [tick, setTick] = useState(0)

  const reload = useCallback(async () => {
    const [o, { data: profs }] = await Promise.all([
      loadOverview(supabase),
      supabase.from('profiles').select('id, full_name, nickname'),
    ])
    setOv(o)
    setNames(new Map((profs ?? []).map((p) => [p.id, displayName(p)])))
    setTick((t) => t + 1)
  }, [])
  useEffect(() => { if (isStaff) reload() }, [isStaff, reload])

  async function act(fn, done) {
    setMsg(null)
    try { const r = await fn(); setMsg(typeof done === 'function' ? done(r) : done) } catch (e) { setMsg(errText(e)) }
    await reload()
  }

  if (!isStaff) return <div className="st-wrap"><p className="st-muted">Mentors only.</p></div>
  if (!ov) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  if (ov.state === 'missing') return <div className="st-wrap"><h1 className="st-title">Team standing</h1><p className="st-muted">Not set up yet. Standing starts when migration 0015 is pasted.</p></div>
  if (ov.state === 'error') return <div className="st-wrap"><h1 className="st-title">Team standing</h1><p className="st-error">{errText(ov.error)}</p></div>
  const rows = ov.data ?? []
  const nameOf = (id) => names.get(id) ?? 'Member'

  return (
    <div className="st-wrap st-wide">
      <div className="st-head">
        <div>
          <h1 className="st-title">Team standing</h1>
          <p className="st-sub">Never shown to other members or posted in a group chat.</p>
        </div>
      </div>
      <div className="st-tabs" role="tablist">
        {TABS.filter((t) => t !== 'Settings' || isAdmin).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`st-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      {tab === 'Overview' && <Overview rows={rows} />}
      {tab === 'Absences' && <Absences nameOf={nameOf} act={act} tick={tick} />}
      {tab === 'Confirm' && <Confirm nameOf={nameOf} act={act} isAdmin={isAdmin} tick={tick} />}
      {tab === 'Log' && <Log rows={rows} act={act} isAdmin={isAdmin} />}
      {tab === 'Incidents' && <Incidents nameOf={nameOf} act={act} tick={tick} />}
      {tab === 'Weeks' && <Weeks act={act} tick={tick} />}
      {tab === 'Grades' && <Grades rows={rows} act={act} isAdmin={isAdmin} />}
      {tab === 'FLL' && <Fll nameOf={nameOf} act={act} tick={tick} />}
      {tab === 'Settings' && isAdmin && <Settings act={act} tick={tick} />}
    </div>
  )
}

function Overview({ rows }) {
  if (!rows.length) return <p className="st-muted">No members the standards apply to.</p>
  return (
    <div className="st-table-wrap">
      <table className="st-table">
        <thead><tr><th>Member</th><th>Standing</th><th>This week</th><th>Meetings this month</th><th>Safety</th></tr></thead>
        <tbody>{rows.map((r) => {
          const shortWeek = Number(r.week_hours) < Number(r.week_required)
          return (
            <tr key={r.member_id} data-member={r.member_id}>
              <td><Link to={`/standing?member=${r.member_id}`}>{r.name}</Link></td>
              <td><span className={`st-badge st-badge-${r.standing}`}>{STANDING_LABEL[r.standing]}</span>
                {r.open_kinds?.length > 0 && <div className="st-muted">{r.open_kinds.map((k) => { const [kind, st] = k.split(':'); return `${KIND_LABEL[kind]}${st === 'proposed' ? ' (to confirm)' : ''}` }).join(', ')}</div>}</td>
              <td className={`hud-tnum${shortWeek ? ' st-warn' : ''}`}>{fmtHours(r.week_hours)} / {fmtHours(r.week_required)}</td>
              <td className="hud-tnum">{r.month_counted ? `${r.month_attended} of ${r.month_counted}${r.month_lates ? `, ${r.month_lates} late` : ''}` : '-'}</td>
              <td className="hud-tnum">{r.safety_count}</td>
            </tr>)
        })}</tbody>
      </table>
    </div>
  )
}

function Absences({ nameOf, act, tick }) {
  const [list, setList] = useState(null)
  const [notes, setNotes] = useState({})
  useEffect(() => {
    supabase.from('absence_requests').select('id, member_id, reason, emergency, note, requested_at, events(title, starts_at)')
      .eq('status', 'pending').order('requested_at').then(({ data }) => setList(data ?? []))
  }, [tick])
  if (!list) return <p className="st-muted">Loading…</p>
  if (!list.length) return <p className="st-muted">No absence requests waiting.</p>
  return (
    <ul className="st-list st-queue">{list.map((a) => (
      <li key={a.id} data-request={a.id}>
        <div><b>{nameOf(a.member_id)}</b> · {a.events?.title} · {a.events?.starts_at && fmtWhen(a.events.starts_at)}</div>
        <div className="st-muted">{reasonLabel(a.reason)}{a.emergency ? ' · emergency' : ''}{a.note ? ` · "${a.note}"` : ''} · asked {fmtWhen(a.requested_at)}</div>
        <div className="st-row">
          <input className="st-input" placeholder="Note to the student (optional)" value={notes[a.id] ?? ''} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} />
          <button className="st-btn st-btn-primary" onClick={() => act(() => rpc(supabase, 'decide_absence', { p_request: a.id, p_approve: true, p_note: notes[a.id] ?? null }), 'Approved.')}>Approve</button>
          <button className="st-btn" onClick={() => act(() => rpc(supabase, 'decide_absence', { p_request: a.id, p_approve: false, p_note: notes[a.id] ?? null }), 'Denied.')}>Deny</button>
        </div>
      </li>))}</ul>
  )
}

function Confirm({ nameOf, act, isAdmin, tick }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    supabase.from('standing_records').select('*').or('status.eq.proposed,and(status.eq.open,confirmed_at.is.null)')
      .order('created_at').then(({ data }) => setList(data ?? []))
  }, [tick])
  if (!list) return <p className="st-muted">Loading…</p>
  if (!list.length) return <p className="st-muted">Nothing to confirm.</p>
  return (
    <>
      <p className="st-muted">Probation starts automatically. Every month Mr. Pina confirms each one, and a removal takes effect only when he confirms it.</p>
      <ul className="st-list st-queue">{list.map((r) => (
        <li key={r.id} data-record={r.kind}>
          <div><b>{nameOf(r.member_id)}</b> · {KIND_LABEL[r.kind]} <span className="st-chip">{STATUS_LABEL[r.status]}</span></div>
          <div className="st-muted">{r.reason} · {fmtDate(r.opened_on)}</div>
          {isAdmin && (
            <div className="st-row">
              <button className="st-btn st-btn-primary" onClick={() => act(() => rpc(supabase, 'admin_confirm_standing', { p_record: r.id, p_confirm: true, p_note: null }), r.kind === 'removal' ? 'Removed.' : 'Confirmed.')}>
                {r.kind === 'removal' ? 'Confirm removal' : 'Confirm'}</button>
              <button className="st-btn" onClick={() => act(() => rpc(supabase, 'admin_confirm_standing', { p_record: r.id, p_confirm: false, p_note: null }), 'Withdrawn.')}>Withdraw</button>
            </div>
          )}
        </li>))}</ul>
    </>
  )
}

function MemberPick({ rows, value, onChange }) {
  return (
    <select className="st-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Member">
      <option value="">Pick a member</option>
      {rows.map((r) => <option key={r.member_id} value={r.member_id}>{r.name}</option>)}
    </select>
  )
}

function Log({ rows, act, isAdmin }) {
  const [member, setMember] = useState('')
  const [rule, setRule] = useState('')
  const [level, setLevel] = useState('verbal')
  const [starts, setStarts] = useState(laToday())
  const [ends, setEnds] = useState('')
  const [day, setDay] = useState(laToday())
  const [reason, setReason] = useState('')
  const need = (fn) => () => (member ? fn() : null)
  return (
    <div className="st-grid">
      <section className="st-card">
        <h2 className="st-h2">Safety violation</h2>
        <MemberPick rows={rows} value={member} onChange={setMember} />
        <div className="st-chips">{SAFETY_RULES.map((r) => (
          <button type="button" key={r} className="st-pick" disabled={!member}
            onClick={need(() => act(() => rpc(supabase, 'staff_log_safety', { p_member: member, p_rule: r, p_note: null }), 'Safety violation logged. The family is told.'))}>{r}</button>))}</div>
        <p className="st-muted">One tap logs it. The third in a school year goes to Mr. Pina.</p>
      </section>
      <section className="st-card">
        <h2 className="st-h2">Discipline</h2>
        <MemberPick rows={rows} value={member} onChange={setMember} />
        <div className="st-chips">{['verbal', 'written', 'suspension', ...(isAdmin ? ['removal'] : [])].map((l) => (
          <button type="button" key={l} className={`st-pick${level === l ? ' on' : ''}`} onClick={() => setLevel(l)}>{l === 'verbal' ? 'Verbal warning' : l === 'written' ? 'Written warning' : l === 'suspension' ? 'Suspension' : 'Removal'}</button>))}</div>
        <input className="st-input" placeholder="The rule broken" value={rule} onChange={(e) => setRule(e.target.value)} />
        {level === 'suspension' && (
          <div className="st-row">
            <label className="st-label">From <input type="date" className="st-input" value={starts} onChange={(e) => setStarts(e.target.value)} /></label>
            <label className="st-label">Through <input type="date" className="st-input" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
          </div>
        )}
        <button className="st-btn st-btn-primary" disabled={!member || rule.trim().length < 3}
          onClick={() => act(() => rpc(supabase, 'staff_log_discipline', { p_member: member, p_level: level, p_rule: rule.trim(), p_note: null,
            p_starts: level === 'suspension' ? starts : null, p_ends: level === 'suspension' ? ends : null }), 'Logged.')}>Log it</button>
        <p className="st-muted">A suspension runs 1 to 4 weeks. Written warnings and up email the parents.</p>
      </section>
      <section className="st-card">
        <h2 className="st-h2">Void a day of hours</h2>
        <MemberPick rows={rows} value={member} onChange={setMember} />
        <input type="date" className="st-input" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
        <input className="st-input" placeholder="Reason, sent to the student and parents" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="st-btn" disabled={!member || reason.trim().length < 3}
          onClick={() => act(() => rpc(supabase, 'staff_void_day', { p_member: member, p_day: day, p_reason: reason.trim() }), (n) => `${n} session(s) voided.`)}>Void that day</button>
        <p className="st-muted">To void an idle session now, use Void on the Sign-outs page.</p>
      </section>
    </div>
  )
}

function Incidents({ nameOf, act, tick }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    supabase.from('incident_reports').select('*').order('reported_at', { ascending: false }).limit(50).then(({ data }) => setList(data ?? []))
  }, [tick])
  if (!list) return <p className="st-muted">Loading…</p>
  if (!list.length) return <p className="st-muted">No incidents logged.</p>
  const label = (k) => INCIDENT_KINDS.find((x) => x.key === k)?.label ?? k
  return (
    <ul className="st-list st-queue">{list.map((r) => (
      <li key={r.id} className={r.closed_at ? '' : 'unread'}>
        <div><b>{label(r.kind)}</b> · {fmtWhen(r.occurred_at)} · reported by {nameOf(r.reported_by)}</div>
        <div className="st-pre">{r.description}</div>
        <div className="st-row">
          <label className="st-check"><input type="checkbox" checked={r.parent_called} onChange={(e) => act(() => rpc(supabase, 'staff_update_incident', { p_incident: r.id, p_parent_called: e.target.checked, p_office_told: r.office_told, p_close: !!r.closed_at }), null)} /> Parent called</label>
          <label className="st-check"><input type="checkbox" checked={r.office_told} onChange={(e) => act(() => rpc(supabase, 'staff_update_incident', { p_incident: r.id, p_parent_called: r.parent_called, p_office_told: e.target.checked, p_close: !!r.closed_at }), null)} /> Front office told</label>
          {!r.closed_at && <button className="st-btn" onClick={() => act(() => rpc(supabase, 'staff_update_incident', { p_incident: r.id, p_parent_called: r.parent_called, p_office_told: r.office_told, p_close: true }), 'Closed.')}>Close</button>}
        </div>
      </li>))}</ul>
  )
}

function Weeks({ act, tick }) {
  const [list, setList] = useState([])
  const [week, setWeek] = useState('')
  const [kind, setKind] = useState('break')
  const [note, setNote] = useState('')
  useEffect(() => {
    supabase.from('team_weeks').select('*').gte('week_start', laToday()).order('week_start').then(({ data }) => setList(data ?? []))
  }, [tick])
  return (
    <section className="st-card">
      <h2 className="st-h2">School breaks</h2>
      <p className="st-muted">A break week never counts against anyone; a work week keeps the normal standards. Posted at least 14 days ahead, and fixed once it starts.</p>
      <div className="st-row">
        <label className="st-label">Monday <input type="date" className="st-input" value={week} onChange={(e) => setWeek(e.target.value)} /></label>
        <div className="st-chips">{['break', 'work'].map((k) => <button key={k} type="button" className={`st-pick${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{k === 'break' ? 'Break week' : 'Work week'}</button>)}</div>
        <input className="st-input" placeholder="Note (Thanksgiving)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="st-btn st-btn-primary" disabled={!week} onClick={() => act(() => rpc(supabase, 'staff_set_week', { p_week: week, p_kind: kind, p_note: note || null }), 'Posted.')}>Post</button>
      </div>
      <ul className="st-list">{list.map((w) => <li key={w.week_start}>{fmtDate(w.week_start)} · {w.kind === 'break' ? 'Break week' : 'Work week'}{w.note ? ` · ${w.note}` : ''}</li>)}</ul>
    </section>
  )
}

function Grades({ rows, act, isAdmin }) {
  const [date, setDate] = useState(laToday())
  const [below, setBelow] = useState({})
  if (!isAdmin) return <p className="st-muted">Mr. Pina records grade checks from FACTS. No grades are stored, only whether a GPA is under 2.0.</p>
  async function record() {
    for (const r of rows) {
      await rpc(supabase, 'admin_record_grade_check', { p_member: r.member_id, p_check: date, p_below: !!below[r.member_id], p_note: null })
    }
    return rows.length
  }
  return (
    <section className="st-card">
      <h2 className="st-h2">Grade check</h2>
      <p className="st-muted">Tick every member under 2.0 in FACTS, then record the check for everyone. Under 2.0 opens grades probation; 2.0 or above closes it.</p>
      <label className="st-label">Check date <input type="date" className="st-input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <ul className="st-list">{rows.map((r) => (
        <li key={r.member_id}><label className="st-check"><input type="checkbox" checked={!!below[r.member_id]} onChange={(e) => setBelow({ ...below, [r.member_id]: e.target.checked })} /> {r.name}: under 2.0</label></li>))}</ul>
      <button className="st-btn st-btn-primary" onClick={() => act(record, (n) => `Grade check recorded for ${n} members.`)}>Record the check</button>
    </section>
  )
}

function Fll({ nameOf, act, tick }) {
  const [teams, setTeams] = useState([])
  const [mentors, setMentors] = useState([])
  const [name, setName] = useState('')
  useEffect(() => {
    Promise.all([
      supabase.from('fll_teams').select('*').order('name'),
      supabase.from('fll_mentors').select('*').is('removed_at', null),
    ]).then(([t, m]) => { setTeams(t.data ?? []); setMentors(m.data ?? []) })
  }, [tick])
  return (
    <section className="st-card">
      <h2 className="st-h2">FLL teams</h2>
      <div className="st-row">
        <input className="st-input" placeholder="FLL team name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="st-btn st-btn-primary" disabled={!name.trim()} onClick={() => act(async () => {
          const { error } = await supabase.from('fll_teams').insert({ name: name.trim() })
          if (error) throw error
          setName('')
        }, 'Team added.')}>Add team</button>
      </div>
      <ul className="st-list">{teams.map((t) => {
        const ms = mentors.filter((m) => m.team_id === t.id)
        return (
          <li key={t.id}><b>{t.name}</b> <span className={ms.length < 2 ? 'st-warn' : 'st-muted'}>{ms.length} of 2 to 4 mentors</span>
            <ul className="st-sublist">{ms.map((m) => (
              <li key={m.id} className="st-row-between">{nameOf(m.member_id)}
                <button className="st-link" onClick={() => act(() => rpc(supabase, 'fll_leave', { p_team: t.id, p_member: m.member_id }), 'Removed.')}>Remove</button></li>))}</ul>
          </li>)
      })}</ul>
    </section>
  )
}

function Settings({ act, tick }) {
  const [s, setS] = useState(null)
  const [events, setEvents] = useState([])
  useEffect(() => {
    supabase.from('standing_settings').select('*').maybeSingle().then(({ data }) => setS(data))
    supabase.from('events').select('id, title, starts_at').in('kind', ['meeting', 'other', 'training']).gte('starts_at', new Date(Date.now() - 200 * 864e5).toISOString()).order('starts_at').then(({ data }) => setEvents(data ?? []))
  }, [tick])
  if (!s) return <p className="st-muted">Loading…</p>
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value })
  return (
    <section className="st-card">
      <h2 className="st-h2">Standing settings</h2>
      <label className="st-label">Standards apply from <input type="date" className="st-input" value={s.starts_on} onChange={set('starts_on')} /></label>
      <label className="st-label">Build season from <input type="date" className="st-input" value={s.build_season_start} onChange={set('build_season_start')} /></label>
      <label className="st-label">Build season through <input type="date" className="st-input" value={s.build_season_end} onChange={set('build_season_end')} /></label>
      {'kickoff_event_id' in s && (
        <label className="st-label">Kickoff event (missing it blocks the drive team and pit crew)
          <select className="st-input" value={s.kickoff_event_id ?? ''} onChange={set('kickoff_event_id')}>
            <option value="">Not set</option>
            {events.map((e) => <option key={e.id} value={e.id}>{new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {e.title}</option>)}
          </select>
        </label>
      )}
      <div className="st-row">
        <button className="st-btn st-btn-primary" onClick={() => act(async () => {
          const { error } = await supabase.from('standing_settings').update({ starts_on: s.starts_on, build_season_start: s.build_season_start, build_season_end: s.build_season_end,
            ...('kickoff_event_id' in s ? { kickoff_event_id: s.kickoff_event_id || null } : {}), updated_at: new Date().toISOString() }).eq('id', true)
          if (error) throw error
        }, 'Saved.')}>Save</button>
        <button className="st-btn" onClick={() => act(() => rpc(supabase, 'standing_evaluate', {}), (n) => `Evaluated: ${n} new week or month result(s).`)}>Run the check now</button>
      </div>
      <p className="st-muted">The check also runs every morning. A week or month is judged once, when it ends.</p>
    </section>
  )
}

