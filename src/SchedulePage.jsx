import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { fmtTime, fmtDay } from './shopStatus'
import './SchedulePage.css'

const KINDS = ['build', 'meeting', 'competition', 'potluck', 'outreach', 'other']
const RESPONSES = [['going', 'Going'], ['maybe', 'Maybe'], ['declined', "Can't go"]]
// 0 = Sunday … 6 = Saturday (matches Date.getDay()).
const WEEKDAYS = [[0, 'Sun'], [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat']]
const blankForm = () => ({
  title: '', kind: 'build', start: '', end: '', location: '', notes: '',
  rsvp_enabled: false, capacity: '',
  repeat: false, repeatDays: [], repeatUntil: '',
})

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
  const [editScope, setEditScope] = useState('one') // 'one' | 'series' (when editing a series event)
  const [confirmDel, setConfirmDel] = useState(null) // event pending delete confirmation
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
    setEditing(ev.id); setEditScope('one'); setError('')
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

    // Bulk create: one submission → the same time block on every selected
    // weekday from the start date through the repeat-until date (new only).
    if (editing === 'new' && form.repeat) {
      if (form.repeatDays.length === 0 || !form.repeatUntil) {
        setSaving(false); setError('Pick at least one weekday and a repeat-until date'); return
      }
      const start = new Date(form.start)
      const durationMs = new Date(form.end) - start
      const until = new Date(form.repeatUntil + 'T23:59:59')
      if (until < start) { setSaving(false); setError('Repeat-until must be on or after the start date'); return }

      const rows = []
      const cur = new Date(start); cur.setHours(0, 0, 0, 0)
      while (cur <= until) {
        if (form.repeatDays.includes(cur.getDay())) {
          const s = new Date(cur); s.setHours(start.getHours(), start.getMinutes(), 0, 0)
          const e2 = new Date(s.getTime() + durationMs)
          rows.push({ ...payload, starts_at: s.toISOString(), ends_at: e2.toISOString(), created_by: session.user.id })
        }
        cur.setDate(cur.getDate() + 1)
      }
      if (rows.length === 0) { setSaving(false); setError('No selected weekdays fall in that date range'); return }

      // Tie a real multi-day batch together as a series so it can be edited /
      // deleted as a group. A single-day result stays a standalone event.
      if (rows.length > 1) {
        const seriesId = crypto.randomUUID()
        for (const r of rows) r.series_id = seriesId
      }

      const { error: bulkErr } = await supabase.from('events').insert(rows)
      setSaving(false)
      if (bulkErr) { setError(bulkErr.message); return }
      setEditing(null); load()
      return
    }

    // Editing a whole series: apply the field changes to every event in it, and
    // shift each one to the new time-of-day while keeping its own date.
    const editingEvent = editing !== 'new' ? events.find(ev => ev.id === editing) : null
    if (editingEvent?.series_id && editScope === 'series') {
      const start = new Date(form.start)
      const durationMs = new Date(form.end) - start
      const fields = {
        title: payload.title, kind: payload.kind, location: payload.location,
        notes: payload.notes, rsvp_enabled: payload.rsvp_enabled, capacity: payload.capacity,
        updated_at: new Date().toISOString(),
      }
      const sibs = events.filter(ev => ev.series_id === editingEvent.series_id)
      const results = await Promise.all(sibs.map(sib => {
        const s = new Date(sib.starts_at)
        s.setHours(start.getHours(), start.getMinutes(), 0, 0)
        const e2 = new Date(s.getTime() + durationMs)
        return supabase.from('events').update({ ...fields, starts_at: s.toISOString(), ends_at: e2.toISOString() }).eq('id', sib.id)
      }))
      setSaving(false)
      const failed = results.find(r => r.error)
      if (failed) { setError(failed.error.message); return }
      setEditing(null); load()
      return
    }

    const res = editing === 'new'
      ? await supabase.from('events').insert({ ...payload, created_by: session.user.id })
      : await supabase.from('events').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    setEditing(null); load()
  }

  // Standalone events confirm-then-delete; series events get a one-vs-series choice.
  function remove(ev) { setConfirmDel(ev) }
  async function doDelete(ev, scope) {
    const q = scope === 'series'
      ? supabase.from('events').delete().eq('series_id', ev.series_id)
      : supabase.from('events').delete().eq('id', ev.id)
    const { error: err } = await q
    setConfirmDel(null)
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

  const editingEvent = editing && editing !== 'new' ? events.find(e => e.id === editing) : null
  const editingSeriesCount = editingEvent?.series_id
    ? events.filter(e => e.series_id === editingEvent.series_id).length : 0
  const seriesCountOf = ev => ev.series_id ? events.filter(e => e.series_id === ev.series_id).length : 0

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

        {confirmDel && (
          <div className="sch-confirm">
            <span className="sch-confirm-text">Delete “{confirmDel.title}”?</span>
            <div className="sch-confirm-btns">
              {confirmDel.series_id ? (
                <>
                  <button className="sch-del" onClick={() => doDelete(confirmDel, 'one')}>This event only</button>
                  <button className="sch-del" onClick={() => doDelete(confirmDel, 'series')}>Whole series ({seriesCountOf(confirmDel)})</button>
                </>
              ) : (
                <button className="sch-del" onClick={() => doDelete(confirmDel, 'one')}>Delete</button>
              )}
              <button className="sch-cancel" onClick={() => setConfirmDel(null)}>Cancel</button>
            </div>
          </div>
        )}

        {isStaff && editing !== null && (
          <form className="sch-form" onSubmit={save}>
            <h2 className="sch-form-title">{editing === 'new' ? 'New event' : 'Edit event'}</h2>

            {editingEvent?.series_id && (
              <div className="sch-scope">
                <span className="sch-label">Apply changes to</span>
                <div className="sch-scope-opts">
                  <label className={`sch-scope-opt${editScope === 'one' ? ' on' : ''}`}>
                    <input type="radio" name="editscope" checked={editScope === 'one'}
                      onChange={() => setEditScope('one')} />
                    This event only
                  </label>
                  <label className={`sch-scope-opt${editScope === 'series' ? ' on' : ''}`}>
                    <input type="radio" name="editscope" checked={editScope === 'series'}
                      onChange={() => setEditScope('series')} />
                    Whole series ({editingSeriesCount})
                  </label>
                </div>
                {editScope === 'series' && (
                  <p className="sch-scope-hint">Title, kind, location, notes, RSVP, and the time block apply to all {editingSeriesCount} events; each keeps its own day.</p>
                )}
              </div>
            )}

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
            {editing === 'new' && (
              <div className="sch-repeat">
                <label className="sch-toggle">
                  <input type="checkbox" checked={form.repeat}
                    onChange={e => setForm(f => {
                      // Pre-select the start day's weekday when turning repeat on.
                      const startDay = f.start ? new Date(f.start).getDay() : null
                      return {
                        ...f, repeat: e.target.checked,
                        repeatDays: e.target.checked && f.repeatDays.length === 0 && startDay != null
                          ? [startDay] : f.repeatDays,
                      }
                    })} />
                  <span className="sch-label">Repeat on multiple days</span>
                </label>
                {form.repeat && (
                  <div className="sch-repeat-body">
                    <div className="sch-weekdays">
                      {WEEKDAYS.map(([n, label]) => (
                        <button key={n} type="button"
                          className={`sch-weekday${form.repeatDays.includes(n) ? ' on' : ''}`}
                          onClick={() => setForm(f => ({
                            ...f,
                            repeatDays: f.repeatDays.includes(n)
                              ? f.repeatDays.filter(d => d !== n)
                              : [...f.repeatDays, n],
                          }))}
                        >{label}</button>
                      ))}
                    </div>
                    <label className="sch-field sch-repeat-until">
                      <span className="sch-label">Repeat until</span>
                      <input className="sch-input" type="date" value={form.repeatUntil}
                        onChange={e => setForm(f => ({ ...f, repeatUntil: e.target.value }))} />
                    </label>
                    <p className="sch-repeat-hint">Uses the start/end time above as the block for each day.</p>
                  </div>
                )}
              </div>
            )}

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
                          {ev.series_id && <span className="sch-series-tag" title="Part of a recurring series">series</span>}
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
