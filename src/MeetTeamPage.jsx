import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import { DAY_FMT, TIME_FMT } from './roleBoard'
import {
  ORG_TAGS, RESOURCE_TAGS, CONTACT_ROLES, tagLabel, emptyForm, formFromConnection, validateConnection, saveArgs, toggle,
  groupByTeam, readDraft, writeDraft, clearDraft, draftHasContent,
} from './meetTeam'
import './MeetTeam.css'

// Meet a team (0035, ledger 0026). Every member talks to another team at a
// competition and logs what that team does well, how they are organized,
// what they offer and one thing to copy. The notes are the team's shared
// knowledge base for the event, grouped by team number and searchable.
// Contacts come back only for students and staff (meet_team_event); a member
// edits or deletes their own notes, staff any. Staff see progress and give
// everyone a Meet a team slot on the role board.

function done(r) {
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'Meet a team is not set up yet. Nothing was saved.' }
  return r.data
}
const errText = (e) => e?.message || 'Something went wrong. Nothing was changed.'
const offline = (e) => !e?.code && /fetch|network|load failed/i.test(String(e?.message ?? e ?? ''))
const when = (s) => `${DAY_FMT(s.day ?? String(s.starts_at).slice(0, 10))} · ${TIME_FMT(s.starts_at)}${s.ends_at ? `–${TIME_FMT(s.ends_at)}` : ''}`

export default function MeetTeamPage(props) {
  const { eventId } = useParams()
  return eventId ? <MeetTeamEvent key={eventId} eventId={eventId} {...props} /> : <MeetTeamIndex />
}

function Shell({ children, eventId }) {
  return (
    <main className="mt-wrap" data-page="meet-team">
      <Link className="mt-back" to={eventId ? '/meet' : '/scouting'}>{eventId ? '← All events' : '← Scouting'}</Link>
      {children}
    </main>
  )
}

function MeetTeamIndex() {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    supabase.from('events').select('id, title, starts_at, ends_at, kind').eq('kind', 'competition').gte('ends_at', since).order('starts_at')
      .then((r) => setEvents(r.error ? [] : (r.data ?? [])))
  }, [])
  return (
    <Shell>
      <header className="mt-head"><span className="mt-eyebrow">Meet a team</span><h1 className="mt-title">Pick a competition</h1>
        <p className="mt-sub">At every competition, each of us talks to another team and logs what they do well.</p></header>
      {!events ? <p className="mt-muted" role="status">Loading…</p> : !events.length ? <div className="mt-empty"><h2>No competitions yet</h2><p>They show up here once they are on the schedule.</p></div> : (
        <ul className="mt-events">{events.map((e) => (
          <li key={e.id}><Link to={`/meet/${e.id}`} className="mt-event"><b>{e.title}</b><span className="hud-mono">{DAY_FMT(String(e.starts_at).slice(0, 10))}</span></Link></li>))}</ul>
      )}
    </Shell>
  )
}

