import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import './MemberSkillsPanel.css'

// canEdit:    member can toggle own in_progress status
// canCertify: staff can promote in_progress → certified
export default function MemberSkillsPanel({ memberId, currentUserId, canEdit, canCertify }) {
  const [catalog,      setCatalog]      = useState(null)
  const [memberSkills, setMemberSkills] = useState(null)
  const [busy,         setBusy]         = useState(null) // skill id mid-save

  useEffect(() => {
    if (!memberId) return
    setCatalog(null)
    setMemberSkills(null)
    Promise.all([
      supabase.from('skills').select('*').order('sort_order'),
      supabase.from('member_skills').select('*').eq('member_id', memberId),
    ]).then(([{ data: cat }, { data: ms }]) => {
      setCatalog(cat ?? [])
      setMemberSkills(ms ?? [])
    })
  }, [memberId])

  const statusMap = useMemo(() => {
    const m = {}
    for (const ms of (memberSkills ?? [])) m[ms.skill_id] = ms.status
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
          certified:   sorted.filter(s => statusMap[s.id] === 'certified'),
          in_progress: sorted.filter(s => statusMap[s.id] === 'in_progress'),
          not_started: sorted.filter(s => !statusMap[s.id]),
        }
      })
  }, [catalog, statusMap])

  async function toggleOwn(skill) {
    if (!canEdit || busy) return
    if (statusMap[skill.id] === 'certified') return
    setBusy(skill.id)

    if (statusMap[skill.id] === 'in_progress') {
      await supabase.from('member_skills')
        .delete().match({ member_id: memberId, skill_id: skill.id })
      setMemberSkills(prev => prev.filter(ms => ms.skill_id !== skill.id))
    } else {
      const { data } = await supabase.from('member_skills')
        .upsert({ member_id: memberId, skill_id: skill.id, status: 'in_progress', updated_at: new Date().toISOString() })
        .select().single()
      if (data) setMemberSkills(prev => [...prev.filter(ms => ms.skill_id !== skill.id), data])
    }
    setBusy(null)
  }

  async function certify(skill) {
    if (!canCertify || busy) return
    setBusy(skill.id)
    const { data } = await supabase.from('member_skills')
      .upsert({
        member_id:    memberId,
        skill_id:     skill.id,
        status:       'certified',
        certified_by: currentUserId,
        updated_at:   new Date().toISOString(),
      })
      .select().single()
    if (data) setMemberSkills(prev => [...prev.filter(ms => ms.skill_id !== skill.id), data])
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
        <p className="msp-hint">Click any skill to mark it in progress, or click again to clear it.</p>
      )}
      {grouped.map(({ category, certified, in_progress, not_started }) => {
        const total = certified.length + in_progress.length + not_started.length
        return (
          <div key={category} className="msp-category">
            <div className="msp-cat-header">
              <span className="msp-cat-name">{category}</span>
              <span className="msp-cat-progress">
                {certified.length}/{total} certified
              </span>
            </div>

            <div className="msp-cat-body">
              {certified.length > 0 && (
                <Section label={`Certified (${certified.length})`} variant="certified">
                  {certified.map(s => (
                    <SkillRow key={s.id} skill={s} status="certified" busy={busy === s.id} />
                  ))}
                </Section>
              )}

              {in_progress.length > 0 && (
                <Section label={`In Progress (${in_progress.length})`} variant="progress">
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
                <Section label={`Not Started (${not_started.length})`} variant="none">
                  {not_started.map(s => (
                    <SkillRow
                      key={s.id} skill={s} status="not_started" busy={busy === s.id}
                      onClick={canEdit ? () => toggleOwn(s) : undefined}
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

function Section({ label, variant, children }) {
  return (
    <div className="msp-section">
      <p className={`msp-section-label msp-section-${variant}`}>{label}</p>
      {children}
    </div>
  )
}

function SkillRow({ skill, status, busy, onClick, onCertify }) {
  return (
    <div
      className={`msp-skill-row${onClick ? ' msp-clickable' : ''}${busy ? ' msp-busy' : ''}`}
      onClick={onClick}
    >
      <span className="msp-dot" data-status={status} />
      <span className="msp-skill-name">{skill.name}</span>
      {skill.safety_critical && (
        <span className="msp-safety" title="Safety critical">!</span>
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
