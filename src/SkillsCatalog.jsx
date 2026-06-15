import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import DisciplinesCatalog from './DisciplinesCatalog'
import './SkillsCatalog.css'

const EMPTY_FORM = { name: '', category: '', description: '', safety_critical: false }

export default function SkillsCatalog({ hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [skills,     setSkills]     = useState(null)
  const [formOpen,   setFormOpen]   = useState(false)
  const [editTarget, setEditTarget] = useState(null)   // null = adding, obj = editing
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [saving,     setSaving]     = useState(false)
  const [moving,     setMoving]     = useState(null)   // id of skill mid-reorder
  const [error,      setError]      = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) { setError(error.message); setSkills([]); return }
    setSkills(data ?? [])
  }

  // Skills grouped by category, categories sorted A→Z, rows sorted by sort_order
  const grouped = useMemo(() => {
    if (!skills) return []
    const map = {}
    for (const s of skills) (map[s.category] ??= []).push(s)
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, rows]) => [cat, [...rows].sort((a, b) => a.sort_order - b.sort_order)])
  }, [skills])

  const existingCategories = useMemo(
    () => [...new Set((skills ?? []).map(s => s.category))].sort(),
    [skills]
  )

  // ── Form helpers ────────────────────────────────────────────────────────────

  function openAdd() {
    setEditTarget(null); setForm(EMPTY_FORM); setError(''); setFormOpen(true)
  }

  function openEdit(skill) {
    setEditTarget(skill)
    setForm({
      name:            skill.name,
      category:        skill.category,
      description:     skill.description ?? '',
      safety_critical: skill.safety_critical,
    })
    setError('')
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false); setEditTarget(null); setError('')
  }

  const fld = key => e =>
    setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  // ── Save (add or edit) ───────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')

    const payload = {
      name:            form.name.trim(),
      category:        form.category.trim(),
      description:     form.description.trim() || null,
      safety_critical: form.safety_critical,
    }

    if (editTarget) {
      const { data, error } = await supabase
        .from('skills').update(payload).eq('id', editTarget.id).select().single()
      setSaving(false)
      if (error) { setError(error.message); return }
      setSkills(prev => prev.map(s => s.id === editTarget.id ? data : s))
    } else {
      const maxOrder = skills.length ? Math.max(...skills.map(s => s.sort_order)) : -1
      const { data, error } = await supabase
        .from('skills').insert({ ...payload, sort_order: maxOrder + 1 }).select().single()
      setSaving(false)
      if (error) { setError(error.message); return }
      setSkills(prev => [...prev, data])
    }
    closeForm()
  }

  // ── Reorder ──────────────────────────────────────────────────────────────────
  // dir: -1 = up, +1 = down; swaps sort_order values of adjacent rows in category

  async function move(skill, dir) {
    const catRows = skills
      .filter(s => s.category === skill.category)
      .sort((a, b) => a.sort_order - b.sort_order)
    const idx = catRows.findIndex(s => s.id === skill.id)
    const other = catRows[idx + dir]
    if (!other) return

    setMoving(skill.id)
    await Promise.all([
      supabase.from('skills').update({ sort_order: other.sort_order }).eq('id', skill.id),
      supabase.from('skills').update({ sort_order: skill.sort_order }).eq('id', other.id),
    ])
    setSkills(prev => prev.map(s => {
      if (s.id === skill.id) return { ...s, sort_order: other.sort_order }
      if (s.id === other.id) return { ...s, sort_order: skill.sort_order }
      return s
    }))
    setMoving(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (skills === null) {
    return <div className="sc-loading"><div className="sc-spinner" /></div>
  }

  if (!isStaff) {
    return <div className="sc-wrap"><div className="sc-denied">Staff access required.</div></div>
  }

  return (
    <div className="sc-wrap">
      <div className="sc-body">

        <div className="sc-page-header">
          <h1 className="sc-page-title">Skills Catalog</h1>
          {!formOpen && (
            <button className="sc-add-btn" onClick={openAdd}>+ Add skill</button>
          )}
        </div>

        {/* ── Add / Edit panel ── */}
        {formOpen && (
          <div className="sc-form-card">
            <h2 className="sc-form-heading">{editTarget ? 'Edit skill' : 'Add skill'}</h2>
            <form onSubmit={handleSubmit} className="sc-form">

              <div className="sc-form-row">
                <div className="sc-form-field sc-field-grow">
                  <label className="sc-label" htmlFor="sc-name">Name</label>
                  <input
                    id="sc-name" type="text" required maxLength={120}
                    placeholder="e.g. Lathe operation"
                    value={form.name} onChange={fld('name')}
                    className="sc-input"
                  />
                </div>
                <div className="sc-form-field sc-field-cat">
                  <label className="sc-label" htmlFor="sc-cat">Category</label>
                  <input
                    id="sc-cat" type="text" required maxLength={80}
                    list="sc-cat-list"
                    placeholder="e.g. Machining"
                    value={form.category} onChange={fld('category')}
                    className="sc-input"
                  />
                  <datalist id="sc-cat-list">
                    {existingCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>

              <div className="sc-form-field">
                <label className="sc-label" htmlFor="sc-desc">Description</label>
                <textarea
                  id="sc-desc" rows={3} maxLength={500}
                  placeholder="What does this skill involve?"
                  value={form.description} onChange={fld('description')}
                  className="sc-input sc-textarea"
                />
              </div>

              <label className="sc-toggle-row">
                <input
                  type="checkbox"
                  checked={form.safety_critical}
                  onChange={fld('safety_critical')}
                  className="sc-toggle-input"
                />
                <span className="sc-toggle-track"><span className="sc-toggle-thumb" /></span>
                <span className="sc-toggle-text">Safety critical</span>
              </label>

              {error && <p className="sc-form-error">{error}</p>}

              <div className="sc-form-actions">
                <button type="button" className="sc-cancel-btn" onClick={closeForm}>Cancel</button>
                <button type="submit" className="sc-save-btn" disabled={saving}>
                  {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add skill'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Empty state ── */}
        {skills.length === 0 && !formOpen && (
          <p className="sc-empty">No skills yet. Use "Add skill" to build the catalog.</p>
        )}

        {/* ── Catalog grouped by category ── */}
        {grouped.map(([category, rows]) => (
          <div key={category} className="sc-category">
            <p className="sc-category-label">{category}</p>
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th className="sc-th">Skill</th>
                    <th className="sc-th sc-th-desc">Description</th>
                    <th className="sc-th">Flag</th>
                    <th className="sc-th sc-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((skill, idx) => (
                    <tr key={skill.id} className="sc-row">
                      <td className="sc-td sc-td-name">{skill.name}</td>
                      <td className="sc-td sc-td-desc">
                        {skill.description || <span className="sc-none">—</span>}
                      </td>
                      <td className="sc-td">
                        {skill.safety_critical && (
                          <span className="sc-badge-safety">Safety critical</span>
                        )}
                      </td>
                      <td className="sc-td sc-td-actions">
                        <button
                          className="sc-reorder-btn"
                          title="Move up"
                          disabled={idx === 0 || !!moving}
                          onClick={() => move(skill, -1)}
                        >↑</button>
                        <button
                          className="sc-reorder-btn"
                          title="Move down"
                          disabled={idx === rows.length - 1 || !!moving}
                          onClick={() => move(skill, 1)}
                        >↓</button>
                        <button
                          className="sc-edit-btn"
                          disabled={formOpen}
                          onClick={() => openEdit(skill)}
                        >Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <DisciplinesCatalog />

      </div>
    </div>
  )
}
