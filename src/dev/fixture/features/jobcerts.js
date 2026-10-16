// Fixture plugin: job claiming gated on the IDEA certifications mirror
// (migration 0012, src/jobCerts.js, src/JobsPage.jsx). Contract:
// src/dev/fixture/README.md. Plain data, no imports, no side effects.
//
// Two states, both driven by the engine's migration switch:
//   0012 applied      task_idea_cert_requirements answers with the rows below,
//                     and claim_task checks the viewer's own IDEA mirror rows
//                     (features/a.js) by sign-in email, active and unexpired.
//   0012 not applied  the table and admin_set_task_cert answer PGRST205 /
//                     PGRST202, claim_task is core's (the old member_skills
//                     gate), and the Jobs page keeps the old path.
//
// What the seed sets up, against features/a.js's mirror and the core seed's
// jobs (seed.js, ids 70000000-...-00000000000N):
//   job 1  swerve gearboxes   requires MECH-1  Sam holds it (active); Riley's
//                                              is expired, so Riley cannot
//   job 2  practice bot PDH   requires ELEC-1  Sam has none, Riley's revoked
//   job 3  autonomous path    requires MILL-2  Sam's is SUSPENDED
//   job 4  intake bracket     unmapped (none)  old Onshape requirement dropped
//   job 5  bumper plywood     requires SAFE-2  Sam's is active but EXPIRED
//   job 8  scouting sheet     unmapped (none)  old Scouting app requirement dropped
// The client-side port of the claim rule below exists only to prove the page;
// the rule itself is proven on PostgreSQL by 0012_jobs_idea_cert_gate_rls_test.sql.

const TASK = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function refuse(message, code = 'P0001') {
  return { data: null, error: { code, message, details: null, hint: null } }
}

function holds(db, email, code, now) {
  const me = String(email || '').trim().toLowerCase()
  if (!me) return false
  const t = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now())
  return (db.idea_cert_holders ?? []).some((h) => h.email === me && h.code === code && h.status === 'active'
    && !(h.expires_at && Date.parse(h.expires_at) <= t))
}

export default {
  migration: '0012',
  creates: {
    tables: ['task_idea_cert_requirements'],
    rpcs: ['admin_set_task_cert', 'idea_cert_caller_holds'],
  },

  seed: () => ({
    task_idea_cert_requirements: [
      { task_id: TASK(1), code: 'MECH-1', source: 'admin', set_by: null },
      { task_id: TASK(2), code: 'ELEC-1', source: 'admin', set_by: null },
      { task_id: TASK(3), code: 'MILL-2', source: 'admin', set_by: null },
      { task_id: TASK(4), code: null, source: 'unmapped', set_by: null },
      { task_id: TASK(5), code: 'SAFE-2', source: 'mapped', set_by: null },
      { task_id: TASK(8), code: null, source: 'unmapped', set_by: null },
    ],
  }),

  rpcs: {
    // Same checks in the same order as 0012's claim_task.
    claim_task: ({ args, db, user, persona, engine, now }) => {
      const t = (db.tasks ?? []).find((x) => x.id === args.p_task)
      if (!t) return refuse('Task not found')
      if (t.status !== 'open') return refuse('Task is not open for claiming')
      const claims = (db.task_claims ?? []).filter((c) => c.task_id === t.id)
      if (claims.some((c) => c.member_id === user.id)) return refuse('You have already claimed this task')
      if (t.max_claimants != null && claims.length >= t.max_claimants) return refuse('This job is full')
      const req = (db.task_idea_cert_requirements ?? []).find((r) => r.task_id === t.id)
      if (req && req.code && !holds(db, persona && persona.email, req.code, now)) {
        return refuse(`This job needs the IDEA certification ${req.code}. Certifications are earned at ideabosco.com/certifications`, '42501')
      }
      engine.insertRow('task_claims', { task_id: t.id, member_id: user.id, status: 'claimed' })
      return { data: null, error: null }
    },

    admin_set_task_cert: ({ args, db, user, persona, engine, now }) => {
      if (!persona || !persona.isAdmin) return refuse('Only an admin can set a job certification requirement', '42501')
      if (!(db.tasks ?? []).some((x) => x.id === args.p_task)) return refuse('Task not found')
      const code = typeof args.p_code === 'string' && args.p_code.trim() ? args.p_code.trim() : null
      if (code && !(db.idea_cert_catalog ?? []).some((c) => c.code === code)) {
        return refuse(`Not an IDEA certification code: ${code}`, '22023')
      }
      const row = { code, source: 'admin', set_by: user.id, set_at: (now instanceof Date ? now : new Date()).toISOString() }
      const updated = engine.updateRows('task_idea_cert_requirements', (r) => r.task_id === args.p_task, row)
      if (!updated.length) engine.insertRow('task_idea_cert_requirements', { task_id: args.p_task, ...row })
      return { data: code, error: null }
    },

    idea_cert_caller_holds: ({ args, db, persona, now }) =>
      ({ data: holds(db, persona && persona.email, args.p_code, now), error: null }),
  },
}
