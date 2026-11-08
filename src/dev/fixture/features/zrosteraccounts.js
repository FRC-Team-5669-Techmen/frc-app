// Rendering contract only. Native PostgreSQL tests prove auth, expiry and merge.
const ok = (data = null) => ({ data, error: null })
const no = (message = 'Not permitted') => ({ data: null, error: { code: '42501', message } })
const rows = (ctx, table) => ctx.db[table] ?? []
const roles = (ctx, id) => rows(ctx, 'member_roles').filter(r => r.member_id === id).map(r => r.role)
const email = (ctx, id) => rows(ctx, '__users').find(u => u.id === id)?.email ?? ''
const name = (ctx, id) => { const p = rows(ctx, 'profiles').find(p => p.id === id); return p?.nickname || p?.full_name || 'Member' }
const candidates = ctx => rows(ctx, 'standing_records').filter(r => r.kind === 'removal' && r.status === 'proposed'
  && /^(Short week on probation, week of |Missed a meeting on probation, week of |Under 80 percent of meetings again, on probation: )/.test(r.reason)
  && rows(ctx, 'standing_records').some(f => f.member_id === r.member_id && ['hours', 'meetings'].includes(f.kind) && f.status === 'failed' && f.closed_on === r.opened_on)
  && rows(ctx, 'profiles').some(p => p.id === r.member_id && p.status === 'active')
  && !rows(ctx, 'member_participation').some(p => p.member_id === r.member_id && p.keep_active))
  .map(r => ({ member_id: r.member_id, name: name(ctx, r.member_id), reason: r.reason, record_id: r.id }))
const transfers = ctx => rows(ctx, 'account_transfer_requests').filter(r => ctx.persona?.isAdmin || [r.source_id, r.target_id].includes(ctx.user?.id))
  .map(r => ({ ...r, source_email: email(ctx, r.source_id), target_email: email(ctx, r.target_id) }))
