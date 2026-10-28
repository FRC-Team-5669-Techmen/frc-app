// Fixture: Approve all on /verify-hours (supabase/migrations/0040_hours_bulk_approve.sql,
// ledger 0028c, feedback c4f9a940). Contract: src/dev/fixture/README.md. A
// test-only PORT of staff_approve_logged_hours so the page can be driven in a
// browser; the rule is the SQL, proven by 0040_hours_bulk_approve_rls_test.sql
// and tools/sql-harness/mutants-0040.mjs.
// A failed call is driven with window.__fx.failNext (src/dev/fixture/client.js).

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))

export default {
  migration: '0040',
  creates: {
    rpcs: ['staff_approve_logged_hours'],
  },
  rpcs: {
    staff_approve_logged_hours: ({ args, db, user, persona, engine, now }) => {
      if (!persona?.isStaff) return { data: null, error: { code: '42501', message: 'Only staff can approve hours', details: null, hint: null } }
      const ids = new Set(args.p_entries ?? [])
      const hit = rows(db, 'logged_hours').filter((l) => ids.has(l.id) && l.status === 'pending')
      const stamp = (now instanceof Date ? now : new Date(now)).toISOString()
      engine.updateRows('logged_hours', (l) => hit.includes(l), { status: 'verified', verified_by: user.id, verified_at: stamp })
      return { data: hit.map((l) => ({ id: l.id, hours: Number(l.hours) })), error: null }
    },
  },
}
