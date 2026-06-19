import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import './MemberSkillsPanel.css'

// canEdit:    member can toggle own in_progress status
// canCertify: staff can promote in_progress → certified
export default function MemberSkillsPanel({ memberId, currentUserId, canEdit, canCertify }) {
  const [catalog,      setCatalog]      = useState(null)
  const [memberSkills, setMemberSkills] = useState(null)
  const [busy,         setBusy]         = useState(null)

  useEffect(() => {
    if (!memberId) return
    setCatalog(null)
    setMemberSkills(null)
    Promise.all([
      supabase.from('skills').select('*').order('sort_order'),
      supabase.from('member_skills').select('*, certifier:certified_by(full_name, nickname)').eq('member_id', memberId),
    ]).then(([{ data: cat }, { data: ms }]) => {
      setCatalog(cat ?? [])
      setMemberSkills(ms ?? [])
    })
  }, [memberId])

  const statusMap = useMemo(() => {
    const m = {}
    for (const ms of (memberSkills ?? [])) m[ms.skill_id] = ms
    return m
  }, [memberSkills])

  const grouped = useMemo(() => {
    if (!catalog) return []
    const map = {}
    for (const s of catalog) (map[s.category] ??= []).push(s)
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, skills]) => {
        const sorted = [...skills].sort((a, b) => a.sort_order - b.sort_order)
        return {
          category,
          certified:   sorted.filter(s => statusMap[s.id]?.status === 'certified'),
          in_progress: sorted.filter(s => statusMap[s.id]?.status === 'in_progress'),
          not_started: sorted.filter(s => !statusMap[s.id]),
        }
      })
  }, [catalog, statusMap])

  async function toggleOwn(skill) {
    if (!canEdit || busy) return
    setBusy(skill.id)
    const ms = statusMap[skill.id]
    if (ms?.status === 'in_progress') {
      await supabase.from('member_skills')
        .delete().match({ member_id: memberId, skill_id: skill.id })
      setMemberSkills(prev => prev.filter(r => r.skill_id !== skill.id))
    } else {
      const { data } = await supabase.from('member_skills')
        .upsert({ member_id: memberId, skill_id: skill.id, status: 'in_progress', updated_at: new Date().toISOString() })
        .select('*, certifier:certified_by(full_name, nickname)').single()
      if (data) setMemberSkills(prev => [...prev.filter(r => r.skill_id !== skill.id), data])
    }
    setBusy(null)
  }

  async function certify(skill) {
    if (!canCertify || busy) return
    setBusy(skill.id)
    const now = new Date().toISOString()
    const { data } = await supabase.from('member_skills')
      .upsert({
        member_id:    memberId,
        skill_id:     skill.id,
        status:       'certified',
        certified_by: currentUserId,
        certified_at: now,
        updated_at:   now,
      })
      .select('*, certifier:certified_by(full_name, nickname)').single()
    if (data) setMemberSkills(prev => [...prev.filter(r => r.skill_id !== skill.id), data])
    setBusy(null)
  }

  if (catalog === null || memberSkills === null) {
    return <div className="msp-loading"><div className="msp-spinner" /></div>
  }

  if (catalog.length === 0) {
    return <p className="msp-empty">No skills in the catalog yet.</p>
  }

  return (
    <div className="msp-wrap">
      {canEdit && (
        <p className="msp-hint">
          Click a not-started skill to mark it in progress. Click again to remove it.
          Staff will certify you when you're ready.
        </p>
      )}

      {grouped.map(({ category, certified, in_progress, not_started }) => {
        const total = certified.length + in_progress.length + not_started.length
        const allDone = certified.length === total && total > 0
        return (
          <div key={category} className="msp-category">

            <div className="msp-cat-header">
              <span className="msp-cat-name">{category}</span>
              {allDone
                ? <span className="msp-cat-complete">All certified ✓</span>
                : <span className="msp-cat-count">{certified.length} / {total}</span>
              }
            </div>
            <div className="msp-cat-bar-track">
              <div
                className="msp-cat-bar-fill"
                style={{ width: total ? `${(certified.length / total) * 100}%` : '0%' }}
              />
            </div>

            <div className="msp-cat-body">
              {certified.length > 0 && (
                <Section label="Certified" count={certified.length} variant="certified">
                  {certified.map(s => (
                    <SkillRow key={s.id} skill={s} status="certified" busy={busy === s.id} msRow={statusMap[s.id]} />
                  ))}
                </Section>
              )}

              {in_progress.length > 0 && (
                <Section label="In Progress" count={in_progress.length} variant="progress">
                  {in_progress.map(s => (
                    <SkillRow
                      key={s.id} skill={s} status="in_progress" busy={busy === s.id}
                      onClick={canEdit ? () => toggleOwn(s) : undefined}
                      onCertify={canCertify ? () => certify(s) : undefined}
                    />
                  ))}
                </Section>
              )}

              {not_started.length > 0 && (
                <Section label="Not Started" count={not_started.length} variant="none">
                  {not_started.map(s => (
                    <SkillRow
                      key={s.id} skill={s} status="not_started" busy={busy === s.id}
                      onClick={canEdit ? () => toggleOwn(s) : undefined}
                      onCertify={canCertify ? () => certify(s) : undefined}
                    />
                  ))}
                </Section>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Section({ label, count, variant, children }) {
  return (
    <div className={`msp-section msp-section-${variant}`}>
      <p className="msp-section-label">
        {label} <span className="msp-section-count">({count})</span>
      </p>
      {children}
    </div>
  )
}

function SkillRow({ skill, status, busy, onClick, onCertify, msRow }) {
  return (
    <div
      className={`msp-skill-row${onClick ? ' msp-clickable' : ''}${busy ? ' msp-busy' : ''}`}
      onClick={onClick}
    >
      <span className="msp-dot" data-status={status} />
      <span className={`msp-skill-name${status === 'not_started' ? ' msp-skill-dim' : ''}`}>
        {skill.name}
      </span>
      {skill.safety_critical && (
        <span className="msp-safety-badge" title="Safety critical — must be certified by a mentor before operating">
          ⚠ Safety critical
        </span>
      )}
      {status === 'certified' && msRow?.certifier && (
        <span className="msp-cert-meta">
          {displayName(msRow.certifier)}
          {msRow.certified_at && ` · ${new Date(msRow.certified_at).toLocaleDateString()}`}
        </span>
      )}
      {onCertify && (
        <button
          className="msp-certify-btn"
          disabled={busy}
          onClick={e => { e.stopPropagation(); onCertify() }}
        >
          Certify
        </button>
      )}
    </div>
  )
}
