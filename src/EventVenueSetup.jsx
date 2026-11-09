import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isSchemaMissing } from './schemaMissing'
import './Operations.css'
export default function EventVenueSetup({ event, members }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [lat, setLat] = useState(''), [lon, setLon] = useState(''), [member, setMember] = useState('')
  const load = useCallback(async () => {
    const r = await supabase.rpc('staff_event_checkin', { p_event: event.id })
    setError(r.error ? (isSchemaMissing(r.error) ? 'Event check-in is not set up yet.' : 'Could not load event check-in.') : '')
    if (!r.error) { setData(r.data); setLat(String(r.data.venue?.latitude ?? '')); setLon(String(r.data.venue?.longitude ?? '')) }
  }, [event.id])
  useEffect(() => { load() }, [load])
  async function act(name, args) {
    setBusy(true); setMsg('')
    try { const r = await writeVia(supabase, name, args); if (r.error || r.via !== 'function') throw r.error || new Error('Not set up yet.'); await load(); setMsg('Event check-in saved.') }
    catch (e) { setMsg(e.message || 'Could not save.') } finally { setBusy(false) }
  }
  return <section className="st-card ops-section" aria-label="Competition venue check-in"><h2 className="st-h2">Competition venue check-in</h2>
    <p>Hours checked in at this venue count as Competition. Event exemptions end automatically at {new Date(event.ends_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} Pacific.</p>
    {error ? <p role="alert">{error} <button className="st-btn" onClick={load}>Retry</button></p> : data && <>
      <form className="ops-form" onSubmit={e => { e.preventDefault(); act('staff_save_event_venue', { p_event: event.id, p_lat: Number(lat), p_lon: Number(lon), p_enabled: true }) }}>
        <label>Venue latitude<input type="number" step="any" required min="-90" max="90" value={lat} onChange={e => setLat(e.target.value)} /></label>
        <label>Venue longitude<input type="number" step="any" required min="-180" max="180" value={lon} onChange={e => setLon(e.target.value)} /></label>
        <button className="st-btn st-btn-primary" disabled={busy}>Save venue</button>
      </form>
      {data.venue && <><p>Venue is {data.venue.enabled ? 'enabled' : 'disabled'}. <Link to={`/checkin?event=${event.id}`}>Event check-in link</Link></p>
        <button className="st-btn" disabled={busy} onClick={() => act('staff_save_event_venue', { p_event: event.id, p_lat: data.venue.latitude, p_lon: data.venue.longitude, p_enabled: !data.venue.enabled })}>{data.venue.enabled ? 'Disable' : 'Enable'} venue</button></>}
      <div className="ops-form"><label>Temporary event exemption<select aria-label="Temporary event exemption" value={member} onChange={e => setMember(e.target.value)}><option value="">Choose member</option>{members.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="st-btn" disabled={!member || busy} onClick={() => act('staff_set_event_geo_exempt', { p_event: event.id, p_member: member, p_exempt: true })}>Exempt until event ends</button></div>
      <ul>{data.exemptions.map(x => <li key={x.member_id}>{x.name} · {x.active ? 'Active' : 'Outside event window'} · expires {new Date(x.expires_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} Pacific <button className="st-btn" disabled={busy} onClick={() => act('staff_set_event_geo_exempt', { p_event: event.id, p_member: x.member_id, p_exempt: false })}>Remove exemption</button></li>)}</ul>
    </>}{msg && <p role="status">{msg}</p>}
  </section>
}
