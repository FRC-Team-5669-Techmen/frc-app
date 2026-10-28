import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { computePresenceDetail, presenceSinceISO, fmtClock, groupBySubteam, subteamOf, UNASSIGNED } from './presence'
import { displayName } from './names'
import { canOpenHistory } from './attendanceHistory'
import { MemberAttendanceHistory } from './AttendanceHistory'
import QuickPulseControl from './QuickPulseControl'
import './PresenceBoard.css'

// Read-only wall-display board of who is currently present, derived from the
// existing attendance_events + profiles data (no new tables). Behind auth.
// Live updates via polling — realtime is not wired in this project.
//
// Staff can click a name to open that member's attendance history (the same
// view as the Team Hours drill-down), read-only here because this board may be
// a shared screen in the shop. Everyone else gets the board exactly as before:
// a name is plain text, not a button, not focusable. That split is a UI rule --
// attendance_events is readable by every signed-in member regardless (see
// canOpenHistory). With no `hasRole` passed, the board renders the non-staff way.

const POLL_MS = 15_000
// Three layouts to choose between (feedback a51bdc10, "ugly and poorly
// formatted"): ?layout=shop (default), teams or timeline. Once one is picked
// the others go.
const LAYOUTS = [['shop', 'In the shop'], ['teams', 'By sub-team'], ['timeline', 'Timeline']]
const elapsed = (since, now) => {
  const m = Math.max(0, Math.floor((now - Date.parse(since)) / 60_000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export default function PresenceBoard({ hasRole } = {}) {
  const staff = canOpenHistory(hasRole)
  const [members, setMembers] = useState(null)   // active roster
  const [present, setPresent] = useState(new Map()) // user_id -> sinceISO
  const [kinds, setKinds] = useState(new Map())     // user_id -> { key, label, color }: FRC or FLL volunteer (feedback 37b5feee)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(null)    // { memberId, name } — staff only
  const [reloadKey, setReloadKey] = useState(0)    // bumped after a quick sign in/out
  const timer = useRef(null)
  const [params] = useSearchParams()
  const layout = LAYOUTS.some(([k]) => k === params.get('layout')) ? params.get('layout') : 'shop'

  const load = useCallback(async () => {
    // Active roster + every event the checked-in rule can count, both readable
    // by any authenticated member. From presenceSinceISO(), not local midnight,
    // so a session open across LA midnight reads present here exactly as it
    // does on the member's own dashboard tile.
    const [{ data: profs, error: pErr }, { data: events, error: eErr }] = await Promise.all([
      // Approved members only: a signed-in account never let onto the team is
      // not on the wall display (audit item 2).
      supabase.from('profiles').select('id, full_name, nickname, subteams, status').eq('status', 'active').eq('approved', true),
      // category: which hours the open session counts (FRC or FLL volunteer).
      supabase.from('attendance_events').select('user_id, type, event_time, category').gte('event_time', presenceSinceISO()),
    ])
    if (pErr || eErr) { setError((pErr || eErr).message); return }
    // Parent-only accounts are not team members on the wall. When the roles
    // cannot be read, nobody is left out.
    const { data: roles, error: rErr } = await supabase.from('member_roles').select('member_id, role')
    const parentOnly = new Set()
    if (!rErr) {
      const by = new Map()
      for (const r of roles ?? []) by.set(r.member_id, [...(by.get(r.member_id) ?? []), r.role])
      for (const [id, rs] of by) if (rs.every(x => x === 'parent')) parentOnly.add(id)
    }
    setError('')
    setMembers((profs ?? []).filter(p => !parentOnly.has(p.id)))
    const detail = computePresenceDetail(events ?? [])
    setPresent(new Map([...detail].map(([id, d]) => [id, d.since])))
    setKinds(new Map([...detail].map(([id, d]) => [id, d.kind])))
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(timer.current); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  if (members === null) {
    // A failed FIRST load says so instead of spinning forever; the poll keeps
    // trying and replaces this with the board once a read answers.
    return (
      <div className="pb-wrap pb-loading">
        {error ? <p className="pb-error">{error}</p> : <div className="pb-spinner" />}
      </div>
    )
  }

  const total = members.length
  const presentCount = members.filter(m => present.has(m.id)).length
  const now = Date.now()

  // Group by primary subteam (shared with HomePage Team Status); crossover
  // members show under their primary subteam so present/total counts stay exact.
  const groups = groupBySubteam(members)
  const byName = (a, b) => displayName(a).localeCompare(displayName(b))
  const here = members.filter(m => present.has(m.id)).sort((a, b) => String(present.get(a.id)).localeCompare(String(present.get(b.id))) || byName(a, b))
  const away = groups.map(([g, list]) => [g, list.filter(m => !present.has(m.id)).sort(byName)]).filter(([, l]) => l.length)

  // One member's name: a button for staff (history and quick sign in or out),
  // plain text for everyone else.
  const nameEl = (m) => {
    const name = displayName(m)
    return staff ? (
      <button type="button" className="pb-name pb-name-btn" aria-haspopup="dialog" title="Sign in or out, and attendance history"
        onClick={() => setHistory({ memberId: m.id, name })}>{name}</button>
    ) : <span className="pb-name">{name}</span>
  }
  const teamLabel = (m) => (subteamOf(m) === UNASSIGNED ? 'No sub-team' : subteamOf(m))
  // Present: a card with sub-team, sign-in time and time in.
  const presentCard = (m, extra = null) => {
    const since = present.get(m.id)
    return (
      <li key={m.id} className="pb-row pb-present">
        {nameEl(m)}
        <span className="pb-meta hud-tnum">
          {kinds.get(m.id) && <span className="pb-kind" data-kind={kinds.get(m.id).key} style={{ '--pb-kind': kinds.get(m.id).color }}>{kinds.get(m.id).label}</span>}
          <span className="pb-team">{teamLabel(m)}</span> · in {fmtClock(since)}
        </span>
        <span className="pb-elapsed hud-tnum">{elapsed(since, now)}</span>
        {extra}
      </li>
    )
  }
  // Not here: a compact chip.
  const awayChip = (m) => <li key={m.id} className="pb-row pb-absent">{nameEl(m)}</li>
  const awaySection = (
    <section className="pb-away" aria-labelledby="pb-away-title">
      <h2 id="pb-away-title" className="pb-section-title">Not here <span className="hud-tnum">{total - presentCount}</span></h2>
      {away.map(([g, list]) => (
        <div key={g} className="pb-away-group">
          <h3>{g === UNASSIGNED ? 'No sub-team' : g}</h3>
          <ul className="pb-chips">{list.map(awayChip)}</ul>
        </div>
      ))}
    </section>
  )
  const coverage = (
    <ul className="pb-coverage" aria-label="Sub-teams in the shop">
      {groups.map(([g, list]) => {
        const n = list.filter(m => present.has(m.id)).length
        return (
          <li key={g} className={n ? 'pb-cov-on' : ''}>
            <span>{g === UNASSIGNED ? 'No sub-team' : g}</span>
            <b className="hud-tnum">{n}<i>/{list.length}</i></b>
            <span className="pb-cov-bar" aria-hidden="true"><span style={{ width: `${list.length ? (n / list.length) * 100 : 0}%` }} /></span>
          </li>
        )
      })}
    </ul>
  )
  const empty = <p className="pb-empty">Nobody is signed in right now.</p>

  // The shared axis for the timeline: the earliest sign-in to now.
  const t0 = here.length ? Math.min(...here.map(m => Date.parse(present.get(m.id)))) : now
  const span = Math.max(now - t0, 30 * 60_000)

  return (
    <div className={`pb-wrap pb-layout-${layout}`} data-layout={layout}>
      <header className="pb-header">
        <div className="pb-title">
          <span className="pb-mark">TECHMEN<span className="pb-dot">·</span>5669</span>
          <span className="pb-tag">TEAM PULSE</span>
        </div>
        <span className="pb-clock hud-tnum">{new Date(now).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}</span>
        <span className="pb-count hud-tnum">
          <span className="pb-count-now">{presentCount}</span>
          <span className="pb-count-sep">/</span>
          <span className="pb-count-total">{total}</span>
          <span className="pb-count-label">in the shop</span>
        </span>
      </header>

      {error && <p className="pb-error">{error}</p>}

      {layout === 'shop' && (
        <>
          {coverage}
          <section className="pb-here" aria-label="In the shop">
            {here.length ? <ul className="pb-cards">{here.map(m => presentCard(m))}</ul> : empty}
          </section>
          {awaySection}
        </>
      )}

      {layout === 'teams' && (
        <div className="pb-teams">
          {groups.map(([g, list]) => {
            const on = list.filter(m => present.has(m.id)).sort((a, b) => String(present.get(a.id)).localeCompare(String(present.get(b.id))))
            const off = list.filter(m => !present.has(m.id)).sort(byName)
            return (
              <section key={g} className={`pb-team-tile${on.length ? ' pb-team-on' : ''}`}>
                <header>
                  <h2>{g === UNASSIGNED ? 'No sub-team' : g}</h2>
                  <b className="hud-tnum">{on.length}<i>/{list.length}</i></b>
                </header>
                <span className="pb-cov-bar" aria-hidden="true"><span style={{ width: `${list.length ? (on.length / list.length) * 100 : 0}%` }} /></span>
                {on.length > 0 && <ul className="pb-team-here">{on.map(m => presentCard(m))}</ul>}
                {off.length > 0 && <ul className="pb-chips">{off.map(awayChip)}</ul>}
              </section>
            )
          })}
        </div>
      )}

      {layout === 'timeline' && (
        <>
          <section className="pb-timeline" aria-label="In the shop, by sign-in time">
            {here.length ? (
              <>
                <div className="pb-axis hud-tnum" aria-hidden="true"><span>{fmtClock(new Date(t0).toISOString())}</span><span>now</span></div>
                <ul className="pb-bars">
                  {here.map(m => presentCard(m, (
                    <span className="pb-track" aria-hidden="true">
                      <span className="pb-fill" style={{ marginLeft: `${((Date.parse(present.get(m.id)) - t0) / span) * 100}%`, width: `${Math.max(2, ((now - Date.parse(present.get(m.id))) / span) * 100)}%` }} />
                    </span>
                  )))}
                </ul>
              </>
            ) : empty}
          </section>
          {coverage}
          {awaySection}
        </>
      )}

      <footer className="pb-footer">
        <span className="hud-tnum">Live · updates every {POLL_MS / 1000} s</span>
        <nav className="pb-layouts" aria-label="Layout">
          {LAYOUTS.map(([k, l]) => <Link key={k} to={`/display?layout=${k}`} aria-current={layout === k ? 'page' : undefined}>{l}</Link>)}
        </nav>
      </footer>

      {staff && history && (
        <MemberAttendanceHistory
          memberId={history.memberId}
          name={history.name}
          onClose={() => setHistory(null)}
          reloadKey={reloadKey}
          banner={(
            <QuickPulseControl
              memberId={history.memberId}
              name={history.name}
              since={present.get(history.memberId) ?? null}
              onChanged={() => { load(); setReloadKey((k) => k + 1) }}
            />
          )}
        />
      )}
    </div>
  )
}