function MeetTeamEvent({ eventId, session }) {
  const uid = session?.user?.id
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const r = await supabase.rpc('meet_team_event', { p_event: eventId })
    if (r.error) { setState(isSchemaMissing(r.error) ? 'missing' : r.error.code === '42501' ? 'denied' : 'error'); setMsg(errText(r.error)); return }
    setData(r.data); setState('ready')
  }, [eventId])
  useEffect(() => { load() }, [load])

  if (state === 'loading') return <Shell eventId={eventId}><h1 className="mt-title">Meet a team</h1><p className="mt-muted" role="status">Loading…</p></Shell>
  if (state === 'missing') return <Shell eventId={eventId}><h1 className="mt-title">Meet a team</h1><div className="mt-empty" data-missing><h2>Not set up yet</h2><p>Meet a team starts when its update reaches the database.</p></div></Shell>
  if (state === 'denied') return <Shell eventId={eventId}><h1 className="mt-title">Meet a team</h1><p className="mt-muted">Meet a team is for team members.</p></Shell>
  if (state === 'error') return <Shell eventId={eventId}><h1 className="mt-title">Meet a team</h1><p className="mt-error" role="alert">{msg}</p></Shell>

  const mine = data.connections.filter((c) => c.mine)
  const slot = data.my_slots.find((s) => s.status === 'assigned') ?? data.my_slots[0] ?? null
  return (
    <Shell eventId={eventId}>
      <header className="mt-head">
        <div>
          <span className="mt-eyebrow">Meet a team</span>
          <h1 className="mt-title">{data.event.title}</h1>
          <p className="mt-sub" data-explainer>Go talk to another team. Find out what they do well and how they run. Not scouting: we want to learn from them.</p>
        </div>
        <Link className="mt-link" to={`/roles/${eventId}`}>Role board →</Link>
      </header>

      {data.can_write && (
        <section className={`mt-status${mine.length ? ' mt-status-done' : ''}`} aria-label="Your Meet a team" data-status>
          <div className="mt-status-main">
            <span className="mt-eyebrow">You</span>
            <b className="mt-status-big">{mine.length ? `Done · ${mine.length} team${mine.length === 1 ? '' : 's'} logged` : 'Not done yet'}</b>
          </div>
          <div className="mt-status-slot hud-mono" data-myslot>
            {slot ? <>Your slot: {when(slot)}{slot.status !== 'assigned' ? ` (${slot.status})` : ''}</> : data.has_slots ? 'No slot yet. A mentor gives everyone one.' : 'Any time during the event.'}
          </div>
        </section>
      )}

      {data.can_write && <ConnectionForm key={`form:${data.connections.length}`} data={data} uid={uid} eventId={eventId} onSaved={async (text) => { await load(); setMsg(text) }} />}
      {msg && <p className="mt-msg" role="status">{msg}</p>}

      {data.can_manage && <StaffPanel eventId={eventId} onChanged={load} />}

      <SharedList data={data} eventId={eventId} uid={uid} onChanged={async (text) => { await load(); setMsg(text) }} />
    </Shell>
  )
}

function Chips({ tags, value, onChange, name }) {
  return (
    <div className="mt-chips" role="group" aria-label={name}>
      {tags.map(([k, label]) => (
        <button key={k} type="button" className="mt-chip" aria-pressed={value.includes(k)} data-chip={k} onClick={() => onChange(toggle(value, k))}>{label}</button>))}
    </div>
  )
}

function Field({ label, error, children, hint }) {
  return (
    <label className={`mt-field${error ? ' mt-field-bad' : ''}`}>
      <span className="mt-label">{label}</span>
      {children}
      {hint && <span className="mt-hint">{hint}</span>}
      {error && <span className="mt-field-error" role="alert">{error}</span>}
    </label>
  )
}

