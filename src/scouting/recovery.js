// Transport validation for an untrusted portable archive, not a second copy of
// SQL business rules. Recovered requests stay out of evidence views until the
// server validates them. Never restore cached permissions or claimed receipts.
export const MAX_RECOVERY_BYTES = 20 * 1024 * 1024
const kinds = new Set(['observation', 'pit', 'assignment', 'message', 'team', 'pick_list'])
const states = new Set(['local', 'syncing', 'failed', 'conflict', 'synced', 'recovered'])
const keys = ['p_actor', 'p_id', 'p_event', 'p_kind', 'p_team', 'p_match', 'p_payload', 'p_expected_version', 'p_operation'].sort()
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const invalid = message => { throw new Error(`Backup cannot be recovered. ${message}`) }

// Sorted object keys let an identical request survive JSON formatting changes;
// arrays, explicit nulls and absent properties keep their original meaning.
export function requestFingerprint(value, depth = 0) {
  if (depth > 30) invalid('A request is nested too deeply.')
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(v => requestFingerprint(v, depth + 1)).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${requestFingerprint(value[k], depth + 1)}`).join(',')}}`
  invalid('A request contains a value that is not JSON.')
}

export function parseRecoveryArchive(text, memberId, eventId) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_RECOVERY_BYTES) invalid('Choose an event JSON file no larger than 20 MB.')
  let archive
  try { archive = JSON.parse(text) } catch { invalid('The file is not valid JSON.') }
  recoveryOperations(archive, memberId, eventId)
  return archive
}

export function recoveryOperations(archive, memberId, eventId) {
  if (!object(archive) || archive.format !== 'techmen-scouting-v2' || archive.device_backup?.format !== 'techmen-scouting-device-v1') invalid('Choose an exported Techmen event backup.')
  const local = archive.device_backup
  if (archive.exported_by !== memberId || local.member_id !== memberId || archive.event_id !== eventId || local.event_id !== eventId) invalid('Open this backup under its original member account and event.')
  if (!Array.isArray(local.operations) || local.operations.length > 12000) invalid('The operation list is missing or too large.')
  const seen = new Set(), pending = []
  for (const op of local.operations) {
    if (!object(op) || !uuid(op.id) || !uuid(op.record_id) || seen.has(op.id)) invalid('A save ID is missing, invalid or repeated.')
    seen.add(op.id)
    const a = op.args
    if (op.member_id !== memberId || op.event_id !== eventId || op.key !== `${memberId}:${eventId}:${op.id}` || !object(a)
      || a.p_actor !== memberId || a.p_event !== eventId || a.p_id !== op.record_id || a.p_operation !== op.id) invalid('A save belongs to another account/event or has inconsistent IDs.')
    if (Object.keys(a).sort().join(',') !== keys.join(',') || !kinds.has(a.p_kind) || !states.has(op.status)
      || !Number.isInteger(a.p_expected_version) || a.p_expected_version < 0 || a.p_expected_version > 2147483647
      || !(a.p_team === null || (Number.isInteger(a.p_team) && a.p_team >= 1 && a.p_team <= 99999))
      || !(a.p_match === null || (typeof a.p_match === 'string' && a.p_match.length <= 100))
      || !object(a.p_payload)) invalid('A save request has an unsupported shape.')
    // Bound the transport while leaving domain validation to scouting_save.
    if (requestFingerprint(a).length > 150000) invalid('A save request is too large.')
    if (op.status !== 'synced') pending.push({ id: op.id, record_id: op.record_id, args: structuredClone(a), previousStatus: op.status })
  }
  if (pending.length > 6000) invalid('There are more than 6000 pending saves.')
  return pending
}

export function planRecovery(operations, current) {
  const byId = new Map(current.map(row => [row.id, row]))
  const activeRecords = new Set(current.filter(row => row.status !== 'synced').map(row => row.record_id))
  const counts = new Map()
  for (const row of operations) counts.set(row.record_id, (counts.get(row.record_id) ?? 0) + 1)
  return operations.map(op => {
    const existing = byId.get(op.id)
    if (existing) {
      // JSON transport drops undefined optional properties in a live draft.
      const same = requestFingerprint(JSON.parse(JSON.stringify(existing.args))) === requestFingerprint(op.args)
      return { ...op, state: same ? 'existing' : 'blocked', reason: same ? 'This save is already on this device; its current status will be kept.' : 'The same save ID has a different request. Keep both archives for your lead to review.' }
    }
    const collision = activeRecords.has(op.record_id) || counts.get(op.record_id) > 1
    return { ...op, state: collision ? 'blocked' : 'ready', reason: collision ? 'Another pending edit uses this record. Resolve it before recovery.' : 'Ready to restore for review.' }
  })
}
