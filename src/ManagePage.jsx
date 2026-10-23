import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { loadAdminCounts, manageLayout } from './adminTools'
import { IconAdmin } from './navIcons'
import HubTile from './HubTile'
import './Hub.css'

// /manage, Team admin (ledger 0017, decision 49): every staff tool in four
// groups with live counts. A tile with something waiting moves to the top.
// The filter box finds a tool by name, what it does, or a word it answers to.
// Every tool keeps its own address; this page only reaches them.
const LINES = {
  signouts: (n) => `${n} waiting`, access: (n) => `${n} waiting`, feedback: (n) => `${n} new`,
  readiness: (n) => `${n} item${n === 1 ? '' : 's'} open`, standing: (n) => `${n} absence${n === 1 ? '' : 's'} to decide`, verify: (n) => `${n} to verify`,
}

export default function ManagePage({ hasRole = () => false }) {
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const isAdmin = hasRole('admin')
  const [counts, setCounts] = useState(null)
  const [query, setQuery] = useState('')
  const box = useRef(null)
  useEffect(() => {
    if (!isStaff) return
    let live = true
    loadAdminCounts(supabase, { isAdmin }).then((c) => { if (live) setCounts(c) }).catch(() => { if (live) setCounts({}) })
    return () => { live = false }
  }, [isStaff, isAdmin])

  if (!isStaff) return <main className="hub-wrap"><h1 className="hub-title">Team admin</h1><p className="hub-sub">For mentors and admins.</p><Link className="hub-link" to="/dashboard">Back to Home</Link></main>

  const layout = manageLayout(counts ?? {}, { isAdmin, query })
  const tile = (t) => <HubTile key={t.path} to={t.path} title={t.title} tone={t.waiting > 0 ? 'alert' : null} badge={t.waiting || null}
    line={t.waiting > 0 && LINES[t.count] ? `${LINES[t.count](t.waiting)} · ${t.what}` : t.what} />
  return (
    <main className="hub-wrap hub-wrap-wide" data-page="manage">
      <header className="hub-head hub-head-row">
        <div>
          <span className="hub-eyebrow"><IconAdmin /> Staff</span>
          <h1 className="hub-title">Team admin</h1>
          <p className="hub-sub">{counts === null ? 'Checking what is waiting…' : layout.waiting?.length ? `${layout.waiting.reduce((n, t) => n + t.waiting, 0)} things waiting on you` : 'Nothing waiting on you right now.'}</p>
        </div>
        <label className="hub-filter">
          <span className="hub-sr">Find a tool</span>
          <input ref={box} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a tool: roster, trips, hours…" autoComplete="off" />
        </label>
      </header>
      {layout.filtered ? (
        layout.filtered.length ? <div className="hub-grid">{layout.filtered.map(tile)}</div>
          : <div className="hub-empty"><p>No tool matches "{query}".</p><button className="hub-btn" onClick={() => { setQuery(''); box.current?.focus() }}>Clear</button></div>
      ) : (
        <>
          {layout.waiting.length > 0 && <section className="hub-group hub-group-waiting" aria-label="Waiting on you"><h2 className="hub-group-title">Waiting on you</h2><div className="hub-grid">{layout.waiting.map(tile)}</div></section>}
          {layout.groups.map((g) => (
            <section key={g.key} className="hub-group" aria-label={g.title}>
              <h2 className="hub-group-title">{g.title}</h2>
              <div className="hub-grid">{g.tools.map(tile)}</div>
            </section>
          ))}
        </>
      )}
    </main>
  )
}