function ConnectionForm({ data, uid, eventId, onSaved, editing = null, onCancel = null }) {
  const draftId = editing ? `${eventId}:${editing.id}` : eventId
  const initial = useMemo(() => {
    const d = readDraft(uid, draftId)
    if (d && draftHasContent(d.form)) return { form: { ...emptyForm(), ...d.form }, restored: true }
    return { form: editing ? formFromConnection(editing) : emptyForm(), restored: false }
  }, [uid, draftId, editing])
  const [f, setF] = useState(initial.form)
  const [open, setOpen] = useState(!!editing || initial.restored || !data.connections.some((c) => c.mine))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(initial.restored ? 'Draft restored from this phone.' : '')
  const teams = data.teams ?? []
  const listed = teams.some((t) => String(t.team_number) === String(f.team_number))
  const [typeIn, setTypeIn] = useState(!teams.length || (f.team_number !== '' && !listed))

  function set(patch) {
    setF((cur) => {
      const next = { ...cur, ...patch }
      writeDraft(uid, draftId, { form: next, at: new Date().toISOString() })
      return next
    })
  }
  async function save(e) {
    e.preventDefault()
    const errs = validateConnection(f)
    setErrors(errs)
    if (Object.keys(errs).length) { setNote('Fix the marked fields.'); return }
    setBusy(true); setNote('')
    try {
      done(await writeVia(supabase, 'team_connection_save', saveArgs(f, eventId, editing?.id ?? null)))
      clearDraft(uid, draftId)
      setBusy(false)
      await onSaved(editing ? `Saved your changes to ${f.team_number}.` : `Saved. Thanks for connecting with ${f.team_number}.`)
    } catch (err) {
      setBusy(false)
      setNote(offline(err) ? 'Not saved: no connection. Your draft is kept on this phone. Try again when you have signal.' : `Not saved. ${errText(err)} Your draft is kept.`)
    }
  }

  if (!open) return <button className="mt-primary mt-open" onClick={() => setOpen(true)}>+ Log another team</button>
  return (
    <form className="mt-form" onSubmit={save} noValidate data-form>
      <div className="mt-form-head">
        <h2 className="mt-h2">{editing ? `Edit your note on ${editing.team_number}` : 'Log a team'}</h2>
        {(editing || data.connections.some((c) => c.mine)) && <button type="button" className="mt-btn" onClick={() => { clearDraft(uid, draftId); if (onCancel) onCancel(); else setOpen(false) }}>Cancel</button>}
      </div>

      <div className="mt-row">
        {typeIn ? (
          <Field label="Team number" error={errors.team_number}>
            <input inputMode="numeric" pattern="[0-9]*" maxLength={5} value={f.team_number} onChange={(e) => set({ team_number: e.target.value.replace(/\D/g, '') })} name="team_number" />
          </Field>
        ) : (
          <Field label="Team" error={errors.team_number}>
            <select value={f.team_number} name="team_pick" onChange={(e) => {
              if (e.target.value === 'other') { setTypeIn(true); set({ team_number: '', team_name: '' }); return }
              const t = teams.find((x) => String(x.team_number) === e.target.value)
              set({ team_number: e.target.value, team_name: t?.name ?? f.team_name })
            }}>
              <option value="">Pick a team</option>
              {teams.map((t) => <option key={t.team_number} value={t.team_number}>{t.team_number}{t.name ? ` · ${t.name}` : ''}</option>)}
              <option value="other">Not listed: type it</option>
            </select>
          </Field>
        )}
        <Field label="Team name">
          <input maxLength={120} value={f.team_name} onChange={(e) => set({ team_name: e.target.value })} name="team_name" />
        </Field>
      </div>
      {typeIn && teams.length > 0 && <button type="button" className="mt-text-btn" onClick={() => setTypeIn(false)}>Pick from this event’s teams</button>}

      <Field label="What do they do well?" error={errors.does_well}>
        <textarea rows={2} maxLength={1000} value={f.does_well} onChange={(e) => set({ does_well: e.target.value })} name="does_well" />
      </Field>

      <fieldset className="mt-set">
        <legend className="mt-label">How are they organized?</legend>
        <Chips name="How they are organized" tags={ORG_TAGS} value={f.org_tags} onChange={(v) => set({ org_tags: v })} />
        <input className="mt-note" placeholder="Anything else about how they run" maxLength={1000} value={f.org_note} onChange={(e) => set({ org_note: e.target.value })} name="org_note" />
      </fieldset>

      <fieldset className="mt-set">
        <legend className="mt-label">Resources they offer</legend>
        <Chips name="Resources they offer" tags={RESOURCE_TAGS} value={f.resource_tags} onChange={(v) => set({ resource_tags: v })} />
        <input className="mt-note" placeholder="Details, links, who to ask" maxLength={1000} value={f.resource_note} onChange={(e) => set({ resource_note: e.target.value })} name="resource_note" />
      </fieldset>

      <Field label="One thing we should copy" error={errors.copy_this}>
        <textarea rows={2} maxLength={1000} value={f.copy_this} onChange={(e) => set({ copy_this: e.target.value })} name="copy_this" />
      </Field>

      <details className="mt-more" open={!!(f.contact_name || f.contact_email || f.contact_discord || f.contact_social)}>
        <summary>Who you talked to (optional)</summary>
        <p className="mt-ask" data-ask>Ask before you write down anyone’s contact info.</p>
        <div className="mt-row">
          <Field label="Name"><input maxLength={120} value={f.contact_name} onChange={(e) => set({ contact_name: e.target.value })} name="contact_name" /></Field>
          <Field label="Their role" error={errors.contact_role}>
            <select value={f.contact_role} onChange={(e) => set({ contact_role: e.target.value })} name="contact_role">
              <option value="">Pick one</option>
              {CONTACT_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-row">
          <Field label="Email" error={errors.contact_email}><input type="email" inputMode="email" maxLength={200} value={f.contact_email} onChange={(e) => set({ contact_email: e.target.value })} name="contact_email" /></Field>
          <Field label="Discord"><input maxLength={100} value={f.contact_discord} onChange={(e) => set({ contact_discord: e.target.value })} name="contact_discord" /></Field>
        </div>
        <Field label="Instagram or website"><input maxLength={200} value={f.contact_social} onChange={(e) => set({ contact_social: e.target.value })} name="contact_social" /></Field>
      </details>

      <div className="mt-follow">
        <span className="mt-label">Follow up?</span>
        <div className="mt-chips" role="group" aria-label="Follow up">
          <button type="button" className="mt-chip" aria-pressed={f.follow_up} onClick={() => set({ follow_up: true })}>Yes</button>
          <button type="button" className="mt-chip" aria-pressed={!f.follow_up} onClick={() => set({ follow_up: false })}>No</button>
        </div>
        {f.follow_up && <input className="mt-note" placeholder="What, and who does it" maxLength={1000} value={f.follow_up_note} onChange={(e) => set({ follow_up_note: e.target.value })} name="follow_up_note" />}
      </div>

      <div className="mt-form-foot">
        <span className="mt-muted" role="status" data-note>{note}</span>
        <button className="mt-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}</button>
      </div>
    </form>
  )
}

function SharedList({ data, eventId, uid, onChanged }) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const groups = groupByTeam(data.connections, q)
  async function del(c) {
    setBusy(c.id); setErr('')
    try { done(await writeVia(supabase, 'team_connection_delete', { p_id: c.id })); setConfirmDel(null); await onChanged(`Deleted the note on ${c.team_number}.`) } catch (e) { setErr(errText(e)) }
    setBusy('')
  }
  return (
    <section className="mt-shared" aria-label="Teams we met" data-shared>
      <div className="mt-shared-head">
        <h2 className="mt-h2">Teams we met <span className="mt-count hud-tnum">{new Set(data.connections.map((c) => c.team_number)).size}</span></h2>
        <input className="mt-search" type="search" placeholder="Search teams, notes, chips" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search teams we met" />
      </div>
      {err && <p className="mt-error" role="alert">{err}</p>}
      {!data.connections.length ? <div className="mt-empty"><h2>No teams yet</h2><p>The first note anyone saves shows up here for the whole team.</p></div>
        : !groups.length ? <p className="mt-muted">Nothing matches “{q}”.</p> : (
          <ul className="mt-teams">{groups.map((g) => (
            <li key={g.team_number} className="mt-team" data-team={g.team_number}>
              <h3 className="mt-team-head"><span className="mt-team-num hud-tnum">{g.team_number}</span>{g.team_name && <span className="mt-team-name">{g.team_name}</span>}
                <span className="mt-team-count hud-mono">{g.notes.length} note{g.notes.length === 1 ? '' : 's'}</span></h3>
              <ul className="mt-notes">{g.notes.map((c) => editing === c.id ? (
                <li key={c.id}><ConnectionForm data={data} uid={uid} eventId={eventId} editing={c} onCancel={() => setEditing(null)} onSaved={async (t) => { setEditing(null); await onChanged(t) }} /></li>
              ) : (
                <li key={c.id} className="mt-note-card" data-note-by={c.logged_by}>
                  <div className="mt-note-by hud-mono">{c.logged_by}{c.mine ? ' (you)' : ''}</div>
                  <p className="mt-well"><b>Does well:</b> {c.does_well}</p>
                  {(c.org_tags?.length > 0 || c.org_note) && <p><b>Organized:</b> {c.org_tags.map((t) => <span key={t} className="mt-tag">{tagLabel(t)}</span>)}{c.org_note && <span className="mt-note-text"> {c.org_note}</span>}</p>}
                  {(c.resource_tags?.length > 0 || c.resource_note) && <p><b>Offers:</b> {c.resource_tags.map((t) => <span key={t} className="mt-tag">{tagLabel(t)}</span>)}{c.resource_note && <span className="mt-note-text"> {c.resource_note}</span>}</p>}
                  <p className="mt-copy"><b>Copy this:</b> {c.copy_this}</p>
                  {c.follow_up && <p className="mt-followup"><b>Follow up:</b> {c.follow_up_note || 'Yes'}</p>}
                  {c.contact && <p className="mt-contact" data-contact><b>Talked to:</b> {[c.contact.name, c.contact.role && tagLabel(c.contact.role)].filter(Boolean).join(', ') || 'Someone'}
                    {[c.contact.email, c.contact.discord, c.contact.social].filter(Boolean).map((x) => <span key={x} className="mt-contact-bit hud-mono">{x}</span>)}</p>}
                  {(c.mine || data.can_manage) && (
                    <div className="mt-note-acts">
                      <button className="mt-btn" onClick={() => setEditing(c.id)}>Edit</button>
                      {confirmDel === c.id
                        ? <><button className="mt-btn mt-btn-bad" disabled={busy === c.id} onClick={() => del(c)}>Yes, delete</button><button className="mt-btn" onClick={() => setConfirmDel(null)}>Keep</button></>
                        : <button className="mt-btn" onClick={() => setConfirmDel(c.id)}>Delete</button>}
                    </div>)}
                </li>))}</ul>
            </li>))}</ul>
        )}
    </section>
  )
}

