import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { resolveCurrentSeason } from './seasons'
import './ApplicationsPage.css'

// Staff view of per-season member applications (src/MemberApplication.jsx).
// Read-only apart from the staff-set Discord confirmation, plus a client-side
// CSV export of the full table. No Sheet mirror, no Google API.

const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
const arr     = v => (Array.isArray(v) ? v.join('; ') : (v ?? ''))
const yn      = v => (v === true ? 'Yes' : v === false ? 'No' : '')

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// The export IS the full table: every application column, one row per member.
// Order matches the form so a mentor reading the CSV reads it in question order.
const COLUMNS = [
  ['Member',                  r => displayName(r.profiles)],
  ['Submitted',               r => fmtDateTime(r.submitted_at)],
  ['Legal first name',        r => r.legal_first_name],
  ['Legal last name',         r => r.legal_last_name],
  ['Preferred name',          r => r.profiles?.nickname ?? ''],
  ['Student phone',           r => r.student_phone],
  ['Pathway',                 r => r.pathway],
  ['Graduation year',         r => r.profiles?.grad_year ?? ''],
  ['Returning member',        r => yn(r.returning_member)],
  ['Seasons on team',         r => r.seasons_on_team ?? ''],
  ['Prior robotics',          r => arr(r.prior_robotics)],
  ['Programming',             r => arr(r.programming_languages)],
  ['CAD tools',               r => arr(r.cad_tools)],
  ['Hands-on experience',     r => arr(r.hands_on_experience)],
  ['Certifications claimed',  r => r.certifications_claimed ?? ''],
  ['Subteam 1st',             r => r.subteam_first],
  ['Subteam 2nd',             r => r.subteam_second],
  ['Subteam 3rd',             r => r.subteam_third ?? ''],
  ['Subteam rationale',       r => r.subteam_rationale],
  ['Monday lunch',            r => r.monday_lunch],
  ['Tuesday after school',    r => r.tuesday_after_school],
  ['Friday after school',     r => r.friday_after_school],
  ['Transport after 5pm',     r => r.transport_after_5pm],
  ['Seasonal conflicts',      r => arr(r.seasonal_conflicts)],
  ['Conflict detail',         r => r.conflict_detail ?? ''],
  ['Build season ack',        r => yn(r.build_season_acknowledged)],
  ['Parent name',             r => r.parent_name],
  ['Parent email',            r => r.parent_email],
  ['Parent phone',            r => r.parent_phone],
  ['Parent 2 name',           r => r.parent_two_name ?? ''],
  ['Parent 2 contact',        r => r.parent_two_contact ?? ''],
  ['Shirt size',              r => r.profiles?.shirt_size ?? ''],
  ['Dietary restrictions',    r => r.dietary_restrictions ?? ''],
  ['Emergency contact',       r => r.emergency_contact_name],
  ['Emergency phone',         r => r.emergency_contact_phone],
  ['Discord username',        r => r.discord_username],
  ['Discord server confirmed', r => yn(r.discord_server_confirmed)],
  ['Conduct ack',             r => yn(r.conduct_acknowledged)],
]

