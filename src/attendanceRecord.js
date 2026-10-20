// One attendance write, through its database function (attendance_record,
// migration 0019) so Claude can make it too, falling back to the direct
// insert the pages always made while 0019 is unpasted (src/writeVia.js).
//
// `row` is the attendance_events row the caller used to insert, unchanged:
// the fallback inserts exactly it. The function takes the same values by
// name and writes the signed-in account as user_id, which is the only
// user_id the insert policy ever accepted. A key the row leaves out (category
// on a check-out, geo_ok, note) reaches the function as null; the function
// gives category its column default, build, exactly as the insert did.
//
// Pure apart from the client passed in; safe to import from the check-in path.

import { writeVia } from './writeVia.js'

export function attendanceArgs(row) {
  return {
    p_type: row.type,
    p_location: row.location ?? null,
    p_method: row.method ?? null,
    p_category: row.category ?? null,
    p_geo_ok: row.geo_ok ?? null,
    p_note: row.note ?? null,
    p_cleanup_confirmed: row.cleanup_confirmed ?? null,
  }
}

// -> { data, error, via }
export function recordAttendance(client, row) {
  return writeVia(client, 'attendance_record', attendanceArgs(row), { table: 'attendance_events', op: 'insert', values: row })
}
