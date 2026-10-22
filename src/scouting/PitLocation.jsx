import { pitLocation } from './model'
export default function PitLocation({ records, team }) {
  const location = pitLocation(records, team)
  return <p className="sc-help">Pit: <strong>{location.value || 'Location not recorded'}</strong>{location.value && <> · {location.source} · {location.at ? new Date(location.at).toLocaleString('en-US', {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}) : 'Time unknown'}{location.stale ? ' · Check location before walking over' : ''}</>}</p>
}
