import { CORE_VERSION, TRACK_NAMES } from './catalog.js'
const key = (id) => `techmen:training:${id}`
export const freshProgress = (track) => ({
  version: CORE_VERSION,
  track,
  index: 0,
  done: [],
  skipped: [],
  status: 'active',
  eventId: '',
})
export function readProgress(storage, id) {
  try {
    const p = JSON.parse(storage.getItem(key(id)))
    if (
      !p ||
      p.version !== CORE_VERSION ||
      !Object.hasOwn(TRACK_NAMES, p.track) ||
      !Number.isInteger(p.index) ||
      p.index < 0 ||
      !Array.isArray(p.done) ||
      !Array.isArray(p.skipped) ||
      !['active', 'paused'].includes(p.status) ||
      p.done.some((s) => typeof s !== 'string')
    )
      return null
    return p
  } catch {
    return null
  }
}
export function writeProgress(storage, id, p) {
  try {
    storage.setItem(key(id), JSON.stringify(p))
    return true
  } catch {
    return false
  }
}
export function advance(p, steps, completed) {
  const id = steps[p.index]?.id
  if (!id) return p
  return {
    ...p,
    index: Math.min(p.index + 1, steps.length),
    done: completed ? [...new Set([...p.done, id])] : p.done,
    skipped: completed
      ? p.skipped.filter((s) => s !== id)
      : [...new Set([...p.skipped, id])],
  }
}
export const coreComplete = (p, steps) =>
  steps.some((s) => s.core) &&
  steps.filter((s) => s.core).every((s) => p.done.includes(s.id))

// Keep the same lesson when a later release inserts or reorders guide pages.
export function positionFor(progress, steps) {
  if (progress.stepId === null) return steps.length
  const found = steps.findIndex((step) => step.id === progress.stepId)
  return found >= 0 ? found : Math.min(progress.index, steps.length)
}
