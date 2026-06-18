import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { supabase } from './supabase'
import MemberSkillsPanel from './MemberSkillsPanel'
import './MemberSkillsHome.css'

const CoverageMatrix = lazy(() => import('./CoverageMatrix'))

// Non-staff Skills page: a personal dashboard (own certs + in-progress via
// MemberSkillsPanel) plus a cert-request form, with a toggle to view the team
// coverage matrix read-only. Staff get the management view (SkillsCatalog).
export default function MemberSkillsHome({ session, hasRole }) {
  const uid = session.user.id
  const [view, setView] = useState('mine')      // 'mine' | 'coverage'

  // Cert-request form data.
  const [skills, setSkills]   = useState([])    // full catalog
  const [certIds, setCertIds] = useState(new Set())
  const [myReqs, setMyReqs]   = useState([])    // my pending cert requests
  const [pick, setPick]       = useState('')
  const [note, setNote]       = useState('')
  const [msg, setMsg]         = useState(null)  // { ok, text }
  const [submitting, setSubmitting] = useState(false)

  const loadReqData = useCallback(async () => {
    const [{ data: cat }, { data: ms }, { data: reqs }] = await Promise.all([
      supabase.from('skills').select('id, name, category, safety_critical').order('name'),
      supabase.from('member_skills').select('skill_id, status').eq('member_id', uid),
      supabase.from('cert_requests').select('id, skill_id').eq('member_id', uid).eq('status', 'pending'),
    ])
    setSkills(cat ?? [])
    setCertIds(new Set((ms ?? []).filter(r => r.status === 'certified').map(r => r.skill_id)))
    setMyReqs(reqs ?? [])
  }, [uid])

  useEffect(() => { loadReqData() }, [loadReqData])

  async function submitRequest(e) {
    e.preventDefault()
    if (!pick) return
    setSubmitting(true)
    setMsg(null)
    const { error } = await supabase.rpc('request_cert', { p_skill: pick, p_note: note || null })
    setSubmitting(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setMsg({ ok: true, text: 'Request sent — a mentor will review it.' })
    setPick(''); setNote('')
    loadReqData()
  }

  const nameById   = Object.fromEntries(skills.map(s => [s.id, s.name]))
  const pendingIds = new Set(myReqs.map(r => r.skill_id))
  const candidates = skills
    .filter(s => !certIds.has(s.id) && !pendingIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="msh-wrap">
      <div className="msh-body">
        <div className="msh-head">
          <h1 className="msh-title">Skills</h1>
          <div className="msh-toggle">
            <button className={`msh-toggle-btn${view === 'mine' ? ' active' : ''}`} onClick={() => setView('mine')}>My skills</button>
            <button className={`msh-toggle-btn${view === 'coverage' ? ' active' : ''}`} onClick={() => setView('coverage')}>Team coverage</button>
          </div>
        </div>

        {view === 'mine' ? (
          <>
            {/* Request a certification */}
            <section className="msh-request">
              <header className="msh-request-head">
                <span className="msh-eyebrow">REQUEST A CERTIFICATION</span>
              </header>
              <p className="msh-request-sub">
                Ready to be signed off on a skill? Request it — a mentor reviews and certifies you.
              </p>

              {myReqs.length > 0 && (
                <div className="msh-req-list">
                  {myReqs.map(r => (
                    <span key={r.id} className="msh-req-chip">
                      {nameById[r.skill_id] || 'Skill'} · pending review
                    </span>
                  ))}
                </div>
              )}

              <form className="msh-request-form" onSubmit={submitRequest}>
                <select className="msh-select" value={pick} onChange={e => setPick(e.target.value)}>
                  <option value="">{candidates.length ? 'Select a skill…' : 'No skills left to request'}</option>
                  {candidates.map(s => (
                    <option key={s.id} value={s.id}>{s.category} · {s.name}</option>
                  ))}
                </select>
                <input
                  className="msh-note"
                  type="text"
                  placeholder="Note (optional)"
                  maxLength={200}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <button className="msh-btn" type="submit" disabled={!pick || submitting}>
                  {submitting ? 'Sending…' : 'Request'}
                </button>
              </form>
              {msg && (
                <p className={`msh-msg${msg.ok ? ' msh-ok' : ' msh-err'}`}>{msg.text}</p>
              )}
            </section>

            {/* Own certifications + in-progress + not-started */}
            <p className="msh-section-label">Your skills</p>
            <MemberSkillsPanel
              memberId={uid}
              currentUserId={uid}
              canEdit={true}
              canCertify={false}
            />
          </>
        ) : (
          <Suspense fallback={<div className="msh-loading"><div className="msh-spinner" /></div>}>
            <CoverageMatrix hasRole={hasRole} canView />
          </Suspense>
        )}
      </div>
    </div>
  )
}
