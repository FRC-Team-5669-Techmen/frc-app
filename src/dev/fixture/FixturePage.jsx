// /_fixture -- the fixture-mode control page. Dev only: App.jsx creates the
// lazy import only when import.meta.env.DEV, the same guard as /_ds, so this
// file is never in a production bundle and the route answers 404 there.
//
// It deliberately does NOT import client.js. Under `vite --mode fixture` the
// fixture client is the app's supabase module and publishes window.__fx; under
// plain `vite` it is not loaded at all, and importing it here would start a
// second, fake client beside the real one. So this page drives window.__fx and
// says plainly when fixture mode is off.

import { useState } from 'react'
import { ROUTES } from './routes.js'
import './FixturePage.css'

const GROUPS = [
  ['public', 'Public'],
  ['member', 'Member'],
  ['staff', 'Staff'],
  ['admin', 'Admin'],
  ['checkin', 'Check-in fast paths (writes on open)'],
  ['dev', 'Dev'],
]

// The numbered migrations tonight's lanes add. A number with no feature file
// behind it changes nothing, which the page says next to it.
const KNOWN_MIGRATIONS = ['0001', '0002', '0003', '0004', '0005']

export default function FixturePage() {
  const fx = typeof window !== 'undefined' ? window.__fx : undefined
  const [, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)

  if (!fx) {
    return (
      <main className="fx-wrap">
        <h1 className="fx-title">Fixture controls</h1>
        <p className="fx-note">
          Fixture mode is not active. Start the app with <code>npm run dev:fixture</code> (vite --mode fixture),
          then open <code>/_fixture</code> on that server.
        </p>
      </main>
    )
  }

  const mig = fx.migrations
  const known = [...new Set([...KNOWN_MIGRATIONS, ...fx.migrationNumbers])].sort()
  const isOn = (n) => mig === 'all' || (Array.isArray(mig) && mig.includes(n))
  const featureFor = (n) => fx.plugins.filter((p) => p.migration === n).map((p) => p.name)

  function setPersona(key) {
    fx.setPersona(key)
    window.location.reload()
  }
  function setMig(next) {
    fx.setMigrations(next)
    window.location.reload()
  }
  function toggle(n) {
    const current = mig === 'all' ? known : mig === 'none' ? [] : mig
    const next = current.includes(n) ? current.filter((x) => x !== n) : [...current, n]
    setMig(next.length ? next : 'none')
  }
  function reset() {
    fx.reset()
    refresh()
  }

  const errors = fx.calls.filter((c) => c.error)

  return (
    <main className="fx-wrap">
      <h1 className="fx-title">Fixture controls</h1>
      <p className="fx-note">
        Every route below runs the real app against an in-memory store of fictional data.
        Nothing here reaches a Supabase project.
      </p>

      <section className="fx-section" aria-labelledby="fx-persona">
        <h2 id="fx-persona" className="fx-h2">Signed in as</h2>
        <div className="fx-chips">
          {fx.personaKeys.map((key) => (
            <button
              key={key}
              type="button"
              className={`fx-chip${fx.persona === key ? ' on' : ''}`}
              aria-pressed={fx.persona === key}
              onClick={() => setPersona(key)}
            >
              {key === 'signedout' ? 'Signed out' : fx.personas[key].label}
            </button>
          ))}
        </div>
      </section>

      <section className="fx-section" aria-labelledby="fx-mig">
        <h2 id="fx-mig" className="fx-h2">Migrations applied</h2>
        <div className="fx-chips">
          <button type="button" className={`fx-chip${mig === 'all' ? ' on' : ''}`} aria-pressed={mig === 'all'} onClick={() => setMig('all')}>All</button>
          <button type="button" className={`fx-chip${mig === 'none' ? ' on' : ''}`} aria-pressed={mig === 'none'} onClick={() => setMig('none')}>None</button>
          {known.map((n) => (
            <button key={n} type="button" className={`fx-chip${isOn(n) ? ' on' : ''}`} aria-pressed={isOn(n)} onClick={() => toggle(n)}>
              {n}
              <span className="fx-chip-sub">{featureFor(n).join(', ') || 'no fixture'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="fx-section" aria-labelledby="fx-store">
        <h2 id="fx-store" className="fx-h2">Store</h2>
        <p className="fx-mono">
          {Object.entries(fx.db).filter(([k]) => !k.startsWith('__')).reduce((n, [, rows]) => n + (rows?.length ?? 0), 0)} rows
          {' / '}{fx.seedProblems.length} seed problem(s)
          {' / '}{errors.length} error answer(s) this page load
        </p>
        <button type="button" className="fx-btn" onClick={reset}>Reset and reseed</button>
        {fx.seedProblems.length > 0 && (
          <ul className="fx-list fx-mono">
            {fx.seedProblems.slice(0, 20).map((p, i) => <li key={i}>{[p.plugin, p.table, p.problem].filter(Boolean).join(' / ')}</li>)}
          </ul>
        )}
      </section>

      <section className="fx-section" aria-labelledby="fx-routes">
        <h2 id="fx-routes" className="fx-h2">Routes</h2>
        {GROUPS.map(([group, label]) => (
          <div key={group} className="fx-group">
            <h3 className="fx-h3">{label}</h3>
            <ul className="fx-links">
              {ROUTES.filter((r) => r.group === group).map((r) => (
                <li key={r.path}>
                  <a className="fx-link" href={r.url}>
                    <span>{r.label}</span>
                    <span className="fx-mono fx-path">{r.url}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  )
}
