// Nexus v1.8.0 documented geometry. No HTML, URLs, SVG markup or styles from
// upstream are accepted. Reject a malformed map as a whole: hiding a wall
// while keeping its pits would give unsafe navigation advice.
const object = value => !!value && typeof value === 'object' && !Array.isArray(value)
// Nexus documents demo and arbitrary offseason keys. Restrict them to one
// bounded URL-path segment; this never broadens TBA import or upstream hosts.
export const validNexusEventKey = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(value)
const bounded = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000
function vector(value, positive = false) {
  if (!object(value) || !bounded(value.x) || !bounded(value.y) || (positive && (value.x <= 0 || value.y <= 0))) throw new Error('Invalid map dimensions')
  return { x: value.x, y: value.y }
}
export function normalizePitMap(raw) {
  if (!object(raw) || !object(raw.pits) || JSON.stringify(raw).length > 500000) throw new Error('Invalid pit map')
  const map = { size: vector(raw.size, true) }
  if (Math.min(map.size.x, map.size.y) < 1 || Math.max(map.size.x/map.size.y, map.size.y/map.size.x) > 50) throw new Error('Unsupported map proportions')
  let count = 0
  for (const kind of ['pits', 'areas', 'labels', 'arrows', 'walls']) {
    const values = raw[kind] ?? {}
    if (!object(values) || Object.keys(values).length > 1000) throw new Error('Invalid map collection')
    map[kind] = Object.fromEntries(Object.entries(values).map(([id, value]) => {
      if (++count > 2500 || !id.trim() || id.length > 100 || !object(value)) throw new Error('Invalid map shape')
      const shape = { position: vector(value.position), size: vector(value.size, true), angle: value.angle ?? 0 }
      if (!bounded(shape.angle)) throw new Error('Invalid map rotation')
      shape.angle %= 360
      if (kind === 'pits') {
        if (value.team != null && value.team !== '' && (typeof value.team !== 'string' || !/^[1-9]\d{0,4}$/.test(value.team))) throw new Error('Invalid mapped team')
        shape.team = value.team || null
      }
      if (kind === 'areas' || kind === 'labels') {
        if (value.label != null && (typeof value.label !== 'string' || value.label.length > 200)) throw new Error('Invalid map label')
        shape.label = value.label || ''
      }
      if (kind === 'arrows') {
        if (!['single', 'double'].includes(value.type)) throw new Error('Unsupported map arrow')
        shape.type = value.type
      }
      return [id, shape]
    }))
  }
  return map
}
