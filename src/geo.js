const SHOP_LAT = 34.041550
const SHOP_LON = -118.086826
const RADIUS_M  = 150

function haversineMeters(lat1, lon1, lat2, lon2) {
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
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 30_000,
    })
  )
}

// Returns { ok: true } or { ok: false, reason: 'denied'|'unavailable'|'range'|'error' }
export async function verifyAtShop() {
  if (!navigator.geolocation) return { ok: false, reason: 'unavailable' }
  try {
    const { coords } = await gpsPosition()
    const dist = haversineMeters(coords.latitude, coords.longitude, SHOP_LAT, SHOP_LON)
    return dist <= RADIUS_M ? { ok: true } : { ok: false, reason: 'range' }
  } catch (err) {
    if (err?.code === 1) return { ok: false, reason: 'denied' }
    return { ok: false, reason: 'error' }
  }
}
