import { useEffect, useRef, useState } from 'react'
import { MAX_RECOVERY_BYTES, parseRecoveryArchive } from './recovery'

export default function RecoveryPanel({ store, uid, eventId, onRestored }) {
  const [archive, setArchive] = useState(null), [plan, setPlan] = useState([]), [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [limit, setLimit] = useState(50)
  const sequence = useRef(0), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++ } }, [])
  async function read(file) {
    const request = ++sequence.current
    setArchive(null); setPlan([]); setSelected([]); setError(''); setNotice(''); setLimit(50)
    if (!file) return
    setBusy(true)
    try {
      if (file.size > MAX_RECOVERY_BYTES) throw new Error('Choose an event JSON file no larger than 20 MB.')
      const value = parseRecoveryArchive(await file.text(), uid, eventId)
      const next = await store.previewRecovery(uid, eventId, value)
      if (!alive.current || request !== sequence.current) return
      setArchive(value); setPlan(next)
      if (!next.length) setNotice('This backup has no pending saves to recover.')
    } catch (e) { if (alive.current && request === sequence.current) setError(e.message || 'Could not read this backup.') }
    finally { if (alive.current && request === sequence.current) setBusy(false) }
  }
  async function restore() {
    if (busy || !archive || !selected.length) return
    setBusy(true); setError(''); setNotice('')
    let committed = false
    try {
      const rows = await store.restoreRecovery(uid, eventId, archive, selected)
      committed = true
      if (!alive.current) return
      // Durable commit is the boundary: a later UI/preview failure must never
      // report the committed recovery as unsaved.
      setNotice(`${rows.length} saves restored on this device and held for review. Open Saved work on this device to review and retry each original save.`)
      setSelected([]); onRestored(rows)
      setPlan(await store.previewRecovery(uid, eventId, archive))
    } catch (e) { if (alive.current) setError(committed ? `Recovered saves are safe on this device, but the preview could not refresh. Reopen the event. ${e.message || ''}` : e.message || 'Could not restore the selected saves.') }
    finally { if (alive.current) setBusy(false) }
  }
  const ready = plan.filter(row => row.state === 'ready')
  return <details className="sc-card sc-recovery">
    <summary>Recover pending saves from a backup</summary>
    <p className="sc-help">Use an event JSON exported by this account for this event. Review it here before restoring. Existing work stays in place. Recovered saves wait for your review before they can sync.</p>
    <p className="sc-help">This recovers queued submissions only. Practice, unsubmitted drafts, downloaded maps and cached data stay in the archive for manual review with your lead.</p>
    <label>Event backup JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={e => read(e.target.files?.[0])} /></label>
    {busy && <p role="status">Working with the backup…</p>}
    {error && <p role="alert" className="sc-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {archive && !!plan.length && <>
      <p>{ready.length} recoverable · {plan.filter(row => row.state === 'existing').length} already present · {plan.filter(row => row.state === 'blocked').length} blocked by other work</p>
      <div className="sc-actions"><button disabled={busy || !ready.length} onClick={() => setSelected(ready.map(row => row.id))}>Select all recoverable saves</button><button disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</button></div>
      <ul className="sc-recovery-list">{plan.slice(0, limit).map(row => <li key={row.id}>
        <label className="sc-checkbox"><input type="checkbox" disabled={busy || row.state !== 'ready'} checked={selected.includes(row.id)} onChange={e => setSelected(previous => e.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))} /><span>{row.args.p_kind.replaceAll('_', ' ')} {row.args.p_team ?? ''} {row.args.p_match ?? ''} · {row.reason}</span></label>
        <details><summary>Inspect original request</summary><p className="sc-help">Previous state: {row.previousStatus}. Notification delivery: {row.args.p_payload.request_delivery === true ? 'requested after synchronization' : 'not requested'}.</p><pre className="sc-json">{JSON.stringify(row.args, null, 2)}</pre></details>
      </li>)}</ul>
      {limit < plan.length && <button disabled={busy} onClick={() => setLimit(value => value + 50)}>Show next 50 saves</button>}
      <button className="sc-primary" disabled={busy || !selected.length} onClick={restore}>Restore {selected.length} selected saves for review</button>
    </>}
  </details>
}
