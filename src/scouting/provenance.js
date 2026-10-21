// A prior event's footage is useful context, but must not silently become a
// current-event reliability trial. Full match keys avoid qm1/previous-qm1 collisions.
export function isExternalEvidence(row) { return row.payload?.source_scope === 'external' }
export function prepareFootageRecord(row) {
  const p = { ...row.payload }
  const hasVideo = row.kind === 'observation' ? p.source === 'video' : !!p.video_url
  if (!hasVideo) {
    delete p.source_scope; delete p.source_event
    return { ...row, payload: p }
  }
  if (!p.video_url || !/^https:\/\/[^\s]+$/i.test(p.video_url)) throw new Error('Add an HTTPS video link so someone can review the observation.')
  p.source_scope = p.source_scope || 'current'
  if (!['current', 'external'].includes(p.source_scope)) throw new Error('Choose where the footage was recorded.')
  if (p.source_scope === 'external') {
    p.source_event = String(p.source_event || '').trim().toLowerCase()
    if (!/^\d{4}[a-z0-9]{2,40}$/.test(p.source_event)) throw new Error('Enter the source event key, such as 2026cabb.')
    if (!String(row.match_key).startsWith(`${p.source_event}_`)) throw new Error(`Use the full source match key, such as ${p.source_event}_qm1.`)
    if (row.kind === 'observation' && p.source !== 'video') throw new Error('Prior-event evidence requires a video source.')
  } else delete p.source_event
  return { ...row, payload: p }
}
export function footageLabel(row) {
  if (isExternalEvidence(row)) return `Prior-event footage · ${row.payload.source_event}`
  if (row.payload?.source === 'video' || row.payload?.video_url) return row.payload.source_scope === 'current' ? 'This event · video' : 'Video · event scope not recorded'
  return 'Live match'
}

// TBA's full current-event key and a scout's short label name the same match.
// External-event keys retain their prefix so two different events never collapse.
export function matchIdentity(row) {
  const key = String(row.match_key ?? '').trim().toLowerCase()
  return isExternalEvidence(row) ? key : key.replace(/^\d{4}[a-z0-9]+_(qm\d+|sf\d+m\d+|f\d+m\d+)$/, '$1')
}
