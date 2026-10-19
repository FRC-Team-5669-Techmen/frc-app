import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { computePresence, presenceSinceISO } from './presence'
import { fetchAllRows } from './fetchAllRows'
import { canApproveSignouts, approveSignout, approveAllSignouts, returnSignout } from './signout'
import { isSchemaMissing } from './schemaMissing'
import './SignoutsPage.css'

// /signouts: the approver's queue (handbook Section 7). Mentors and the
// students Mr. Pina names (the signout.approve capability on /roster) approve
// with two taps, or Approve all. Hours stop at the approval. Nobody approves
// their own. Today's decisions name who decided, so Mr. Pina can see each
// day's student approvals. Before 0014 is pasted the page says so.

const POLL_MS = 15000

function fmtClock(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : ''
}
function fmtLen(ms) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
function laMidnightISO() {
  const now = new Date()
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const offset = now.getTime() - la.getTime()
  la.setHours(0, 0, 0, 0)
  return new Date(la.getTime() + offset).toISOString()
}

export default function SignoutsPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const uid = session?.user?.id
  const [allowed, setAllowed] = useState(undefined)   // undefined loading, null not set up, bool
  const [pending, setPending] = useState([])
  const [decided, setDecided] = useState([])
  const [present, setPresent] = useState(new Map())
  const [names, setNames] = useState(new Map())
  const [busy, setBusy] = useState(null)              // request id, or 'all'
  const [returning, setReturning] = useState(null)    // request id with the reason box open
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState(null)
  const [loadErr, setLoadErr] = useState(null)

  const load = useCallback(async () => {
    const ok = await canApproveSignouts(supabase)
    setAllowed(ok)
    if (!ok) return
    const today = laMidnightISO()
    const [pend, dec, profs, evs] = await Promise.all([
      supabase.from('signout_requests')
        .select('id, member_id, note, cleanup_confirmed, requested_at, source, location, in_event_id')
        .eq('status', 'pending').order('requested_at', { ascending: true }),
      supabase.from('signout_requests')
        .select('id, member_id, status, note, decided_by, decided_at, reason')
        .in('status', ['approved', 'returned']).gte('decided_at', today)
        .order('decided_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name, nickname'),
      fetchAllRows(() => supabase.from('attendance_events')
        .select('id, user_id, type, event_time, category')
        .gte('event_time', presenceSinceISO()).order('event_time', { ascending: true }).order('id')),
    ])
    const err = pend.error || dec.error
    if (err) { setLoadErr(isSchemaMissing(err) ? 'missing' : (err.code || err.message)); return }
    setLoadErr(null)
    setPending(pend.data ?? [])
    setDecided(dec.data ?? [])
    setNames(new Map((profs.data ?? []).map((p) => [p.id, displayName(p)])))
    setPresent(computePresence(evs?.data ?? []))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  async function act(id, fn, done) {
    if (busy) return
    setBusy(id)
    setMsg(null)
    try {
      const r = await fn()
      setMsg(done(r))
    } catch (err) {
      setMsg(`Not done${err?.code ? ` (${err.code})` : ''}: ${err?.message ?? 'try again'}`)
    }
    setReturning(null)
    setReason('')
    await load()
    setBusy(null)
  }

  const nameOf = (id) => names.get(id) ?? 'Member'

  if (allowed === undefined) return <div className="sop-wrap"><p className="sop-muted">Loading…</p></div>
  if (allowed === null || loadErr === 'missing') {
    return (
      <div className="sop-wrap">
        <h1 className="sop-title">Sign-outs</h1>
        <p className="sop-note">Not set up yet. Sign-out approval starts when migration 0014 is pasted; until then students check out with one tap, as before.</p>
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="sop-wrap">
        <h1 className="sop-title">Sign-outs</h1>
        <p className="sop-muted">Only mentors and students Mr. Pina names approve sign-outs.</p>
      </div>
    )
  }

  const others = pending.filter((r) => r.member_id !== uid)
  const pendingIds = new Set(pending.map((r) => r.member_id))
  const signedIn = [...present.entries()]
    .map(([id, since]) => ({ id, since, name: nameOf(id), waiting: pendingIds.has(id) }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="sop-wrap">
      <div className="sop-head">
        <h1 className="sop-title">Sign-outs</h1>
        <p className="sop-sub">Check the area, then approve. Hours stop when you approve. You never approve your own.</p>
      </div>
      {loadErr && <p className="sop-error" role="alert">Could not load ({loadErr}).</p>}
      {msg && <p className="sop-msg" role="status">{msg}</p>}

      <section className="sop-card">
        <div className="sop-card-head">
          <h2 className="sop-h2">Waiting <span className="sop-count hud-tnum">{others.length}</span></h2>
          {others.length > 1 && (
            <button className="sop-btn sop-btn-primary" disabled={!!busy}
              onClick={() => act('all', () => approveAllSignouts(supabase), (n) => `Approved ${n}.`)}>
              {busy === 'all' ? 'Approving…' : `Approve all ${others.length}`}
            </button>
          )}
        </div>
        {others.length === 0 ? (
          <p className="sop-muted">Nobody is waiting.</p>
        ) : (
          <ul className="sop-list">
            {others.map((r) => {
              const since = present.get(r.member_id)
              return (
                <li key={r.id} className="sop-row" data-request={r.id}>
                  <div className="sop-row-main">
                    <div className="sop-row-top">
                      <span className="sop-name">{nameOf(r.member_id)}</span>
                      <span className="sop-meta hud-mono">
                        asked {fmtClock(r.requested_at)}{since ? ` · in ${fmtLen(Date.now() - Date.parse(since))}` : ''}
                      </span>
                    </div>
                    <p className="sop-text">{r.note}</p>
                    <span className={`sop-chip ${r.cleanup_confirmed ? 'sop-chip-ok' : 'sop-chip-warn'}`}>
                      {r.cleanup_confirmed ? 'Area clean' : 'Cleanup not confirmed'}
                    </span>
                    {returning === r.id && (
                      <div className="sop-return">
                        <input className="sop-input" value={reason} onChange={(e) => setReason(e.target.value)}
                          placeholder="What to finish first" aria-label="Reason" autoFocus />
                        <button className="sop-btn" disabled={!!busy}
                          onClick={() => act(r.id, () => returnSignout(supabase, r.id, reason), () => `Sent back to ${nameOf(r.member_id)}.`)}>
                          Send back
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="sop-actions">
                    <button className="sop-btn sop-btn-primary" disabled={!!busy}
                      onClick={() => act(r.id, () => approveSignout(supabase, r.id), () => `Approved ${nameOf(r.member_id)}.`)}>
                      {busy === r.id ? '…' : 'Approve'}
                    </button>
                    <button className="sop-btn" disabled={!!busy}
                      onClick={() => { setReturning(returning === r.id ? null : r.id); setReason('') }}>
                      {returning === r.id ? 'Cancel' : 'Not yet'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="sop-grid">
        <section className="sop-card">
          <h2 className="sop-h2">Signed in now <span className="sop-count hud-tnum">{signedIn.length}</span></h2>
          {signedIn.length === 0 ? <p className="sop-muted">Nobody is signed in.</p> : (
            <ul className="sop-mini">
              {signedIn.map((m) => (
                <li key={m.id}>
                  <span>{m.name}</span>
                  <span className="hud-mono sop-meta">{m.waiting ? 'waiting · ' : ''}since {fmtClock(m.since)}</span>
                  {isStaff && m.id !== uid && <VoidIdle member={m} onDone={(t) => { setMsg(t); load() }} />}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="sop-card">
          <h2 className="sop-h2">Decided today <span className="sop-count hud-tnum">{decided.length}</span></h2>
          {decided.length === 0 ? <p className="sop-muted">Nothing decided yet today.</p> : (
            <ul className="sop-mini">
              {decided.map((d) => (
                <li key={d.id} data-decision={d.status}>
                  <span>{nameOf(d.member_id)} <span className={`sop-chip ${d.status === 'approved' ? 'sop-chip-ok' : 'sop-chip-warn'}`}>{d.status === 'approved' ? 'Approved' : 'Sent back'}</span></span>
                  <span className="hud-mono sop-meta">{fmtClock(d.decided_at)} by {nameOf(d.decided_by)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// Handbook Section 7: idle time is voided. A lead or mentor ends the session
// and voids it, and the reason goes to the student (staff_void_session, 0015).
function VoidIdle({ member, onDone }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <button className="sop-link" onClick={() => setOpen(true)}>Void</button>
  async function go() {
    if (reason.trim().length < 3) return
    setBusy(true)
    const { error } = await supabase.rpc('staff_void_session', { p_member: member.id, p_reason: reason.trim() })
    setBusy(false)
    onDone(error ? `Not voided${error.code ? ` (${error.code})` : ''}: ${error.message}` : `${member.name}: session voided, reason sent.`)
    if (!error) { setOpen(false); setReason('') }
  }
  return (
    <span className="sop-void">
      <input className="sop-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (sent to the student)" aria-label={`Reason to void ${member.name}`} />
      <button className="sop-btn" onClick={go} disabled={busy || reason.trim().length < 3}>Void session</button>
    </span>
  )
}