const STATE_LABEL = { done: 'Done', slotted: 'Slotted, not logged yet', no_slot: 'No slot' }

function StaffPanel({ eventId, onChanged }) {
  const [p, setP] = useState(null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const loadP = useCallback(async () => {
    const r = await supabase.rpc('meet_team_progress', { p_event: eventId })
    setP(r.error ? { error: errText(r.error) } : r.data)
  }, [eventId])
  useEffect(() => { loadP() }, [loadP])
  async function preview() {
    setBusy('preview'); setMsg('')
    const r = await supabase.rpc('staff_meet_team_fill', { p_event: eventId, p_apply: false })
    setBusy('')
    if (r.error) { setMsg(errText(r.error)); return }
    setPlan(r.data)
  }
  async function apply() {
    setBusy('apply'); setMsg('')
    try {
      const out = done(await writeVia(supabase, 'staff_meet_team_fill', { p_event: eventId, p_apply: true }))
      // The message lands after the reload, so what it says is already on screen.
      await loadP(); await onChanged()
      setPlan(null)
      setMsg(`${out.placed.length} placed${out.unplaced.length ? `, ${out.unplaced.length} could not be placed` : ''}.`)
    } catch (e) { setMsg(errText(e)) }
    setBusy('')
  }
  if (!p) return null
  if (p.error) return <section className="mt-staff"><p className="mt-error" role="alert">{p.error}</p></section>
  const by = (s) => p.people.filter((x) => x.state === s)
  return (
    <section className="mt-staff" aria-label="Meet a team progress" data-progress>
      <div className="mt-staff-head">
        <h2 className="mt-h2">Progress</h2>
        <button className="mt-primary" disabled={!!busy} onClick={preview} data-fill>Give everyone a slot</button>
      </div>
      <div className="mt-nums">
        {['done', 'slotted', 'no_slot'].map((s) => <div key={s} className={`mt-num mt-num-${s}`} data-num={s}><b className="hud-tnum">{p[s]}</b><span>{STATE_LABEL[s]}</span></div>)}
      </div>
      {msg && <p className="mt-msg" role="status">{msg}</p>}
      {plan && (
        <div className="mt-plan" data-plan>
          <h3 className="mt-h3">Preview: {plan.placed.length} to place{plan.unplaced.length ? `, ${plan.unplaced.length} cannot be placed` : ''}</h3>
          {plan.placed.length > 0 && <ul className="mt-plan-list">{plan.placed.map((x) => <li key={x.member_id}><b>{x.name}</b><span className="hud-mono">{x.label} · {when(x)}</span></li>)}</ul>}
          {plan.unplaced.length > 0 && <ul className="mt-plan-list mt-plan-bad">{plan.unplaced.map((x) => <li key={x.member_id}><b>{x.name}</b><span>{x.reason}</span></li>)}</ul>}
          {!plan.placed.length && !plan.unplaced.length && <p className="mt-muted">Everyone already has a slot.</p>}
          <div className="mt-plan-acts">
            {plan.placed.length > 0 && <button className="mt-primary" disabled={!!busy} onClick={apply} data-apply>Assign these {plan.placed.length}</button>}
            <button className="mt-btn" onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
      {['slotted', 'no_slot', 'done'].map((s) => by(s).length > 0 && (
        <details key={s} className="mt-people" open={s !== 'done'}>
          <summary>{STATE_LABEL[s]} <span className="hud-tnum">{by(s).length}</span></summary>
          <ul>{by(s).map((x) => <li key={x.member_id}><b>{x.name}</b>
            <span className="hud-mono">{s === 'done' ? `${x.logged} logged: ${x.teams.join(', ')}` : x.slots[0] ? `${x.slots[0].label} · ${when(x.slots[0])}` : ''}</span></li>)}</ul>
        </details>))}
    </section>
  )
}
