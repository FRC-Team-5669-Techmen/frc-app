// A prior event's footage is useful context, but must not silently become a
// current-event reliability trial. Full match keys avoid qm1/previous-qm1 collisions.
export function isExternalEvidence(row) { return row.payload?.source_scope === 'external' }
export function hasUnverifiedVideoScope(row) { return row.payload?.source === 'video' && !['current', 'external'].includes(row.payload?.source_scope) }
export function isCurrentEvidence(row) { return !isExternalEvidence(row) && !hasUnverifiedVideoScope(row) }
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

// Practice matches are not on TBA, so scouts type them: "pm3", "P3",
// "Practice 3", "practice match 3". All become "pm3" so two scouts never split
// one practice match, and every practice match stays its own record. No cap:
// any practice number up to 9999 is accepted (feedback 387edf14).
const PRACTICE = /^(?:pm|p|practice(?:\s*match)?)\s*[-#]?\s*0*([1-9][0-9]{0,3})$/i
const BARE_PRACTICE = /^(?:pm|p|practice(?:\s*match)?)\s*[-#]?\s*0*$/i

/** "Q12", "q12", "qm 12" and "12" become "qm12"; "P3", "Practice 3" and "pm 3" become "pm3"; anything else (sf1m1, 2026cabl_qm3) is kept as typed. */
export function canonicalMatchKey(key) {
  const k = String(key ?? '').trim()
  const m = /^(?:qm|q)?\s*0*([1-9][0-9]{0,2})$/i.exec(k)
  if (m) return `qm${m[1]}`
  const p = PRACTICE.exec(k)
  return p ? `pm${p[1]}` : k
}

/** "practice" or "pm" with no number would put every practice match of a team in one record. */
export const isBarePracticeKey = key => BARE_PRACTICE.test(String(key ?? '').trim())

/** What a scout reads for a stored key: "Practice 3", "Qualification 12", or the key itself. */
export function matchLabel(key) {
  const k = String(key ?? '').trim()
  const m = /^(?:\d{4}[a-z0-9]+_)?(qm|pm)([0-9]+)$/i.exec(k)
  if (!m) return k
  return `${m[1].toLowerCase() === 'pm' ? 'Practice' : 'Qualification'} ${Number(m[2])}`
}

// TBA's full current-event key and a scout's short label name the same match.
// External-event keys retain their prefix so two different events never collapse.
export function matchIdentity(row) {
  const key = String(row.match_key ?? '').trim().toLowerCase()
  return isExternalEvidence(row) ? key : key.replace(/^\d{4}[a-z0-9]+_(qm\d+|sf\d+m\d+|f\d+m\d+)$/, '$1')
}
