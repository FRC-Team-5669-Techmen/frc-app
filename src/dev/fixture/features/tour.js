// Dev-only rendering contract. SQL 0046 and its mutants prove authorization.
const profile = (ctx) =>
  (ctx.db.profiles ?? []).find((p) => p.id === ctx.user?.id)
const eligible = (ctx) =>
  profile(ctx)?.approved && profile(ctx)?.status === 'active'
const refuse = () => ({
  data: null,
  error: { code: '42501', message: 'Not permitted' },
})
export default {
  migration: '0047',
  creates: {
    tables: ['tour_completions'],
    rpcs: ['tour_complete_core', 'tour_completion_overview'],
  },
  seed: ({ ids, now }) => ({
    tour_completions: [
      {
        member_id: ids.mentor,
        core_version: 1,
        track: 'mentor',
        completed_at: new Date(now).toISOString(),
      },
    ],
  }),
  visible: {
    tour_completions: (ctx) =>
      eligible(ctx) &&
      (ctx.persona?.isStaff || ctx.row.member_id === ctx.user?.id),
  },
  rpcs: {
    tour_complete_core: (ctx) => {
      if (!eligible(ctx)) return refuse()
      const { p_track: track, p_version: version } = ctx.args
      if (
        version !== 1 ||
        !['member', 'scout', 'driver', 'pit', 'mentor', 'parent'].includes(
          track,
        )
      )
        return refuse()
      if (
        (track === 'mentor' && !ctx.persona?.isStaff) ||
        (ctx.persona?.isParent && track !== 'parent') ||
        (track === 'parent' && !ctx.persona?.isParent)
      )
        return refuse()
      const rows = ctx.db.tour_completions ?? (ctx.db.tour_completions = [])
      let row = rows.find(
        (r) => r.member_id === ctx.user.id && r.core_version === version,
      )
      if (!row) {
        row = {
          member_id: ctx.user.id,
          core_version: version,
          track,
          completed_at: new Date(ctx.now).toISOString(),
        }
        ctx.engine.insertRow('tour_completions', row)
      }
      return { data: row, error: null }
    },
    tour_completion_overview: (ctx) => {
      if (!eligible(ctx) || !ctx.persona?.isStaff) return refuse()
      return {
        data: (ctx.db.profiles ?? [])
          .filter((p) => p.approved && p.status === 'active')
          .map((p) => {
            const c = (ctx.db.tour_completions ?? []).find(
              (c) =>
                c.member_id === p.id && c.core_version === ctx.args.p_version,
            )
            return {
              member_id: p.id,
              name: p.nickname || p.full_name,
              track: c?.track ?? null,
              completed_at: c?.completed_at ?? null,
            }
          }),
        error: null,
      }
    },
  },
}
