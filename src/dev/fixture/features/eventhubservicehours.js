// Fixture: the parent service hours note (supabase/migrations/0011_event_hub_parent_service_hours.sql).
// Contract: src/dev/fixture/README.md. 0011 adds one column to 0005's
// hub_events and changes three function bodies; it adds no table and no RPC a
// page calls by a new name. The function changes are ported where their 0005
// and 0007 ports live, gated on engine.applied('0011'): eventJson and
// exportRows in features/eventhub.js, hub_join_info in features/eventhubjoin.js.
// The seeded note on Fixture Blitz sits on the 0005 seed row; while 0011 is
// off this column hides it from every read, as a missing column would.
// The SQL is the rule, proven by tools/sql-harness/check-0011.mjs.
export default {
  migration: '0011',
  creates: { columns: { hub_events: { parent_service_hours_note: { type: 'text' } } } },
}
