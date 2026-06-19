import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import './CertifyPage.css'

const STATUSES = ['not_started', 'in_progress', 'certified']
const STATUS_LABELS = { not_started: 'Not started', in_progress: 'In progress', certified: 'Certified' }

export default function CertifyPage({ session, hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [members,      setMembers]      = useState(null)
  const [selectedId,   setSelectedId]   = useState('')
  const [catalog,      setCatalog]      = useState(null)
  const [memberSkills, setMemberSkills] = useState([])
  const [busy,         setBusy]         = useState({})

  useEffect(() => {
    async function loadMembers() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, nickname')
        .order('full_name')
      const list = data ?? []
      // Ensure the current staff member appears so they can certify their own skills.
      // The member_skills staff write policy has no restriction on certified_by = member_id,
      // so this is safe — only staff reach this page at all.
      if (!list.find(p => p.id === session.user.id)) {
        const { data: own } = await supabase
          .from('profiles')
          .select('id, full_name, nickname')
          .eq('id', session.user.id)
          .single()
        if (own) list.unshift(own)
      }
      setMembers(list)
    }
    loadMembers()
  }, [session.user.id])

  useEffect(() => {
    if (!selectedId) { setCatalog(null); setMemberSkills([]); return }
    setCatalog(null)
    Promise.all([
      supabase.from('skills').select('*').order('sort_order'),
      supabase.from('member_skills')
        .select('*, certifier:certified_by(full_name, nickname)')
        .eq('member_id', selectedId),
    ]).then(([{ data: cat }, { data: ms }]) => {
      setCatalog(cat ?? [])
      setMemberSkills(ms ?? [])
    })
  }, [selectedId])

  const statusMap = useMemo(() => {
    const m = {}
    for (const ms of memberSkills) m[ms.skill_id] = ms
    return m
  }, [memberSkills])

  const grouped = useMemo(() => {
    if (!catalog) return []
    const map = {}
    for (const s of catalog) (map[s.category] ??= []).push(s)
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, skills]) => ({
        category,
        skills: [...skills].sort((a, b) => a.sort_order - b.sort_order),
      }))
  }, [catalog])

  async function setStatus(skill, status) {
    if (!selectedId || busy[skill.id]) return
    setBusy(b => ({ ...b, [skill.id]: true }))

    if (status === 'not_started') {
      await supabase.from('member_skills')
        .delete().match({ member_id: selectedId, skill_id: skill.id })
      setMemberSkills(prev => prev.filter(ms => ms.skill_id !== skill.id))
    } else {
      const now = new Date().toISOString()
      const row = {
        member_id:    selectedId,
        skill_id:     skill.id,
        status,
        updated_at:   now,
        certified_by: status === 'certified' ? session.user.id : null,
        certified_at: status === 'certified' ? now : null,
      }
      const { data } = await supabase.from('member_skills')
        .upsert(row)
        .select('*, certifier:certified_by(full_name, nickname)')
        .single()
      if (data) setMemberSkills(prev => [...prev.filter(ms => ms.skill_id !== skill.id), data])
    }

    setBusy(b => { const n = { ...b }; delete n[skill.id]; return n })
  }

  if (!isStaff) {
    return (
      <div className="cp-wrap">
        <div className="cp-denied">You need a staff role to access this page.</div>
      </div>
    )
  }

  return (
    <div className="cp-wrap">
      <div className="cp-body">
        <div className="cp-picker-row">
          <label className="cp-picker-label" htmlFor="cp-member">Member</label>
          <select
            id="cp-member"
            className="cp-picker-select"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
          >
            <option value="">— Select a member —</option>
            {(members ?? []).map(m => (
              <option key={m.id} value={m.id}>
                {displayName(m)}
                {m.id === session.user.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>

        {!selectedId && (
          <p className="cp-hint">Select a member above to manage their skills.</p>
        )}

        {selectedId && catalog === null && (
          <div className="cp-loading"><div className="cp-spinner" /></div>
        )}

        {selectedId && catalog !== null && catalog.length === 0 && (
          <p className="cp-hint">No skills in the catalog yet.</p>
        )}

        {selectedId && catalog !== null && grouped.map(({ category, skills }) => (
          <div key={category} className="cp-category">
            <p className="cp-cat-name">{category}</p>
            <div className="cp-skill-list">
              {skills.map(skill => {
                const ms = statusMap[skill.id]
                const currentStatus = ms?.status ?? 'not_started'
                return (
                  <div key={skill.id} className="cp-skill-row">
                    <div className="cp-skill-left">
                      <span className="cp-skill-name">{skill.name}</span>
                      {skill.safety_critical && (
                        <span className="cp-safety" title="Safety critical">!</span>
                      )}
                      {currentStatus === 'certified' && ms?.certifier && (
                        <span className="cp-cert-meta">
                          by {displayName(ms.certifier)}
                          {ms.certified_at && ` · ${new Date(ms.certified_at).toLocaleDateString()}`}
                        </span>
                      )}
                    </div>
                    <div className={`cp-seg${busy[skill.id] ? ' cp-seg-busy' : ''}`}>
                      {STATUSES.map(st => (
                        <button
                          key={st}
                          className={`cp-seg-btn cp-seg-${st}${currentStatus === st ? ' cp-seg-active' : ''}`}
                          disabled={!!busy[skill.id]}
                          onClick={() => currentStatus !== st && setStatus(skill, st)}
                        >
                          {STATUS_LABELS[st]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
