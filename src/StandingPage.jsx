import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from './supabase'
import {
  ABSENCE_REASONS, NEVER_EXCUSED, STANDING_LABEL, KIND_LABEL, STATUS_LABEL, DISCIPLINE_LABEL, INCIDENT_KINDS,
  reasonLabel, meetingShare, fmtHours, loadStanding, loadAbsenceEvents, absenceProblem, requestAbsence, rpc, errText,
} from './standing'
import './Standing.css'

// /standing: a member's own record (handbook Sections 6, 11, 12, 14, 15).
// ?member=<id> shows another member's to a linked parent or staff; the
// database refuses anyone else. Only the member asks for absences, appeals,
// joins FLL teams or reads their notices as read.

const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function StandingPage({ session }) {
  const [params] = useSearchParams()
  const uid = session?.user?.id
  const memberId = params.get('member') || uid
  const self = memberId === uid
  const [res, setRes] = useState(null)
  const [events, setEvents] = useState([])
  const [notices, setNotices] = useState([])
  const [teams, setTeams] = useState([])
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const r = await loadStanding(supabase, memberId)
    setRes(r)
    if (r.state !== 'ok') return
    if (self) {
      setEvents(await loadAbsenceEvents(supabase))
      const [{ data: n }, { data: t }, { data: fm }] = await Promise.all([
        supabase.from('member_notices').select('id, kind, title, body, created_at, read_at').eq('member_id', memberId).order('created_at', { ascending: false }).limit(20),
        supabase.from('fll_teams').select('id, name, active').eq('active', true).order('name'),
        supabase.from('fll_mentors').select('team_id').is('removed_at', null),
      ])
      setNotices(n ?? [])
      const counts = {}
      for (const x of fm ?? []) counts[x.team_id] = (counts[x.team_id] ?? 0) + 1
      setTeams((t ?? []).map((x) => ({ ...x, mentors: counts[x.id] ?? 0 })))
    }
  }, [memberId, self])

  useEffect(() => { load() }, [load])

  async function act(fn, done) {
    setMsg(null)
    try { await fn(); setMsg(done) } catch (e) { setMsg(errText(e)) }
    await load()
  }

  if (!res) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  if (res.state === 'missing') {
    return <div className="st-wrap"><h1 className="st-title">Standing</h1><p className="st-muted">Not set up yet. Standing starts when migration 0015 is pasted.</p></div>
  }
  if (res.state === 'error') {
    return <div className="st-wrap"><h1 className="st-title">Standing</h1><p className="st-error" role="alert">{errText(res.error)}</p></div>
  }
  const d = res.data
  const share = meetingShare(d.month)
  const weekOk = Number(d.week.hours) >= Number(d.week.required)
  const open = (d.records ?? []).filter((r) => r.status === 'open' || r.status === 'proposed')
  const past = (d.records ?? []).filter((r) => !(r.status === 'open' || r.status === 'proposed'))

  return (
    <div className="st-wrap">
      <div className="st-head">
        <div>
          <h1 className="st-title">{self ? 'My standing' : d.name}</h1>
          <p className="st-sub">Seen only by you, your parents and the mentors.</p>
        </div>
        <span className={`st-badge st-badge-${d.standing}`} data-standing={d.standing}>{STANDING_LABEL[d.standing]}</span>
      </div>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      {!d.applies && <p className="st-muted">The member standards apply to students. Nothing here counts for this account.</p>}

      <div className="st-grid">
        <section className="st-card" data-card="week">
          <h2 className="st-h2">This week</h2>
          <p className="st-big hud-tnum">{fmtHours(d.week.hours)} <span className="st-of">of {fmtHours(d.week.required)}</span></p>
          <div className="st-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (Number(d.week.hours) / Math.max(1, Number(d.week.required))) * 100)}%` }} className={weekOk ? 'ok' : ''} /></div>
          <p className="st-muted">Signed-in hours, Monday to Sunday. FLL counts separately.</p>
        </section>
        <section className="st-card" data-card="month">
          <h2 className="st-h2">Meetings this month</h2>
          {share ? (
            <>
              <p className="st-big hud-tnum">{share.effective} <span className="st-of">of {share.counted}</span></p>
              <p className={share.ok ? 'st-ok' : 'st-warn'}>{share.pct}% · {share.ok ? 'on track for 80%' : 'under 80%'}</p>
            </>
          ) : <p className="st-big">No meetings yet</p>}
          <p className="st-muted">Lates: {d.month.lates} (every 3rd is an absence). Missed: {d.month.misses}.</p>
        </section>
      </div>

      {open.length > 0 && (
        <section className="st-card st-alert" data-card="open">
          <h2 className="st-h2">Open now</h2>
          <ul className="st-list">
            {open.map((r) => (
              <li key={r.id}><b>{KIND_LABEL[r.kind]}</b> <span className="st-chip">{STATUS_LABEL[r.status]}</span>
                <div className="st-muted">{r.reason}{r.kind !== 'removal' && r.kind !== 'grades' ? ` · ${r.clean_weeks} of 4 clean weeks` : ''}</div></li>
            ))}
          </ul>
        </section>
      )}

      {self && <AbsenceForm events={events} absences={d.absences} onDone={(t) => { setMsg(t); load() }} />}
      {!self && (
        <section className="st-card"><h2 className="st-h2">Absence requests</h2><AbsenceList absences={d.absences} /></section>
      )}

      <div className="st-grid">
        <section className="st-card" data-card="safety">
          <h2 className="st-h2">Safety this school year <span className="hud-tnum">{d.safety.length}</span></h2>
          {d.safety.length === 0 ? <p className="st-muted">None.</p> : (
            <ul className="st-list">{d.safety.map((s) => <li key={s.id}>{fmtDay(s.logged_at)} · {s.rule}</li>)}</ul>
          )}
        </section>
        <section className="st-card" data-card="discipline">
          <h2 className="st-h2">Discipline this school year</h2>
          {d.discipline.length === 0 ? <p className="st-muted">None.</p> : (
            <ul className="st-list">{d.discipline.map((x) => (
              <li key={x.id}>
                <b>{DISCIPLINE_LABEL[x.level]}</b> · {fmtDay(x.created_at)} · {x.rule}
                {x.level === 'suspension' && <div className="st-muted">{fmtDate(x.starts_on)} to {fmtDate(x.ends_on)}</div>}
                {x.appeal_at && <div className="st-muted">Appealed{x.appeal_decision ? `: ${x.appeal_decision === 'upheld' ? 'the warning stands' : 'withdrawn'}` : ', waiting for Mr. Pina'}</div>}
                {self && x.level === 'written' && !x.appeal_at && Date.now() - Date.parse(x.created_at) < 7 * 86400000 && (
                  <Appeal onSend={(note) => act(() => rpc(supabase, 'appeal_discipline', { p_record: x.id, p_note: note }), 'Appeal sent to Mr. Pina.')} />
                )}
              </li>))}</ul>
          )}
        </section>
      </div>

      <div className="st-grid">
        <section className="st-card" data-card="grades">
          <h2 className="st-h2">Grade checks</h2>
          {d.grades.length === 0 ? <p className="st-muted">No grade check yet. Mr. Pina checks FACTS after each progress report and report card.</p> : (
            <ul className="st-list">{d.grades.map((g) => <li key={g.id}>{fmtDate(g.check_date)} · {g.below ? 'Under 2.0' : '2.0 or above'}</li>)}</ul>
          )}
        </section>
        <section className="st-card" data-card="weeks">
          <h2 className="st-h2">Recent weeks</h2>
          {d.weeks.length === 0 ? <p className="st-muted">Weeks are judged from {fmtDate(d.since)}.</p> : (
            <ul className="st-list st-weeks">{d.weeks.map((w) => (
              <li key={w.week_start} className={w.ok ? '' : 'bad'}>
                <span>{fmtDate(w.week_start)}</span>
                <span className="hud-tnum">{w.excused ? 'excused' : w.suspended ? 'suspended' : `${fmtHours(w.hours)} / ${fmtHours(w.required)}${w.misses ? ` · ${w.misses} missed` : ''}`}</span>
              </li>))}</ul>
          )}
        </section>
      </div>

      {self && <FllCard teams={teams} mine={d.fll} onAct={act} />}

      {self && notices.length > 0 && (
        <section className="st-card" data-card="notices">
          <h2 className="st-h2">Notices</h2>
          <ul className="st-list">{notices.map((n) => (
            <li key={n.id} className={n.read_at ? '' : 'unread'}>
              <b>{n.title}</b> <span className="st-muted">{fmtDay(n.created_at)}</span>
              {n.body && <div className="st-pre">{n.body}</div>}
              {!n.read_at && <button className="st-link" onClick={() => act(() => rpc(supabase, 'mark_notice_read', { p_notice: n.id }), null)}>Mark read</button>}
            </li>))}</ul>
        </section>
      )}

      {self && <IncidentForm onDone={(t) => setMsg(t)} />}

      {past.length > 0 && (
        <section className="st-card"><h2 className="st-h2">Past records</h2>
          <ul className="st-list">{past.map((r) => <li key={r.id}>{KIND_LABEL[r.kind]} · {STATUS_LABEL[r.status]} · {fmtDate(r.opened_on)}{r.closed_on ? ` to ${fmtDate(r.closed_on)}` : ''}</li>)}</ul>
        </section>
      )}
      <p className="st-muted">The rules: <Link to="/handbook">handbook</Link>, Sections 6, 7 and 11.</p>
    </div>
  )
}

