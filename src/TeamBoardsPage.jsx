import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { isSchemaMissing } from './schemaMissing'
import { SUBTEAMS } from './subteams'
import { sessionsFromEvents } from './hoursUtils'
import { resolveCurrentSeason } from './seasons'
import { fetchAllRows } from './fetchAllRows'
import { errText, fmtHours } from './standing'
import './Standing.css'

// Three small team boards (migration 0017 for the last two):
//   /leaderboard     the hours leaderboard every member sees (Section 18)
//   /status-reports  the weekly green / yellow / red sub-team ratings (13)
//   /no-photo        the media sub-team's no-photo list (17)

export default function TeamBoardsPage({ board, session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  if (board === 'leaderboard') return <Leaderboard uid={session?.user?.id} />
  if (board === 'status') return <StatusReports canReport={isStaff || hasRole('lead')} />
  return <NoPhoto isStaff={isStaff} />
}

const ADULT_ROLES = ['mentor', 'admin', 'parent']

function Leaderboard({ uid }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    (async () => {
      const [{ data: seasons }, { data: profs }, { data: roleRows }] = await Promise.all([
        supabase.from('seasons').select('*'),
        supabase.from('profiles').select('id, full_name, nickname, status, approved'),
        supabase.from('member_roles').select('member_id, role'),
      ])
      // Students compete with students. Mentors, admins and parents are listed
      // apart and never ranked against a student. A student lead is a student.
      const adults = new Set((roleRows ?? []).filter((r) => ADULT_ROLES.includes(r.role)).map((r) => r.member_id))
      const season = resolveCurrentSeason(seasons ?? [])
      const from = season ? new Date(`${season.start_date}T00:00:00-07:00`).toISOString() : new Date(Date.now() - 365 * 864e5).toISOString()
      const { data: ev } = await fetchAllRows(() => supabase.from('attendance_events').select('id, user_id, type, event_time, category')
        .gte('event_time', from).order('event_time').order('id'))
      const byUser = new Map()
      for (const e of ev ?? []) byUser.set(e.user_id, [...(byUser.get(e.user_id) ?? []), e])
      const active = (profs ?? []).filter((p) => p.approved && (p.status ?? 'active') === 'active')
      setRows(active.map((p) => {
        let build = 0, vol = 0
        for (const s of sessionsFromEvents(byUser.get(p.id) ?? [])) { if (s.category === 'volunteer') vol += s.ms; else build += s.ms }
        return { id: p.id, name: displayName(p), build: build / 3600000, vol: vol / 3600000, adult: adults.has(p.id) }
      }).filter((r) => r.build + r.vol > 0).sort((a, b) => b.build - a.build))
    })()
  }, [])
  if (!rows) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  const hrs = (r) => `${fmtHours(Math.round(r.build * 10) / 10)}${r.vol > 0 ? ` · FLL ${fmtHours(Math.round(r.vol * 10) / 10)}` : ''}`
  const students = rows.filter((r) => !r.adult)
  const adults = rows.filter((r) => r.adult)
  return (
    <div className="st-wrap">
      <h1 className="st-title">Hours leaderboard</h1>
      <p className="st-sub">Student signed-in hours this season. Good work is praised in public; problems are handled in private.</p>
      <ol className="st-list st-board" data-board="students">{students.map((r, i) => (
        <li key={r.id} className={`st-row-between${r.id === uid ? ' unread' : ''}`} data-rank={i + 1} data-member={r.id}>
          <span><b className="hud-tnum">{i + 1}.</b> {r.name}</span>
          <span className="hud-tnum">{hrs(r)}</span>
        </li>))}</ol>
      {adults.length > 0 && (
        <>
          <h2 className="st-h2">Mentors and adults</h2>
          <p className="st-muted">Not ranked, and not part of the student board.</p>
          <ul className="st-list" data-board="adults">{adults.map((r) => (
            <li key={r.id} className={`st-row-between${r.id === uid ? ' unread' : ''}`} data-member={r.id}>
              <span>{r.name}</span>
              <span className="hud-tnum">{hrs(r)}</span>
            </li>))}</ul>
        </>
      )}
    </div>
  )
}

