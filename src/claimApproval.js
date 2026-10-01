// What a claim_profile() answer does to the approval this tab already holds,
// and (at the foot) what the roles and onboarding reads after it do to theirs.
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

// The same hold for the two reads claimAndLoad makes after the claim. Both run
// on that same SIGNED_IN, so the same transient error reaches them:
//   - member_roles: an error used to set roles to [], so a mentor's staff nav
//     and routes vanished, and the application gate then read a mentor or a
//     parent as the member track and put them behind the student form;
//   - profiles.onboarded_at: an error used to set it to null ("never
//     onboarded"), which can start the onboarding tour over /dashboard.

/**
 * @param {string[]|null} held  the roles this tab holds for THIS member (null: none yet)
 * @param {{ data?: {role: string}[]|null, error?: unknown }} result  the member_roles read
 * @returns {string[]|null}  the roles to use; null means UNKNOWN (an error with
 *          nothing held), which the caller must not read as "no roles"
 */
export function nextRoles(held, result) {
  if (result?.error) return held ?? null
  return (result?.data ?? []).map(r => r.role)
}

/**
 * @param {string|null|undefined} held  undefined: not loaded (the tour waits);
 *        null: never onboarded (the tour may start); a timestamp: done
 * @param {{ data?: { onboarded_at?: string|null }|null, error?: unknown }} result
 * @returns {string|null|undefined}  an error keeps what is held, never null
 */
export function nextOnboardedAt(held, result) {
  if (result?.error) return held
  return result?.data?.onboarded_at ?? null
}
