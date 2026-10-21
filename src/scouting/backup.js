// Portable evidence archive. JSON is deliberately plain and documented so a
// reviewer can recover work without this application's runtime. It is not an
// import command: pending operations must retain their IDs and author on retry.
export function buildEventArchive({ eventId, memberId, snapshot, local, exportedAt = new Date().toISOString() }) {
  if (local.member_id !== memberId || local.event_id !== eventId) throw new Error('Backup belongs to another account or event.')
  const records = new Map((snapshot.records ?? []).map(row => [row.id, row]))
  for (const op of local.operations) {
    if (op.status !== 'synced' || !op.result || op.result.event_id !== eventId) continue
    const previous = records.get(op.record_id)
    if (!previous || op.result.version > previous.version) records.set(op.record_id, op.result)
  }
  return {
    format: 'techmen-scouting-v2', event_id: eventId, exported_by: memberId,
    exported_at: exportedAt, event: snapshot.event ?? null,
    downloaded_at: snapshot.cachedAt ?? null, offline_snapshot: !!snapshot.offline,
    records: [...records.values()], revisions: snapshot.revisions ?? [], delivery: snapshot.delivery ?? [],
    pending: local.operations.filter(op => op.status !== 'synced'),
    device_backup: local,
    source_note: 'Pit claims, observations, official alliance results and estimates are distinct. Pending records and drafts are local proposals, not synchronized evidence.',
    recovery: {
      scope: 'Restore only to the same signed-in member and event. The backup contains team data; share only with authorized team staff.',
      operations: 'Keep each operation id, record_id, p_operation, p_actor, p_expected_version and request body unchanged. Confirm existing server receipts before retrying. Never bulk-insert these records or infer success from the archive.',
      drafts: 'Unsubmitted form, pick-list, planner and practice drafts are preserved with their original keys and timestamps. Review before restoring; never overwrite newer work.',
      permissions: 'Cached roster and manager hints are not authorization. Obtain current permissions from the server. This file contains no login tokens.',
    },
  }
}

export function downloadArchive(payload, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.append(a)
  try { a.click() } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
