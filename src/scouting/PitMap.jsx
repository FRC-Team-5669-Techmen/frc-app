import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { importedMapKey, mapDirectory, mapIsStale, normalizePitMap, PIT_MAP_DRAFT, validMapKey } from './pitMap'

const when = at => new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
function Shape({ shape, kind, address, selected }) {
  const { position:p, size:s, angle } = shape
  const font = Math.max(8, Math.min(s.x / 4, s.y / 5, 22))
  return <g transform={`translate(${p.x} ${p.y}) rotate(${angle})`} className={`sc-map-${kind}${selected ? ' sc-map-selected' : ''}`}>
    {kind === 'arrows' ? <path d={shape.type === 'double' ? `M 0 ${-s.y/2} L ${s.x/2} ${-s.y/6} H ${s.x/6} V ${s.y/6} H ${s.x/2} L 0 ${s.y/2} L ${-s.x/2} ${s.y/6} H ${-s.x/6} V ${-s.y/6} H ${-s.x/2} Z` : `M 0 ${-s.y/2} L ${s.x/2} 0 H ${s.x/6} V ${s.y/2} H ${-s.x/6} V 0 H ${-s.x/2} Z`} />
      : kind !== 'labels' && <rect x={-s.x/2} y={-s.y/2} width={s.x} height={s.y} />}
    {kind === 'pits' && <text textAnchor="middle" fontSize={font}><tspan x="0" y={shape.team ? -font/5 : font/3}>{shape.team || address}</tspan>{shape.team && <tspan x="0" dy={font*1.3} fontSize={font*.8}>{address}</tspan>}</text>}
    {['areas','labels'].includes(kind) && <text textAnchor="middle" dominantBaseline="central" fontSize={font}>{shape.label}</text>}
  </g>
}

