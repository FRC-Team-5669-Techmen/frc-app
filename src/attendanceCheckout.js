// The dashboard's Check Out button: the one check-out that is not a tag tap.
//
// It used to discard the insert's result (HomePage.jsx: `await supabase...
// .insert(...)` with nothing read back), so a rejected or failed write left the
// tile saying "Checked in" with no word about why. It now reports.
//
// Pure: the Supabase client is passed in, so tests/checkout-path.test.js drives
// it with a stand-in and pins both the row shape and the error path.

// The row is UNCHANGED from what has always been written: location 'button',
// method null. method null passes attendance_events_method_check (a CHECK on
// NULL is not false), category takes its 'build' default, and an OUT needs
// neither (sessions are attributed by their IN). Writing a new value here would
// need a migration first; the test pins that it does not.
export const DASHBOARD_CHECKOUT_ROW = Object.freeze({ type: 'out', location: 'button', method: null })

export function dashboardCheckoutRow(uid) {
  return { user_id: uid, ...DASHBOARD_CHECKOUT_ROW }
}

// What the tile says when the write does not land. The code (a Postgres or
// PostgREST code such as 23514 or 42501) is what makes the next report
// actionable; the raw message is not shown to a student.
export function checkoutFailureText(error) {
  const code = typeof error?.code === 'string' && error.code ? ` (${error.code})` : ''
  return `Check-out was not recorded${code}. Try again, or tap your tag.`
}

// -> { ok: true, message: null } | { ok: false, message }
export async function checkOutFromDashboard(client, uid) {
  try {
    const { error } = await client.from('attendance_events').insert(dashboardCheckoutRow(uid))
    if (error) return { ok: false, message: checkoutFailureText(error) }
    return { ok: true, message: null }
  } catch (err) {
    return { ok: false, message: checkoutFailureText(err) }
  }
}
