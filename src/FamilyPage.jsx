import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './supabase'
import MedicalForm from './MedicalForm'
import { STANDING_LABEL, KIND_LABEL, STATUS_LABEL, fmtHours, errText } from './standing'
import { isSchemaMissing } from './schemaMissing'
import './Standing.css'

// /family/<token>: the private parent link (handbook Sections 1 and 19). No
// account: the token is the only credential and every read and write goes
// through one SQL function, family_call (migration 0017), which never shows
// another family anything. Public by design, like /parent/<token>.

const HANDBOOK_SHEET = 'https://github.com/FRC-Team-5669-Techmen/frc-app/raw/main/public/print/handbook-signature-sheet.pdf'

export default function FamilyPage() {
  const { token } = useParams()
  const [d, setD] = useState(null)
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [read, setRead] = useState(false)
  const [showText, setShowText] = useState(false)

  const call = useCallback(async (action, args = {}) => {
    const { data, error } = await supabase.rpc('family_call', { p_token: token, p_action: action, p_args: args })
    if (error) throw error
    return data
  }, [token])

  const load = useCallback(async () => {
    try { setD(await call('summary')); setState('ok') } catch (e) {
      setState(e?.code === 'P0002' ? 'invalid' : e?.code === 'PGRST202' || e?.code === '42883' ? 'missing' : 'error')
    }
  }, [call])
  useEffect(() => { load() }, [load])

  async function act(fn, done) {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(done); await load() } catch (e) { setMsg(errText(e)) }
    setBusy(false)
  }

  if (state === 'loading') return <Shell><p className="st-muted">Loading…</p></Shell>
  if (state === 'invalid') return <Shell><h1 className="st-title">Link not valid</h1><p className="st-muted">This family link was replaced or is wrong. Ask Mr. Pina for a new one: apina@boscotech.edu.</p></Shell>
  if (state !== 'ok') return <Shell><h1 className="st-title">Not available</h1><p className="st-muted">The family page is not set up yet. Try again later.</p></Shell>
  const items = d.onboarding?.items ?? []

  return (
    <Shell>
      <div className="st-head">
        <div><h1 className="st-title">{d.student}</h1><p className="st-sub">Your private family link. Never share it; a shared link is replaced.</p></div>
        <span className={`st-badge st-badge-${d.standing.label}`}>{STANDING_LABEL[d.standing.label]}</span>
      </div>
      {msg && <p className="st-msg" role="status">{msg}</p>}

      {d.standing.records.length > 0 && (
        <section className="st-card st-alert" data-card="open">
          <h2 className="st-h2">Open now</h2>
          <ul className="st-list">{d.standing.records.map((r, i) => <li key={i}><b>{KIND_LABEL[r.kind]}</b> <span className="st-chip">{STATUS_LABEL[r.status]}</span><div className="st-muted">{r.reason}</div></li>)}</ul>
        </section>
      )}
      {d.standing.weeks.length > 0 && (
        <section className="st-card"><h2 className="st-h2">Recent weeks</h2>
          <ul className="st-list st-weeks">{d.standing.weeks.map((w) => <li key={w.week_start} className={w.ok ? '' : 'bad'}><span>{w.week_start}</span><span className="hud-tnum">{fmtHours(w.hours)} / {fmtHours(w.required)}</span></li>)}</ul>
        </section>
      )}

      <TripSignups token={token} />

      <section className="st-card" data-card="checklist">
        <h2 className="st-h2">First-two-weeks checklist</h2>
        <ul className="st-list">{items.map((x) => <li key={x.key} data-item={x.key} className={x.done ? '' : 'bad'}>{x.done ? '✓' : '○'} {x.label}</li>)}</ul>
        {!items.find((x) => x.key === 'groupme')?.done && (
          <button className="st-btn" disabled={busy} onClick={() => act(() => call('groupme'), 'Thank you.')}>I joined the parent GroupMe</button>
        )}
        <p className="st-muted">Due {d.onboarding?.due}. No shop tools until it is done.</p>
      </section>

      <section className="st-card" data-card="sign">
        <h2 className="st-h2">Handbook signature · version {d.version}</h2>
        {d.signed ? <p className="st-ok">Signed. Thank you.</p> : (
          <>
            <p className="st-muted">Read the handbook, then sign as a parent or guardian.</p>
            <button className="st-link" onClick={() => setShowText(!showText)}>{showText ? 'Hide the handbook' : 'Read the handbook here'}</button>
            {showText && <HandbookText />}
            <p className="st-muted"><a href={HANDBOOK_SHEET} target="_blank" rel="noreferrer">The one-page summary (PDF)</a></p>
            <label className="st-check"><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
              <span>I have read the handbook and understand the standards, probation and removal. I will follow the family rules in Sections 15, 16 and 19.</span></label>
            <input className="st-input" placeholder="Your full name" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="st-btn st-btn-primary" disabled={busy || !read || name.trim().length < 2}
              onClick={() => act(() => call('sign', { version: d.version, name: name.trim() }), 'Signed.')}>Sign</button>
          </>
        )}
      </section>

      <section className="st-card" data-card="medical">
        <h2 className="st-h2">Emergency information</h2>
        <MedicalForm initial={d.medical} busy={busy} onSave={(v) => act(() => call('medical_save', v), 'Saved. Keep it current.')} />
      </section>
    </Shell>
  )
}

