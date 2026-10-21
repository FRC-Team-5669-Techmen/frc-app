import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { CAPABILITIES, reliability } from './scouting/model'
import { createScoutingStore } from './scouting/storage'
import { loadScoutingEvent, saveScoutingRecord, syncScoutingQueue } from './scouting/client'
import RecordForm from './scouting/RecordForm'
import PickLists from './scouting/PickLists'
import Training from './scouting/Training'
import SchedulePlanner from './scouting/SchedulePlanner'
import PitLocation from './scouting/PitLocation'
import CoveragePanel from './scouting/CoveragePanel'
import { buildEventArchive, downloadArchive } from './scouting/backup'
import { matchOrder } from './scouting/schedule'
import { footageLabel, matchIdentity } from './scouting/provenance'
import './ScoutingPage.css'

const when = value => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : 'Unknown time'
const words = value => ({ yes: 'Yes', no: 'No', unknown: 'Unknown', did_not_see: 'Did not see', not_applicable: 'Not applicable' })[value] ?? 'Not recorded'
const errorText = e => e?.message || String(e || 'Could not complete this action.')
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export default function ScoutingPage({ session, hasRole = () => false }) {
  const { eventId } = useParams()
  const uid = session?.user?.id
  const staff = ['admin', 'mentor', 'lead'].some(hasRole)
  if (!uid || (hasRole('parent') && !staff)) return <main className="sc-wrap"><h1>Scouting</h1><p>Scouting is available to student and staff accounts.</p><Link className="sc-link" to="/dashboard">Back to dashboard</Link></main>
  if (eventId && !uuid(eventId)) return <main className="sc-wrap"><h1>Event not found</h1><Link className="sc-link" to="/scouting">Choose an event</Link></main>
  return eventId ? <EventScouting key={`${uid}:${eventId}`} uid={uid} eventId={eventId} staff={staff} /> : <ScoutingEvents key={uid} uid={uid} />
}

