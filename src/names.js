// Single source of truth for how a member's name is displayed across the app.
// Precedence: nickname (trimmed, if set) → full_name → email prefix → 'Member'.
//
// Google sign-ins often arrive with a missing/blank full_name, which is why a
// raw `full_name` read shows blank or wrong. Always render member names through
// this helper, and make sure every select that feeds a name also pulls nickname
// (and email, where available — profiles has no email column, so email only
// resolves on objects that carry it, e.g. session.user).
export function displayName(profile) {
  const nick = profile?.nickname?.trim()
  if (nick) return nick
  if (profile?.full_name?.trim()) return profile.full_name.trim()
  const email = profile?.email
  if (email && email.includes('@')) return email.split('@')[0]
  return 'Member'
}
