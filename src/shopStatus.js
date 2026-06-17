// Shared shop-status derivation for the dashboard glance card.
// Shop-open windows are defined by today's kind='build' events (recorded in
// CLAUDE.md). Other kinds (meeting/competition/etc.) do NOT open the shop.

export const SHOP_OPEN_KINDS = ['build']

// All event times render in local America/Los_Angeles time (the shop's zone),
// reusing the toLocaleTimeString pattern from HomePage — no date library.
export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })
}

export function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

// buildEvents: today's events whose kind is in SHOP_OPEN_KINDS ({ starts_at, ends_at }).
// Returns { state: 'open' | 'opens' | 'closed', headline, detail }.
export function computeShopStatus(buildEvents, now = new Date()) {
  const wins = (buildEvents ?? [])
    .map(e => ({ start: new Date(e.starts_at), end: new Date(e.ends_at) }))
    .sort((a, b) => a.start - b.start)

  const current = wins.find(w => now >= w.start && now < w.end)
  if (current) {
    return { state: 'open', headline: 'Shop open', detail: `until ${fmtTime(current.end)}` }
  }
  const next = wins.find(w => w.start > now)
  if (next) {
    return { state: 'opens', headline: 'Shop closed', detail: `opens ${fmtTime(next.start)}` }
  }
  return { state: 'closed', headline: 'Shop closed', detail: 'no build today' }
}