export default {
  migration: '0050',
  creates: {
    tables: ['participation_settings', 'member_participation', 'account_classifications', 'account_transfer_codes', 'account_transfer_requests'],
    rpcs: ['admin_preview_folding', 'admin_set_folding', 'staff_participation', 'mentor_set_participation', 'my_account_classification', 'admin_account_review', 'admin_reclassify_account', 'create_account_transfer_code', 'request_account_transfer', 'account_transfers', 'admin_decide_account_transfer', 'staff_access_classifications'],
  },
  alters: { profiles: { status: { values: ['active', 'inactive', 'alumni', 'folded'] } } },
  seed: ({ ids }) => ({
    participation_settings: [{ id: true, enabled: false }],
    account_classifications: Object.values(ids).filter(id => /00000000-0000-0000-0000-0000000000[a-e][0-9]/.test(id)).map(member_id => ({ member_id, classification: null, legacy: true, reason: 'Existing account: roles retained for admin review.' })),
  }),
  visible: Object.fromEntries(['participation_settings', 'member_participation', 'account_classifications', 'account_transfer_codes', 'account_transfer_requests'].map(t => [t, () => false])),
  rpcs: {
    admin_preview_folding: ctx => ctx.persona?.isAdmin ? ok({ enabled: rows(ctx, 'participation_settings')[0]?.enabled ?? false, candidates: candidates(ctx), held: false, as_of: new Date(ctx.now).toISOString() }) : no(),
    admin_set_folding: ctx => {
      if (!ctx.persona?.isAdmin) return no()
      ctx.engine.updateRows('participation_settings', () => true, { enabled: ctx.args.p_enabled }); return ok()
    },
    staff_participation: ctx => ctx.persona?.isStaff ? ok(rows(ctx, 'member_participation')) : no(),
    mentor_set_participation: ctx => {
      if (!ctx.persona?.isAdmin && !roles(ctx, ctx.user?.id).includes('mentor')) return no()
      const { p_member: member_id, p_keep_active: keep_active, p_restore: restore } = ctx.args
      const patch = { keep_active, override_by: ctx.user.id, override_at: new Date(ctx.now).toISOString() }
      if (rows(ctx, 'member_participation').some(r => r.member_id === member_id)) ctx.engine.updateRows('member_participation', r => r.member_id === member_id, patch)
      else ctx.engine.insertRow('member_participation', { member_id, ...patch })
      if (restore) {
        ctx.engine.updateRows('profiles', p => p.id === member_id && p.status === 'folded', { status: 'active' })
        ctx.engine.updateRows('standing_records', r => r.member_id === member_id && r.kind === 'removal' && r.status === 'proposed'
  && /^(Short week on probation, week of |Missed a meeting on probation, week of |Under 80 percent of meetings again, on probation: )/.test(r.reason)
  && rows(ctx, 'standing_records').some(f => f.member_id === r.member_id && ['hours', 'meetings'].includes(f.kind) && f.status === 'failed' && f.closed_on === r.opened_on), { status: 'dismissed' })
      }
      return ok()
    },
    my_account_classification: ctx => ok(rows(ctx, 'account_classifications').find(r => r.member_id === ctx.user?.id) ?? null),
    admin_account_review: ctx => {
      if (!ctx.persona?.isAdmin) return no()
      return ok(rows(ctx, 'account_classifications').filter(c => email(ctx, c.member_id) && !email(ctx, c.member_id).endsWith('@boscotech.edu')).map(c => ({ ...c, name: name(ctx, c.member_id), email: email(ctx, c.member_id), roles: roles(ctx, c.member_id), needs_review: c.legacy && roles(ctx, c.member_id).includes('student') })))
    },
    admin_reclassify_account: ctx => {
      if (!ctx.persona?.isAdmin) return no()
      const { p_member: id, p_classification: role } = ctx.args
      ctx.engine.deleteRows('member_roles', r => r.member_id === id && ['student', 'parent'].includes(r.role))
      ctx.engine.insertRow('member_roles', { member_id: id, role })
      ctx.engine.updateRows('account_classifications', c => c.member_id === id, { classification: role, reason: 'Admin reclassification.', legacy: false })
      return ok()
    },
    create_account_transfer_code: ctx => {
      if (!ctx.user || email(ctx, ctx.user.id).endsWith('@boscotech.edu')) return no('Generate the code from your personal account')
      const code = ctx.uuid().replaceAll('-', '')
      const expires_at = new Date(new Date(ctx.now).getTime() + 864e5).toISOString()
      ctx.engine.updateRows('account_transfer_codes', c => c.source_id === ctx.user.id && !c.used_at, { used_at: new Date(ctx.now).toISOString() })
      // This fake stores a test token. Production stores only a SHA256 hash.
      ctx.engine.insertRow('account_transfer_codes', { source_id: ctx.user.id, code_hash: code, expires_at })
      return ok({ code, expires_at })
    },
    request_account_transfer: ctx => {
      if (!email(ctx, ctx.user?.id).endsWith('@boscotech.edu')) return no('Enter the code from your school account')
      const c = rows(ctx, 'account_transfer_codes').find(c => c.code_hash === ctx.args.p_code)
      if (!c || c.used_at || new Date(c.expires_at) <= new Date(ctx.now)) return no('Code invalid, expired or already used')
      const r = ctx.engine.insertRow('account_transfer_requests', { source_id: c.source_id, target_id: ctx.user.id, code_id: c.id, status: 'pending', requested_at: new Date(ctx.now).toISOString() })
      ctx.engine.updateRows('account_transfer_codes', x => x.id === c.id, { used_at: new Date(ctx.now).toISOString() })
      return ok(r.id)
    },
    account_transfers: ctx => ctx.user ? ok(transfers(ctx)) : no(),
    admin_decide_account_transfer: ctx => {
      if (!ctx.persona?.isAdmin) return no()
      const r = rows(ctx, 'account_transfer_requests').find(r => r.id === ctx.args.p_request && r.status === 'pending')
      if (!r) return no('No pending transfer')
      const result = ctx.args.p_approve ? { moved_total: 2, duplicates_removed: 0 } : null
      ctx.engine.updateRows('account_transfer_requests', x => x.id === r.id, { status: ctx.args.p_approve ? 'approved' : 'denied', result })
      return ok(result)
    },
    staff_access_classifications: ctx => ctx.persona?.isStaff ? ok(rows(ctx, 'access_requests').filter(r => r.status === 'pending').map(r => {
      const c = rows(ctx, 'account_classifications').find(c => email(ctx, c.member_id) === r.email)
      return { request_id: r.id, classification: c?.classification ?? null, reason: c?.reason ?? 'Existing roles retained.' }
    })) : no(),
  },
}
