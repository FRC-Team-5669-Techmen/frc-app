import { useEffect, useRef, useState } from 'react'
import ComparisonEvidence from './ComparisonEvidence'
import { aggregatePickLists, CAPABILITIES, filterTeams, previewComparison, TIERS } from './model'

const normalize = rows => TIERS.flatMap(t => rows.filter(x => x.tier === t.value).map((x, i) => ({ ...x, rank: i + 1 })))
const tierLabel = tier => TIERS.find(x => x.value === tier)?.label ?? `Tier ${tier}`

export default function PickLists({ records, uid, eventId, store, onSave, nameFor }) {
  const mine = records.find(r => r.kind === 'pick_list' && r.member_id === uid)
  const [entries, setEntries] = useState(mine?.payload?.entries ?? [])
  const [dirty, setDirty] = useState(false)
  const [recordId, setRecordId] = useState(() => mine?.id ?? crypto.randomUUID())
  const [draftStatus, setDraftStatus] = useState('')
  const writes = useRef(Promise.resolve())
  const sequence = useRef(0)
  const [baseVersion, setBaseVersion] = useState(mine?.version ?? 0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [minEpa, setMinEpa] = useState('')
  const [capability, setCapability] = useState('')
  const [selected, setSelected] = useState(['', '', ''])
  const [votes, setVotes] = useState({})
  const [preview, setPreview] = useState(null)
  const [mode, setMode] = useState('mine')
  const [addTier, setAddTier] = useState(1)
  useEffect(() => {
    let live = true
    store.getDraft(uid, eventId, 'pick-list').then(draft => {
      if (!live) return
      if (draft) { setEntries(draft.entries); setBaseVersion(draft.baseVersion); if (draft.recordId) setRecordId(draft.recordId); setDirty(true); setDraftStatus('Draft restored on this device'); if (draft.baseVersion !== (mine?.version ?? 0)) setError('The saved list changed while this draft was open. Saving will preserve your proposal for conflict review.') }
      setReady(true)
    }).catch(e => { if (live) { setError(`Your pick-list draft could not be read. Retry before editing. ${e.message || ''}`); setReady(false) } })
    return () => { live = false }
  }, [uid, eventId, store, loadAttempt])
  useEffect(() => { if (!dirty) { setEntries(mine?.payload?.entries ?? []); setBaseVersion(mine?.version ?? 0); if (mine?.id) setRecordId(mine.id) } }, [mine?.version, mine?.localStatus])
  function change(next) {
    setEntries(next); setDirty(true); setPreview(null)
    setDraftStatus('Saving draft…')
    const request = ++sequence.current
    writes.current = writes.current.catch(() => {}).then(() => store.saveDraft(uid, eventId, 'pick-list', { entries: next, baseVersion, recordId })).then(() => {
      if (request === sequence.current) setDraftStatus('Draft saved on this device')
    }).catch(e => { if (request === sequence.current) { setDraftStatus('Draft is not saved'); setError(`Draft not saved: ${e.message}`) } })
  }
  async function save(next = entries, reason = '') {
    setSaving(true); setError('')
    try {
      await writes.current
      await onSave({ id: recordId, version: preview?.baseVersion ?? baseVersion, kind: 'pick_list', team_number: null, match_key: null, payload: { entries: normalize(next), reason } })
      await store.deleteDraft(uid, eventId, 'pick-list').catch(() => {})
      setDirty(false); setPreview(null)
    } catch (e) { setError(e.message || 'Could not save your list.') }
    finally { setSaving(false) }
  }
  function move(team, direction) {
    const i = entries.findIndex(e => e.team === team), row = entries[i]
    const same = entries.filter(e => e.tier === row.tier)
    const pos = same.findIndex(e => e.team === team), other = same[pos + direction]
    if (!other) return
    const swapped = entries.map(e => e.team === team ? other : e.team === other.team ? row : e)
    change(normalize(swapped))
  }
  const filtered = filterTeams(records.filter(r => !r.localStatus), { minEpa: minEpa === '' ? undefined : Number(minEpa), capability: capability || undefined })
  const master = aggregatePickLists(records.filter(r => !r.localStatus))
  const selectedNumbers = selected.map(Number)
  const pairs = [[0, 1], [0, 2], [1, 2]]
  const pending = !!mine?.localStatus
  return <section aria-label="Pick lists" className="sc-stack">
    <div className="sc-section-head"><div><h2>Pick lists</h2><p className="sc-help">Build your view, then bring the evidence to the meeting.</p></div><div className="sc-toggle"><button aria-pressed={mode === 'mine'} onClick={() => setMode('mine')}>My list</button><button aria-pressed={mode === 'master'} onClick={() => setMode('master')}>Master list</button></div></div>
    {error && <p role="alert" className="sc-error">{error}</p>}
    {!ready && error && <button onClick={() => { setError(''); setLoadAttempt(value => value + 1) }}>Retry loading pick-list draft</button>}
    {mode === 'master' ? <>
      <p className="sc-help">Techmen rule: median tier and rank, with every submitted list counted. Unranked teams contribute no vote. Do-not-pick votes are shown separately, never a hidden veto. Local changes appear after sync.</p>
      {master.length ? <ol className="sc-master">{master.map((r, i) => <li key={r.team}><span className="sc-position">{i + 1}</span><div><strong>{r.team}</strong> <span>{nameFor(r.team)}</span><p className="sc-help">{r.tier === 'dnp' ? 'No ranked votes' : `Median tier ${r.tier}, rank ${r.rank}`} · {r.support} list{r.support === 1 ? '' : 's'} · {r.dnpVotes} do not pick</p></div></li>)}</ol> : <div className="sc-empty">No submitted lists yet. Start with your own observations.</div>}
    </> : <>
      <div className="sc-card sc-stack">
        <h3>Find teams</h3><div className="sc-fields"><label>Minimum EPA<input type="number" step="any" value={minEpa} onChange={e => setMinEpa(e.target.value)} placeholder="Any" /></label><label>Pit capability<select aria-label="Pit capability" value={capability} onChange={e => setCapability(e.target.value)}><option value="">Any capability</option>{CAPABILITIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label></div>
        <p className="sc-help">EPA is a statistical estimate. The EPA filter excludes missing estimates and snapshots older than 24 hours. Capability filters use pit claims.</p>
        <label>Add to<select aria-label="Add to" value={String(addTier)} onChange={e => setAddTier(e.target.value === 'dnp' ? 'dnp' : Number(e.target.value))}>{TIERS.map(t => <option key={t.value} value={String(t.value)}>{t.label}</option>)}</select></label>
        <div className="sc-team-picker">{filtered.filter(r => !entries.some(e => e.team === r.team_number)).map(r => <button disabled={saving || pending || !ready} key={r.team_number} onClick={() => change(normalize([...entries, { team: r.team_number, tier: addTier, rank: entries.length + 1 }]))}><b>{r.team_number}</b><span>Add {r.payload?.name || 'team'}</span></button>)}</div>
        {!filtered.length && <p className="sc-help">No teams match. Clear a filter or ask your lead to add the event teams.</p>}
      </div>
      {TIERS.map(t => <div className="sc-card sc-tier" key={t.value}><div className="sc-section-head"><h3>{t.label}</h3><span className="sc-count">{entries.filter(e => e.tier === t.value).length}</span></div>
        <ol>{entries.filter(e => e.tier === t.value).map((e, i, tierEntries) => <li key={e.team}><div className="sc-pick-name"><strong>{e.team}</strong><span>{nameFor(e.team)}</span></div><div className="sc-pick-controls">
          <label className="sc-sr-only" htmlFor={`tier-${e.team}`}>Tier for {e.team}</label><select id={`tier-${e.team}`} aria-label={`Tier for ${e.team}`} disabled={saving || pending || !ready} value={String(e.tier)} onChange={ev => change(normalize(entries.map(x => x.team === e.team ? { ...x, tier: ev.target.value === 'dnp' ? 'dnp' : Number(ev.target.value) } : x)))}>{TIERS.map(t => <option key={t.value} value={String(t.value)}>{t.label}</option>)}</select>
          <button disabled={saving || pending || !ready || i === 0} aria-label={`Move ${e.team} up`} onClick={() => move(e.team, -1)}>↑</button><button disabled={saving || pending || !ready || i === tierEntries.length - 1} aria-label={`Move ${e.team} down`} onClick={() => move(e.team, 1)}>↓</button><button disabled={saving || pending || !ready} aria-label={`Remove ${e.team} from list`} onClick={() => change(normalize(entries.filter(x => x.team !== e.team)))}>Remove</button>
        </div></li>)}</ol>{!entries.some(e => e.tier === t.value) && <p className="sc-help">No teams in this tier.</p>}
      </div>)}
      <div className="sc-save-bar"><span role="status" className="sc-help">{pending ? 'Saved locally. Sync before editing again.' : dirty ? draftStatus : mine ? `Saved list · version ${mine.version}` : 'No saved list yet'}</span><button className="sc-primary" disabled={saving || pending || !dirty || !ready} onClick={() => save()}>{saving ? 'Saving…' : 'Save pick list'}</button></div>
      <details className="sc-card sc-comparison"><summary>Compare three teams</summary><p className="sc-help">Choose three teams already in your saved list. Three pairwise votes produce a proposed order. Ties keep the original order; other teams stay in place.</p>
        {(!ready || !mine || dirty || pending) ? <p className="sc-help">Load your draft, then save and sync your list before comparing.</p> : <>
          <div className="sc-fields">{selected.map((value, i) => <label key={i}>Team {i + 1}<select aria-label={`Team ${i + 1}`} value={value} onChange={e => { const next = [...selected]; next[i] = e.target.value; setSelected(next); setVotes({}); setPreview(null) }}><option value="">Choose team</option>{entries.map(e => <option key={e.team} value={e.team}>{e.team} {nameFor(e.team)}</option>)}</select></label>)}</div>
          {selected.every(Boolean) && new Set(selected).size === 3 && <>
            <ComparisonEvidence teams={selectedNumbers} records={records.filter(r => !r.localStatus)} nameFor={nameFor} />
            {pairs.map(([a, b]) => { const key = `${a}:${b}`; return <fieldset className="sc-choice" key={key}><legend>Which team would you pick first?</legend><div className="sc-choice-options">{[a, b].map(index => <button key={index} aria-pressed={votes[key] === selectedNumbers[index]} onClick={() => { setVotes({ ...votes, [key]: selectedNumbers[index] }); setPreview(null) }}>{selectedNumbers[index]} {nameFor(selectedNumbers[index])}</button>)}</div></fieldset> })}
            <button disabled={Object.keys(votes).length !== 3} onClick={() => { try { const result = previewComparison(entries, selectedNumbers, pairs.map(([a, b]) => ({ winner: votes[`${a}:${b}`], loser: votes[`${a}:${b}`] === selectedNumbers[a] ? selectedNumbers[b] : selectedNumbers[a] }))); setPreview({ ...result, baseVersion: mine.version }) } catch (e) { setError(e.message) } }}>Preview order</button>
          </>}
          {preview && <div className="sc-preview" aria-live="polite"><h3>Proposed list</h3><ol>{preview.entries.map(e => <li key={e.team}>{e.team} · {tierLabel(e.tier)} · position {e.rank}</li>)}</ol><p className="sc-help">{preview.changed ? 'Apply only if this reflects your evidence.' : 'The order stays the same.'} The server checks that version {preview.baseVersion} is still current.</p><div className="sc-actions"><button onClick={() => setPreview(null)}>Cancel preview</button><button className="sc-primary" disabled={saving || !preview.changed} onClick={() => save(preview.entries, `Three-team comparison: ${selectedNumbers.join(', ')}`)}>Apply proposed order</button></div></div>}
        </>}
      </details>
    </>}
  </section>
}
