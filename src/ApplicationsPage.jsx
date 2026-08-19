import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { resolveCurrentSeason } from './seasons'
import { APPLICATION_SELECT } from './applicationFields'
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

// The parent questionnaire (src/ParentResponse.jsx), staff-read-only — not
// even the student sees their own parent's answers. Absent is the normal
// case: it gates nothing, so "pending" is not a fault, just unanswered.
const WEEKEND_LABEL = {
  saturdays: 'Saturdays', sundays: 'Sundays', either: 'Either day', neither: 'Neither',
}
const YNM_LABEL = { yes: 'Yes', no: 'No', maybe: 'Maybe' }

// A named employer with consent is a legal sponsorship ask; a named employer
// without it is not — the two must never be visually confusable. No employer
// named is a third, unrelated state (nothing to contact either way).
function employerBadge(response) {
  if (!response?.employer_name) return null
  return response.employer_contact_consent
    ? { cls: 'ap-consent-yes', text: 'Consent to contact' }
    : { cls: 'ap-consent-no', text: 'No consent — do not contact' }
}

// The export IS the full table: every application column, one row per member,
// plus the parent response (rows are pre-merged with `_response` before this
// runs — see downloadCsv's caller). Order matches the form so a mentor reading
// the CSV reads it in question order.
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
  ['FLL volunteering interest', r => r.fll_volunteering_interest ?? ''],
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
  ['Parent responded',        r => yn(!!r._response)],
  ['Parent response date',    r => r._response ? fmtDateTime(r._response.updated_at ?? r._response.submitted_at) : ''],
  ['Weekend supervision',     r => r._response ? (WEEKEND_LABEL[r._response.weekend_supervision] ?? '') : ''],
  ['Meal support',            r => r._response ? (YNM_LABEL[r._response.meal_support] ?? '') : ''],
  ['Can drive',               r => r._response ? (YNM_LABEL[r._response.travel_driving] ?? '') : ''],
  ['Employer name',           r => r._response?.employer_name ?? ''],
  ['Employer contact consent', r => (r._response ? yn(r._response.employer_contact_consent) : '')],
  ['Can donate or lend',      r => r._response?.donation_offer ?? ''],
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

