import { writeVia } from '../writeVia.js'
import { isSchemaMissing } from '../schemaMissing.js'

const plainError = e => ({ code: e?.code || 'NETWORK_ERROR', message: e?.message || 'Could not reach the server. Your local save is safe.' })
const noLongerCurrent = () => ({ code: 'ACCOUNT_CHANGED', message: 'Your account changed. Reopen scouting with the account that saved this record.' })
async function current(client, memberId, isCurrent) {
  if (!isCurrent()) return false
  const { data, error } = await client.auth.getSession()
  return !error && data?.session?.user?.id === memberId && isCurrent()
}
export async function saveScoutingRecord({ store, memberId, eventId, record }) {
  // Resolution means the IndexedDB transaction committed. No optimistic success
  // is shown before durable storage acknowledges the write.
  return store.enqueue(memberId, eventId, record)
}

export async function syncScoutingQueue({ store, client, memberId, eventId, isCurrent = () => true }) {
  if (!await current(client, memberId, isCurrent)) return store.listQueue(memberId, eventId)
  const queue = await store.listQueue(memberId, eventId)
  for (const candidate of queue) {
    if (!await current(client, memberId, isCurrent)) break
    const op = await store.claim(memberId, eventId, candidate.id)
    if (!op) continue
    if (!await current(client, memberId, isCurrent)) {
      await store.finish(memberId, eventId, op.id, op.lease, { status: 'failed', error: noLongerCurrent(), retryable: true })
      break
    }
    let saved
    try {
      const response = await writeVia(client, 'scouting_save', op.args)
      if (response.error) throw response.error
      // Legacy writeVia returns direct/null when its function is absent and
      // there is no fallback. New scouting records MUST NOT mistake that for a save.
      if (response.via !== 'function') throw { code: 'PGRST202', message: 'Scouting is not set up yet. Your record is saved locally. Reload after setup, then retry.' }
      saved = response.data
      if (!saved || saved.id !== op.record_id || saved.event_id !== eventId || !Number.isInteger(saved.version) || saved.version < 1) {
        throw { code: 'INVALID_RESPONSE', message: 'The server did not confirm this record. Retry with the same save ID.' }
      }
      const finished = await store.finish(memberId, eventId, op.id, op.lease, { status: 'synced', result: saved })
      if (!finished) continue // Another tab owns an expired lease now.
    } catch (e) {
      const conflict = e?.code === '40001'
      const permanent = conflict || ['42501', '22023', '23505', '23514', '23503', '22P02'].includes(e?.code)
      await store.finish(memberId, eventId, op.id, op.lease, { status: conflict ? 'conflict' : 'failed', error: plainError(e), retryable: !permanent })
      continue
    }
    // A notification is a separate consequence, never part of "saved".
    if (saved.payload?.request_delivery === true && ['message', 'observation'].includes(saved.kind) && await current(client, memberId, isCurrent)) {
      try {
        if (!client.functions?.invoke) throw { code: 'NOT_CONFIGURED', message: 'Notification delivery is not configured.' }
        const { data, error } = await client.functions.invoke('scouting-dispatch', { body: { record_id: saved.id, version: saved.version } })
        if (error) throw error
        await store.setDelivery(memberId, eventId, op.id, { status: data?.status || data?.delivery?.status || 'queued', ...(data?.delivery ?? {}) })
      } catch (e) {
        // Unknown transport outcome can mean Discord received it. Never retry
        // automatically, and never claim delivery without server confirmation.
        await store.setDelivery(memberId, eventId, op.id, { status: e?.code === 'NOT_CONFIGURED' ? 'not_configured' : 'uncertain', error: plainError(e) })
      }
    }
  }
  return store.listQueue(memberId, eventId)
}

// Exact counts and an explicit limit prevent PostgREST row caps from silently
// turning a large competition into a partial data set. Stable unique ordering
// also makes each page deterministic. A size change while paging requires a
// refresh; it is never presented as a complete ranking input.
export async function readScoutingPages(client, table, { eventId, columns = '*', order = ['id'], limit = 100000 } = {}) {
  const rows = [], seen = new Set(); let total = null
  while (true) {
    let q = client.from(table).select(columns, { count: 'exact' })
    if (eventId) q = q.eq(table === 'events' ? 'id' : 'event_id', eventId)
    for (const column of order) q = q.order(column, { ascending: true })
    const response = await q.range(rows.length, rows.length + 499)
    if (response.error) throw response.error
    if (!Number.isInteger(response.count) || !Array.isArray(response.data)) throw { code: 'INCOMPLETE_DATA', message: 'The server could not confirm a complete scouting data set. Refresh before using rankings.' }
    if (response.count > limit) throw { code: 'DATA_LIMIT', message: `This event exceeds the ${limit.toLocaleString()}-row offline limit. No partial ranking was loaded.` }
    if (total !== null && total !== response.count) throw { code: 'DATA_CHANGED', message: 'Scouting data changed while loading. Refresh to load a complete set.' }
    total = response.count
    for (const row of response.data) {
      const key = JSON.stringify(order.map(column => row[column]))
      if (seen.has(key)) throw { code: 'DATA_CHANGED', message: 'Scouting data changed while loading. Refresh to load a complete set.' }
      seen.add(key); rows.push(row)
    }
    if (rows.length === total) return rows
    if (!response.data.length || rows.length > total) throw { code: 'INCOMPLETE_DATA', message: 'The server returned an incomplete scouting data set. Refresh before using rankings.' }
  }
}

export async function loadScoutingEvent({ store, client, memberId, eventId, isCurrent = () => true }) {
  if (!await current(client, memberId, isCurrent)) return { records: [], delivery: [], revisions: [], members: [], event: null, error: noLongerCurrent(), offline: false, missing: false }
  try {
    const requests = await Promise.all([
      readScoutingPages(client, 'scouting_records', { eventId }),
      readScoutingPages(client, 'scouting_delivery', { eventId }),
      readScoutingPages(client, 'scouting_revisions', { eventId, order: ['record_id', 'version'] }),
      readScoutingPages(client, 'events', { eventId }),
      readScoutingPages(client, 'profiles', { columns: 'id,full_name,nickname' }),
    ])
    if (!await current(client, memberId, isCurrent)) throw noLongerCurrent()
    const value = { records: requests[0], delivery: requests[1], revisions: requests[2], event: requests[3][0] ?? null, members: requests[4] }
    const cached = await store.putCache(memberId, eventId, value)
    return { ...value, cachedAt: cached.cachedAt, offline: false, missing: false, error: null }
  } catch (e) {
    if (e?.code === 'ACCOUNT_CHANGED' || !await current(client, memberId, isCurrent)) return { records: [], delivery: [], revisions: [], members: [], event: null, error: noLongerCurrent(), offline: false, missing: false }
    // A denied or missing schema read is not an offline event. Do not resurrect
    // old server data after a definitive refusal or before the migration exists.
    const missing = isSchemaMissing(e)
    const denied = e?.code === '42501' || e?.code === 'PGRST301'
    const cached = missing || denied ? null : await store.getCache(memberId, eventId)
    return { records: [], delivery: [], revisions: [], members: [], event: null, ...(cached?.value ?? {}), cachedAt: cached?.cachedAt ?? null,
      offline: !!cached, missing, error: plainError(e) }
  }
}
