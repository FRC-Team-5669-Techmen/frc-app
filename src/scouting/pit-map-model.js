import { normalizePitMap, validNexusEventKey } from '../../supabase/functions/scouting-import/pit-map.js'
import { pitLocation } from './model.js'
export { normalizePitMap }
export const PIT_MAP_DRAFT = 'nexus-pit-map-v1'
export const validMapKey = validNexusEventKey
export function importedMapKey(records) {
  const keys = [...new Set(records.filter(r => r.kind === 'team' && r.payload?.source === 'tba').flatMap(r => {
    const match = /^https:\/\/www\.thebluealliance\.com\/event\/(20\d{2}[a-z0-9_]{2,60})$/.exec(r.payload.source_url ?? '')
    return match ? [match[1]] : []
  }))]
  return keys.length === 1 ? keys[0] : ''
}
export function mapIsStale(at, now = Date.now()) {
  const time = Date.parse(at)
  return !Number.isFinite(time) || time > now || now - time > 86400000
}
export function mapDirectory(map, records, query = '') {
  const q = query.trim().toLowerCase()
  const locations = new Map()
  for (const row of records) {
    if (!['pit','team'].includes(row.kind)) continue
    const group = locations.get(Number(row.team_number)) ?? []
    group.push(row); locations.set(Number(row.team_number), group)
  }
  return Object.entries(map.pits).map(([address, pit]) => {
    const location = pit.team ? pitLocation(locations.get(Number(pit.team)) ?? [], Number(pit.team)) : null
    return { address, ...pit, location, conflict: !!location?.value && location.value.trim().toLowerCase() !== address.trim().toLowerCase() }
  }).filter(pit => !q || `${pit.address} ${pit.team ?? ''}`.toLowerCase().includes(q)).sort((a,b) => a.address.localeCompare(b.address, undefined, { numeric: true }))
}
