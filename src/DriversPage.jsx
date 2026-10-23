import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { displayName } from './names'
import { resolveCurrentSeason } from './seasons'
import {
  SCORE_RULES, SESSION_KINDS, CRITERIA, leaderboard, inSeason, laDate, kindLabel, isReal,
  fmtMinutes, fmtHours, sessionProblem, ratingMean,
} from './driverScore'
import './BatteriesPage.css'
import './Drivers.css'

// The driver leaderboard (migration 0029, ledger 0020). Every write is a
// database function through writeVia with NO direct fallback: before 0029 is
// pasted the page reads "not set up yet", and a write that finds no function
// is reported as not set up, never as saved. The Driver Score is computed in
// src/driverScore.js and only there.

const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const todayLA = () => laDate(new Date().toISOString())
const pct = (x) => `${Math.round(x * 100)}%`

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The driver leaderboard is not set up yet. Nothing was saved.' }
  return r.data
}

export default function DriversPage({ session, hasRole = () => false }) {
  const uid = session?.user?.id
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const parentOnly = hasRole('parent') && !isStaff
  const [s, setS] = useState({ loading: true })
  const [seasonId, setSeasonId] = useState(null) // null until loaded; 'all' for All time
  const [msg, setMsg] = useState('')
  const [openId, setOpenId] = useState(null)
  const formRef = useRef(null)

  const load = useCallback(async () => {
    const [ds, sc, rt, se] = await Promise.all([
      supabase.from('drive_sessions').select('*').order('session_date', { ascending: false }).limit(5000),
      supabase.rpc('driver_rating_scores'),
      supabase.from('driver_ratings').select('*').order('rated_at', { ascending: false }).limit(2000),
      supabase.from('seasons').select('id, name, start_date, end_date').order('start_date', { ascending: false }),
    ])
    const e = ds.error || sc.error
    if (e) { setS({ loading: false, missing: isSchemaMissing(e), error: isSchemaMissing(e) ? null : e }); return }
    const ids = new Set([...(ds.data ?? []).map((x) => x.member_id), ...(sc.data ?? []).map((x) => x.driver_id), ...(sc.data ?? []).map((x) => x.coach_id)])
    if (uid) ids.add(uid)
    let roster = []
    if (isStaff) {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('id, full_name, nickname, approved, status'),
        supabase.from('member_roles').select('member_id, role').in('role', ['student', 'mentor', 'lead', 'admin']),
      ])
      const can = new Set((r.data ?? []).map((x) => x.member_id))
      roster = (p.data ?? []).filter((x) => x.approved && (x.status ?? 'active') === 'active' && can.has(x.id))
        .map((x) => ({ id: x.id, name: displayName(x) })).sort((a, b) => a.name.localeCompare(b.name))
      for (const m of roster) ids.delete(m.id)
    }
    const p = ids.size ? await supabase.from('profiles').select('id, full_name, nickname').in('id', [...ids]) : { data: [] }
    const names = new Map([...roster.map((m) => [m.id, m.name]), ...(p.data ?? []).map((x) => [x.id, displayName(x)])])
    const seasons = se.data ?? []
    setS({ loading: false, sessions: ds.data ?? [], scores: sc.data ?? [], ratings: rt.error ? [] : rt.data ?? [], seasons, names, roster })
    setSeasonId((cur) => cur ?? (resolveCurrentSeason(seasons)?.id ?? 'all'))
  }, [uid, isStaff])
  useEffect(() => { if (!parentOnly) load() }, [load, parentOnly])

  const season = useMemo(() => (s.seasons ?? []).find((x) => x.id === seasonId) ?? null, [s.seasons, seasonId])
  const nameOf = useCallback((id) => s.names?.get(id) ?? '', [s.names])
  const board = useMemo(() => (s.sessions ? leaderboard(s.sessions, s.scores, season, nameOf) : []), [s.sessions, s.scores, season, nameOf])

  if (parentOnly) return <main className="ba-wrap"><h1 className="ba-title">Drivers</h1><p className="ba-muted">The driver leaderboard is for students and staff.</p><Link className="ba-link" to="/dashboard">Back to Home</Link></main>
  if (s.loading) return <main className="ba-wrap"><h1 className="ba-title">Drivers</h1><p className="ba-muted" role="status">Loading the driver leaderboard…</p></main>
  if (s.missing) return <main className="ba-wrap dr-wrap"><Link className="ba-back" to="/robot">← Robot</Link><h1 className="ba-title">Drivers</h1><div className="ba-empty"><h2>Not set up yet</h2><p>The driver leaderboard starts when migration 0029 is pasted into Supabase. Everything else in the app works as before.</p></div></main>
  if (s.error) return <main className="ba-wrap"><h1 className="ba-title">Drivers</h1><p className="ba-error" role="alert">{errText(s.error)}</p><button className="ba-btn" onClick={load}>Try again</button></main>

  const mine = s.sessions.filter((x) => x.member_id === uid && inSeason(x.session_date, season))
  const counted = s.sessions.filter((x) => !x.voided_at && inSeason(x.session_date, season))
  const realMin = counted.filter((x) => isReal(x.kind)).reduce((a, x) => a + x.minutes, 0)
  const simMin = counted.filter((x) => x.kind === 'mosim').reduce((a, x) => a + x.minutes, 0)
  const me = board.find((r) => r.id === uid)
  const opened = openId ? { id: openId, name: nameOf(openId) || 'Member', row: board.find((r) => r.id === openId) } : null
  const after = async (text) => { setMsg(text); await load() }

  return (
    <main className="ba-wrap dr-wrap" data-page="drivers">
      <Link className="ba-back" to="/robot">← Robot</Link>
      <header className="ba-head">
        <div>
          <span className="ba-eyebrow">Drive team</span>
          <h1 className="ba-title">Drivers</h1>
          <p className="ba-sub">Real robot time, MoSim practice and coach ratings, one Driver Score per season.</p>
        </div>
        <div className="ba-head-actions">
          <button className="ba-primary" onClick={() => { formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); formRef.current?.querySelector('input, button')?.focus({ preventScroll: true }) }}>Log a session</button>
        </div>
      </header>

      <div className="dr-bar">
        <label className="ba-field dr-season"><span>Season</span>
          <select value={seasonId ?? 'all'} onChange={(e) => setSeasonId(e.target.value)} aria-label="Season">
            {s.seasons.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="all">All time</option>
          </select>
        </label>
        <div className="ba-tally dr-tally" aria-label="Season summary">
          <span><b className="hud-tnum">{board.length}</b> drivers</span>
          <span><b className="hud-tnum">{fmtMinutes(realMin)}</b> robot</span>
          <span><b className="hud-tnum">{fmtMinutes(simMin)}</b> MoSim</span>
          {me && <span className="dr-tally-me"><b className="hud-tnum">#{me.rank}</b> you</span>}
        </div>
      </div>
      {msg && <p className="ba-msg" role="status">{msg}</p>}

      <section className="dr-board-wrap" aria-label="Driver leaderboard">
        {!board.length ? (
          <div className="ba-empty"><h2>No drive time yet</h2><p>{season ? `Nothing logged in ${season.name}. Log the first session below, or switch to All time.` : 'Log the first session below.'}</p></div>
        ) : (
          <ol className="dr-board">
            <li className="dr-row dr-row-head" aria-hidden="true">
              <span className="dr-rank">#</span><span className="dr-name">Driver</span><span className="dr-score">Score</span>
              <span className="dr-real">Robot</span><span className="dr-sim">MoSim</span><span className="dr-coach">Coach</span>
            </li>
            {board.map((r) => (
              <li key={r.id} className={`dr-row${r.id === uid ? ' dr-row-me' : ''}${r.rank === 1 ? ' dr-row-top' : ''}`} data-driver={r.name}>
                <button className="dr-open" onClick={() => setOpenId(r.id)} aria-label={`${r.name}: Driver Score ${r.score}, open details`}>
                  <span className="dr-rank hud-tnum">{r.rank}</span>
                  <span className="dr-name">{r.name}{r.id === uid && <i className="dr-you">you</i>}</span>
                  <span className="dr-score hud-tnum" data-score={r.score}>{r.score}</span>
                  <span className="dr-real hud-tnum"><i>Robot</i>{fmtHours(r.realHours)}</span>
                  <span className="dr-sim hud-tnum"><i>MoSim</i>{fmtHours(r.simHours)}</span>
                  <span className="dr-coach hud-tnum"><i>Coach</i>{r.coachAvg == null ? <em>Unrated</em> : `${r.coachAvg.toFixed(1)} / 5`}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <details className="ba-rules dr-formula">
        <summary>How the Driver Score works</summary>
        <p>One number from 0 to 100 per season. Half is practice, half is what the coaches see.</p>
        <ul>
          <li><b>Practice hours</b> = real robot hours (practice field, match, test) + {SCORE_RULES.SIM_WEIGHT} × MoSim hours. MoSim counts, but less than the real robot.</li>
          <li><b>Experience</b> = 1 − e<sup>−hours / {SCORE_RULES.HOURS_SCALE}</sup>. The first hours count most: {SCORE_RULES.HOURS_SCALE} hours is {pct(1 - Math.exp(-1))}, {SCORE_RULES.HOURS_SCALE * 2} is {pct(1 - Math.exp(-2))}, {SCORE_RULES.HOURS_SCALE * 3} is {pct(1 - Math.exp(-3))}.</li>
          <li><b>Coach</b> = the average of each coach's newest rating this season (the mean of control, awareness, scoring, defense and consistency, 1 to 5), scaled to 0 to 1. Unrated counts as 0.</li>
          <li><b>Driver Score</b> = 100 × ({SCORE_RULES.EXPERIENCE_WEIGHT} × experience + {SCORE_RULES.COACH_WEIGHT} × coach).</li>
        </ul>
        <p>A voided session counts for nothing. A MoSim score is shown but not scored. These weights are proposed defaults.</p>
      </details>

      <div className="dr-cols">
        <section className="dr-panel" ref={formRef} aria-labelledby="dr-log-h">
          <h2 className="ba-h3" id="dr-log-h">Log a session</h2>
          <SessionForm uid={uid} isStaff={isStaff} roster={s.roster} onSaved={after} />
        </section>
        <section className="dr-panel" aria-labelledby="dr-mine-h">
          <h2 className="ba-h3" id="dr-mine-h">My drive log {season ? <span className="ba-muted">{season.name}</span> : <span className="ba-muted">All time</span>}</h2>
          {!mine.length ? <p className="ba-muted">No sessions {season ? 'this season' : 'yet'}. Log your first one.</p> : (
            <SessionList list={mine} uid={uid} isStaff={isStaff} nameOf={nameOf} onSaved={after} />
          )}
        </section>
      </div>

      {isStaff && (
        <section className="dr-panel dr-staff" aria-labelledby="dr-rate-h">
          <h2 className="ba-h3" id="dr-rate-h">Rate a driver <span className="ba-muted">staff</span></h2>
          <RateForm uid={uid} roster={s.roster} onSaved={after} />
        </section>
      )}

      {opened && <DriverSheet d={opened} uid={uid} isStaff={isStaff} sessions={s.sessions.filter((x) => x.member_id === opened.id && inSeason(x.session_date, season))}
        ratings={s.ratings.filter((x) => x.driver_id === opened.id)} scores={s.scores.filter((x) => x.driver_id === opened.id)} season={season} nameOf={nameOf}
        onClose={() => setOpenId(null)} onSaved={after} />}
    </main>
  )
}

function SessionForm({ uid, isStaff, roster = [], start = null, onSaved, onCancel }) {
  const blank = { member: uid, kind: 'practice_field', minutes: '', date: todayLA(), score: '', notes: '' }
  const [v, setV] = useState(start ? { member: start.member_id, kind: start.kind, minutes: String(start.minutes), date: start.session_date, score: start.sim_score == null ? '' : String(start.sim_score), notes: start.notes ?? '' } : blank)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(e) {
    e.preventDefault()
    const problem = sessionProblem(v)
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    const score = v.kind === 'mosim' && v.score !== '' ? Number(v.score) : null
    try {
      if (start) done(await writeVia(supabase, 'driver_edit_session', { p_session: start.id, p_date: v.date, p_minutes: Number(v.minutes), p_kind: v.kind, p_score: score, p_notes: v.notes.trim() || null }))
      else done(await writeVia(supabase, 'driver_log_session', { p_member: v.member && v.member !== uid ? v.member : null, p_date: v.date, p_minutes: Number(v.minutes), p_kind: v.kind, p_score: score, p_notes: v.notes.trim() || null }))
      const forName = v.member && v.member !== uid ? roster.find((m) => m.id === v.member)?.name ?? 'the driver' : null
      await onSaved(start ? 'Session corrected.' : `${fmtMinutes(Number(v.minutes))} of ${kindLabel(v.kind)} logged${forName ? ` for ${forName}` : ''}.`)
      if (!start) setV({ ...blank, kind: v.kind, member: v.member })
    } catch (x) { setErr(errText(x)) }
    setSaving(false)
  }
  return (
    <form className="ba-form dr-form" onSubmit={save}>
      {isStaff && !start && roster.length > 0 && (
        <label className="ba-field"><span>Driver</span>
          <select value={v.member ?? ''} onChange={(e) => setV({ ...v, member: e.target.value })}>
            {!roster.some((m) => m.id === uid) && <option value={uid}>Me</option>}
            {roster.map((m) => <option key={m.id} value={m.id}>{m.id === uid ? `${m.name} (me)` : m.name}</option>)}
          </select>
        </label>
      )}
      <fieldset className="ba-seg"><legend>What you drove</legend>
        <div className="ba-seg-opts">{SESSION_KINDS.map((k) => <button type="button" key={k.key} className={`dr-kind-${k.key}`} aria-pressed={v.kind === k.key} onClick={() => setV({ ...v, kind: k.key, score: k.key === 'mosim' ? v.score : '' })}>{k.label}</button>)}</div>
      </fieldset>
      <div className="ba-grid2">
        <label className="ba-num"><span>Minutes</span><span className="ba-num-box"><input inputMode="numeric" pattern="[0-9]*" value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value.replace(/[^0-9]/g, '') })} aria-label="Minutes" placeholder="30" /><i>min</i></span></label>
        <label className="ba-field"><span>Date</span><input type="date" value={v.date} max={todayLA()} onChange={(e) => setV({ ...v, date: e.target.value })} aria-label="Date" /></label>
      </div>
      {v.kind === 'mosim' && <label className="ba-field"><span>MoSim score (optional)</span><input inputMode="numeric" value={v.score} onChange={(e) => setV({ ...v, score: e.target.value.replace(/[^0-9]/g, '') })} aria-label="MoSim score" /></label>}
      <label className="ba-field"><span>Notes (optional)</span><input value={v.notes} maxLength={1000} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder={v.kind === 'mosim' ? 'Defense drills, 2 v 3' : 'Figure eights, cycling'} aria-label="Notes" /></label>
      {err && <p className="ba-error" role="alert">{err}</p>}
      <div className="ba-row">
        <button className="ba-primary dr-save" type="submit" disabled={saving}>{saving ? 'Saving…' : start ? 'Save correction' : 'Log session'}</button>
        {onCancel && <button className="ba-btn" type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

function SessionList({ list, uid, isStaff, nameOf, onSaved, showLogger = false }) {
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  async function voidIt(x) {
    setErr('')
    try { done(await writeVia(supabase, 'driver_void_drive', { p_session: x.id, p_reason: null })); await onSaved('Session voided. It stays on the record and counts for nothing.') } catch (e) { setErr(errText(e)) }
  }
  const canVoid = (x) => !x.voided_at && (isStaff || (x.member_id === uid && Date.parse(x.created_at) > Date.now() - 24 * 3600_000))
  return (
    <>
      {err && <p className="ba-error" role="alert">{err}</p>}
      <ol className="ba-history dr-sessions">
        {list.map((x) => (
          <li key={x.id} className={x.voided_at ? 'dr-void' : ''} data-session={x.id}>
            {editing === x.id ? <SessionForm uid={uid} isStaff start={x} onSaved={async (t) => { setEditing(null); await onSaved(t) }} onCancel={() => setEditing(null)} /> : (
              <>
                <div className="ba-run-top">
                  <strong><span className={`dr-chip dr-chip-${isReal(x.kind) ? 'real' : 'sim'}`}>{kindLabel(x.kind)}</span> <span className="hud-tnum">{fmtMinutes(x.minutes)}</span>{x.sim_score != null && <span className="ba-muted"> · score {x.sim_score}</span>}</strong>
                  <span className="hud-mono">{day(x.session_date)}</span>
                </div>
                {x.notes && <p className="ba-run-note">{x.notes}</p>}
                <div className="ba-run-foot">
                  <span className="ba-muted">{x.voided_at ? `Void${x.void_reason ? `: ${x.void_reason}` : ''}` : showLogger && x.logged_by && x.logged_by !== x.member_id ? `Logged by ${nameOf(x.logged_by) || 'staff'}` : ''}</span>
                  <span className="dr-actions">
                    {isStaff && !x.voided_at && <button className="ba-link-btn" onClick={() => setEditing(x.id)}>Edit</button>}
                    {canVoid(x) && <button className="ba-link-btn dr-void-btn" onClick={() => voidIt(x)}>Void</button>}
                  </span>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}

function RateForm({ uid, roster = [], driver = null, onSaved }) {
  const others = roster.filter((m) => m.id !== uid)
  const [v, setV] = useState({ driver: driver ?? others[0]?.id ?? '', note: '', ...Object.fromEntries(CRITERIA.map((c) => [c.key, null])) })
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(e) {
    e.preventDefault()
    if (!v.driver) { setErr('Choose a driver.'); return }
    if (CRITERIA.every((c) => v[c.key] == null)) { setErr('Give at least one rating from 1 to 5.'); return }
    setSaving(true); setErr('')
    try {
      done(await writeVia(supabase, 'driver_rate', { p_driver: v.driver, p_control: v.control, p_awareness: v.awareness, p_scoring: v.scoring, p_defense: v.defense, p_consistency: v.consistency, p_note: v.note.trim() || null }))
      await onSaved(`Rating saved for ${roster.find((m) => m.id === v.driver)?.name ?? 'the driver'}.`)
      setV({ ...v, note: '', ...Object.fromEntries(CRITERIA.map((c) => [c.key, null])) })
    } catch (x) { setErr(errText(x)) }
    setSaving(false)
  }
  return (
    <form className="ba-form dr-rate" onSubmit={save}>
      {!driver && (
        <label className="ba-field"><span>Driver</span>
          <select value={v.driver} onChange={(e) => setV({ ...v, driver: e.target.value })} aria-label="Driver to rate">
            {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}
      {CRITERIA.map((c) => (
        <fieldset className="ba-seg dr-crit" key={c.key}><legend>{c.label}</legend>
          <div className="ba-seg-opts">
            {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} aria-pressed={v[c.key] === n} aria-label={`${c.label} ${n}`} onClick={() => setV({ ...v, [c.key]: v[c.key] === n ? null : n })}>{n}</button>)}
          </div>
        </fieldset>
      ))}
      <p className="ba-muted">Tap a number again to clear it; leave a criterion blank if you did not see it.</p>
      <label className="ba-field"><span>Note (the driver and staff see it)</span><textarea rows={2} maxLength={1000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} aria-label="Rating note" /></label>
      {err && <p className="ba-error" role="alert">{err}</p>}
      <button className="ba-primary dr-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rating'}</button>
    </form>
  )
}

function DriverSheet({ d, uid, isStaff, sessions, ratings, scores, season, nameOf, onClose, onSaved }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current, opener = document.activeElement
    el?.showModal?.()
    return () => { el?.close?.(); if (opener?.isConnected) opener.focus() }
  }, [])
  const r = d.row
  const notes = new Map(ratings.map((x) => [x.id, x.note]))
  const shown = (scores.length ? scores : ratings).filter((x) => inSeason(laDate(x.rated_at), season))
  return (
    <dialog ref={ref} className="ba-sheet dr-sheet" aria-label={`${d.name} details`} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="ba-sheet-head">
        <div><span className="ba-eyebrow">{season ? season.name : 'All time'}</span><h2>{d.name}</h2></div>
        <button className="ba-btn" onClick={onClose}>Close</button>
      </div>
      <div className="ba-sheet-body">
        {r ? (
          <dl className="ba-facts">
            <div><dt>Driver Score</dt><dd className="dr-big hud-tnum">{r.score}</dd></div>
            <div><dt>Rank</dt><dd className="hud-tnum">#{r.rank}</dd></div>
            <div><dt>Robot</dt><dd className="hud-tnum">{fmtHours(r.realHours)}</dd></div>
            <div><dt>MoSim</dt><dd className="hud-tnum">{fmtHours(r.simHours)}{r.bestSim != null ? ` · best ${r.bestSim}` : ''}</dd></div>
            <div><dt>Experience</dt><dd className="hud-tnum">{pct(r.experience)}</dd></div>
            <div><dt>Coach</dt><dd className="hud-tnum">{r.coachAvg == null ? 'Unrated' : `${r.coachAvg.toFixed(2)} / 5 from ${r.coaches}`}</dd></div>
          </dl>
        ) : <p className="ba-muted">Nothing counted in this season.</p>}
        <h3 className="ba-h3">Coach ratings</h3>
        {!shown.length ? <p className="ba-muted">No ratings {season ? 'this season' : 'yet'}.</p> : (
          <ol className="ba-history">{shown.map((x) => (
            <li key={x.id} className="dr-rating">
              <div className="ba-run-top"><strong>{nameOf(x.coach_id) || 'Coach'} <span className="hud-tnum">{ratingMean(x)?.toFixed(1) ?? '--'}</span></strong><span className="hud-mono">{day(laDate(x.rated_at))}</span></div>
              <div className="ba-run-nums hud-mono">{CRITERIA.map((c) => <span key={c.key}>{c.label} {x[c.key] ?? '–'}</span>)}</div>
              {notes.get(x.id) && <p className="ba-run-note dr-note">{notes.get(x.id)}</p>}
            </li>
          ))}</ol>
        )}
        {isStaff && d.id !== uid && <details className="ba-more"><summary>Rate {d.name}</summary><RateForm uid={uid} roster={[{ id: d.id, name: d.name }]} driver={d.id} onSaved={onSaved} /></details>}
        <h3 className="ba-h3">Sessions</h3>
        {!sessions.length ? <p className="ba-muted">No sessions {season ? 'this season' : 'yet'}.</p> : <SessionList list={sessions} uid={uid} isStaff={isStaff} nameOf={nameOf} onSaved={onSaved} showLogger />}
      </div>
    </dialog>
  )
}
