// What a claim_profile() answer does to the approval this tab already holds.
//
// App.jsx runs claim_profile on every auth event, and supabase-js 2.106 emits
// SIGNED_IN on every hidden-to-visible transition of the tab. A transient
// error on that resume (a dropped connection as the phone wakes, a 5xx, a
// token mid-refresh) used to set approved to false, and the AccessGate early
// return then replaced the WHOLE tree: /checkin and /dashboard unmounted under
// a student who had just pulled the phone out to check out.
//
// So an answer decides, and an error never takes away what this tab holds:
//   - no error: approved exactly when claim_profile returned true (a real
//     revocation, data false, still revokes);
//   - error: keep the approval already held; with nothing held yet (the first
//     load) it reads as not approved, as it always did.
// The server is not trusted any less for this: every table is still behind
// RLS, so a tab that keeps showing the app after an access change can read and
// write only what that member's policies allow.
//
// Pure: no React, no Supabase. tests/checkout-approval.test.js.

/**
 * @param {boolean|null} held  the approval this tab holds (null: not decided yet)
 * @param {{ data?: unknown, error?: unknown }} result  the rpc('claim_profile') answer
 * @returns {boolean}
 */
export function nextApproval(held, result) {
  if (result?.error) return held ?? false
  return result?.data === true
}