function AbsenceList({ absences, onWithdraw }) {
  if (!absences?.length) return <p className="st-muted">None.</p>
  return (
    <ul className="st-list">{absences.map((a) => (
      <li key={a.id} data-absence={a.status}>
        <b>{a.title}</b> · {fmtWhen(a.starts_at)} <span className={`st-chip st-chip-${a.status}`}>{a.status}</span>
        <div className="st-muted">{reasonLabel(a.reason)}{a.emergency ? ' · emergency' : ''}{a.decision_note ? ` · ${a.decision_note}` : ''}</div>
        {onWithdraw && a.status === 'pending' && <button className="st-link" onClick={() => onWithdraw(a.id)}>Withdraw</button>}
      </li>))}</ul>
  )
}

function AbsenceForm({ events, absences, onDone }) {
  const [eventId, setEventId] = useState('')
  const [reason, setReason] = useState('')
  const [emergency, setEmergency] = useState(false)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)
  const ev = events.find((e) => e.id === eventId)

  async function send(e) {
    e.preventDefault()
    const p = absenceProblem(ev, { reason, emergency })
    setProblem(p)
    if (p) return
    setBusy(true)
    try {
      await requestAbsence(supabase, { eventId, reason, note, emergency })
      setEventId(''); setReason(''); setNote(''); setEmergency(false)
      onDone('Absence request sent. A mentor approves or denies it; one still unanswered when the meeting starts counts as approved.')
    } catch (err) { setProblem(errText(err)) }
    setBusy(false)
  }
  async function withdraw(id) {
    try { await rpc(supabase, 'withdraw_absence', { p_request: id }); onDone('Withdrawn.') } catch (err) { onDone(errText(err)) }
  }

  return (
    <section className="st-card" data-card="absence">
      <h2 className="st-h2">Absences</h2>
      <form className="st-form" onSubmit={send} noValidate>
        <label className="st-label" htmlFor="st-ev">Which meeting or event</label>
        <select id="st-ev" className="st-input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">Pick one</option>
          {events.map((x) => <option key={x.id} value={x.id}>{fmtWhen(x.starts_at)} · {x.title}{x.mandatory || x.kind === 'competition' ? ' (mandatory)' : ''}</option>)}
        </select>
        <span className="st-label">Reason</span>
        <div className="st-chips" role="radiogroup">
          {ABSENCE_REASONS.map((r) => (
            <button type="button" key={r.key} role="radio" aria-checked={reason === r.key}
              className={`st-pick${reason === r.key ? ' on' : ''}`} onClick={() => setReason(r.key)}>{r.label}</button>
          ))}
        </div>
        <label className="st-check"><input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} />
          <span>Emergency: my own illness or injury, or a death, hospital stay or serious illness in my close family. Filed by 11:59 PM the next school day.</span></label>
        <input className="st-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the mentor (optional)" maxLength={500} />
        {problem && <p className="st-error" role="alert">{problem}</p>}
        <button className="st-btn st-btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Ask for the absence'}</button>
        <p className="st-muted">Ask at least 24 hours ahead. {NEVER_EXCUSED}</p>
      </form>
      <AbsenceList absences={absences} onWithdraw={withdraw} />
    </section>
  )
}

