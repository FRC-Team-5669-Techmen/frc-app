import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import {
  CATALOG_SELECT, HOLDER_SELECT, SYNC_LOG_SELECT, NOT_SYNCED_LINE,
  resolvePageState, viewModeFor, groupCatalog, holderCounts, holdersFor,
  ownCertifications, groupByHolder, syncSummary, statusLabel, normEmail,
  fmtDate, fmtDateTime,
} from './ideaCerts'
import './CertificationsPage.css'

// The official IDEA certifications (/certifications), read from the mirror.
//
// IDEA Classroom is the one record: certifications are awarded there and only
// there, and this app holds a one-way copy (migration 0001, contract in
// docs/IDEA_CERTIFICATIONS_SYNC.md). So this page has NO write path at all --
// no award, no request, no edit -- and every rule about what counts as held
// lives in src/ideaCerts.js, not here.
//
// What each viewer gets is decided by RLS, not by this file: members and staff
// read every holder, a parent-only account reads only their linked students'
// rows. The page shapes itself to match: a parent sees "Your student" instead
// of "Your certifications" and no team-wide holder counts, because counts over
// a parent's narrowed rows would be wrong numbers presented as right ones.
//
// Until migration 0001 is applied, and until the first sync arrives, the page
// is one plain line (NOT_SYNCED_LINE), never an error.

function StatusPill({ status }) {
  return <span className={`ic-pill ic-st-${status}`}>{statusLabel(status)}</span>
}

function HolderLine({ row, me, showName = true, showCode = false, nameOf }) {
  return (
    <li className={`ic-holder${row.held ? '' : ' ic-holder-off'}`} data-serial={row.serial}>
      <div className="ic-holder-top">
        {showName && <span className="ic-holder-name">{row.holder_name}</span>}
        {showCode && (
          <span className="ic-holder-name">
            <span className="ic-code">{row.code}</span> {nameOf?.(row.code)}
          </span>
        )}
        {me && normEmail(row.email) === me && showName && <span className="ic-you">You</span>}
        <StatusPill status={row.effective} />
      </div>
      <div className="ic-holder-meta hud-mono">
        <span>Serial {row.serial}</span>
        <span>Awarded {fmtDate(row.awarded_at)}</span>
        <span>{row.expires_at ? `Expires ${fmtDate(row.expires_at)}` : 'No expiry'}</span>
      </div>
    </li>
  )
}

