import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { fmtTime, fmtDay } from './shopStatus'
import './SchedulePage.css'

const KINDS = ['build', 'meeting', 'competition', 'potluck', 'outreach', 'other']
const RESPONSES = [['going', 'Going'], ['maybe', 'Maybe'], ['declined', "Can't go"]]
const blankForm = () => ({ title: '', kind: 'build', start: '', end: '', location: '', notes: '', rsvp_enabled: false, capacity: '' })

// UTC ISO -> value for <input type="datetime-local"> in the browser's local time.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
// LA calendar day key, for grouping.
function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

export default function SchedulePage({ session, hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [events, setEvents]   = useState(null)
  const [signups, setSignups] = useState([])
  const [expanded, setExpanded] = useState(() => new Set())
  const [itemDraft, setItemDraft] = useState({}) // event_id -> bringing text
  const [showPast, setShowPast] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | event id
  const [form, setForm]       = useState(blankForm())
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    const [{ data: evData, error: e1 }, { data: suData, error: e2 }] = await Promise.all([
      supabase.from('events').select('*').order('starts_at', { ascending: true }),
      supabase.from('event_signups').select('event_id, member_id, response, item, profiles(full_name)'),
    ])
    if (e1 || e2) { setError((e1 || e2).message); setEvents([]); return }
    setError('')
    setEvents(evData ?? [])
    setSignups(suData ?? [])
  }, [])

  const myId = session.user.id
  const mySignup = (evId) => signups.find(s => s.event_id === evId && s.member_id === myId)

  function toggleExpand(ev) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(ev.id)) next.delete(ev.id)
      else { next.add(ev.id); setItemDraft(d => ({ ...d, [ev.id]: mySignup(ev.id)?.item ?? '' })) }
      return next
    })
  }

  async function upsertSignup(ev, patch) {
    const mine = mySignup(ev.id)
    const row = {
      event_id: ev.id, member_id: myId,
      response: patch.response ?? mine?.response ?? 'going',
      item: 'item' in patch ? (patch.item || null) : (mine?.item ?? null),
      updated_at: new Date().toISOString(),
    }
    const { error: err } = await supabase.from('event_signups').upsert(row, { onConflict: 'event_id,member_id' })
    if (err) { setError(err.message); return }
    load()
  }

  async function clearSignup(ev) {
    const { error: err } = await supabase.from('event_signups').delete().match({ event_id: ev.id, member_id: myId })
    if (err) { setError(err.message); return }
    load()
  }

  useEffect(() => { load() }, [load])

  function openNew() { setForm(blankForm()); setEditing('new'); setError('') }
  function openEdit(ev) {
    setForm({
      title: ev.title, kind: ev.kind,
      start: toLocalInput(ev.starts_at), end: toLocalInput(ev.ends_at),
      location: ev.location || '', notes: ev.notes || '',
      rsvp_enabled: !!ev.rsvp_enabled, capacity: ev.capacity ?? '',
    })
    setEditing(ev.id); setError('')
  }

  async function save(e) {
    e.preventDefault()
    if (!form.start || !form.end) { setError('Start and end are required'); return }
    const starts_at = new Date(form.start).toISOString()
    const ends_at   = new Date(form.end).toISOString()
    if (new Date(ends_at) < new Date(starts_at)) { setError('End must be after start'); return }
    setSaving(true); setError('')
    const capNum = parseInt(form.capacity, 10)
    const payload = {
      title: form.title.trim(), kind: form.kind, starts_at, ends_at,
      location: form.location.trim() || null, notes: form.notes.trim() || null,
      rsvp_enabled: form.rsvp_enabled,
      capacity: form.rsvp_enabled && Number.isFinite(capNum) && capNum > 0 ? capNum : null,
    }
    const res = editing === 'new'
      ? await supabase.from('events').insert({ ...payload, created_by: session.user.id })
      : await supabase.from('events').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    setEditing(null); load()
  }

  async function remove(ev) {
    if (!window.confirm(`Delete "${ev.title}"?`)) return
    const { error: err } = await supabase.from('events').delete().eq('id', ev.id)
    if (err) { setError(err.message); return }
    load()
  }

  if (events === null) {
    return <div className="sch-wrap sch-loading"><div className="sch-spinner" /></div>
  }

  const now = new Date()
  const visible = events.filter(ev => showPast || new Date(ev.ends_at) >= now)
  // Group by LA calendar day, ascending.
  const groups = []
  for (const ev of visible) {
    const key = dayKey(ev.starts_at)
    let grp = groups.find(g => g.key === key)
    if (!grp) { grp = { key, label: fmtDay(ev.starts_at), items: [] }; groups.push(grp) }
    grp.items.push(ev)
  }
  const pastCount = events.length - events.filter(ev => new Date(ev.ends_at) >= now).length

  return (
    <div className="sch-wrap">
      <div className="sch-body">
        <header className="sch-head">
          <h1 className="sch-title">Schedule</h1>
          {isStaff && editing === null && (
            <button className="sch-new-btn" onClick={openNew}>+ New event</button>
          )}
        </header>

        {error && <p className="sch-error" onClick={() => setError('')}>{error}</p>}

        {isStaff && editing !== null && (
          <form className="sch-form" onSubmit={save}>
            <h2 className="sch-form-title">{editing === 'new' ? 'New event' : 'Edit event'}</h2>
            <label className="sch-field">
              <span className="sch-label">Title</span>
              <input className="sch-input" value={form.title} required
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Build session" />
            </label>
            <div className="sch-field-row">
              <label className="sch-field">
                <span className="sch-label">Kind</span>
                <select className="sch-input" value={form.kind}
                  onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
                  {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="sch-field">
                <span className="sch-label">Location</span>
                <input className="sch-input" value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Shop" />
              </label>
            </div>
            <div className="sch-field-row">
              <label className="sch-field">
                <span className="sch-label">Start</span>
                <input className="sch-input" type="datetime-local" value={form.start} required
                  onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
              </label>
              <label className="sch-field">
                <span className="sch-label">End</span>
                <input className="sch-input" type="datetime-local" value={form.end} required
                  onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
              </label>
            </div>
            <label className="sch-field">
              <span className="sch-label">Notes <span className="sch-optional">(optional)</span></span>
              <textarea className="sch-input sch-textarea" value={form.notes} rows={2}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
            <div className="sch-field-row sch-rsvp-fields">
              <label className="sch-toggle">
                <input type="checkbox" checked={form.rsvp_enabled}
                  onChange={e => setForm(f => ({ ...f, rsvp_enabled: e.target.checked }))} />
                <span className="sch-label">Enable RSVP</span>
              </label>
              {form.rsvp_enabled && (
                <label className="sch-field sch-cap-field">
                  <span className="sch-label">Capacity <span className="sch-optional">(optional)</span></span>
                  <input className="sch-input" type="number" min="1" value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 30" />
                </label>
              )}
            </div>
            <div className="sch-form-actions">
              <button type="button" className="sch-cancel" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="sch-save" disabled={saving}>
                {saving ? 'Saving…' : (editing === 'new' ? 'Create' : 'Save')}
              </button>
            </div>
          </form>
        )}

        {groups.length === 0 ? (
          <p className="sch-empty">No upcoming events.</p>
        ) : (
          groups.map(g => (
            <section key={g.key} className="sch-day">
              <h2 className="sch-day-title">{g.label}</h2>
              <ul className="sch-list">
                {g.items.map(ev => {
                  const evSignups = signups.filter(s => s.event_id === ev.id)
                  const going = evSignups.filter(s => s.response === 'going')
                  const maybe = evSignups.filter(s => s.response === 'maybe')
                  const mine = mySignup(ev.id)
                  const open = expanded.has(ev.id)
                  const cap = ev.capacity
                  const full = cap != null && going.length >= cap
                  const nameOf = s => (s.member_id === myId ? 'You' : (s.profiles?.full_name || 'Member'))
                  return (
                  <li key={ev.id} className="sch-event">
                    <div className="sch-event-row">
                      <div className="sch-event-time hud-mono">
                        {fmtTime(ev.starts_at)}<span className="sch-event-dash">–</span>{fmtTime(ev.ends_at)}
                      </div>
                      <div className="sch-event-main">
                        <div className="sch-event-head">
                          <span className={`sch-kind sch-kind-${ev.kind}`}>{ev.kind}</span>
                          <span className="sch-event-title">{ev.title}</span>
                        </div>
                        {ev.location && <span className="sch-event-loc hud-mono">@ {ev.location}</span>}
                        {ev.notes && <p className="sch-event-notes">{ev.notes}</p>}
                        {ev.rsvp_enabled && (
                          <button className="sch-rsvp-toggle" onClick={() => toggleExpand(ev)} aria-expanded={open}>
                            <span className="hud-tnum">{going.length}</span> going
                            {cap != null && <span className="sch-rsvp-cap">{` · ${going.length} of ${cap}${full ? ' · FULL' : ''}`}</span>}
                            {mine && <span className="sch-rsvp-mine"> · {mine.response === 'declined' ? "you can't go" : `you're ${mine.response}`}</span>}
                            <span className={`sch-rsvp-caret${open ? ' open' : ''}`}>▸</span>
                          </button>
                        )}
                      </div>
                      {isStaff && (
                        <div className="sch-event-actions">
                          <button className="sch-edit" onClick={() => openEdit(ev)}>Edit</button>
                          <button className="sch-del" onClick={() => remove(ev)}>Delete</button>
                        </div>
                      )}
                    </div>

                    {ev.rsvp_enabled && open && (
                      <div className="sch-rsvp">
                        <div className="sch-rsvp-controls">
                          {RESPONSES.map(([val, label]) => (
                            <button key={val}
                              className={`sch-rsvp-btn${mine?.response === val ? ' on' : ''}`}
                              onClick={() => upsertSignup(ev, { response: val })}
                            >{label}</button>
                          ))}
                          {mine && <button className="sch-rsvp-clear" onClick={() => clearSignup(ev)}>Clear</button>}
                        </div>

                        {mine && mine.response !== 'declined' && (
                          <div className="sch-rsvp-item">
                            <input className="sch-input" placeholder="Bringing… (optional)"
                              value={itemDraft[ev.id] ?? ''}
                              onChange={e => setItemDraft(d => ({ ...d, [ev.id]: e.target.value }))} />
                            <button className="sch-save sch-rsvp-item-save"
                              onClick={() => upsertSignup(ev, { item: (itemDraft[ev.id] ?? '').trim() })}>Save</button>
                          </div>
                        )}

                        {full && <p className="sch-rsvp-warn">This event is at capacity ({cap}). You can still RSVP — capacity is a guide.</p>}

                        {going.length === 0
                          ? <p className="sch-rsvp-none">No one's going yet.</p>
                          : <ul className="sch-rsvp-list">
                              {going.map(s => (
                                <li key={s.member_id} className="sch-rsvp-attendee">
                                  <span className="sch-rsvp-name">{nameOf(s)}</span>
                                  {s.item && <span className="sch-rsvp-bringing hud-mono">{s.item}</span>}
                                </li>
                              ))}
                            </ul>}
                        {maybe.length > 0 && (
                          <p className="sch-rsvp-maybe hud-mono">Maybe: {maybe.map(nameOf).join(', ')}</p>
                        )}
                      </div>
                    )}
                  </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}

        {pastCount > 0 && (
          <button className="sch-past-toggle" onClick={() => setShowPast(p => !p)}>
            {showPast ? 'Hide past events' : `Show ${pastCount} past event${pastCount === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  )
}