const mondayISO = () => {
  const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
const COLORS = [['green', 'On track'], ['yellow', 'At risk'], ['red', 'Late']]

function StatusReports({ canReport }) {
  const [rows, setRows] = useState(null)
  const [missing, setMissing] = useState(false)
  const [notes, setNotes] = useState({})
  const [msg, setMsg] = useState(null)
  const load = useCallback(async () => {
    const since = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10)
    const { data, error } = await supabase.from('subteam_status_reports').select('*').gte('week_start', since).order('week_start', { ascending: false })
    if (error) { if (isSchemaMissing(error)) setMissing(true); return }
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])
  if (missing) return <div className="st-wrap"><h1 className="st-title">Sub-team status</h1><p className="st-muted">Not set up yet.</p></div>
  if (!rows) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  const wk = mondayISO()
  const weeks = [...new Set(rows.map((r) => r.week_start))].filter((w) => w !== wk).slice(0, 4)
  const at = (w, t) => rows.find((r) => r.week_start === w && r.subteam === t)
  async function set(t, status) {
    const { error } = await supabase.rpc('set_subteam_status', { p_subteam: t, p_status: status, p_note: notes[t] ?? null })
    setMsg(error ? errText(error) : `${t}: saved.`)
    load()
  }
  return (
    <div className="st-wrap st-wide">
      <h1 className="st-title">Sub-team status</h1>
      <p className="st-sub">Leaders meet weekly and rate each sub-team: on track, at risk, or late. Team leaders report back at the next meeting.</p>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      <ul className="st-list">{SUBTEAMS.map((t) => {
        const cur = at(wk, t)
        return (
          <li key={t} data-subteam={t}>
            <div className="st-row-between"><b>{t}</b>
              <span className="st-row">{weeks.map((w) => { const r = at(w, t); return <span key={w} className={`st-dot st-dot-${r?.status ?? 'none'}`} title={`${w}: ${r?.status ?? 'no report'}`} /> })}</span></div>
            {canReport ? (
              <div className="st-row">
                {COLORS.map(([c, label]) => <button key={c} className={`st-pick st-pick-${c}${cur?.status === c ? ' on' : ''}`} onClick={() => set(t, c)}>{label}</button>)}
                <input className="st-input" placeholder="Why (optional)" value={notes[t] ?? cur?.note ?? ''} onChange={(e) => setNotes({ ...notes, [t]: e.target.value })} />
              </div>
            ) : <div className="st-muted">{cur ? `${COLORS.find((c) => c[0] === cur.status)?.[1]}${cur.note ? `: ${cur.note}` : ''}` : 'No report this week'}</div>}
          </li>)
      })}</ul>
    </div>
  )
}

function NoPhoto({ isStaff }) {
  const [list, setList] = useState(null)
  const [members, setMembers] = useState([])
  const [pick, setPick] = useState('')
  const [missing, setMissing] = useState(false)
  const [msg, setMsg] = useState(null)
  const load = useCallback(async () => {
    const [{ data, error }, { data: profs }] = await Promise.all([
      supabase.from('media_exceptions').select('*'),
      supabase.from('profiles').select('id, full_name, nickname, status, approved'),
    ])
    if (error) { if (isSchemaMissing(error)) setMissing(true); return }
    setList(data ?? [])
    setMembers((profs ?? []).filter((p) => p.approved && (p.status ?? 'active') === 'active').map((p) => ({ id: p.id, name: displayName(p) })).sort((a, b) => a.name.localeCompare(b.name)))
  }, [])
  useEffect(() => { load() }, [load])
  if (missing) return <div className="st-wrap"><h1 className="st-title">No-photo list</h1><p className="st-muted">Not set up yet.</p></div>
  if (!list) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  const nameOf = (id) => members.find((m) => m.id === id)?.name ?? 'Member'
  async function set(id, on) {
    const { error } = await supabase.rpc('staff_set_media_exception', { p_member: id, p_on: on, p_note: null })
    setMsg(error ? errText(error) : on ? 'Added.' : 'Removed.')
    load()
  }
  return (
    <div className="st-wrap">
      <h1 className="st-title">No-photo list</h1>
      <p className="st-sub">Families who need an exception tell a mentor. Seen by mentors and the media sub-team. Team posts never pair a photo with a full name.</p>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      {list.length === 0 ? <p className="st-muted">No one on the list.</p> : (
        <ul className="st-list">{list.map((x) => (
          <li key={x.member_id} className="st-row-between" data-nophoto={x.member_id}><span><b>{nameOf(x.member_id)}</b>{x.note ? ` · ${x.note}` : ''}</span>
            {isStaff && <button className="st-link" onClick={() => set(x.member_id, false)}>Remove</button>}</li>))}</ul>
      )}
      {isStaff && (
        <div className="st-row">
          <select className="st-input" aria-label="Member" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add a member</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="st-btn st-btn-primary" disabled={!pick} onClick={() => set(pick, true)}>Add</button>
        </div>
      )}
    </div>
  )
}
