import { matchIdentity } from './provenance.js'
import { recoveryOperations, planRecovery } from './recovery.js'
// IndexedDB transactions make queue claims atomic across tabs. A request can be
// retried after a lease expires, using the SAME operation id and immutable body;
// the server supplies the exactly-once logical write guarantee.
const clone = value => structuredClone(value)
const scopeKey = (member, event) => `${member}:${event}`
function requireScope(member, event) {
  if (!member || !event) throw new Error('A signed-in member and event are required.')
}
const error = (code, message) => Object.assign(new Error(message), { code })
function request(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
}
function idbBackend(db) {
  return {
    close: () => db.close(),
    async transaction(names, mode, fn) {
      const tx = db.transaction(names, mode)
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error || new Error('Local storage failed.'))
        tx.onabort = () => reject(tx.error || new Error('Local save was interrupted.'))
      })
      // Attach a rejection handler immediately, including failures before fn ends.
      done.catch(() => {})
      const api = {
        get: (store, key) => request(tx.objectStore(store).get(key)),
        put: (store, value) => request(tx.objectStore(store).put(value)),
        remove: (store, key) => request(tx.objectStore(store).delete(key)),
        all: store => request(tx.objectStore(store).getAll()),
      }
      try { const result = await fn(api); await done; return result }
      catch (e) { try { tx.abort() } catch { /* already ended */ } await done.catch(() => {}); throw e }
    },
  }
}

export async function createScoutingStore({ indexedDB = globalThis.indexedDB, dbName = 'techmen-scouting-v1', now = () => Date.now(), uuid = () => crypto.randomUUID() } = {}) {
  if (!indexedDB) throw error('LOCAL_STORAGE_UNAVAILABLE', 'This browser cannot save scouting offline. Use a browser with local storage enabled.')
  const open = indexedDB.open(dbName, 1)
  open.onupgradeneeded = () => {
    for (const name of ['operations', 'drafts', 'cache']) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath: 'key' })
  }
  const db = await new Promise((resolve, reject) => {
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(error('LOCAL_STORAGE_BLOCKED', 'Close older scouting tabs and try again.'))
  })
  db.onversionchange = () => db.close()
  return new ScoutingStore(idbBackend(db), { now, uuid })
}

