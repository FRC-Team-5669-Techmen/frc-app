const SHOP_LAT = 34.041550
const SHOP_LON = -118.086826
// FLL room (summer volunteering) — its own geofence center, same radius and
// accuracy floor as the shop. Used by the /checkin-volunteer route.
const FLL_LAT = 34.042134
const FLL_LON = -118.086326
const RADIUS_M  = 150
const ACCURACY_FLOOR_M = 100

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6_371_000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function gpsPosition() {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    })
  )
}

// Shared geofence core: verify the current fix is within RADIUS_M of (lat, lon).
// Returns { ok: true } or
// { ok: false, reason: 'denied'|'unavailable'|'range'|'error'|'imprecise' }
async function verifyAt(lat, lon) {
  if (!navigator.geolocation) return { ok: false, reason: 'unavailable' }
  try {
    const { coords } = await gpsPosition()
    // Reject coarse fixes (e.g. iOS "Precise Location" off): a >100 m accuracy
    // radius can't be trusted against a 150 m geofence.
    if (coords.accuracy > ACCURACY_FLOOR_M) return { ok: false, reason: 'imprecise' }
    const dist = haversineMeters(coords.latitude, coords.longitude, lat, lon)
    return dist <= RADIUS_M ? { ok: true } : { ok: false, reason: 'range' }
  } catch (err) {
    if (err?.code === 1) return { ok: false, reason: 'denied' }
    return { ok: false, reason: 'error' }
  }
}

// Shop geofence — normal check-in (CheckinPage).
export function verifyAtShop() { return verifyAt(SHOP_LAT, SHOP_LON) }

// FLL-room geofence — volunteer check-in (VolunteerCheckinPage).
export function verifyAtFLL() { return verifyAt(FLL_LAT, FLL_LON) }

// Start the sensor directly from the confirmation gesture. Classification can
// wait for fresh server venue/exemption context without delaying the GPS call.
export async function captureCheckinFix() {
  if (!navigator.geolocation) return { ok: false, reason: 'unavailable' }
  try {
    const { coords } = await gpsPosition()
    if (!Number.isFinite(coords.accuracy) || coords.accuracy < 0 || coords.accuracy > 100) return { ok: false, reason: 'imprecise' }
    return { ok: true, latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }
  } catch (e) { return { ok: false, reason: e?.code === 1 ? 'denied' : 'error' } }
}
export function matchCheckinVenue(fix, venues, eventId = null, shopOnly = false) {
  if (!fix.ok) return fix
  const hits = shopOnly ? [] : venues.filter(v => (!eventId || v.id === eventId) && haversineMeters(fix.latitude, fix.longitude, v.latitude, v.longitude) <= 150)
  if (hits.length === 1) return { ...fix, event: hits[0] }
  if (hits.length > 1) return { ok: false, reason: 'ambiguous' }
  if (!eventId && haversineMeters(fix.latitude, fix.longitude, SHOP_LAT, SHOP_LON) <= 150) return fix
  return { ok: false, reason: 'range' }
}