function rowsToCsv(rows) {
  const lines = [COLUMNS.map(([h]) => csvCell(h)).join(',')]
  for (const r of rows) lines.push(COLUMNS.map(([, get]) => csvCell(get(r))).join(','))
  return lines.join('\r\n')
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function Row({ label, value }) {
  const text = Array.isArray(value) ? value.join(', ') : value
  if (text === null || text === undefined || text === '' || (Array.isArray(value) && !value.length)) return null
  return (
    <div className="ap-row">
      <span className="ap-row-label">{label}</span>
      <span className="ap-row-value">{typeof text === 'boolean' ? yn(text) : text}</span>
    </div>
  )
}

function Detail({ app, onClose, onConfirmDiscord, busy }) {
  return (
    <div className="ap-modal-backdrop" onClick={onClose}>
      <div className="ap-modal" onClick={e => e.stopPropagation()}>
        <div className="ap-modal-head">
          <div>
            <h2 className="ap-modal-title">{displayName(app.profiles)}</h2>
            <span className="ap-modal-sub">Submitted {fmtDateTime(app.submitted_at)}</span>
          </div>
          <button className="ap-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ap-modal-body">
          <h3 className="ap-section">Identity and school</h3>
          <Row label="Legal name"   value={`${app.legal_first_name} ${app.legal_last_name}`} />
          <Row label="Preferred"    value={app.profiles?.nickname} />
          <Row label="Student phone" value={app.student_phone} />
          <Row label="Pathway"      value={app.pathway} />
          <Row label="Graduation"   value={app.profiles?.grad_year} />
          <Row label="Returning"    value={yn(app.returning_member)} />
          <Row label="Seasons on team" value={app.seasons_on_team} />

          <h3 className="ap-section">Subteam interest</h3>
          <Row label="1st choice" value={app.subteam_first} />
          <Row label="2nd choice" value={app.subteam_second} />
          <Row label="3rd choice" value={app.subteam_third} />
          <Row label="Why"        value={app.subteam_rationale} />

          <h3 className="ap-section">
            Prior experience
            <span className="ap-section-note">self-reported — not a certification</span>
          </h3>
          <Row label="Robotics"    value={app.prior_robotics} />
          <Row label="Programming" value={app.programming_languages} />
          <Row label="CAD"         value={app.cad_tools} />
          <Row label="Hands-on"    value={app.hands_on_experience} />
          <Row label="Claimed certs" value={app.certifications_claimed} />

          <h3 className="ap-section">Commitment</h3>
          <Row label="Monday lunch"    value={app.monday_lunch} />
          <Row label="Tuesday after school" value={app.tuesday_after_school} />
          <Row label="Friday after school"  value={app.friday_after_school} />
          <Row label="Ride after 5pm"  value={app.transport_after_5pm} />
          <Row label="Conflicts"       value={app.seasonal_conflicts} />
          <Row label="Conflict detail" value={app.conflict_detail} />
          <Row label="Build season ack" value={yn(app.build_season_acknowledged)} />

          <h3 className="ap-section">Parent or guardian</h3>
          <Row label="Name"    value={app.parent_name} />
          <Row label="Email"   value={app.parent_email} />
          <Row label="Phone"   value={app.parent_phone} />
          <Row label="Second"  value={app.parent_two_name} />
          <Row label="Second contact" value={app.parent_two_contact} />

          <h3 className="ap-section">Logistics</h3>
          <Row label="Shirt size" value={app.profiles?.shirt_size} />
          <Row label="Dietary"    value={app.dietary_restrictions} />
          <Row label="Emergency contact" value={app.emergency_contact_name} />
          <Row label="Emergency phone"   value={app.emergency_contact_phone} />

          <h3 className="ap-section">Discord</h3>
          <Row label="Username" value={app.discord_username} />
          <label className="ap-check">
            <input
              type="checkbox"
              checked={app.discord_server_confirmed}
              disabled={busy}
              onChange={e => onConfirmDiscord(app.id, e.target.checked)}
            />
            <span>In the Discord server (staff-set)</span>
          </label>
          <Row label="Conduct ack" value={yn(app.conduct_acknowledged)} />
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationsPage({ hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [seasons, setSeasons] = useState(null)
  const [seasonId, setSeasonId] = useState('')
  const [apps, setApps] = useState(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)     // application id
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isStaff) return
    supabase.from('seasons').select('id, name, start_date, end_date')
      .order('start_date', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return }
        const list = data ?? []
        setSeasons(list)
        setSeasonId(resolveCurrentSeason(list)?.id ?? list[0]?.id ?? '')
      })
  }, [isStaff])

  useEffect(() => {
    if (!isStaff || !seasonId) return
    setApps(null)
    supabase.from('member_applications')
      .select('*, profiles(full_name, nickname, grad_year, shirt_size)')
      .eq('season_id', seasonId)
      .order('submitted_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setApps([]); return }
        setApps(data ?? [])
      })
  }, [isStaff, seasonId])

  const filtered = useMemo(() => {
    if (!apps) return null
    const needle = q.trim().toLowerCase()
    if (!needle) return apps
    return apps.filter(a =>
      [displayName(a.profiles), a.legal_first_name, a.legal_last_name,
       a.pathway, a.subteam_first, a.discord_username]
        .some(v => (v ?? '').toLowerCase().includes(needle)))
  }, [apps, q])

  // Top-choice counts: where recruiting is short, before the season starts.
  const topChoices = useMemo(() => {
    if (!apps?.length) return []
    const counts = new Map()
    for (const a of apps) counts.set(a.subteam_first, (counts.get(a.subteam_first) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [apps])

  async function confirmDiscord(id, confirmed) {
    setBusy(true)
    const { error: err } = await supabase.rpc('staff_set_discord_confirmed', {
      p_application: id,
      p_confirmed: confirmed,
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    setApps(prev => prev.map(a => (a.id === id ? { ...a, discord_server_confirmed: confirmed } : a)))
  }

  if (!isStaff) {
    return (
      <div className="ap-wrap">
        <div className="ap-denied">You need a staff role to access this page.</div>
      </div>
    )
  }

  const season   = seasons?.find(s => s.id === seasonId)
  const openApp  = apps?.find(a => a.id === open)

  return (
    <div className="ap-wrap">
      <div className="ap-head">
        <h1 className="ap-title">Applications</h1>
        <p className="ap-sub">
          Every member completes one application per season. Contact details here
          are staff-visible only.
        </p>
      </div>

      <div className="ap-controls">
        <select className="ap-input" value={seasonId} onChange={e => { setSeasonId(e.target.value); setOpen(null) }}>
          {(seasons ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          className="ap-input ap-search"
          type="search"
          placeholder="Search name, pathway, subteam, Discord…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <button
          className="ap-export"
          type="button"
          disabled={!filtered?.length}
          onClick={() => downloadCsv(
            rowsToCsv(filtered),
            `applications-${(season?.name ?? 'season').replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
          )}
        >
          Export CSV
        </button>
      </div>

      {error && <p className="ap-error">{error}</p>}

      {apps === null && <p className="ap-muted">Loading…</p>}

      {apps !== null && apps.length === 0 && (
        <p className="ap-muted">No applications for this season yet.</p>
      )}

      {!!apps?.length && (
        <>
          <div className="ap-stats">
            <div className="ap-stat">
              <span className="ap-stat-num">{apps.length}</span>
              <span className="ap-stat-label">submitted</span>
            </div>
            <div className="ap-stat">
              <span className="ap-stat-num">{apps.filter(a => a.returning_member).length}</span>
              <span className="ap-stat-label">returning</span>
            </div>
            <div className="ap-stat">
              <span className="ap-stat-num">{apps.filter(a => !a.discord_server_confirmed).length}</span>
              <span className="ap-stat-label">not in Discord</span>
            </div>
          </div>

          <div className="ap-topchoices">
            <span className="ap-topchoices-label">First choices</span>
            {topChoices.map(([name, n]) => (
              <span key={name} className="ap-tag">{name} <strong>{n}</strong></span>
            ))}
          </div>

          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Pathway</th>
                  <th>Grad</th>
                  <th>Returning</th>
                  <th>1st choice</th>
                  <th>Mon / Tue / Fri</th>
                  <th>Discord</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} className="ap-tr" onClick={() => setOpen(a.id)}>
                    <td className="ap-name">{displayName(a.profiles)}</td>
                    <td>{a.pathway}</td>
                    <td className="ap-num">{a.profiles?.grad_year ?? '—'}</td>
                    <td>{a.returning_member ? `Yes${a.seasons_on_team ? ` (${a.seasons_on_team})` : ''}` : 'No'}</td>
                    <td>{a.subteam_first}</td>
                    <td className="ap-num">
                      {[a.monday_lunch, a.tuesday_after_school, a.friday_after_school]
                        .map(v => (v === 'Yes' ? 'Y' : v === 'No' ? 'N' : 'S')).join(' / ')}
                    </td>
                    <td className={a.discord_server_confirmed ? 'ap-ok' : 'ap-pending'}>
                      {a.discord_server_confirmed ? 'in server' : a.discord_username}
                    </td>
                    <td className="ap-num">{fmtDateTime(a.submitted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && <p className="ap-muted">No applications match that search.</p>}
        </>
      )}

      {openApp && (
        <Detail
          app={openApp}
          busy={busy}
          onClose={() => setOpen(null)}
          onConfirmDiscord={confirmDiscord}
        />
      )}
    </div>
  )
}
