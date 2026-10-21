// Keep confirmed evidence independent of optimistic editing views.
export function projectRecords(downloaded, queue, memberId, eventId) {
  const confirmed = new Map(downloaded.filter(r => r.event_id === eventId && !r.localStatus).map(r => [r.id, r]))
  const scoped = queue.filter(op => op.member_id === memberId && op.event_id === eventId)
  for (const op of scoped) {
    const row = op.result
    if (op.status === 'synced' && row?.id === op.record_id && row.event_id === eventId && !row.localStatus
      && Number.isInteger(row.version) && row.version > (confirmed.get(row.id)?.version ?? 0)) confirmed.set(row.id, row)
  }
  const visible = new Map(confirmed)
  for (const op of scoped) {
    if (!op.recoveredFrom && ['local', 'syncing'].includes(op.status)) visible.set(op.record_id, {
      ...confirmed.get(op.record_id), id: op.record_id, event_id: eventId,
      member_id: confirmed.get(op.record_id)?.member_id ?? memberId,
      kind: op.args.p_kind, team_number: op.args.p_team, match_key: op.args.p_match,
      payload: op.args.p_payload, version: op.args.p_expected_version, localStatus: op.status,
    })
  }
  return { confirmed: [...confirmed.values()], visible: [...visible.values()] }
}
