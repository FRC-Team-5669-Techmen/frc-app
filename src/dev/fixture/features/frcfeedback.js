// TEST-ONLY ports for the pages. SQL and permissive mutation tests prove the boundaries.
const refuse = (message, code = '42501') => ({ data: null, error: { message, code } })
export default {
  migration: '0048',
  creates: {
    rpcs: ['set_session_paused', 'staff_standing_evidence'],
    columns: { attendance_events: { pauses: { type: 'jsonb', default: [] } } },
  },
  rpcs: {
    set_session_paused: ({ args, user, persona, db, engine, now }) => {
      const rows = (db.attendance_events ?? []).filter(r => r.user_id === user?.id).sort((a, b) => b.event_time.localeCompare(a.event_time))
      const row = rows[0]
      if (!row || row.id !== args.p_in || row.type !== 'in') return refuse('Session ended', 'P0002')
      if (persona?.isParent || (!persona?.isStaff && !persona?.roles.includes('student'))) return refuse('Not allowed')
      const pauses = [...(row.pauses ?? [])].map(p => ({ ...p }))
      const last = pauses.at(-1)
      if (args.p_paused && (!last || last.end)) pauses.push({ start: new Date(now).toISOString(), end: null })
      if (!args.p_paused && last && !last.end) last.end = new Date(now).toISOString()
      const [saved] = engine.updateRows('attendance_events', r => r.id === row.id, { pauses })
      return { data: saved, error: null }
    },
    staff_standing_evidence: ({ args, persona, db, now }) => {
      if (!persona?.isStaff) return refuse('Staff only')
      const r = (db.standing_records ?? []).find(r => r.id === args.p_record)
      if (!r) return { data: null, error: null }
      const from = new Date(Date.parse(`${r.opened_on}T12:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10)
      return { data: { origin: 'reconstructed', from, to: r.opened_on, reason: r.reason, record_id: r.id,
        judged_week: (db.standing_weeks ?? []).find(w => w.member_id === r.member_id),
        meetings: [], attendance: (db.attendance_events ?? []).filter(a => a.user_id === r.member_id), reviews: db.session_reviews ?? [] }, error: null }
    },
  },
}
