import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { GUIDE } from '../featureGuide.js'
import { useTour } from './context.jsx'
import { TRACK_NAMES } from './catalog.js'
import { loadCompletions } from './api.js'
import Practice from './Practice.jsx'
import './tour.css'

export default function TrainingPage() {
  const t = useTour(),
    [params] = useSearchParams()
  const [track, setTrack] = useState(
    t.progress?.track ?? (t.context.isStaff ? 'mentor' : t.tracks[0]),
  )
  const [events, setEvents] = useState(null),
    [eventId, setEventId] = useState(t.progress?.eventId ?? ''),
    [eventError, setEventError] = useState(false)
  const reference = GUIDE.find((g) => g.path === params.get('feature'))
  const adminReference = reference?.for.includes('admin') && !t.context.isAdmin
  const absence = params.get('lesson') === 'absence'
  const [practiceDone, setPracticeDone] = useState(false)
  useEffect(() => {
    let live = true
    supabase
      .from('events')
      .select('id,title,starts_at')
      .in('kind', ['competition', 'training'])
      .order('starts_at', { ascending: false })
      .limit(50)
      .then((r) => {
        if (live) {
          setEvents(r.error ? [] : (r.data ?? []))
          setEventError(!!r.error)
        }
      })
      .catch(() => {
        if (live) {
          setEvents([])
          setEventError(true)
        }
      })
    return () => {
      live = false
    }
  }, [])
  const progress = t.progress
  return (
    <main className="tour-page" data-tour="training-hub">
      <header>
        <span className="tour-eyebrow">Techmen training</span>
        <h1>Learn the app by doing</h1>
        <p>
          Start with the core activities, then explore every feature available
          to your account. Pause, skip or replay any lesson. Your place is saved
          on this device.
        </p>
      </header>
      {reference && (
        <section className="tour-card" data-tour="feature-reference">
          <h2>{reference.title}</h2>
          <p>{reference.what}</p>
          <p>Find it: {reference.where}.</p>
          <p>
            {adminReference
              ? 'Only admins can open this feature. Ask an admin when you need help with it.'
              : 'Open this feature from the entry point above when you need it.'}
          </p>
        </section>
      )}
      {params.get('lesson') === 'parent-standing' && (
        <section className="tour-card" data-tour="feature-reference">
          <h2>Your student record</h2>
          <p>
            Use Standing beside your linked student on Home. Your private family
            link also opens their checklist, standing and handbook. The student
            files an absence from My standing.
          </p>
          <Link to="/dashboard">Find your linked student</Link>
        </section>
      )}
      {absence && (
        <section className="tour-card">
          <h2>Absence practice</h2>
          <p>
            Sample meeting only. This form cannot send a real absence request.
          </p>
          <Practice
            kind="absence"
            onDone={() => {
              setPracticeDone(true)
              window.dispatchEvent(new Event('techmen:absence-practiced'))
            }}
          />
          {practiceDone && (
            <p role="status">
              Practice request received. No real request was sent. Continue your
              walkthrough.
            </p>
          )}
          <p>
            When you need a real absence, open{' '}
            <Link to="/standing">My standing</Link>.
          </p>
        </section>
      )}
      <section className="tour-card">
        <h2>Your learning track</h2>
        <p>
          Scout, driver and pit tracks teach those tools first after core. They
          do not change your permissions.
        </p>
        <label className="tour-field">
          Track
          <select
            id="tour-track"
            aria-label="Track"
            value={track}
            onChange={(e) => setTrack(e.target.value)}
          >
            {t.tracks.map((k) => (
              <option key={k} value={k}>
                {TRACK_NAMES[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="tour-field">
          Competition for event lessons
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Choose an event</option>
            {events?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        {events === null && <p role="status">Loading events…</p>}
        {eventError && (
          <p role="alert">
            Events could not load. Reload to retry. Other lessons remain
            available.
          </p>
        )}
        {events?.length === 0 && !eventError && (
          <p>
            No competition is available yet. Event lessons can be skipped and
            resumed after setup.
          </p>
        )}
        <div className="tour-actions">
          <button onClick={() => t.start(track, eventId)}>
            Start {TRACK_NAMES[track]} tour
          </button>
          {progress && (
            <button
              onClick={() => {
                t.update((p) => ({ ...p, eventId: eventId || p.eventId }))
                t.resume()
              }}
            >
              Resume {TRACK_NAMES[progress.track]} tour
            </button>
          )}
        </div>
        {progress && (
          <>
            <p>
              {progress.done.length} activities done on this device.{' '}
              {progress.skipped.length} skipped.
            </p>
            <details>
              <summary>Review lessons</summary>
              <ol className="tour-lessons">
                {t.steps.map((s, i) => (
                  <li key={s.id}>
                    <button
                      onClick={() =>
                        t.update((p) => ({
                          ...p,
                          index: i,
                          status: 'active',
                          eventId: eventId || p.eventId,
                        }))
                      }
                    >
                      {s.title}{' '}
                      {progress.done.includes(s.id)
                        ? '✓'
                        : progress.skipped.includes(s.id)
                          ? '(skipped)'
                          : ''}
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
        {!t.storageOk && (
          <p role="alert">
            Your browser is blocking saved progress. Your place lasts only in
            this tab.
          </p>
        )}
        <p>
          Core completion is self-reported training, not certification. It is
          recorded after every core activity is done. Skipping never counts as
          completion.
        </p>
      </section>
      {t.context.isStaff && <CompletionRoster />}
    </main>
  )
}
function CompletionRoster() {
  const [state, setState] = useState({ state: 'loading' }),
    [query, setQuery] = useState(''),
    [onlyMissing, setOnlyMissing] = useState(true)
  async function load() {
    setState({ state: 'loading' })
    try {
      setState(await loadCompletions(supabase))
    } catch {
      setState({ state: 'error' })
    }
  }
  useEffect(() => {
    load()
  }, [])
  const rows = (state.rows ?? []).filter(
    (r) =>
      (!onlyMissing || !r.completed_at) &&
      (r.name ?? '').toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <section className="tour-card" data-tour="completion-roster">
      <h2>Core training progress</h2>
      {state.state === 'loading' && (
        <p role="status">Loading member progress…</p>
      )}
      {state.state === 'missing' && (
        <p role="status">
          Completion tracking is not set up yet. Training still works on each
          device.
        </p>
      )}
      {state.state === 'error' && (
        <p role="alert">
          Could not load progress. No completion totals are available.
        </p>
      )}
      {state.state === 'ok' && (
        <>
          <p>
            {state.rows.filter((r) => r.completed_at).length} of{' '}
            {state.rows.length} active members completed core version 1.
          </p>
          <label className="tour-field">
            Find a member
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="tour-check">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            Show members who have not finished
          </label>
          <ul className="tour-roster">
            {rows.map((r) => (
              <li key={r.member_id}>
                <b>{r.name || 'Unnamed member'}</b>
                <span>
                  {r.completed_at
                    ? `Completed · ${TRACK_NAMES[r.track] ?? r.track}`
                    : 'Not completed'}
                </span>
              </li>
            ))}
          </ul>
          {!rows.length && <p>No members match this filter.</p>}
        </>
      )}
      <button onClick={load}>Refresh progress</button>
    </section>
  )
}