// Trip sign-ups (0023): the event hub sign-ups of THIS link's student on
// trips not over, done or not, and a button that emails the sign-up link to
// the addresses already on it. Every read and the send go through
// family_hub_trips / family_hub_send_link, scoped in SQL to this token's
// student; the page never sees a hub token or an address. Before 0023 is
// pasted the card is simply not there.
const fmtTripDay = (ymd) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '')

function sendQueuedHubMail() {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-family`
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resend_link', email: '' }) })
    .catch(() => { /* the hourly tick sends it */ })
}

function TripSignups({ token }) {
  const [trips, setTrips] = useState(null)
  const [busy, setBusy] = useState(null)
  const [notes, setNotes] = useState({})
  useEffect(() => {
    let live = true
    supabase.rpc('family_hub_trips', { p_token: token }).then(({ data, error }) => {
      if (!live) return
      setTrips(error ? (isSchemaMissing(error) ? [] : null) : (Array.isArray(data) ? data : []))
    })
    return () => { live = false }
  }, [token])
  if (!trips?.length) return null
  async function send(t) {
    setBusy(t.event_id)
    const { data, error } = await supabase.rpc('family_hub_send_link', { p_token: token, p_event: t.event_id })
    setBusy(null)
    let note
    if (error) note = { bad: true, text: error.details || 'Not sent. Try again in a minute.' }
    else if ((data?.queued ?? 0) === 0) note = { text: 'Already sent in the last hour. Check your inbox and spam folder.' }
    else {
      sendQueuedHubMail()
      note = { text: `Sent to the ${data.count === 1 ? 'email' : `${data.count} emails`} on this sign-up. Check your inbox.` }
    }
    setNotes((n) => ({ ...n, [t.event_id]: note }))
  }
  return (
    <section className="st-card" data-card="trips">
      <h2 className="st-h2">Trip sign-ups</h2>
      <ul className="st-list">
        {trips.map((t) => (
          <li key={t.event_id} data-trip={t.event_id}>
            <div className="st-trip-head">
              <b>{t.title}</b>{t.starts_on && <span className="st-muted"> · {fmtTripDay(t.starts_on)}</span>}
            </div>
            <div className="st-trip-state">
              <span className={`st-chip${t.signup_done ? '' : ' st-chip-bad'}`} data-state={t.signup_done ? 'done' : 'not-done'}>
                {t.signup_done ? 'Sign-up done' : 'Sign-up not finished'}
              </span>
              {t.lockin_open && (
                <span className={`st-chip${t.lockin_done ? '' : ' st-chip-bad'}`}>{t.lockin_done ? 'Locked in' : 'Lock-in not done'}</span>
              )}
            </div>
            {t.has_email
              ? <button className="st-btn" disabled={busy === t.event_id} onClick={() => send(t)} data-action="send-trip-link">
                  {busy === t.event_id ? 'Sending…' : 'Send me the sign-up link'}
                </button>
              : <p className="st-muted">No email on this sign-up yet. Ask a mentor to add yours.</p>}
            {notes[t.event_id] && <p className={notes[t.event_id].bad ? 'st-msg st-msg-bad' : 'st-msg'} role="status">{notes[t.event_id].text}</p>}
          </li>
        ))}
      </ul>
      <p className="st-muted">The link goes to the emails already on the sign-up, never to anyone else.</p>
    </section>
  )
}

function Shell({ children }) {
  return (
    <div className="st-page-public">
      <header className="st-public-head">TECHMEN<span>·</span>5669 <span className="st-muted">FAMILY</span></header>
      <div className="st-wrap">{children}</div>
    </div>
  )
}

// The handbook text, loaded only when asked for, as plain readable blocks.
function HandbookText() {
  const [md, setMd] = useState(null)
  useEffect(() => { import('./handbook/handbook.md?raw').then((m) => setMd(m.default)) }, [])
  if (!md) return <p className="st-muted">Loading…</p>
  const blocks = md.split('\n').filter((l) => l.trim() && !l.startsWith('{{') && !/^\|\s*-/.test(l))
  const clean = (s) => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  return (
    <div className="st-handbook">{blocks.map((l, i) => {
      if (l.startsWith('### ')) return <h4 key={i}>{clean(l.slice(4))}</h4>
      if (l.startsWith('## ')) return <h3 key={i}>{clean(l.slice(3))}</h3>
      if (l.startsWith('# ')) return <h2 key={i}>{clean(l.slice(2))}</h2>
      if (l.startsWith('|')) return <p key={i} className="st-muted">{clean(l.replace(/\|/g, ' · ').replace(/^ · | · $/g, ''))}</p>
      return <p key={i}>{clean(l.replace(/^\s*(-|\d+\.)\s+/, '• '))}</p>
    })}</div>
  )
}
