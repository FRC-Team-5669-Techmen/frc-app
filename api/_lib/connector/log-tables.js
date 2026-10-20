// Tables whose written rows a connector audit row records, beyond the ones
// 0018 seeds. Synced into connector_log_tables by the server (insert only),
// so a new hand entry needs no migration. A table named here that does not
// exist is skipped by _connector_rows_written.
export const LOG_TABLES = Object.freeze([
  'attendance_events',
  'hour_adjustments',
  'member_roles',
  'feedback',
  'signout_requests',
  'events',
  'event_signups',
])
