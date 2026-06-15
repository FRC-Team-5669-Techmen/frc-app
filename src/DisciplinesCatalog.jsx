import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'

// Staff-only disciplines catalog editor. Mirrors SkillsCatalog (and reuses its
// sc-* styles) but drops description/safety-critical and adds a remove action.
// Rendered as a section inside the already staff-gated /skills page.

const EMPTY_FORM = { name: '', category: '' }

export default function DisciplinesCatalog() {
  const [items, setItems]       = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [moving, setMoving]     = useState(null)
  const [error, setError]       = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('disciplines')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) { setError(error.message); setItems([]); return }
    setItems(data ?? [])
  }

  // Group by category; categories ordered by their first (lowest) sort_order so
  // the seed order is preserved, rows within a category sorted by sort_order.
  const grouped = useMemo(() => {
    if (!items) return []
    const map = new Map()
    for (const d of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
      if (!map.has(d.category)) map.set(d.category, [])
      map.get(d.category).push(d)
    }
    return [...map.entries()]
  }, [items])

  const existingCategories = useMemo(
    () => [...new Set((items ?? []).map(d => d.category))],
    [items]
  )

  function openAdd()  { setEditTarget(null); setForm(EMPTY_FORM); setError(''); setFormOpen(true) }
  function openEdit(d) {
    setEditTarget(d)
    setForm({ name: d.name, category: d.category })
    setError(''); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setEditTarget(null); setError('') }

  const fld = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      name:     form.name.trim(),
      category: form.category.trim() || 'General',
    }

    if (editTarget) {
      const { data, error } = await supabase
        .from('disciplines').update(payload).eq('id', editTarget.id).select().single()
      setSaving(false)
      if (error) { setError(error.message); return }
      setItems(prev => prev.map(d => d.id === editTarget.id ? data : d))
    } else {
      const maxOrder = items.length ? Math.max(...items.map(d => d.sort_order)) : -1
      const { data, error } = await supabase
        .from('disciplines').insert({ ...payload, sort_order: maxOrder + 1 }).select().single()
      setSaving(false)
      if (error) { setError(error.message); return }
      setItems(prev => [...prev, data])
    }
    closeForm()
  }

  // dir: -1 = up, +1 = down; swaps sort_order with the adjacent row in category
  async function move(item, dir) {
    const catRows = items
      .filter(d => d.category === item.category)
      .sort((a, b) => a.sort_order - b.sort_order)
    const idx = catRows.findIndex(d => d.id === item.id)
    const other = catRows[idx + dir]
    if (!other) return

    setMoving(item.id)
    await Promise.all([
      supabase.from('disciplines').update({ sort_order: other.sort_order }).eq('id', item.id),
      supabase.from('disciplines').update({ sort_order: item.sort_order }).eq('id', other.id),
    ])
    setItems(prev => prev.map(d => {
      if (d.id === item.id)  return { ...d, sort_order: other.sort_order }
      if (d.id === other.id) return { ...d, sort_order: item.sort_order }
      return d
    }))
    setMoving(null)
  }

  async function remove(item) {
    if (!window.confirm(`Remove "${item.name}"? Members who selected it keep the saved name.`)) return
    const { error } = await supabase.from('disciplines').delete().eq('id', item.id)
    if (error) { setError(error.message); return }
    setItems(prev => prev.filter(d => d.id !== item.id))
  }

  if (items === null) return null

  return (
    <div className="sc-section-divider">
      <div className="sc-page-header">
        <h2 className="sc-page-title">Disciplines</h2>
        {!formOpen && <button className="sc-add-btn" onClick={openAdd}>+ Add discipline</button>}
      </div>

      {formOpen && (
        <div className="sc-form-card">
          <h2 className="sc-form-heading">{editTarget ? 'Edit discipline' : 'Add discipline'}</h2>
          <form onSubmit={handleSubmit} className="sc-form">
            <div className="sc-form-row">
              <div className="sc-form-field sc-field-grow">
                <label className="sc-label" htmlFor="dc-name">Name</label>
                <input
                  id="dc-name" type="text" required maxLength={120}
                  placeholder="e.g. Welding"
                  value={form.name} onChange={fld('name')} className="sc-input"
                />
              </div>
              <div className="sc-form-field sc-field-cat">
                <label className="sc-label" htmlFor="dc-cat">Category</label>
                <input
                  id="dc-cat" type="text" required maxLength={80} list="dc-cat-list"
                  placeholder="e.g. Build / Mechanical"
                  value={form.category} onChange={fld('category')} className="sc-input"
                />
                <datalist id="dc-cat-list">
                  {existingCategories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>

            {error && <p className="sc-form-error">{error}</p>}

            <div className="sc-form-actions">
              <button type="button" className="sc-cancel-btn" onClick={closeForm}>Cancel</button>
              <button type="submit" className="sc-save-btn" disabled={saving}>
                {saving ? 'Saving…' : editTarget ? 'Save changes' : 'Add discipline'}
              </button>
            </div>
          </form>
        </div>
      )}

      {items.length === 0 && !formOpen && (
        <p className="sc-empty">No disciplines yet. Use "Add discipline" to build the list.</p>
      )}

      {grouped.map(([category, rows]) => (
        <div key={category} className="sc-category">
          <p className="sc-category-label">{category}</p>
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th className="sc-th">Discipline</th>
                  <th className="sc-th sc-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d, idx) => (
                  <tr key={d.id} className="sc-row">
                    <td className="sc-td sc-td-name">{d.name}</td>
                    <td className="sc-td sc-td-actions">
                      <button className="sc-reorder-btn" title="Move up"
                        disabled={idx === 0 || !!moving} onClick={() => move(d, -1)}>↑</button>
                      <button className="sc-reorder-btn" title="Move down"
                        disabled={idx === rows.length - 1 || !!moving} onClick={() => move(d, 1)}>↓</button>
                      <button className="sc-edit-btn" disabled={formOpen} onClick={() => openEdit(d)}>Edit</button>
                      <button className="sc-delete-btn" onClick={() => remove(d)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