export default function PitMap({ store, uid, eventId, records, online, client }) {
  const [saved, setSaved] = useState(null)
  const [key, setKey] = useState(() => importedMapKey(records))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const alive = useRef(false)
  const mapTitle = useId()
  useEffect(() => {
    alive.current = true
    setReady(false)
    ;(async () => {
      try {
        const cached = await store.getDraft(uid, eventId, PIT_MAP_DRAFT)
        if (!alive.current) return
        if (cached) {
          if (!validMapKey(cached.event_key) || cached.source !== 'nexus') throw new Error('The saved map format is not supported. Reconnect to download it again.')
          const checked = { ...cached, map: normalizePitMap(cached.map) }
          setSaved(checked); setKey(checked.event_key)
        }
      } catch (e) { if (alive.current) setError(e.message || 'Could not open the saved map.') }
      finally { if (alive.current) setReady(true) }
    })()
    return () => { alive.current = false }
  }, [store, uid, eventId])
  async function refresh() {
    if (busy || !online || !validMapKey(key.trim())) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: failed } = await client.functions.invoke('scouting-import', { body: { event_id: eventId, event_key: key.trim(), mode: 'pit_map' } })
      if (failed || data?.error) throw new Error(data?.error || 'Map download failed. Check the event key and Nexus setup. Your previous map is unchanged.')
      if (data?.event_key !== key.trim() || data.source !== 'nexus' || !Number.isFinite(Date.parse(data.fetched_at))) throw new Error('The server did not confirm this map and its source time.')
      const next = { ...data, map: normalizePitMap(data.map) }
      // Do not advertise offline availability until the IndexedDB transaction
      // commits. A failed refresh must leave the old durable map intact.
      await store.saveDraft(uid, eventId, PIT_MAP_DRAFT, next)
      if (alive.current) { setSaved(next); setSelected(''); setNotice('Map saved on this device for offline use.'); setZoom(1); setRotation(0) }
    } catch (e) { if (alive.current) setError(e.message || 'Could not save the map. Your previous map is unchanged.') }
    finally { if (alive.current) setBusy(false) }
  }
  const map = saved?.map
  const pits = useMemo(() => map ? mapDirectory(map, records) : [], [map, records])
  const search = query.trim().toLowerCase()
  const directory = pits.filter(p => !search || `${p.address} ${p.team ?? ''}`.toLowerCase().includes(search))
  const current = pits.find(p => p.address === selected)
  const rotated = rotation % 180 !== 0
  const width = map ? rotated ? map.size.y : map.size.x : 1
  const height = map ? rotated ? map.size.x : map.size.y : 1
  const transform = !map || rotation === 0 ? '' : rotation === 90 ? `translate(${map.size.y} 0) rotate(90)` : rotation === 180 ? `translate(${map.size.x} ${map.size.y}) rotate(180)` : `translate(0 ${map.size.x}) rotate(270)`
  return <details className="sc-card sc-pit-map"><summary>Pit map and directory</summary>
    <p className="sc-help">Download this event’s map before leaving Wi-Fi. Maps are simplified venue guides; check signs and pit staff for changed locations.</p>
    <div className="sc-import"><label>Nexus event key<input aria-label="Nexus event key" placeholder="2026cabb" maxLength={64} value={key} disabled={busy || !ready} onChange={e => setKey(e.target.value)} /></label><button disabled={!ready || busy || !online || !validMapKey(key.trim())} onClick={refresh}>{busy ? 'Downloading map…' : 'Download / refresh map'}</button></div>
    {!online && <p className="sc-help">Offline. {saved ? 'Showing the map saved on this device.' : 'No map has been downloaded for this account and event.'}</p>}
    {error && <p className="sc-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!ready ? <p role="status">Opening saved map…</p> : !map ? <p className="sc-help">No saved map. Team pit addresses below remain available when a map is missing.</p> : <>
      <p className="sc-help">Nexus · <strong>{saved.event_key}</strong> · downloaded {when(saved.fetched_at)}{mapIsStale(saved.fetched_at) ? ' · Check map before walking: this copy may be out of date.' : ''}{key.trim() !== saved.event_key ? ' · The displayed map is for the key shown here; download to change it.' : ''}</p>
      <div className="sc-map-controls"><label>Find a pit or team<input type="search" aria-label="Find a pit or team" value={query} onChange={e => setQuery(e.target.value)} placeholder="Team number or A12" /></label><label>Highlight pit<select aria-label="Highlight pit" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose a pit ({directory.length})</option>{directory.map(pit => <option key={pit.address} value={pit.address}>{pit.address} · {pit.team ? `Team ${pit.team}` : 'Unassigned'}{pit.conflict ? ' · check location' : ''}</option>)}{current && !directory.some(p => p.address === selected) && <option value={selected}>{selected} · selected</option>}</select></label></div>
      <div className="sc-actions"><button disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1,z-.5))} aria-label="Zoom out">−</button><span className="sc-help">{Math.round(zoom*100)}%</span><button disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4,z+.5))} aria-label="Zoom in">+</button><button onClick={() => setRotation(r => (r+90)%360)}>Rotate map</button><button onClick={() => { setZoom(1); setRotation(0); setSelected(''); setQuery('') }}>Reset map view</button></div>
      {current && <p className="sc-map-selection" role="status"><strong>{current.address} · {current.team ? `Team ${current.team}` : 'Unassigned pit'}</strong>{current.conflict ? ` · Location differs: ${current.location.source} says ${current.location.value}. Check with pit staff; neither source was changed.` : ''}</p>}
      <div className="sc-map-viewport" role="region" aria-label="Scrollable pit map" tabIndex={0}>
        <svg role="img" aria-labelledby={mapTitle} viewBox={`0 0 ${width} ${height}`} style={{ width: `${zoom*100}%`, aspectRatio: `${width} / ${height}` }}>
          <title id={mapTitle}>Nexus pit map for {saved.event_key}{current ? `, highlighted ${current.address}` : ''}. Use the pit directory to select a team.</title>
          <g transform={transform}>{['walls','areas','arrows','labels','pits'].flatMap(kind => Object.entries(map[kind]).map(([address, shape]) => <Shape key={`${kind}:${address}`} kind={kind} address={address} shape={shape} selected={kind === 'pits' && selected === address} />))}</g>
        </svg>
      </div>
      <p className="sc-help">Use zoom and scroll to read small pits. Highlighted pits use a thick border. Source assignments do not override scout reports.</p>
      <details><summary>Text directory ({directory.length})</summary>{!directory.length ? <p>No pits match that search.</p> : <ul className="sc-map-directory">{directory.map(p => <li key={p.address}><button aria-pressed={p.address === selected} onClick={() => setSelected(p.address)}>{p.address} · {p.team ? `Team ${p.team}` : 'Unassigned'}</button>{p.conflict && <span className="sc-help">Check location: {p.location.source} says {p.location.value}.</span>}</li>)}</ul>}</details>
      <a className="sc-link" href="https://frc.nexus" target="_blank" rel="noreferrer">Map data by Nexus ↗</a>
    </>}
  </details>
}
