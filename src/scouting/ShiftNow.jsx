import { useCallback, useEffect, useRef, useState } from 'react'
import { isSchemaMissing } from '../schemaMissing'
import { writeVia } from '../writeVia'
import { DEFAULT_BLOCK, onShift, upNext, upNextText, nextNow, matchNumber } from './shifts'

// The shared "now" match number (0030). Everyone sees whose shift is on even
// when the event runs late; a lead bumps it as matches really start. Before
// 0030 is pasted the panel says so and nothing else changes.
const DRAFT = 'scouting-now-v1'
const BLOCKS = [6, 8, 10, 12, 15, 20]

export default function ShiftNow({ client, store, uid, eventId, records, manager, online, memberName, nameFor }) {
  const [now, setNow] = useState(null), [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [setTo, setSetTo] = useState('')
  const alive = useRef(true)
  const load = useCallback(async () => {
    const cached = await store.getDraft(uid, eventId, DRAFT).catch(() => null)
    if (cached && alive.current) { setNow(cached); setState('cached') }
    if (!online) { if (alive.current && !cached) setState('offline'); return }
    const r = await client.rpc('scouting_now_get', { p_event: eventId })
    if (!alive.current) return
    if (r.error) { setState(isSchemaMissing(r.error) ? 'missing' : cached ? 'cached' : 'error'); if (!isSchemaMissing(r.error)) setError(r.error.message || 'Could not read the current match.'); return }
    setNow(r.data); setState('live'); setError('')
    await store.saveDraft(uid, eventId, DRAFT, r.data ?? null).catch(() => {})
  }, [client, store, uid, eventId, online])
  useEffect(() => {
    alive.current = true
    load().catch(() => { if (alive.current) setState('error') })
    const timer = online ? setInterval(() => load().catch(() => {}), 30000) : null
    return () => { alive.current = false; if (timer) clearInterval(timer) }
  }, [load, online])

  async function move(args) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const r = await writeVia(client, 'scouting_now_set', { p_event: eventId, p_match: null, p_delta: null, p_block: null, ...args })
      if (r.error) throw r.error
      if (alive.current) { setNow(r.data); setState('live'); setSetTo('') }
      await store.saveDraft(uid, eventId, DRAFT, r.data).catch(() => {})
    } catch (e) { if (alive.current) setError(e.message || 'Could not move the current match.') }
    finally { if (alive.current) setBusy(false) }
  }

  if (state === 'missing') return <section className="sc-card sc-now" aria-label="Current match"><span className="sc-eyebrow">Match-number shifts</span><p className="sc-help">The shared current match starts when migration 0030 is pasted. Assignments still work by match.</p></section>
  const current = Number.isInteger(now?.match_number) ? now.match_number : null
  const size = now?.block_size ?? DEFAULT_BLOCK
  const shift = current ? onShift(records, current, size) : { block: null, scouts: [], supers: [] }
  const mine = upNext(records, uid, current ?? 0)
  const names = list => list.map(s => `${memberName(s.id)} (${s.count})`).join(', ')
  return <section className="sc-card sc-now" aria-label="Current match">
    <div className="sc-now-head">
      <div><span className="sc-eyebrow">Now on the field</span><div className="sc-now-match" aria-live="polite">{current ? `Q${current}` : 'Not started'}</div></div>
      <div className="sc-now-block"><span className="sc-eyebrow">Shift</span><strong>{shift.block ? shift.block.label : `Blocks of ${size}`}</strong></div>
    </div>
    {mine ? <p className={`sc-now-you${mine.inMatches <= 2 ? ' sc-now-soon' : ''}`} role="status">{upNextText(mine)}{mine.role === 'super' ? ` · super scout, ${mine.rows[0].payload?.alliance ?? ''} alliance` : ` · team ${mine.rows.map(r => r.team_number).join(', ')}${nameFor?.(mine.rows[0].team_number) ? ` ${nameFor(mine.rows[0].team_number)}` : ''}`}</p>
      : <p className="sc-help">{records.some(r => r.kind === 'assignment' && r.payload?.assignee === uid && r.payload?.status !== 'cancelled' && matchNumber(r.match_key) !== null) ? 'Your assigned matches are done.' : 'No numbered assignments for you yet.'}</p>}
    {shift.block && <div className="sc-now-shift"><p><span className="sc-eyebrow">On shift</span> {shift.scouts.length ? names(shift.scouts) : 'No robot scouts assigned in this block.'}</p>{shift.supers.length > 0 && <p><span className="sc-eyebrow">Super scouts</span> {names(shift.supers)}</p>}</div>}
    {manager && <div className="sc-now-controls">
      <button type="button" disabled={busy || !online || !current} onClick={() => move({ p_delta: -1 })} aria-label="Back one match">−1</button>
      <button type="button" className="sc-primary" disabled={busy || !online} onClick={() => move({ p_delta: 1 })} aria-label="Next match">+1 match</button>
      <label className="sc-now-set">Set<input inputMode="numeric" type="number" min="0" max="999" value={setTo} placeholder={current ? String(current) : '1'} onChange={e => setSetTo(e.target.value)} /></label>
      <button type="button" disabled={busy || !online || setTo === '' || !Number.isInteger(Number(setTo))} onClick={() => move({ p_match: nextNow(current, { set: Number(setTo) }) })}>Set match</button>
      <label className="sc-now-set">Block<select aria-label="Shift block size" value={size} disabled={busy || !online} onChange={e => move({ p_block: Number(e.target.value) })}>{BLOCKS.map(n => <option key={n} value={n}>{n} matches</option>)}</select></label>
    </div>}
    {state === 'cached' && <p className="sc-help">Saved copy{now?.updated_at ? ` from ${new Date(now.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}. Reconnect for the live match.</p>}
    {error && <p role="alert" className="sc-error">{error}</p>}
  </section>
}
