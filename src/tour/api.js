import { writeVia } from '../writeVia.js'
import { isSchemaMissing } from '../schemaMissing.js'
import { CORE_VERSION } from './catalog.js'
export async function recordCore(client, track) {
  const r = await writeVia(client, 'tour_complete_core', {
    p_track: track,
    p_version: CORE_VERSION,
  })
  if (r.error) return { state: isSchemaMissing(r.error) ? 'missing' : 'error' }
  if (!r.data?.member_id || !r.data?.completed_at) return { state: 'error' }
  return { state: 'saved', data: r.data }
}
export async function loadCompletions(client) {
  const r = await client.rpc('tour_completion_overview', {
    p_version: CORE_VERSION,
  })
  if (r.error) return { state: isSchemaMissing(r.error) ? 'missing' : 'error' }
  return { state: 'ok', rows: r.data ?? [] }
}
