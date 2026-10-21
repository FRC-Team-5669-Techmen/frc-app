// Device-local identity hint for prepared scouting only. It is NEVER server
// authorization, and contains no login token. Online writes still require the
// real session, actor binding and RLS. Explicit sign-out/account change clears it.
const KEY = 'techmen:scouting-offline-account:v1'
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const storage = () => { try { return globalThis.localStorage } catch { return null } }
export function readOfflineScoutingAccount(target = storage()) {
  try {
    const value = JSON.parse(target?.getItem(KEY) ?? 'null')
    return value && uuid(value.memberId) && (!value.eventId || uuid(value.eventId)) && Number.isFinite(value.preparedAt) ? value : null
  } catch { return null }
}
export function prepareOfflineScoutingAccount(memberId, eventId, target = storage()) {
  try { target?.setItem(KEY, JSON.stringify({ memberId, eventId, preparedAt: Date.now() })); return readOfflineScoutingAccount(target)?.memberId === memberId } catch { return false }
}
export function clearOfflineScoutingAccountUnless(memberId = null, target = storage()) {
  try { if (readOfflineScoutingAccount(target)?.memberId !== memberId) target?.removeItem(KEY) } catch { /* No local hint is a safe failure. */ }
}