function Appeal({ onSend }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  if (!open) return <button className="st-link" onClick={() => setOpen(true)}>Appeal to Mr. Pina</button>
  return (
    <div className="st-row">
      <input className="st-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it should be withdrawn" />
      <button className="st-btn" onClick={() => onSend(note)}>Send appeal</button>
    </div>
  )
}

function FllCard({ teams, mine, onAct }) {
  const mineIds = new Set((mine ?? []).map((m) => m.team_id))
  if (!teams.length && !mineIds.size) return null
  return (
    <section className="st-card" data-card="fll">
      <h2 className="st-h2">FLL mentoring</h2>
      <p className="st-muted">Every FLL team gets 2 to 4 FRC mentors. Go to at least one of its sessions every week; 2 weeks in a row missed and you come off the team.</p>
      <ul className="st-list">{teams.map((t) => (
        <li key={t.id} className="st-row-between">
          <span><b>{t.name}</b> <span className="st-muted">{t.mentors} of 4</span></span>
          {mineIds.has(t.id)
            ? <button className="st-btn" onClick={() => onAct(() => rpc(supabase, 'fll_leave', { p_team: t.id, p_member: null }), `Left ${t.name}.`)}>Leave</button>
            : <button className="st-btn" disabled={t.mentors >= 4} onClick={() => onAct(() => rpc(supabase, 'fll_join', { p_team: t.id }), `Signed up for ${t.name}.`)}>Sign up</button>}
        </li>))}</ul>
    </section>
  )
}

function IncidentForm({ onDone }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('near_miss')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <button className="st-btn st-btn-wide" onClick={() => setOpen(true)}>Report an injury or near miss</button>
  async function send() {
    if (text.trim().length < 3) return
    setBusy(true)
    try {
      await rpc(supabase, 'report_incident', { p_kind: kind, p_member: null, p_description: text.trim(), p_occurred: null })
      setOpen(false); setText(''); onDone('Logged. Mentors are told now. Tell the nearest adult in person too.')
    } catch (e) { onDone(errText(e)) }
    setBusy(false)
  }
  return (
    <section className="st-card" data-card="incident">
      <h2 className="st-h2">Report an injury or near miss</h2>
      <p className="st-muted">Hurt? Stop, make the area safe, get the nearest adult. For a serious injury the adult calls 911 first.</p>
      <div className="st-chips">{INCIDENT_KINDS.map((k) => (
        <button type="button" key={k.key} className={`st-pick${kind === k.key ? ' on' : ''}`} onClick={() => setKind(k.key)}>{k.label}</button>))}</div>
      <textarea className="st-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, where, and who was there" />
      <button className="st-btn st-btn-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Log it'}</button>
    </section>
  )
}