function ParentResponseBlock({ response, onResend, resendState }) {
  const badge = employerBadge(response)
  return (
    <>
      <h3 className="ap-section">
        Parent response
        <span className="ap-section-note">optional — gates nothing</span>
      </h3>

      {response ? (
        <>
          <Row label="Weekend supervision" value={WEEKEND_LABEL[response.weekend_supervision]} />
          <Row label="Meal support"  value={YNM_LABEL[response.meal_support]} />
          <Row label="Can drive"     value={YNM_LABEL[response.travel_driving]} />
          {response.employer_name && (
            <div className="ap-row">
              <span className="ap-row-label">Employer</span>
              <span className="ap-row-value">
                {response.employer_name}
                {badge && <span className={`ap-badge ${badge.cls}`}>{badge.text}</span>}
              </span>
            </div>
          )}
          <Row label="Can donate or lend" value={response.donation_offer} />
          <Row label="Answered" value={fmtDateTime(response.updated_at ?? response.submitted_at)} />
        </>
      ) : (
        <p className="ap-muted">No response yet.</p>
      )}

      <button className="ap-resend" type="button" disabled={resendState === 'sending'} onClick={onResend}>
        {resendState === 'sending' ? 'Sending…' : response ? 'Resend the link' : 'Send the parent email'}
      </button>
      {resendState === 'sent'    && <p className="ap-muted">Sent.</p>}
      {resendState === 'skipped' && <p className="ap-muted">Email is not configured on this project — nothing was sent.</p>}
      {resendState === 'failed'  && <p className="ap-error">That didn't send. Try again in a moment.</p>}
    </>
  )
}

function Detail({ app, onClose, onConfirmDiscord, busy, response, onResend, resendState }) {
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
          <Row label="FLL volunteering interest" value={app.fll_volunteering_interest} />
          <Row label="Build season ack" value={yn(app.build_season_acknowledged)} />

          <h3 className="ap-section">Parent or guardian</h3>
          <Row label="Name"    value={app.parent_name} />
          <Row label="Email"   value={app.parent_email} />
          <Row label="Phone"   value={app.parent_phone} />
          <Row label="Second"  value={app.parent_two_name} />
          <Row label="Second contact" value={app.parent_two_contact} />

          <ParentResponseBlock response={response} onResend={onResend} resendState={resendState} />

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
  const [responses, setResponses] = useState({})   // application_id -> parent response
  const [q, setQ] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)   // filter: no parent_responses row yet
  const [open, setOpen] = useState(null)     // application id
  const [busy, setBusy] = useState(false)
  // application id -> '' | sending | sent | skipped | failed. Shared by the
  // per-row resend button and the modal's, since both resend the same id.
  const [resendStates, setResendStates] = useState({})
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
    // Explicit column list, not `*`: parent_token is revoked from clients at
    // the column level — staff included — and Postgres expands the star before
    // checking privileges (supabase/parent_responses.sql).
    supabase.from('member_applications')
      .select(`${APPLICATION_SELECT}, profiles(full_name, nickname, grad_year, shirt_size)`)
      .eq('season_id', seasonId)
      .order('submitted_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); setApps([]); return }
        const rows = data ?? []
        setApps(rows)
        // Parent questionnaires, staff-read-only. A failure here is silent on
        // purpose: it is supplementary, and the roster must still render.
        if (!rows.length) { setResponses({}); return }
        supabase.from('parent_responses')
          .select('application_id, weekend_supervision, meal_support, travel_driving, employer_name, employer_contact_consent, donation_offer, submitted_at, updated_at')
          .in('application_id', rows.map(r => r.id))
          .then(({ data: prs }) => {
            setResponses(Object.fromEntries((prs ?? []).map(p => [p.application_id, p])))
          })
      })
  }, [isStaff, seasonId])

  const filtered = useMemo(() => {
    if (!apps) return null
    let list = apps
    const needle = q.trim().toLowerCase()
    if (needle) {
      list = list.filter(a =>
        [displayName(a.profiles), a.legal_first_name, a.legal_last_name,
         a.pathway, a.subteam_first, a.discord_username]
          .some(v => (v ?? '').toLowerCase().includes(needle)))
    }
    if (pendingOnly) list = list.filter(a => !responses[a.id])
    return list
  }, [apps, q, pendingOnly, responses])

  // Top-choice counts: where recruiting is short, before the season starts.
  const topChoices = useMemo(() => {
    if (!apps?.length) return []
    const counts = new Map()
    for (const a of apps) counts.set(a.subteam_first, (counts.get(a.subteam_first) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [apps])

  const pendingCount = useMemo(
    () => (apps ?? []).filter(a => !responses[a.id]).length,
    [apps, responses],
  )

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

  // Staff resend. Same Edge Function the student's submit calls — it accepts a
  // staff caller for ANY application (is_staff() checked server-side), which is
  // what covers a send that failed at submit time. Called from both the
  // per-row button and the modal's, keyed by application id so concurrent
  // clicks on different rows don't share one disabled/confirming state.
  async function resendParent(id) {
    setResendStates(s => ({ ...s, [id]: 'sending' }))
    const { data, error: err } = await supabase.functions
      .invoke('send-parent-request', { body: { application_id: id } })
    const next = err ? 'failed' : (data?.skipped ? 'skipped' : 'sent')
    setResendStates(s => ({ ...s, [id]: next }))
    // Confirmation is transient — the control re-enables itself so a genuine
    // second send (e.g. after fixing the parent email) doesn't need a reload.
    setTimeout(() => setResendStates(s => ({ ...s, [id]: '' })), 4000)
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
        <label className="ap-filter-toggle">
          <input
            type="checkbox"
            checked={pendingOnly}
            onChange={e => setPendingOnly(e.target.checked)}
          />
          Pending parent response only{pendingCount ? ` (${pendingCount})` : ''}
        </label>
        <button
          className="ap-export"
          type="button"
          disabled={!filtered?.length}
          onClick={() => downloadCsv(
            rowsToCsv(filtered.map(a => ({ ...a, _response: responses[a.id] ?? null }))),
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
            <div className="ap-stat">
              <span className="ap-stat-num">{pendingCount}</span>
              <span className="ap-stat-label">parent response pending</span>
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
                  <th>Parent response</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const resp = responses[a.id]
                  const badge = employerBadge(resp)
                  const rowResend = resendStates[a.id] ?? ''
                  return (
                    <tr key={a.id} className="ap-tr" onClick={() => { setOpen(a.id) }}>
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
                      <td>
                        <div className="ap-parent-cell">
                          {resp ? (
                            <>
                              <span className="ap-ok">Responded {fmtDateTime(resp.updated_at ?? resp.submitted_at)}</span>
                              {badge && <span className={`ap-badge ${badge.cls}`}>{badge.text}</span>}
                            </>
                          ) : (
                            <>
                              <span className="ap-pending">Pending</span>
                              <button
                                type="button"
                                className="ap-row-resend"
                                disabled={rowResend === 'sending'}
                                title={rowResend === 'skipped' ? 'Email is not configured on this project — nothing was sent.' : undefined}
                                onClick={e => { e.stopPropagation(); resendParent(a.id) }}
                              >
                                {rowResend === 'sending' ? 'Sending…'
                                  : rowResend === 'sent' ? 'Sent'
                                  : rowResend === 'skipped' ? 'Skipped'
                                  : rowResend === 'failed' ? 'Failed — retry'
                                  : 'Resend'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
          response={responses[openApp.id] ?? null}
          resendState={resendStates[openApp.id] ?? ''}
          onResend={() => resendParent(openApp.id)}
        />
      )}
    </div>
  )
}