export default function CertificationsPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const isParent = hasRole('parent') && !isStaff
  const mode = viewModeFor({ isStaff, isParent })
  const me = normEmail(session?.user?.email)

  const [load, setLoad] = useState({ status: 'loading' })
  const [open, setOpen] = useState(() => new Set())

  useEffect(() => {
    let active = true
    async function run() {
      const [cat, hold, log] = await Promise.all([
        supabase.from('idea_cert_catalog').select(CATALOG_SELECT),
        supabase.from('idea_cert_holders').select(HOLDER_SELECT),
        // Staff-only by RLS; not asked for at all otherwise. Its failure never
        // breaks the page -- it only feeds the sync readout.
        isStaff
          ? supabase.from('idea_cert_sync_log').select(SYNC_LOG_SELECT)
              .order('received_at', { ascending: false }).limit(10)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (!active) return
      setLoad({
        status: resolvePageState({ catalogError: cat.error, holdersError: hold.error, catalog: cat.data ?? [] }),
        catalog: cat.data ?? [],
        holders: hold.data ?? [],
        log: log.error ? [] : (log.data ?? []),
        error: cat.error || hold.error || null,
        // One clock for the whole render, so a row cannot read active in one
        // section and expired in another.
        at: Date.now(),
      })
    }
    run().catch(err => { if (active) setLoad({ status: 'error', error: err }) })
    return () => { active = false }
  }, [isStaff])

  const derived = useMemo(() => {
    if (load.status !== 'ready') return null
    const byCode = new Map(load.catalog.map(c => [c.code, c]))
    return {
      byCode,
      groups: groupCatalog(load.catalog),
      counts: holderCounts(load.holders, load.at),
      mine: ownCertifications(load.holders, me, load.at),
      students: groupByHolder(load.holders, load.at),
    }
  }, [load, me])

  const sync = useMemo(() => syncSummary(load.log ?? []), [load.log])

  function toggle(code) {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const nameOf = (code) => derived?.byCode.get(code)?.name ?? ''
  const empty = load.status === 'not_set_up' || load.status === 'not_synced'

  return (
    <div className="ic-wrap">
      <div className="ic-body">
        <header className="ic-head">
          <h1 className="ic-title">Certifications</h1>
          {load.status === 'ready' && (
            <p className="ic-lede">
              The official IDEA certifications, awarded in IDEA Classroom. This page is a read-only copy.
            </p>
          )}
        </header>

        {load.status === 'loading' && <p className="ic-muted hud-mono">Loading…</p>}

        {empty && (
          <p className="ic-empty" data-state={load.status === 'not_set_up' ? 'not-set-up' : 'not-synced'}>
            {NOT_SYNCED_LINE}
          </p>
        )}

        {load.status === 'error' && (
          <p className="ic-error" role="alert">
            Could not load certifications{load.error?.message ? `: ${load.error.message}` : '.'}
          </p>
        )}

        {/* Staff: when the mirror last heard from IDEA, and whether the latest
            attempt was refused. Shown under the empty line too, because a
            first sync that was refused is exactly when staff need to know. */}
        {mode === 'staff' && (load.status === 'ready' || load.status === 'not_synced') && sync.lastAttempt && (
          <div className="ic-sync hud-mono" data-testid="ic-sync">
            {sync.lastOk
              ? <p>
                  Last sync {fmtDateTime(sync.lastOk.received_at)}
                  {sync.lastOk.source_revision ? ` · ${sync.lastOk.source_revision}` : ''}
                  {` · ${sync.lastOk.catalog_count ?? 0} certifications · ${sync.lastOk.holder_count ?? 0} holder rows`}
                </p>
              : <p>No sync has been accepted yet.</p>}
            {sync.failing && (
              <p className="ic-sync-fail">
                Latest attempt refused {fmtDateTime(sync.lastAttempt.received_at)}: {sync.lastAttempt.error}
              </p>
            )}
          </div>
        )}

        {derived && mode !== 'parent' && (
          <section className="ic-section" aria-labelledby="ic-mine-h" data-testid="ic-mine">
            <h2 className="ic-section-title" id="ic-mine-h">
              Your certifications
              <span className="ic-section-count hud-mono">
                {derived.mine.filter(r => r.held).length} held
              </span>
            </h2>
            {derived.mine.length === 0
              ? <p className="ic-muted">You hold no IDEA certifications yet.</p>
              : (
                <ul className="ic-holders">
                  {derived.mine.map(r => (
                    <HolderLine key={r.serial} row={r} showName={false} showCode nameOf={nameOf} />
                  ))}
                </ul>
              )}
            <p className="ic-note">Matched by your sign-in email{me ? `, ${me}` : ''}.</p>
          </section>
        )}

        {derived && mode === 'parent' && (
          <section className="ic-section" aria-labelledby="ic-student-h" data-testid="ic-student">
            <h2 className="ic-section-title" id="ic-student-h">Your student</h2>
            {derived.students.length === 0
              ? <p className="ic-muted">No linked student holds an IDEA certification yet.</p>
              : derived.students.map(s => (
                  <div className="ic-student" key={s.email}>
                    <h3 className="ic-student-name">
                      {s.name}
                      <span className="ic-section-count hud-mono">{s.heldCount} held</span>
                    </h3>
                    <ul className="ic-holders">
                      {s.rows.map(r => (
                        <HolderLine key={r.serial} row={r} showName={false} showCode nameOf={nameOf} />
                      ))}
                    </ul>
                  </div>
                ))}
          </section>
        )}

        {derived && (
          <section className="ic-section" aria-labelledby="ic-all-h" data-testid="ic-catalog">
            <h2 className="ic-section-title" id="ic-all-h">All certifications</h2>
            {derived.groups.map(g => (
              <div className="ic-group" key={g.category}>
                <h3 className="ic-cat hud-label">{g.category}</h3>
                <ul className="ic-certs">
                  {g.certs.map(c => {
                    const isOpen = open.has(c.code)
                    const n = derived.counts.get(c.code) ?? 0
                    const rows = isOpen ? holdersFor(c.code, load.holders, load.at) : []
                    const panelId = `ic-panel-${c.code}`
                    return (
                      <li className={`ic-cert${isOpen ? ' ic-cert-open' : ''}`} key={c.code} data-code={c.code}>
                        <button
                          type="button"
                          className="ic-cert-btn"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => toggle(c.code)}
                        >
                          <span className="ic-code">{c.code}</span>
                          <span className="ic-cert-name">
                            {c.name}
                            {!c.active && <span className="ic-retired">Retired</span>}
                          </span>
                          <span className="ic-level hud-mono">L{c.level}</span>
                          {mode !== 'parent' && (
                            <span className="ic-count hud-mono" data-testid="ic-count">
                              {n} {n === 1 ? 'holder' : 'holders'}
                            </span>
                          )}
                          <span className={`ic-chev${isOpen ? ' ic-chev-up' : ''}`} aria-hidden="true">▾</span>
                        </button>

                        {isOpen && (
                          <div className="ic-panel" id={panelId}>
                            <dl className="ic-facts">
                              {c.definition && <><dt>Definition</dt><dd>{c.definition}</dd></>}
                              {c.allows && <><dt>Allows</dt><dd>{c.allows}</dd></>}
                              {c.does_not_allow && <><dt>Does not allow</dt><dd>{c.does_not_allow}</dd></>}
                              <dt>Prerequisites</dt>
                              <dd>
                                {(c.prerequisites ?? []).length === 0
                                  ? 'None'
                                  : c.prerequisites.map(p => (
                                      <span className="ic-prereq" key={p}>
                                        <span className="ic-code">{p}</span> {nameOf(p)}
                                      </span>
                                    ))}
                              </dd>
                              {c.renewal && <><dt>Renewal</dt><dd>{c.renewal}</dd></>}
                            </dl>

                            <h4 className="ic-panel-h">{mode === 'parent' ? 'Your student' : 'Holders'}</h4>
                            {rows.length === 0
                              ? <p className="ic-muted">
                                  {mode === 'parent' ? 'Your student does not hold this.' : 'Nobody holds this yet.'}
                                </p>
                              : (
                                <ul className="ic-holders">
                                  {rows.map(r => <HolderLine key={r.serial} row={r} me={me} />)}
                                </ul>
                              )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
