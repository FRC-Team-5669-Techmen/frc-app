// The pick board (ledger 0032): /scouting/:eventId/board.
//
// One screen for choosing alliance partners. The order is automatic
// (pickRank.js: TBA results pulled toward each team's 2026 season, adjusted
// by our scouting), people add Must pick / Avoid / a bump, and during
// alliance selection one person taps each pick as it is announced; the
// board re-ranks after every tap and every device follows (draft.js, the
// shared state in 0042). On a laptop it is three columns that fit one
// screen; on a phone the same three are tabs.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { isSchemaMissing } from '../schemaMissing'
import { writeVia } from '../writeVia'
import { createScoutingStore } from './storage'
import { loadScoutingEvent } from './client'
import { projectRecords } from './projection'
import { aggregatePickLists, reliability, CAPABILITIES, currentObservations } from './model'
import { teamMatchSummary } from './match'
import { superSummary } from './superscout'
import { importedMapKey } from './pit-map-model'
import { boardOrder, compactMatches, dataRatings, rankingFromMatches, roleScore, scoutSignals, teamValue } from './pickRank'
import { allianceOf, availability, onClock, picksUntilOurs, pickable, replay } from './draft'
import './PickBoard.css'

const PRIORS = import.meta.glob('./priors/*.json')
const POLL_MS = 5000
const AUTO_PULL_MS = 3 * 60 * 1000
const OUR_TEAM = 5669
const errorText = e => e?.message || String(e || 'Something went wrong.')
const fmt = v => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10) : '--')
const pct = v => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v * 100)}%` : '--')
const ago = iso => {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return 'never'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private window */ } }

async function boardCall(args) {
  const r = await writeVia(supabase, 'scouting_pick_board_save', args)
  if (r.error) throw r.error
  if (r.via !== 'function') throw { code: 'PGRST202', message: 'The pick board is not set up yet. Nothing was saved.' }
  return r.data
}

export default function PickBoard({ session, hasRole = () => false }) {
  const { eventId } = useParams()
  const uid = session?.user?.id
  const staff = ['admin', 'mentor', 'lead'].some(hasRole)
  if (!uid || (hasRole('parent') && !staff)) return <main className="pk-wrap"><h1>Pick board</h1><p>The pick board is for students and staff.</p><Link to="/dashboard">Back to dashboard</Link></main>
  return <Board key={`${uid}:${eventId}`} uid={uid} eventId={eventId} />
}

function Board({ uid, eventId }) {
  const localKey = `techmen:pick-board:${eventId}`
  const [data, setData] = useState(null)
  const [board, setBoard] = useState(() => readLocal(localKey))
  const [missing, setMissing] = useState(false)
  const [manager, setManager] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [prior, setPrior] = useState(null)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('list')
  const [query, setQuery] = useState('')
  const [showTaken, setShowTaken] = useState(false)
  const [pending, setPending] = useState(null) // a selection not yet accepted by the server
  const [online, setOnline] = useState(navigator.onLine)
  const [keyDraft, setKeyDraft] = useState('')
  const [setupOpen, setSetupOpen] = useState(false)
  const alive = useRef(true)
  const listRef = useRef(null)

  useEffect(() => {
    alive.current = true
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { alive.current = false; window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Scouting records (observations, pick lists, teams): every minute.
  const loadRecords = useCallback(async () => {
    let store
    try {
      store = await createScoutingStore()
      const snap = await loadScoutingEvent({ store, client: supabase, memberId: uid, eventId, isCurrent: () => alive.current })
      if (!alive.current) return
      setData(snap)
      if (snap.error && !snap.offline) setError(errorText(snap.error))
    } catch (e) { if (alive.current) setError(errorText(e)) }
    finally { store?.close?.() }
  }, [uid, eventId])
  useEffect(() => { loadRecords(); const t = setInterval(() => { if (navigator.onLine) loadRecords() }, 60000); return () => clearInterval(t) }, [loadRecords])

  // The shared board: every 5 seconds while the page is open and visible.
  const loadBoard = useCallback(async () => {
    if (!navigator.onLine) return
    const r = await supabase.rpc('scouting_pick_board_get', { p_event: eventId })
    if (!alive.current) return
    if (r.error) { if (isSchemaMissing(r.error)) setMissing(true); return }
    setMissing(false)
    const next = r.data ?? { state: {}, version: 0 }
    setBoard(next); writeLocal(localKey, next)
  }, [eventId, localKey])
  useEffect(() => {
    loadBoard()
    supabase.rpc('scouting_can_manage', { p_event: eventId }).then(r => { if (alive.current) setManager(!r.error && r.data === true) })
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadBoard() }, POLL_MS)
    return () => clearInterval(t)
  }, [loadBoard, eventId])

  const state = board?.state ?? {}
  const settings = state.settings ?? {}
  const confirmed = useMemo(() => projectRecords(data?.records ?? [], [], uid, eventId).confirmed, [data, uid, eventId])
  const eventKey = settings.event_key || importedMapKey(confirmed) || ''
  const ourTeam = Number(settings.our_team) || OUR_TEAM
  useEffect(() => { if (!keyDraft && eventKey) setKeyDraft(eventKey) }, [eventKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // The season prior shipped with the app for this event (tools/scouting/season-prior.mjs).
  useEffect(() => {
    const load = PRIORS[`./priors/${eventKey}.json`]
    if (!load) { setPrior(null); return }
    load().then(m => { if (alive.current) setPrior(m.default ?? m) }).catch(() => setPrior(null))
  }, [eventKey])

  const matches = useMemo(() => state.matches?.matches ?? [], [state.matches])
  const names = useMemo(() => {
    const out = new Map()
    for (const t of state.matches?.teams ?? []) out.set(Number(t.n), t.name)
    for (const r of confirmed) if (r.kind === 'team' && r.payload?.name) out.set(r.team_number, r.payload.name)
    return out
  }, [state.matches, confirmed])
  const teams = useMemo(() => {
    const s = new Set()
    for (const r of confirmed) if (r.kind === 'team' && r.team_number) s.add(r.team_number)
    for (const t of state.matches?.teams ?? []) s.add(Number(t.n))
    for (const m of matches) for (const t of [...(m.red?.teams ?? []), ...(m.blue?.teams ?? [])]) s.add(Number(t))
    if (prior?.teams && !s.size) for (const k of Object.keys(prior.teams)) s.add(Number(k))
    return [...s].filter(n => Number.isInteger(n) && n > 0).sort((a, b) => a - b)
  }, [confirmed, state.matches, matches, prior])

  const priorMap = useMemo(() => {
    const m = new Map()
    for (const [k, v] of Object.entries(prior?.teams ?? {})) if (typeof v?.total === 'number') m.set(Number(k), { total: v.total, source: 'season' })
    // Statbotics EPA, when the import got one, is a better season number.
    for (const t of state.matches?.teams ?? []) if (typeof t.epa === 'number') m.set(Number(t.n), { total: t.epa, source: 'statbotics' })
    return m
  }, [prior, state.matches])

  const overrides = state.overrides ?? {}
  const selectionSaved = state.selection ?? null
  const selection = pending ?? selectionSaved
  const ranking = useMemo(() => rankingFromMatches(matches), [matches])
  const draftSetup = useMemo(() => selection?.seeds?.length ? { seeds: selection.seeds.map(Number), rounds: Number(selection.rounds) || 3, alliances: Number(selection.alliances) || 8 } : null, [selection])
  const draft = useMemo(() => (draftSetup ? replay(draftSetup, (selection?.log ?? []).map(a => ({ ...a, team: Number(a.team) }))) : null), [draftSetup, selection])
  const clock = draft ? onClock(draft) : null
  const live = !!draft

  const rows = useMemo(() => {
    const data = dataRatings(teams, matches, priorMap)
    const votes = new Map(aggregatePickLists(confirmed).map(v => [v.team, v]))
    const base = teams.map(t => {
      const s = scoutSignals({ match: teamMatchSummary(confirmed, t), superS: superSummary(confirmed, t), vote: votes.get(t) })
      const v = teamValue(data.get(t), s)
      return { id: t, name: names.get(t) ?? '', data: data.get(t), signals: s, ...v }
    })
    const valueOf = new Map(base.map(r => [r.id, r.value]))
    const ours = draft ? draft.alliances[allianceOf(draft, ourTeam)] ?? [ourTeam] : [ourTeam]
    const members = ours.map(t => valueOf.get(t)).filter(v => typeof v === 'number')
    return base.map(r => ({ ...r, score: roleScore(r.value, members, { defense: r.signals.defense, wantDefense: !!settings.want_defense }) }))
  }, [teams, matches, priorMap, confirmed, names, draft, ourTeam, settings.want_defense])

  const odds = useMemo(() => {
    if (!draft) return null
    const values = new Map(rows.filter(r => r.id !== ourTeam).map(r => [r.id, r.value]))
    return availability(draft, values, ourTeam, { runs: 300 })
  }, [draft, rows, ourTeam])

  const autoRank = useMemo(() => new Map(boardOrder(rows, {}).map((r, i) => [r.id, i + 1])), [rows])
  const ordered = useMemo(() => boardOrder(rows, overrides), [rows, overrides])
  const taken = t => draft && (draft.alliances.some(a => a.some(x => x === t)) || draft.declined.includes(t))
  const visible = ordered.filter(r => r.id !== ourTeam || !live).filter(r => showTaken || !taken(r.id) || (draft && pickable(draft, r.id)))
    .filter(r => !query || `${r.id} ${r.name}`.toLowerCase().includes(query.toLowerCase()))
  // The Auto column compares with the data-only order of the SAME list, so a
  // team that rose because picked teams left is not shown as moved by a person.
  const autoVisible = new Map(boardOrder(visible, {}).map((r, i) => [r.id, i + 1]))
  const maxScore = Math.max(1, ...rows.map(r => r.score ?? 0))
  const sel = rows.find(r => r.id === selected) ?? null
  const until = draft ? picksUntilOurs(draft, ourTeam) : null
  const best = visible.find(r => overrides[r.id]?.flag !== 'avoid' && (!draft || pickable(draft, r.id)))

  // ---- writes ----
  async function saveSection(section, value, extra = {}) {
    const out = await boardCall({ p_event: eventId, p_section: section, p_value: value, ...extra })
    setBoard(out); writeLocal(localKey, out)
    return out
  }
  async function setOverride(team, patch) {
    const cur = overrides[team] ?? {}
    const next = { flag: cur.flag ?? null, bump: cur.bump ?? 0, note: cur.note ?? '', ...patch }
    const clean = {}
    if (next.flag) clean.flag = next.flag
    if (next.bump) clean.bump = Math.max(-30, Math.min(30, next.bump))
    if (next.note?.trim()) clean.note = next.note.trim().slice(0, 300)
    setBusy('override')
    try { await saveSection('override', Object.keys(clean).length ? clean : null, { p_team: team }) }
    catch (e) { setError(errorText(e)) } finally { setBusy('') }
  }
  // The selection: optimistic on this device, kept until the server accepts it.
  async function pushSelection(next) {
    setPending(next); setError('')
    try {
      const out = await saveSection('selection', { ...next, version: undefined }, { p_expected: Number(selectionSaved?.version ?? 0) })
      setPending(null)
      return out
    } catch (e) {
      if (e?.code === '40001') { setPending(null); await loadBoard(); setError('Someone else changed the selection, so the board reloaded. Check the last pick, then record it again if it is missing.') }
      else setError(navigator.onLine ? errorText(e) : 'Offline: this pick is on this device only. It sends when you reconnect.')
    }
  }
  // Retry an unsent selection when the connection comes back.
  useEffect(() => { if (pending && online) { const t = setTimeout(() => pushSelection(pending), 1500); return () => clearTimeout(t) } }, [online]) // eslint-disable-line react-hooks/exhaustive-deps
  const recordPick = (team, type = 'pick') => {
    if (!draft || !manager) return
    if (!pickable(draft, team)) { setError(`${team} cannot be ${type === 'pick' ? 'picked' : 'declined'} now.`); return }
    const next = { ...selection, log: [...(selection.log ?? []), { type, team }] }
    const after = replay(draftSetup, next.log)
    if (after.errors.length > draft.errors.length) { setError(after.errors.at(-1).why); return }
    setNotice(type === 'pick' ? `Alliance ${clock.number} picked ${team}.` : `${team} declined Alliance ${clock.number}.`)
    pushSelection(next)
  }
  const undo = () => { if (!selection?.log?.length || !manager) return; const last = selection.log.at(-1); setNotice(`Undid: ${last.type} ${last.team}.`); pushSelection({ ...selection, log: selection.log.slice(0, -1) }) }

  async function startSelection(seeds) {
    if (!manager) return
    await pushSelection({ seeds, log: [], rounds: Number(settings.rounds) || 3, alliances: Number(settings.alliances) || 8, our_team: ourTeam })
    setSetupOpen(false); setTab('alliances')
  }
  async function pullResults(quiet = false) {
    if (!manager || !eventKey) return
    setBusy('pull'); if (!quiet) { setError(''); setNotice('') }
    try {
      const r = await supabase.functions.invoke('scouting-import', { body: { event_id: eventId, event_key: eventKey } })
      if (r.error) throw r.error
      const teamsIn = Array.isArray(r.data?.teams) ? r.data.teams : []
      const source = (r.data?.sources ?? []).find(s => s.source === 'tba_matches')
      if (source && source.status !== 'ok') throw new Error('The Blue Alliance did not answer. The board keeps its last results.')
      const compact = compactMatches(r.data?.matches ?? [])
      await saveSection('matches', { event_key: eventKey, fetched_at: r.data?.fetched_at ?? new Date().toISOString(), source: 'tba',
        teams: teamsIn.map(t => ({ n: t.team_number, name: t.payload?.name ?? '', ...(typeof t.payload?.epa === 'number' ? { epa: t.payload.epa } : {}) })), matches: compact })
      const played = compact.filter(m => m.level === 'qm' && m.red.score !== null).length
      if (!quiet) setNotice(`Results pulled: ${teamsIn.length} teams, ${played} qualification matches played.`)
    } catch (e) { if (!quiet) setError(`Could not pull results. ${errorText(e)}`) }
    finally { setBusy('') }
  }
  // While a manager has the board open during quals, results refresh themselves.
  useEffect(() => {
    if (!manager || !eventKey) return
    const t = setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible' && !live) pullResults(true) }, AUTO_PULL_MS)
    return () => clearInterval(t)
  }, [manager, eventKey, live]) // eslint-disable-line react-hooks/exhaustive-deps

  // Laptop keys: arrows move, Enter picks, D declined, U undo, M must, A avoid.
  useEffect(() => {
    const onKey = e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return
      const ids = visible.map(r => r.id)
      const i = ids.indexOf(selected)
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); setSelected(ids[Math.min(ids.length - 1, i + 1)] ?? ids[0]) }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); setSelected(ids[Math.max(0, i - 1)] ?? ids[0]) }
      else if (e.key === 'Enter' && selected && live) recordPick(selected)
      else if ((e.key === 'd' || e.key === 'D') && selected && live) recordPick(selected, 'decline')
      else if (e.key === 'u' || e.key === 'U') undo()
      else if ((e.key === 'm' || e.key === 'M') && selected && manager) setOverride(selected, { flag: overrides[selected]?.flag === 'must' ? null : 'must' })
      else if ((e.key === 'a' || e.key === 'A') && selected && manager) setOverride(selected, { flag: overrides[selected]?.flag === 'avoid' ? null : 'avoid' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!data && !board) return <main className="pk-wrap"><p role="status">Opening the pick board…</p></main>
  const played = matches.filter(m => m.level === 'qm' && m.red?.score != null).length
  const title = data?.event?.title || 'Event'
  const dataLine = played ? `TBA results: ${played} matches · ${ago(state.matches?.fetched_at)}` : prior ? `2026 season numbers · no matches yet` : 'No results yet'

  return <main className="pk-wrap" data-pick-board data-live={live ? 'yes' : 'no'}>
    <header className="pk-top">
      <Link className="pk-back" to={`/scouting/${eventId}`}>← Scouting</Link>
      <div className="pk-title"><span className="pk-eyebrow">Pick board</span><h1>{title}</h1></div>
      <div className="pk-chips">
        <span className="pk-chip" data-data-line>{dataLine}</span>
        <span className="pk-chip">{online ? 'Live' : 'Offline copy'}{pending ? ' · 1 change not sent' : ''}</span>
        {manager && <button className="pk-btn" disabled={!eventKey || busy === 'pull' || !online} onClick={() => pullResults(false)}>{busy === 'pull' ? 'Pulling…' : 'Pull results'}</button>}
        {manager && <button className="pk-btn" aria-expanded={setupOpen} onClick={() => setSetupOpen(v => !v)}>{live ? 'Selection setup' : 'Start alliance selection'}</button>}
      </div>
    </header>
    {missing && <p className="pk-note" role="status">The shared board is not set up on the server yet. The ranking below works; marks and live selection need the update.</p>}
    {error && <p className="pk-error" role="alert">{error} <button className="pk-link" onClick={() => setError('')}>Dismiss</button></p>}
    {notice && !error && <p className="pk-notice" role="status">{notice}</p>}
    {manager && !eventKey && <div className="pk-keybar"><label>TBA event key<input value={keyDraft} placeholder="2026cabl" onChange={e => setKeyDraft(e.target.value.trim())} /></label><button className="pk-btn pk-primary" disabled={!/^20\d{2}[a-z0-9]+$/.test(keyDraft)} onClick={() => saveSection('settings', { event_key: keyDraft, our_team: ourTeam, rounds: 3, alliances: 8 }).catch(e => setError(errorText(e)))}>Save key</button><span className="pk-help">The end of the event's address on thebluealliance.com/event/.</span></div>}
    {setupOpen && manager && <SelectionSetup ranking={ranking} rows={ordered} names={names} settings={settings} existing={selection} onStart={startSelection} onSettings={v => saveSection('settings', v).catch(e => setError(errorText(e)))} onClose={() => setSetupOpen(false)} ourTeam={ourTeam} />}

    {live && <section className="pk-clock" aria-live="polite" data-clock>
      {clock ? <><div><span className="pk-eyebrow">Round {clock.round} · pick {clock.overall} of {draft.slots.length}</span><strong>Alliance {clock.number} is picking <em>{clock.captain}</em></strong></div>
        <div className="pk-ours">{until === 0 ? <b className="pk-us-now">WE ARE ON THE CLOCK</b> : until !== null ? <span>Our next pick in <b>{until}</b></span> : <span>We are not on an alliance yet</span>}
          {best && <span className="pk-best">Best for us: <b>{best.id}</b> {best.name}</span>}</div></> : <strong>Alliance selection is complete</strong>}
      {manager && <div className="pk-clock-actions"><button className="pk-btn" disabled={!selection?.log?.length} onClick={undo}>Undo last</button></div>}
    </section>}

    <nav className="pk-tabs" aria-label="Pick board sections">{[['list', 'Teams'], ['alliances', live ? 'Alliances' : 'Our alliance'], ['team', sel ? `Team ${sel.id}` : 'Team']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</nav>

    <div className="pk-grid">
      <section className={`pk-col pk-list${tab === 'list' ? ' pk-on' : ''}`} aria-label="Teams by pick order">
        <div className="pk-list-head">
          <input className="pk-search" type="search" placeholder="Find a team" value={query} onChange={e => setQuery(e.target.value)} aria-label="Find a team" />
          {live && <label className="pk-check"><input type="checkbox" checked={showTaken} onChange={e => setShowTaken(e.target.checked)} />Show picked</label>}
        </div>
        <div className="pk-legend"><span>#</span><span>Team</span><span title="Points this robot adds per match, adjusted by our scouting">Value</span><span title="Climbing points per match">Climb</span><span title="Share of scouted matches with a breakdown">Breaks</span>{live && until ? <span title="Chance it is still there at our next pick">There</span> : <span title="Automatic rank before people's marks">Auto</span>}<span /></div>
        <ol className="pk-rows" ref={listRef}>
          {visible.map((r, i) => {
            const o = overrides[r.id]
            const isTaken = taken(r.id) && !(draft && pickable(draft, r.id))
            const move = (autoVisible.get(r.id) ?? 0) - (i + 1)
            return <li key={r.id} className={`pk-row${selected === r.id ? ' pk-sel' : ''}${isTaken ? ' pk-taken' : ''}${o?.flag ? ` pk-${o.flag}` : ''}`} data-team={r.id}>
              <button className="pk-row-main" onClick={() => { setSelected(r.id); setTab('team') }} aria-label={`Team ${r.id} ${r.name}, value ${fmt(r.value)}`}>
                <span className="pk-pos">{i + 1}</span>
                <span className="pk-team"><b>{r.id}</b><small>{r.name || ' '}</small></span>
                <span className="pk-val"><i style={{ width: `${Math.max(4, 100 * (r.score ?? 0) / maxScore)}%` }} /><b>{fmt(r.value)}</b></span>
                <span className="pk-num">{fmt(r.tower)}</span>
                <span className={`pk-num${r.signals.troubleN && r.signals.troubleBad / r.signals.troubleN >= 0.25 ? ' pk-bad' : ''}`}>{r.signals.troubleN ? `${r.signals.troubleBad}/${r.signals.troubleN}` : '--'}</span>
                {live && until ? <span className="pk-num">{pct(odds?.get(r.id))}</span> : <span className="pk-num pk-auto">{autoVisible.get(r.id)}{move ? <em>{move > 0 ? `↑${move}` : `↓${-move}`}</em> : null}</span>}
                <span className="pk-flags">{o?.flag === 'must' && <b className="pk-flag-must" title="Must pick">★</b>}{o?.flag === 'avoid' && <b className="pk-flag-avoid" title="Avoid">✕</b>}{o?.bump ? <small>{o.bump > 0 ? '+' : ''}{o.bump}</small> : null}{r.signals.voteAvoid && <small title="Most scouts say do not pick">scouts ✕</small>}</span>
              </button>
              {manager && live && clock && !isTaken && <button className="pk-pick" onClick={() => recordPick(r.id)} title={`Alliance ${clock.number} picked ${r.id}`}>A{clock.number} ✓</button>}
            </li>
          })}
        </ol>
        {!visible.length && <p className="pk-help">{teams.length ? 'No teams match.' : 'No teams yet. A scouting lead adds the event key and pulls results.'}</p>}
      </section>

      <section className={`pk-col pk-alliances${tab === 'alliances' ? ' pk-on' : ''}`} aria-label="Alliances">
        {live ? <ol className="pk-ally">{draft.alliances.map((a, i) => {
          const ours = a.includes(ourTeam)
          const slots = Array.from({ length: (Number(selection.rounds) || 3) + 1 }, (_, k) => a[k] ?? null)
          return <li key={i} className={`${ours ? 'pk-ours-row' : ''}${clock?.position === i ? ' pk-clock-row' : ''}`}><span className="pk-ally-n">A{i + 1}</span>{slots.map((t, k) => <button key={k} className={`pk-slot${t === null ? ' pk-empty' : ''}${k === 0 ? ' pk-capt' : ''}`} disabled={t === null} onClick={() => { setSelected(t); setTab('team') }}>{t ?? (clock?.position === i && k === a.length ? '…' : '')}</button>)}</li>
        })}</ol> : <OurPlan rows={ordered} ourTeam={ourTeam} overrides={overrides} names={names} />}
        {live && draft.declined.length > 0 && <p className="pk-help">Declined: {draft.declined.join(', ')}</p>}
        {live && manager && <p className="pk-help pk-keys">Keys: ↑ ↓ choose · Enter picked · D declined · U undo · M must · A avoid</p>}
      </section>

      <section className={`pk-col pk-detail${tab === 'team' ? ' pk-on' : ''}`} aria-label="Team detail">
        {sel ? <TeamDetail row={sel} confirmed={confirmed} override={overrides[sel.id]} manager={manager} busy={busy === 'override'} autoRank={autoRank.get(sel.id)} odds={odds?.get(sel.id)} live={live} clock={clock} canPick={!!(draft && pickable(draft, sel.id))}
          onOverride={patch => setOverride(sel.id, patch)} onPick={() => recordPick(sel.id)} onDecline={() => recordPick(sel.id, 'decline')} />
          : <div className="pk-empty-detail"><h2>Choose a team</h2><p>Tap a row to see why it is ranked where it is, what our scouts saw, and to mark it.</p><HowItWorks /></div>}
      </section>
    </div>
  </main>
}

function HowItWorks() {
  return <details className="pk-how"><summary>How the order is made</summary><ul>
    <li><b>Value</b> is the points a robot adds per match. FUEL is The Blue Alliance's alliance HUB points split by least squares (like OPR), pulled toward the team's 2026 season so a couple of matches cannot swing it. Climb points are exact, per robot, from TBA.</li>
    <li>Our scouting adjusts it: breakdowns lower it, scouts' hand counts count for at most 30 percent, and scouts' tiers move it a few percent.</li>
    <li>For a pick, the order is what the team adds to <b>our</b> alliance: three robots play, so a team that would sit as our fourth adds less.</li>
    <li>Must pick ★ goes to the top and Avoid ✕ to the bottom. A bump adds or takes points. The Auto column shows where the data alone put it.</li>
  </ul></details>
}

function OurPlan({ rows, ourTeam, overrides, names }) {
  const must = rows.filter(r => overrides[r.id]?.flag === 'must' && r.id !== ourTeam)
  const top = rows.filter(r => r.id !== ourTeam && overrides[r.id]?.flag !== 'avoid').slice(0, 8)
  const avoid = rows.filter(r => overrides[r.id]?.flag === 'avoid')
  return <div className="pk-plan">
    <h2>Before selection</h2>
    <p className="pk-help">Top of our list if we are a captain. When selection starts, a scouting lead taps Start alliance selection and every phone follows the picks.</p>
    <h3>Top 8 for us</h3><ol className="pk-plan-list">{top.map(r => <li key={r.id}><b>{r.id}</b> {names.get(r.id) || r.name} <span>{fmt(r.value)}</span></li>)}</ol>
    {must.length > 0 && <><h3>Must pick</h3><p>{must.map(r => r.id).join(', ')}</p></>}
    {avoid.length > 0 && <><h3>Avoid</h3><p>{avoid.map(r => r.id).join(', ')}</p></>}
  </div>
}

function TeamDetail({ row, confirmed, override, manager, busy, autoRank, odds, live, clock, canPick, onOverride, onPick, onDecline }) {
  const [note, setNote] = useState(override?.note ?? '')
  useEffect(() => setNote(override?.note ?? ''), [row.id, override?.note])
  const notes = currentObservations(confirmed, row.id).map(r => r.payload?.notes).filter(n => typeof n === 'string' && n.trim()).slice(-4)
  const claims = CAPABILITIES.map(c => ({ ...c, r: reliability(confirmed, row.id, c.key) })).filter(c => c.r.denominator || c.r.didNotSee)
  const d = row.data
  return <div className="pk-team-detail" data-detail={row.id}>
    <div className="pk-detail-head"><div><span className="pk-eyebrow">Auto rank {autoRank ?? '--'}{live && typeof odds === 'number' ? ` · ${Math.round(odds * 100)}% still there at our pick` : ''}</span><h2>{row.id} <small>{row.name}</small></h2></div><b className="pk-big">{fmt(row.value)}</b></div>
    <dl className="pk-facts">
      <div><dt>Points a match</dt><dd>{fmt(row.points)}</dd></div>
      <div><dt>FUEL</dt><dd>{fmt(row.fuel)}</dd></div>
      <div><dt>Climb</dt><dd>{fmt(row.tower)}{typeof d?.climbs === 'number' ? ` · ${d.climbs}/${d.matches}` : ''}</dd></div>
      <div><dt>Season 2026</dt><dd>{fmt(d?.priorTotal)}</dd></div>
      <div><dt>Breakdowns</dt><dd>{row.signals.troubleN ? `${row.signals.troubleBad} of ${row.signals.troubleN}` : '--'}</dd></div>
      <div><dt>Defense</dt><dd>{typeof row.signals.defense === 'number' ? `${fmt(row.signals.defense * 5)}/5` : '--'}</dd></div>
    </dl>
    <ul className="pk-why">{row.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
    {manager && <div className="pk-marks">
      <button aria-pressed={override?.flag === 'must'} disabled={busy} onClick={() => onOverride({ flag: override?.flag === 'must' ? null : 'must' })}>★ Must pick</button>
      <button aria-pressed={override?.flag === 'avoid'} disabled={busy} onClick={() => onOverride({ flag: override?.flag === 'avoid' ? null : 'avoid' })}>✕ Avoid</button>
      <button disabled={busy} onClick={() => onOverride({ bump: (override?.bump ?? 0) + 5 })} aria-label="Bump up 5 points">+5</button>
      <button disabled={busy} onClick={() => onOverride({ bump: (override?.bump ?? 0) - 5 })} aria-label="Bump down 5 points">−5</button>
      {(override?.flag || override?.bump || override?.note) && <button disabled={busy} onClick={() => onOverride({ flag: null, bump: 0, note: '' })}>Reset to automatic</button>}
    </div>}
    {manager && <div className="pk-note-edit"><input value={note} maxLength={300} placeholder="Strategy note (everyone sees it)" onChange={e => setNote(e.target.value)} aria-label="Strategy note" /><button disabled={busy || note === (override?.note ?? '')} onClick={() => onOverride({ note })}>Save note</button></div>}
    {!manager && override?.note && <p className="pk-strategy-note">{override.note}</p>}
    {manager && live && clock && canPick && <div className="pk-live-actions"><button className="pk-btn pk-primary" onClick={onPick}>Alliance {clock.number} picked {row.id}</button><button className="pk-btn" onClick={onDecline}>{row.id} declined</button></div>}
    {claims.length > 0 && <><h3>Pit claims, checked in matches</h3><ul className="pk-claims">{claims.map(c => <li key={c.key}>{c.label}: <b>{c.r.percent === null ? '--' : `${Math.round(c.r.percent)}%`}</b> <small>{c.r.yes}/{c.r.denominator} matches{c.r.disputed ? `, ${c.r.disputed} disputed` : ''}</small></li>)}</ul></>}
    {notes.length > 0 && <><h3>Scout notes</h3><ul className="pk-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
  </div>
}

function SelectionSetup({ ranking, rows, names, settings, existing, onStart, onSettings, onClose, ourTeam }) {
  const size = Number(settings.alliances) || 8
  const fromRank = ranking.map(r => Number(r.team))
  const initial = existing?.seeds?.length ? existing.seeds.map(Number) : fromRank.length ? fromRank : rows.map(r => r.id)
  const [seeds, setSeeds] = useState(initial)
  const all = [...new Set([...seeds, ...rows.map(r => r.id)])]
  const setSeed = (i, team) => { const t = Number(team); const next = seeds.filter(x => x !== t); next.splice(i, 0, t); setSeeds(next) }
  return <section className="pk-setup" aria-label="Alliance selection setup">
    <h2>Alliance selection setup</h2>
    <p className="pk-help">Captains are the top {size} of the qualification ranking. {fromRank.length ? 'This order comes from the results (ranking points, then average score); fix any seed to match the screen at the event.' : 'No results yet: set the seeds by hand.'} Beach Blitz: {Number(settings.rounds) || 3} pick rounds, four-team alliances.</p>
    <ol className="pk-seeds">{Array.from({ length: Math.min(size + 4, all.length) }, (_, i) => <li key={i}><span>{i < size ? `Captain ${i + 1}` : `Seed ${i + 1}`}</span><select value={seeds[i] ?? ''} onChange={e => setSeed(i, e.target.value)} aria-label={`Seed ${i + 1}`}>{all.map(t => <option key={t} value={t}>{t} {names.get(t) ?? ''}{t === ourTeam ? ' (us)' : ''}</option>)}</select></li>)}</ol>
    <div className="pk-setup-row">
      <label>Pick rounds<select value={Number(settings.rounds) || 3} onChange={e => onSettings({ rounds: Number(e.target.value) })}>{[2, 3].map(n => <option key={n} value={n}>{n} ({n + 1}-team alliances)</option>)}</select></label>
      <label className="pk-check"><input type="checkbox" checked={!!settings.want_defense} onChange={e => onSettings({ want_defense: e.target.checked })} />We want a defender</label>
    </div>
    <div className="pk-setup-row">
      <button className="pk-btn pk-primary" onClick={() => onStart(seeds)}>{existing?.log?.length ? 'Restart selection with these seeds' : 'Start selection'}</button>
      <button className="pk-btn" onClick={onClose}>Close</button>
    </div>
    {existing?.log?.length > 0 && <p className="pk-help">Restarting clears the {existing.log.length} picks recorded so far.</p>}
  </section>
}
