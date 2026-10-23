import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UPDATES, sortUpdates, readSeen, markSeen, newSince } from './updates'
import './Hub.css'
import './Updates.css'

// What's new (/updates): every app release, newest first, from src/updates.js.
// Opening the page marks everything seen; entries newer than the previous
// visit carry a NEW chip for this visit.

function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UpdatesPage() {
  const [prevSeen] = useState(() => readSeen())
  useEffect(() => { markSeen() }, [])
  const list = sortUpdates(UPDATES)
  const fresh = new Set(newSince(list, prevSeen))
  const isNew = (u) => fresh.has(u)

  // One group per date, in order.
  const groups = []
  for (const u of list) {
    const g = groups[groups.length - 1]
    if (g && g.date === u.date) g.items.push(u)
    else groups.push({ date: u.date, items: [u] })
  }

  return (
    <main className="hub-wrap upd-wrap" data-page="updates">
      <header className="hub-head">
        <span className="hub-eyebrow">Updates</span>
        <h1 className="hub-title">What&apos;s new</h1>
        <p className="hub-sub">Every update to the app, newest first.</p>
      </header>
      <ol className="upd-timeline">
        {groups.map((g) => (
          <li key={g.date} className="upd-day">
            <time className="upd-date" dateTime={g.date}>{fmtDate(g.date)}</time>
            <div className="upd-cards">
              {g.items.map((u) => (
                <article key={u.title} className="upd-card">
                  <div className="upd-card-head">
                    <h2 className="upd-title">{u.title}</h2>
                    {isNew(u) && <span className="upd-new">New</span>}
                  </div>
                  <ul className="upd-items">
                    {u.items.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                  {u.route && u.route !== '/updates' && <Link to={u.route} className="upd-open">Open <span aria-hidden="true">→</span></Link>}
                </article>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}
