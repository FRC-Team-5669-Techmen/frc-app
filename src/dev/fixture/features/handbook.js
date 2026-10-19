// Fixture: handbook signatures (supabase/migrations/0013_handbook_acknowledgments.sql).
// Contract: src/dev/fixture/README.md. 0013 adds one table and no RPC. The
// read filter mirrors the select policy (own, staff, or a parent linked in
// guardian_links). Fixture mode models no write-side RLS, so the insert
// boundary (own row, a role the member holds) is proven only by
// 0013_handbook_acknowledgments_rls_test.sql and tools/sql-harness/mutants-0013.mjs.
export default {
  migration: '0013',
  creates: {
    tables: ['handbook_acknowledgments'],
    columns: {
      handbook_acknowledgments: {
        member_id: { type: 'uuid' },
        version: { type: 'text' },
        signer_role: { type: 'text' },
        lessons_passed: { type: 'integer', default: 0 },
        signed_at: { type: 'timestamp with time zone' },  // the page sends it; the live trigger replaces it
      },
    },
  },
  seed: ({ ids, now }) => ({
    // One mentor signature, so the staff list has a row to show.
    handbook_acknowledgments: [
      { member_id: ids.mentor, version: '2026-10-20', signer_role: 'mentor', lessons_passed: 0, signed_at: new Date(now).toISOString() },
    ],
  }),
  visible: {
    handbook_acknowledgments: ({ row, user, persona, db }) =>
      row.member_id === user?.id || persona?.isStaff
      || (db.guardian_links ?? []).some((g) => g.parent_id === user?.id && g.student_id === row.member_id),
  },
}
