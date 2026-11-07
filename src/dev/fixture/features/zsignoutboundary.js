// Browser-only port of 0046. SQL and permissive mutants prove the boundary.
// No trigger emulation: fixture mode still cannot prove direct-write guards.
import signout from './signout.js'
const refuse = (message, code) => ({ data: null, error: { code, message } })
const latest = (db, id) => (db.attendance_events ?? []).filter(e => e.user_id === id)
  .sort((a, b) => b.event_time.localeCompare(a.event_time) || b.id.localeCompare(a.id))[0]
function approve(ctx) {
  const req = (ctx.db.signout_requests ?? []).find(r => r.id === ctx.args.p_request)
  const can = signout.rpcs.can_approve_signouts(ctx).data
  if (can && req && req.member_id !== ctx.user?.id && req.status === 'pending') {
    const last = latest(ctx.db, req.member_id)
    if (last?.id !== req.in_event_id || last?.type !== 'in') {
      const [row] = ctx.engine.updateRows('signout_requests', r => r.id === req.id,
        { status: 'withdrawn', decided_by: ctx.user.id, decided_at: new Date(ctx.now).toISOString() })
      return { data: row, error: null }
    }
  }
  return signout.rpcs.approve_signout(ctx)
}
export default {
  migration: '0046',
  creates: { rpcs: ['approve_signout', 'approve_all_signouts', 'switch_to_fll'] },
  rpcs: {
    approve_signout: approve,
    approve_all_signouts: ctx => {
      if (!signout.rpcs.can_approve_signouts(ctx).data) return refuse('Only approvers can approve', '42501')
      let n = 0
      for (const req of (ctx.db.signout_requests ?? []).filter(r => r.status === 'pending' && r.member_id !== ctx.user.id)) {
        const result = approve({ ...ctx, args: { p_request: req.id } })
        if (result.error) return result
        if (result.data.status === 'approved') n++
      }
      return { data: n, error: null }
    },
    switch_to_fll: ctx => {
      if (!ctx.user || !ctx.persona?.isStaff) return refuse('Finish build sign-out approval first, then scan for FLL hours', '42501')
      const n = String(ctx.args.p_note ?? '').trim().length
      if (n < 3 || n > 1000) return refuse('Write a short note of what you did', '22023')
      return signout.rpcs.switch_to_fll(ctx)
    },
  },
}