// The transaction backend is injectable for deterministic failure/race tests.
// Production always uses the IndexedDB backend above; no memory fallback can
// make a failed durable save look successful.
export class ScoutingStore {
  constructor(backend, { now = () => Date.now(), uuid = () => crypto.randomUUID() } = {}) {
    this.backend = backend; this.now = now; this.uuid = uuid
  }
  close() { this.backend.close?.() }
  async enqueue(memberId, eventId, record) {
    return (await this.enqueueBatch(memberId, eventId, [record]))[0]
  }
  // A reviewed assignment plan lands entirely or not at all on this device.
  // Server writes remain individual, versioned operations with visible outcomes.
  async enqueueBatch(memberId, eventId, records) {
    requireScope(memberId, eventId)
    if (!Array.isArray(records) || !records.length || records.length > 6000) throw error('INVALID_BATCH', 'Choose between 1 and 6000 records.')
    const scope = scopeKey(memberId, eventId)
    const operations = records.map(record => {
      const id = this.uuid(), recordId = record.id || this.uuid()
      return { key: `${scope}:${id}`, id, member_id: memberId, event_id: eventId, record_id: recordId,
        args: { p_actor: memberId, p_id: recordId, p_event: eventId, p_kind: record.kind, p_team: record.team_number ?? null,
          p_match: record.match_key || null, p_payload: clone(record.payload), p_expected_version: record.version ?? 0, p_operation: id },
        status: 'local', createdAt: this.now(), updatedAt: this.now(), attempts: 0, error: null, result: null }
    })
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const all = (await tx.all('operations')).filter(o => o.member_id === memberId && o.event_id === eventId && o.status !== 'synced')
      for (const operation of operations) {
        if (all.some(o => o.record_id === operation.record_id)) throw error('PENDING_RECORD', 'This record already has an unsynchronized edit. Resolve or synchronize it before saving another version.')
        const a = operation.args
        if (a.p_kind === 'assignment' && a.p_expected_version === 0 && all.some(o => o.args.p_kind === 'assignment' && matchIdentity({ match_key: o.args.p_match, payload: o.args.p_payload }) === matchIdentity({ match_key: a.p_match, payload: a.p_payload }) && o.args.p_payload.assignee === a.p_payload.assignee && o.args.p_payload.status !== 'cancelled')) throw error('PENDING_ASSIGNMENT', 'A queued assignment already uses this scout in this match. Sync and review the plan again.')
        all.push(operation)
      }
      for (const operation of operations) await tx.put('operations', operation)
      return clone(operations)
    })
  }
  async replaceConflict(memberId, eventId, operationId, record) {
    requireScope(memberId, eventId)
    const id = this.uuid(), recordId = record.id || this.uuid(), scope = scopeKey(memberId, eventId)
    const replacement = { key: `${scope}:${id}`, id, member_id: memberId, event_id: eventId, record_id: recordId,
      args: { p_actor: memberId, p_id: recordId, p_event: eventId, p_kind: record.kind, p_team: record.team_number ?? null,
        p_match: record.match_key || null, p_payload: clone(record.payload), p_expected_version: record.version ?? 0, p_operation: id },
      status: 'local', createdAt: this.now(), updatedAt: this.now(), attempts: 0, error: null, result: null }
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const key = `${scope}:${operationId}`, old = await tx.get('operations', key)
      if (!old || !['conflict', 'failed'].includes(old.status)) throw error('REPLACE_REFUSED', 'Only a rejected proposal can be replaced after review.')
      if (old.args.p_kind !== record.kind) throw error('REPLACE_REFUSED', 'A reviewed proposal must keep its record type.')
      const other = (await tx.all('operations')).find(o => o.key !== key && o.member_id === memberId && o.event_id === eventId && o.record_id === recordId && o.status !== 'synced')
      if (other) throw error('PENDING_RECORD', 'Resolve the other pending edit for this record first.')
      // Both changes commit together. A quota error cannot delete the proposal.
      await tx.put('operations', replacement)
      await tx.remove('operations', key)
      return clone(replacement)
    })
  }
  async listQueue(memberId, eventId) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['operations'], 'readonly', async tx => (await tx.all('operations'))
      .filter(o => o.member_id === memberId && o.event_id === eventId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)))
  }
  async claim(memberId, eventId, operationId, leaseMs = 30000) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const key = `${scopeKey(memberId, eventId)}:${operationId}`, op = await tx.get('operations', key)
      if (!op || (!['local', 'syncing'].includes(op.status) && !(op.status === 'failed' && op.retryable)) || (op.status === 'syncing' && op.leaseUntil > this.now())) return null
      const lease = this.uuid()
      const claimed = { ...op, status: 'syncing', lease, leaseUntil: this.now() + leaseMs, attempts: op.attempts + 1, updatedAt: this.now() }
      await tx.put('operations', claimed)
      return clone(claimed)
    })
  }
  async finish(memberId, eventId, operationId, lease, outcome) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const key = `${scopeKey(memberId, eventId)}:${operationId}`, op = await tx.get('operations', key)
      if (!op || op.status !== 'syncing' || op.lease !== lease) return false
      // Identity and request body cannot be rewritten by completion handlers.
      const next = { ...op, status: outcome.status, error: outcome.error ?? null, result: outcome.result ?? null,
        retryable: !!outcome.retryable, lease: null, leaseUntil: null, updatedAt: this.now() }
      await tx.put('operations', next)
      return true
    })
  }
  async setDelivery(memberId, eventId, operationId, delivery) {
    const key = `${scopeKey(memberId, eventId)}:${operationId}`
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const op = await tx.get('operations', key)
      if (op?.status === 'synced') await tx.put('operations', { ...op, delivery: clone(delivery) })
    })
  }
  async retry(memberId, eventId, operationId) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const key = `${scopeKey(memberId, eventId)}:${operationId}`, op = await tx.get('operations', key)
      if (!op || op.status !== 'failed' || !op.retryable) throw error('RETRY_REFUSED', 'Resolve this edit before retrying. Conflicts never overwrite automatically.')
      const next = { ...op, status: 'local', error: null, updatedAt: this.now() }
      await tx.put('operations', next)
      return next
    })
  }
  async discard(memberId, eventId, operationId) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const key = `${scopeKey(memberId, eventId)}:${operationId}`, op = await tx.get('operations', key)
      if (op?.status === 'syncing') throw error('IN_FLIGHT', 'Wait for this save to finish before discarding it.')
      await tx.remove('operations', key)
    })
  }
  // One read transaction captures receipts, unsynced work, drafts and the last
  // downloaded event together, without ever including another account/event.
  async exportBackup(memberId, eventId) {
    requireScope(memberId, eventId)
    const scope = scopeKey(memberId, eventId), prefix = `${scope}:`
    return this.backend.transaction(['operations', 'drafts', 'cache'], 'readonly', async tx => ({
      format: 'techmen-scouting-device-v1', member_id: memberId, event_id: eventId, captured_at: this.now(),
      operations: (await tx.all('operations')).filter(op => op.member_id === memberId && op.event_id === eventId),
      drafts: (await tx.all('drafts')).filter(row => row.key.startsWith(prefix)).map(row => ({ draft_key: row.key.slice(prefix.length), value: row.value, updated_at: row.updatedAt })),
      cache: (await tx.get('cache', scope)) ?? null,
    }))
  }
  async previewRecovery(memberId, eventId, archive) {
    requireScope(memberId, eventId)
    const operations = recoveryOperations(archive, memberId, eventId)
    return this.backend.transaction(['operations'], 'readonly', async tx => planRecovery(operations,
      (await tx.all('operations')).filter(op => op.member_id === memberId && op.event_id === eventId)))
  }
  async restoreRecovery(memberId, eventId, archive, selectedIds) {
    requireScope(memberId, eventId)
    const operations = recoveryOperations(archive, memberId, eventId)
    if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > 6000 || new Set(selectedIds).size !== selectedIds.length
      || selectedIds.some(id => !operations.some(op => op.id === id))) throw error('RECOVERY_SELECTION', 'Choose pending saves from this backup.')
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const current = (await tx.all('operations')).filter(op => op.member_id === memberId && op.event_id === eventId)
      const plan = planRecovery(operations, current).filter(op => selectedIds.includes(op.id))
      if (plan.some(op => op.state === 'blocked')) throw error('RECOVERY_COLLISION', 'Local work changed or conflicts with this backup. Preview it again; nothing was restored.')
      const restored = []
      for (const op of plan.filter(row => row.state === 'ready')) {
        const row = { key: `${scopeKey(memberId, eventId)}:${op.id}`, id: op.id, record_id: op.record_id, member_id: memberId, event_id: eventId,
          args: op.args, status: 'recovered', recoveredFrom: op.previousStatus, createdAt: this.now(), updatedAt: this.now(), attempts: 0, error: null, result: null }
        await tx.put('operations', row); restored.push(row)
      }
      return clone(restored)
    })
  }
  async releaseRecovered(memberId, eventId, operationId) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['operations'], 'readwrite', async tx => {
      const key = `${scopeKey(memberId, eventId)}:${operationId}`, op = await tx.get('operations', key)
      if (!op || op.status !== 'recovered') throw error('RECOVERY_REFUSED', 'This save is no longer awaiting recovery review. Refresh its status.')
      const next = { ...op, status: 'local', updatedAt: this.now() }
      await tx.put('operations', next)
      return clone(next)
    })
  }
  async saveDraft(memberId, eventId, draftKey, value) {
    requireScope(memberId, eventId)
    const row = { key: `${scopeKey(memberId, eventId)}:${draftKey}`, value: clone(value), updatedAt: this.now() }
    await this.backend.transaction(['drafts'], 'readwrite', tx => tx.put('drafts', row))
    return row
  }
  async getDraft(memberId, eventId, draftKey) {
    requireScope(memberId, eventId)
    const row = await this.backend.transaction(['drafts'], 'readonly', tx => tx.get('drafts', `${scopeKey(memberId, eventId)}:${draftKey}`))
    return row?.value ?? null
  }
  async deleteDraft(memberId, eventId, draftKey) {
    requireScope(memberId, eventId)
    return this.backend.transaction(['drafts'], 'readwrite', tx => tx.remove('drafts', `${scopeKey(memberId, eventId)}:${draftKey}`))
  }
  async putCache(memberId, eventId, value) {
    requireScope(memberId, eventId)
    const row = { key: scopeKey(memberId, eventId), value: clone(value), cachedAt: this.now() }
    await this.backend.transaction(['cache'], 'readwrite', tx => tx.put('cache', row))
    return row
  }
  async getCache(memberId, eventId) {
    requireScope(memberId, eventId)
    return (await this.backend.transaction(['cache'], 'readonly', tx => tx.get('cache', scopeKey(memberId, eventId)))) ?? null
  }
}