function ScoutingEvents({ uid }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [cached, setCached] = useState(false)
  const [query, setQuery] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let live = true
    async function load() {
      let store
      try {
        store = await createScoutingStore()
        const saved = await store.getDraft(uid, 'event-index', 'events')
        if (live && saved) { setEvents(saved); setCached(true) }
        const result = await supabase.from('events').select('id,title,kind,starts_at,ends_at,location').in('kind', ['competition', 'training']).order('starts_at', { ascending: false })
        if (result.error) throw result.error
        if (live) { setEvents(result.data ?? []); setCached(false); setError('') }
        await store.saveDraft(uid, 'event-index', 'events', result.data ?? [])
      } catch (e) { if (live) { setError(errorText(e)); setEvents(old => old ?? []) } }
      finally { store?.close() }
    }
    load()
    return () => { live = false }
  }, [uid, retry])
  const filtered = (events ?? []).filter(e => `${e.title} ${e.location ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  return <main className="sc-wrap" data-scout-page="events">
    <header className="sc-head"><div><span className="sc-eyebrow">Techmen field intelligence</span><h1>Scouting</h1><p>One event. Shared evidence. Better decisions.</p></div><span className="sc-season">REBUILT / 2026</span></header>
    <div className="sc-intro"><span className="sc-intro-number">01</span><div><h2>Choose your event</h2><p>Open the event while connected to save its data for the stands. Observations and notes stay on this device until they sync.</p></div></div>
    <label className="sc-search">Find an event<input type="search" placeholder="Event name or venue" value={query} onChange={e => setQuery(e.target.value)} /></label>
    {cached && <p className="sc-notice">Showing the event list saved on this device.</p>}
    {error && <div className="sc-notice" role="status"><p>Could not refresh events. {error}</p><button onClick={() => setRetry(n => n + 1)}>Try again</button></div>}
    {!events ? <p role="status">Loading events…</p> : !filtered.length ? <div className="sc-empty"><h2>No matching events</h2><p>Your lead can add a competition or training event in Schedule.</p><Link className="sc-link" to="/schedule">Open Schedule</Link></div> : <div className="sc-event-grid">{filtered.map(event => <Link className="sc-event-card" key={event.id} to={`/scouting/${event.id}`}><span className="sc-eyebrow">{event.kind}</span><h2>{event.title}</h2><p>{event.location || 'Venue not listed'}</p><span className="sc-event-foot"><span>{when(event.starts_at)}</span><b>Open scouting →</b></span></Link>)}</div>}
  </main>
}

function EventScouting({ uid, eventId, staff }) {
  const [store, setStore] = useState(null)
  const [data, setData] = useState({ records: [], delivery: [], revisions: [], members: [], event: null })
  const [queue, setQueue] = useState([])
  const [scouts, setScouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [manager, setManager] = useState(staff)
  const [tab, setTab] = useState('scout')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(null)
  const [teamQuery, setTeamQuery] = useState('')
  const [showAllAssignments, setShowAllAssignments] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const alive = useRef(true)
  const syncLock = useRef(false)
  const queueGeneration = useRef(0)
  const current = () => alive.current
  useEffect(() => {
    alive.current = true
    createScoutingStore().then(value => { if (alive.current) setStore(value) }).catch(e => { if (alive.current) { setError(`Device storage is unavailable. ${errorText(e)}`); setLoading(false) } })
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { alive.current = false; window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const refresh = useCallback(async (selectedStore = store) => {
    if (!selectedStore) return
    const snapshot = await loadScoutingEvent({ store: selectedStore, client: supabase, memberId: uid, eventId, isCurrent: current })
    if (!alive.current) return
    setData(snapshot); setLoading(false)
    setQueue(await selectedStore.listQueue(uid, eventId))
    if (snapshot.error) setError(errorText(snapshot.error)); else setError('')
    if (!navigator.onLine) {
      const savedScouts = await selectedStore.getDraft(uid, eventId, 'eligible-scouts')
      if (alive.current && savedScouts) { setScouts(savedScouts.scouts ?? []); setManager(savedScouts.manager === true) }
    }
    if (navigator.onLine && !snapshot.missing) {
      const result = await supabase.rpc('scouting_can_manage', { p_event: eventId })
      if (alive.current) setManager(!result.error && result.data === true)
      if (!result.error && result.data === true) {
        const roster = await supabase.rpc('scouting_roster', { p_event: eventId })
        if (alive.current) {
          if (roster.error || !Array.isArray(roster.data)) { setScouts([]); setError('Could not load eligible scouts. Refresh before assigning a shift.') }
          else {
            setScouts(roster.data)
            await selectedStore.saveDraft(uid, eventId, 'eligible-scouts', { scouts: roster.data, manager: true })
          }
        }
      } else if (alive.current) setScouts([])
    }
  }, [store, uid, eventId])

  const sync = useCallback(async () => {
    if (!store || syncLock.current) return
    syncLock.current = true; setBusy(true)
    const startedGeneration = queueGeneration.current
    try {
      const next = await syncScoutingQueue({ store, client: supabase, memberId: uid, eventId, isCurrent: current })
      if (!alive.current) return
      setQueue(next); await refresh()
    } catch (e) { if (alive.current) setError(errorText(e)) }
    finally {
      syncLock.current = false
      if (alive.current) {
        setBusy(false)
        // Batch imports may enqueue new rows after this sync took its snapshot.
        // Drain only fresh local work; failed requests wait for a deliberate retry.
        if (queueGeneration.current !== startedGeneration) store.listQueue(uid, eventId).then(next => { if (alive.current && navigator.onLine && next.some(op => op.status === 'local')) setTimeout(() => { if (alive.current) sync() }, 0) }).catch(() => {})
      }
    }
  }, [store, uid, eventId, refresh])

  useEffect(() => { if (store) refresh().catch(e => { if (alive.current) { setError(errorText(e)); setLoading(false) } }) }, [store, refresh])
  useEffect(() => { if (store && online && !loading && !data.missing) sync() }, [store, online, loading])

  async function save(record) {
    if (!store) throw new Error('Device storage is unavailable. Nothing was saved.')
    const operation = await saveScoutingRecord({ store, memberId: uid, eventId, record })
    queueGeneration.current++
    if (!alive.current) return operation
    setQueue(await store.listQueue(uid, eventId)); setNotice('Saved on this device. Waiting to sync.')
    if (navigator.onLine) {
      // Enqueue completes first. Network failures cannot erase the local save.
      sync().catch(e => { if (alive.current) setError(errorText(e)) })
    }
    return operation
  }
  async function saveBatch(proposals) {
    if (!store) throw new Error('Device storage is unavailable. Nothing was saved.')
    const operations = await store.enqueueBatch(uid, eventId, proposals)
    queueGeneration.current++
    // Local commit is the success boundary. A failed refresh cannot make a
    // successfully saved batch look unsaved and invite a duplicate submission.
    if (alive.current) {
      setQueue(previous => [...previous, ...operations]); setNotice(`${operations.length} records saved on this device.`)
      if (navigator.onLine) sync().catch(e => { if (alive.current) setError(errorText(e)) })
    }
    return operations
  }
  const records = useMemo(() => {
    const byId = new Map((data.records ?? []).map(r => [r.id, r]))
    for (const op of queue) {
      if (op.status === 'synced' && op.result && (!byId.has(op.record_id) || op.result.version > byId.get(op.record_id).version)) byId.set(op.record_id, op.result)
      else if (op.status === 'local' || op.status === 'syncing') byId.set(op.record_id, { ...byId.get(op.record_id), id: op.record_id, event_id: eventId, member_id: byId.get(op.record_id)?.member_id ?? uid, kind: op.args.p_kind, team_number: op.args.p_team, match_key: op.args.p_match, payload: op.args.p_payload, version: op.args.p_expected_version, localStatus: op.status })
    }
    return [...byId.values()]
  }, [data.records, queue, eventId, uid])
  const serverRecords = (data.records ?? []).filter(r => !r.localStatus)
  const pending = queue.filter(x => x.status !== 'synced')
  const teamRows = records.filter(r => r.kind === 'team')
  const numbers = [...new Set(records.map(r => r.team_number).filter(Boolean))].sort((a, b) => a - b)
  const nameFor = n => teamRows.find(r => r.team_number === n)?.payload?.name ?? ''
  const memberName = id => (data.members ?? []).find(m => m.id === id)?.nickname || (data.members ?? []).find(m => m.id === id)?.full_name || (id === uid ? 'You' : 'Team member')
  const canEdit = row => !row.localStatus && (row.member_id === uid || (manager && !['pick_list', 'observation'].includes(row.kind)))
  const observations = records.filter(r => r.kind === 'observation')
  const observationFor = row => observations.find(o => o.member_id === row.payload.assignee && (o.payload.assignment_id === row.id || (o.team_number === row.team_number && matchIdentity(o) === matchIdentity(row))))
  const isComplete = row => row.payload.status === 'complete' || !!observationFor(row)
  const assignments = records.filter(r => r.kind === 'assignment' && r.payload?.status !== 'cancelled' && (showAllAssignments || r.payload?.assignee === uid))
    .sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)) || matchOrder({ key: a.match_key }, { key: b.match_key }))
  const pitFor = n => records.filter(r => r.kind === 'pit' && r.team_number === n).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
  const openForm = (kind, extra = {}) => setForm({ kind, ...extra })
  async function exportData() {
    if (!store || exporting) return
    setExporting(true); setExportError('')
    try {
      const local = await store.exportBackup(uid, eventId)
      if (!alive.current) return
      const payload = buildEventArchive({ eventId, memberId: uid, snapshot: data, local })
      downloadArchive(payload, `techmen-scouting-${eventId}-${new Date().toISOString().replaceAll(':', '-')}.json`)
      setNotice(`Backup prepared: ${payload.records.length} synchronized records, ${payload.pending.length} pending saves and ${local.drafts.length} saved drafts. Check your Downloads folder.`)
    } catch (e) { if (alive.current) setExportError(`Backup could not be created. Your saved work is unchanged. ${errorText(e)}`) }
    finally { if (alive.current) setExporting(false) }
  }

  if (loading) return <main className="sc-wrap"><h1>Scouting</h1><p role="status">Opening event and saved work…</p></main>
  if (data.missing) return <main className="sc-wrap"><Link className="sc-link" to="/scouting">← Events</Link><h1>Scouting is not set up yet</h1><p>Your lead needs to finish scouting setup. Your existing team tools are still available.</p><Link className="sc-link" to="/dashboard">Back to dashboard</Link></main>
  return <main className="sc-wrap" data-scout-page="event">
    <Link className="sc-back" to="/scouting">← Events</Link>
    <header className="sc-head"><div><span className="sc-eyebrow">Techmen scouting</span><h1>{data.event?.title || 'Event scouting'}</h1><p>{data.event?.location || 'Observe. Compare. Decide.'}</p></div><button className="sc-primary" disabled={!store || !data.event} onClick={() => openForm('observation')}>New observation</button></header>
    <div className="sc-status-row"><span className="sc-status"><i className={online ? '' : 'sc-offline-dot'} />{online && !data.offline ? 'Connected' : 'Offline copy'}{data.cachedAt ? ` · updated ${when(data.cachedAt)}` : ''}</span><span className="sc-status">{pending.length ? `${pending.length} waiting to sync` : 'All saved work synced'}</span><button disabled={busy || !online || !store} onClick={sync}>Sync now</button><button disabled={busy || !online || !store} onClick={() => refresh().catch(e => setError(errorText(e)))}>Refresh</button></div>
    {error && <p role="alert" className="sc-error">{error}</p>}
    {notice && <div className="sc-notice" role="status"><span>{notice}</span><button aria-label="Dismiss save notice" onClick={() => setNotice('')}>Dismiss</button></div>}
    {data.offline && <p className="sc-help">Using the last successful download. New data stays on this device until you reconnect. Keep this browser's data until everything has synced.</p>}
    <QueuePanel queue={pending} store={store} uid={uid} eventId={eventId} serverRecords={serverRecords} onChange={async () => { queueGeneration.current++; setQueue(await store.listQueue(uid, eventId)) }} onSave={save} onSync={sync} onRepair={op => openForm(op.args.p_kind, { rejectedOperation: op.id, record: { id: op.args.p_id, version: op.args.p_expected_version, kind: op.args.p_kind, team_number: op.args.p_team, match_key: op.args.p_match, payload: op.args.p_payload } })} />
    <nav className="sc-tabs" role="tablist" aria-label="Scouting sections" onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')]; const i = tabs.indexOf(document.activeElement); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; e.preventDefault(); tabs[next]?.focus(); tabs[next]?.click() }}>{[['scout', 'Scout this'], ['teams', 'Teams'], ['messages', 'Pit messages'], ['picks', 'Pick lists'], ['practice', 'Practice']].map(([key, label]) => <button key={key} role="tab" id={`sc-tab-${key}`} aria-controls={`sc-panel-${key}`} tabIndex={tab === key ? 0 : -1} aria-label={label} aria-selected={tab === key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}{key === 'scout' && <span>{assignments.filter(r => !isComplete(r)).length}</span>}</button>)}</nav>
    {tab === 'scout' && <section className="sc-stack" role="tabpanel" id="sc-panel-scout" aria-labelledby="sc-tab-scout">
      <div className="sc-section-head"><div><h2>Your next match</h2><p className="sc-help">Observe the assigned robot. Record what you actually see.</p></div><button aria-pressed={showAllAssignments} onClick={() => setShowAllAssignments(x => !x)}>{showAllAssignments ? 'Show my assignments' : 'Show all assignments'}</button></div>
      {!assignments.length && <div className="sc-empty"><span className="sc-eyebrow">Ready when you are</span><h3>No assignments yet</h3><p>Ask your scouting lead for a match, or capture an observation now.</p><button onClick={() => openForm('observation')}>Start an observation</button></div>}
      <div className="sc-assignment-grid">{assignments.map(row => <article className={`sc-card sc-assignment${isComplete(row) ? ' sc-complete' : ''}`} key={row.id}><div className="sc-section-head"><span className="sc-match">{row.match_key}</span><span className="sc-chip">{row.localStatus ? 'Saved locally' : isComplete(row) ? 'Recorded' : 'To scout'}</span></div><div className="sc-team-number">{row.team_number}</div><h3>{nameFor(row.team_number) || 'Assigned robot'}</h3><p>{row.payload.instructions || 'Watch capabilities and record useful match notes.'}</p><p className="sc-help">Scout: {memberName(row.payload.assignee)}{row.payload.video_url ? ` · ${footageLabel(row)}` : ''}</p><div className="sc-actions">{row.payload.video_url && <a className="sc-link" href={row.payload.video_url} target="_blank" rel="noopener noreferrer">Watch video ↗</a>}<button className="sc-primary" disabled={!!row.localStatus || !!observationFor(row)?.localStatus || row.payload.assignee !== uid} onClick={() => openForm('observation', observationFor(row) ? { record: observationFor(row) } : { team: row.team_number, assignment: row })}>{observationFor(row) ? 'Review observation' : 'Scout match'}</button>{manager && canEdit(row) && <button onClick={() => openForm('assignment', { record: row })}>Edit assignment</button>}</div></article>)}</div>
      <details className="sc-card" open={observations.length > 0}><summary>Recent observations ({observations.length})</summary><div className="sc-stack">{observations.slice().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 30).map(row => <EvidenceRecord key={row.id} row={row} memberName={memberName} canEdit={canEdit(row)} onEdit={() => openForm('observation', { record: row })} revisions={data.revisions ?? []} />)}{!observations.length && <p className="sc-help">No observations saved for this event.</p>}</div></details>
    </section>}
    {tab === 'teams' && <section className="sc-stack" role="tabpanel" id="sc-panel-teams" aria-labelledby="sc-tab-teams">
      <CoveragePanel records={records} nameFor={nameFor} onTeam={team => setTeamQuery(String(team))} />
      <div className="sc-section-head"><div><h2>Robots and evidence</h2><p className="sc-help">Pit claims are separate from match verification.</p></div><label className="sc-search">Find a team<input type="search" value={teamQuery} onChange={e => setTeamQuery(e.target.value)} placeholder="Number or name" /></label></div>
      {!numbers.length && <div className="sc-empty"><h3>No teams yet</h3><p>Your lead can import the event roster or add a team below. You can also record a pit report by team number.</p><button onClick={() => openForm('pit')}>New pit report</button></div>}
      <div className="sc-team-grid">{numbers.filter(n => `${n} ${nameFor(n)}`.toLowerCase().includes(teamQuery.toLowerCase())).map(n => { const team = teamRows.find(r => r.team_number === n), pit = pitFor(n); return <article className="sc-card sc-team-card" key={n}><div className="sc-section-head"><div><span className="sc-team-number">{n}</span><h3>{nameFor(n) || 'Team'}</h3></div><span className="sc-chip">{pit?.payload.pit_location || team?.payload.pit_location || 'Pit unknown'}</span></div>
        <PitLocation records={records} team={n} />
        <div className="sc-evidence-grid">{CAPABILITIES.map(c => { const r = reliability(serverRecords, n, c.key); return <div className="sc-evidence" key={c.key}><h4>{c.label}</h4><span className="sc-help">Pit claim: {words(pit?.payload.capabilities?.[c.key])}</span><div className="sc-ratio">{r.percent === null ? 'No evidence' : `${Math.round(r.percent)}%`}<span>{r.yes}/{r.denominator} observed matches</span></div><p className="sc-help">{r.sufficient ? '3+ observed matches' : 'Provisional: fewer than 3 observed matches'}{r.disputed ? ` · ${r.disputed} disputed` : ''}</p><details><summary>Count details</summary><p className="sc-help">{r.no} observed failures. Excluded scout responses: {r.didNotSee} did not see, {r.notApplicable} not applicable, {r.missing} unanswered. Disputed matches are excluded.</p></details></div> })}</div>
        {team?.payload.epa != null && <p className="sc-help">Statbotics estimate: {team.payload.epa} EPA · {when(team.payload.epa_fetched_at)}. Not an official robot score.</p>}
        <div className="sc-actions"><button disabled={!!pit && !canEdit(pit)} onClick={() => openForm('pit', pit ? { record: pit } : { team: n })}>Pit report</button><button onClick={() => openForm('observation', { team: n })}>Observe</button><button onClick={() => openForm('message', { team: n })}>Message</button>{manager && team && canEdit(team) && <button onClick={() => openForm('team', { record: team })}>Edit team</button>}</div>
        {pit && <details><summary>Pit notes and history</summary><EvidenceRecord row={pit} memberName={memberName} revisions={data.revisions ?? []} /></details>}
        {!!team?.payload.official_results?.length && <details><summary>Official alliance results</summary><p className="sc-help">Alliance totals do not establish this robot's individual contribution.</p><pre className="sc-json">{JSON.stringify(team.payload.official_results, null, 2)}</pre></details>}
      </article> })}</div>
    </section>}
    {tab === 'messages' && <section className="sc-stack" role="tabpanel" id="sc-panel-messages" aria-labelledby="sc-tab-messages"><div className="sc-section-head"><div><h2>Stands to pits</h2><p className="sc-help">Ask a focused question. Keep the answer with the robot's history.</p></div><button className="sc-primary" onClick={() => openForm('message')}>New pit message</button></div>
      {!records.some(r => r.kind === 'message') && <div className="sc-empty"><h3>No pit messages</h3><p>Flag a robot issue or a question for someone in the pits.</p></div>}
      {records.filter(r => r.kind === 'message').sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(row => { const delivery = (data.delivery ?? []).filter(d => d.record_id === row.id && d.record_version === row.version).at(-1); return <article className="sc-card" key={row.id}><div className="sc-section-head"><h3>{row.team_number} {nameFor(row.team_number)}</h3><span className="sc-chip">{row.payload.status}</span></div>{row.payload.reply_to && <p className="sc-help">Reply to: {records.find(r => r.id === row.payload.reply_to)?.payload.text || 'Original message not loaded'}</p>}<p className="sc-note">{row.payload.text}</p><PitLocation records={records} team={row.team_number} /><p className="sc-help">{memberName(row.member_id)} · {row.localStatus ? 'Saved on this device' : `Synced · ${when(row.updated_at)}`}</p><p className="sc-delivery">Discord: {row.localStatus ? 'Waiting for sync' : delivery?.status?.replaceAll('_', ' ') || (row.payload.request_delivery ? 'Delivery requested; status unavailable' : 'Not requested')}</p>{['uncertain', 'sending'].includes(delivery?.status) && <p className="sc-help">Receipt is unconfirmed. Check Discord before any further action; an automatic resend could duplicate the message.</p>}<div className="sc-actions">{!row.localStatus && <button onClick={() => openForm('message', { team: row.team_number, replyTo: row.payload.reply_to ? records.find(r => r.id === row.payload.reply_to) : row })}>Reply to pit conversation</button>}{canEdit(row) && <button onClick={() => openForm('message', { record: row })}>Edit or resolve</button>}{row.payload.request_delivery && (row.member_id === uid || manager) && ['failed', 'not_configured', 'queued'].includes(delivery?.status) && <button disabled={!online || busy} onClick={async () => { setBusy(true); try { const r = await supabase.functions.invoke('scouting-dispatch', { body: { record_id: row.id, version: row.version } }); if (r.error) throw r.error; setNotice(`Discord: ${r.data?.status || 'status pending'}`); await refresh() } catch (e) { setError(`Message remains saved. ${errorText(e)}`) } finally { setBusy(false) } }}>Retry Discord delivery</button>}</div><details><summary>Correction history</summary><RevisionList row={row} revisions={data.revisions ?? []} memberName={memberName} /></details></article> })}
    </section>}
    {tab === 'picks' && store && <div role="tabpanel" id="sc-panel-picks" aria-labelledby="sc-tab-picks"><PickLists records={records} uid={uid} eventId={eventId} store={store} onSave={save} nameFor={nameFor} /></div>}
    {tab === 'practice' && store && <div role="tabpanel" id="sc-panel-practice" aria-labelledby="sc-tab-practice"><Training key={`${uid}:${eventId}`} store={store} memberId={uid} eventId={eventId} /></div>}
    {manager && <ManageEvent store={store} uid={uid} records={records} onSaveBatch={saveBatch} eventId={eventId} teamRows={teamRows} members={scouts} onForm={openForm} onSave={save} online={online} />}
    {exportError && <p role="alert" className="sc-error">{exportError}</p>}
    <footer className="sc-footer"><button disabled={!store || exporting} onClick={exportData}>{exporting ? 'Preparing backup…' : 'Export event data'}</button><span>Includes saved drafts, practice progress and pending saves for this account and event. Wait for “saved on this device” before exporting; keep the file with your team.</span></footer>
    {form && store && <RecordForm key={`${form.kind}:${form.record?.id ?? form.replyTo?.id ?? form.assignment?.id ?? form.team ?? 'new'}`} {...form} members={scouts} store={store} uid={uid} eventId={eventId} onSave={form.rejectedOperation ? async row => { await store.replaceConflict(uid, eventId, form.rejectedOperation, row); queueGeneration.current++; setQueue(await store.listQueue(uid, eventId)); setNotice('Updated proposal saved on this device.'); if (navigator.onLine) sync() } : save} onClose={() => setForm(null)} />}
  </main>
}

function EvidenceRecord({ row, revisions, memberName, canEdit, onEdit }) {
  return <article className="sc-evidence-record"><div className="sc-section-head"><h3>{row.team_number}{row.match_key ? ` · ${row.match_key}` : ' · Pit report'}</h3>{canEdit && <button onClick={onEdit}>Correct observation</button>}</div><p className="sc-help">{memberName(row.member_id)} · {row.localStatus ? 'Saved locally' : `Version ${row.version} · ${when(row.updated_at)}`} · {row.kind === 'observation' ? footageLabel(row) : 'Pit claim'}</p><div className="sc-answer-summary">{CAPABILITIES.map(c => <span key={c.key}><b>{c.label}</b> {words((row.payload.answers ?? row.payload.capabilities)?.[c.key])}</span>)}</div>{row.payload.notes && <p className="sc-note">{row.payload.notes}</p>}{row.payload.video_url && <a className="sc-link" href={row.payload.video_url} target="_blank" rel="noopener noreferrer">Source video ↗</a>}<details><summary>Correction history</summary><RevisionList row={row} revisions={revisions} memberName={memberName} /></details></article>
}
function RevisionList({ row, revisions, memberName }) {
  const history = revisions.filter(r => r.record_id === row.id).sort((a, b) => b.version - a.version)
  return history.length ? <ol className="sc-history">{history.map(r => <li key={`${r.record_id}:${r.version}`}><p>Version {r.version} · {memberName(r.changed_by ?? r.member_id)} · {when(r.created_at ?? r.changed_at)}</p><pre className="sc-json">{JSON.stringify(r.payload ?? r.snapshot?.payload ?? r.record?.payload ?? r.snapshot ?? {}, null, 2)}</pre></li>)}</ol> : <p className="sc-help">No earlier versions downloaded.</p>
}

function QueuePanel({ queue, store, uid, eventId, serverRecords, onChange, onSave, onSync, onRepair }) {
  const [error, setError] = useState('')
  const [review, setReview] = useState(null)
  if (!queue.length) return null
  return <details className="sc-card sc-queue" open={queue.some(x => ['conflict', 'failed'].includes(x.status))}><summary>Saved work on this device ({queue.length})</summary><p className="sc-help">Local saves are durable in this browser. Keep this browser's data until they sync.</p>{error && <p role="alert" className="sc-error">{error}</p>}{queue.map(op => { const current = serverRecords.find(r => r.id === op.record_id) ?? serverRecords.find(r => r.kind === op.args.p_kind && (['pit', 'team'].includes(r.kind) ? r.team_number === op.args.p_team : r.kind === 'pick_list' ? r.member_id === uid : r.kind === 'observation' ? r.member_id === uid && r.team_number === op.args.p_team && matchIdentity(r) === matchIdentity({ match_key: op.args.p_match, payload: op.args.p_payload }) : r.kind === 'assignment' ? r.team_number === op.args.p_team && matchIdentity(r) === matchIdentity({ match_key: op.args.p_match, payload: op.args.p_payload }) && r.payload?.assignee === op.args.p_payload?.assignee && r.payload?.status !== 'cancelled' : false)); return <div className="sc-queue-item" key={op.id}><div><strong>{op.args.p_kind.replaceAll('_', ' ')} {op.args.p_team ?? ''} {op.args.p_match ?? ''}</strong><p>{op.status === 'local' ? 'Saved locally' : op.status}{op.error?.message ? `: ${op.error.message}` : ''}</p></div><div className="sc-actions">{op.status === 'failed' && op.retryable && <button onClick={async () => { try { await store.retry(uid, eventId, op.id); await onChange(); await onSync() } catch (e) { setError(errorText(e)) } }}>Retry save</button>}{op.status === 'failed' && !op.retryable && op.error?.code !== '42501' && <button onClick={() => onRepair(op)}>Edit rejected proposal</button>}{op.status === 'conflict' && <button onClick={() => setReview(review === op.id ? null : op.id)}>Review conflict</button>}</div>{review === op.id && <div className="sc-conflict"><div><h4>Your saved proposal</h4><pre className="sc-json">{JSON.stringify(op.args.p_payload, null, 2)}</pre></div><div><h4>Current server version {current?.version ?? 'not downloaded'}</h4><pre className="sc-json">{JSON.stringify(current?.payload ?? {}, null, 2)}</pre></div><p className="sc-help">Refresh first to compare the latest server record. Keeping the server version removes your queued proposal. Applying yours creates a new version and is checked again for conflicts.</p><div className="sc-actions"><button onClick={async () => { try { await store.discard(uid, eventId, op.id); await onChange(); setReview(null) } catch (e) { setError(errorText(e)) } }}>Keep server version</button><button className="sc-primary" disabled={!current} onClick={async () => { try { await store.replaceConflict(uid, eventId, op.id, { id: current.id, version: current.version, kind: op.args.p_kind, team_number: op.args.p_team, match_key: op.args.p_match, payload: op.args.p_payload }); await onChange(); setReview(null); await onSync() } catch (e) { setError(errorText(e)) } }}>Apply my reviewed proposal</button></div></div>}</div> })}</details>
}

function ManageEvent({ store, uid, records, onSaveBatch, eventId, teamRows, members, onForm, onSave, online }) {
  const [key, setKey] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function importPreview() {
    setBusy(true); setError(''); setNotice(''); setPreview(null)
    try {
      const r = await supabase.functions.invoke('scouting-import', { body: { event_id: eventId, event_key: key.trim() } })
      if (r.error) throw r.error
      if (!Array.isArray(r.data?.teams)) throw new Error('Import returned no usable team data. Existing records were kept.')
      setPreview(r.data)
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  async function applyImport() {
    setBusy(true); setError('')
    try {
      const proposals = preview.teams.map(team => {
        const prior = teamRows.find(r => r.team_number === team.team_number)
        if (prior?.localStatus) throw new Error(`Team ${team.team_number} has a pending edit. Sync or resolve it before importing.`)
        return { ...(prior ? { id: prior.id, version: prior.version } : {}), kind: 'team', team_number: team.team_number, match_key: null, payload: { ...prior?.payload, ...team.payload } }
      })
      await onSaveBatch(proposals)
      setNotice(`${proposals.length} teams saved on this device for sync.`); setPreview(null)
    } catch (e) { setError(`The import was not saved. ${errorText(e)}`) } finally { setBusy(false) }
  }

  return <details className="sc-card sc-manage"><summary>Manage event</summary><p className="sc-help">Scouting leads and staff manage teams and assignments. Each import is previewed before it is saved.</p><div className="sc-actions"><button onClick={() => onForm('team')}>Add event team</button><button onClick={() => onForm('assignment')}>Assign a scout</button></div>
    <div className="sc-import"><label>TBA event key<input placeholder="2026cabb" value={key} onChange={e => setKey(e.target.value)} maxLength="80" /></label><button disabled={!key.trim() || busy || !online} onClick={importPreview}>{busy ? 'Working…' : 'Preview event import'}</button></div>{error && <p role="alert" className="sc-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {preview && <div className="sc-preview"><h3>Import preview</h3><p>{preview.teams.length} teams · {preview.matches?.length ?? 0} scheduled matches</p><ul>{(preview.sources ?? []).map((source, i) => <li key={i}>{source.source}: {source.status}{source.message ? ` · ${source.message}` : ''}</li>)}</ul><p className="sc-help">Imported data keeps its source and retrieval time. Official scores are alliance totals. Statistical estimates remain separate.</p><details><summary>Review teams</summary><ul>{preview.teams.map(t => <li key={t.team_number}>{t.team_number} {t.payload.name} · {t.payload.pit_location || 'Pit unknown'} · EPA {t.payload.epa ?? 'unavailable'}</li>)}</ul></details><div className="sc-actions"><button disabled={busy} onClick={() => setPreview(null)}>Cancel import</button><button className="sc-primary" disabled={busy || !preview.teams.length} onClick={applyImport}>Save imported teams</button></div>{!!preview.matches?.length && <details><summary>Schedule and footage</summary>{preview.matches.map(match => <div className="sc-schedule-match" key={match.key}><h4>{match.key}</h4><div className="sc-actions">{match.teams.map(team => <button key={team} onClick={() => onForm('assignment', { team, assignment: { match_key: match.key, payload: { video_url: match.videos?.[0] ?? '' } } })}>Assign {team}</button>)}</div></div>)}</details>}</div>}
    {store && <SchedulePlanner store={store} uid={uid} eventId={eventId} members={members} records={records} imported={preview} onSaveBatch={onSaveBatch} />}
  </details>
}
