// @vitest-environment jsdom
// DOM + IndexedDB emulation only. No claim about layout, native dialogs,
// service workers, mobile browsers, or real Supabase/Discord is made here.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
vi.mock('../src/supabase', async () => import('../src/dev/fixture/client.js'))
import ScoutingPage from '../src/ScoutingPage.jsx'
import { fixture, supabase } from '../src/dev/fixture/client.js'
import { IDS } from '../src/dev/fixture/personas.js'
import { createScoutingStore } from '../src/scouting/storage.js'
import { _resetWriteVia } from '../src/writeVia.js'

const EVENT = '16000000-0000-4000-8000-000000000001'
let host, root, online
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function settle(check, message = 'condition') {
  for (let i = 0; i < 100; i++) {
    await act(async () => { await pause(10) })
    if (check()) return
  }
  throw new Error(`Timed out waiting for ${message}: ${host.textContent}`)
}
const buttons = text => [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === text)
async function click(button) {
  expect(button).toBeTruthy(); expect(button.disabled).toBe(false)
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await pause(1) })
}
async function input(element, value) {
  const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true })); await pause(1)
  })
}
async function mount(persona = 'student', roles) {
  fixture.setPersona(persona)
  const { data } = await supabase.auth.getSession()
  const actualRoles = roles ?? fixture.rows('member_roles').filter(r => r.member_id === IDS[persona]).map(r => r.role)
  root = createRoot(host)
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [`/scouting/${EVENT}`] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/scouting/:eventId', element: React.createElement(ScoutingPage, { session: data.session, hasRole: r => actualRoles.includes(r) }) })))))
  await settle(() => host.querySelector('[data-scout-page="event"]') || host.textContent.includes('available to student and staff accounts') || host.textContent.includes('not set up yet'), 'event render')
}
async function unmount() { if (root) { await act(async () => root.unmount()); root = null } }
function setOnline(value) {
  online = value
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}
function failReads() {
  return vi.spyOn(supabase, 'from').mockImplementation(() => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => q, range: () => q,
      then: (resolve, reject) => Promise.resolve({ data: null, error: { message: 'Network is offline', code: '' } }).then(resolve, reject) }
    return q
  })
}
beforeEach(() => {
  globalThis.React = React // Standalone Vitest uses the classic JSX transform.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.indexedDB = new IDBFactory()
  // jsdom does not implement native dialog focus and top-layer behavior.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  online = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  fixture.setMigrations('all'); fixture.reset(); fixture.setLatency(0); _resetWriteVia()
  host = document.createElement('div'); document.body.append(host)
})
afterEach(async () => { await unmount(); host.remove(); vi.restoreAllMocks() })

describe('rendered scouting with IndexedDB emulation', () => {
  it('restores a draft, retains an offline observation across remount, then syncs exactly once', async () => {
    await mount()
    await click(buttons('Scout match')[0])
    await settle(() => host.querySelector('dialog textarea'), 'observation draft')
    await click([...host.querySelectorAll('dialog fieldset')][0].querySelectorAll('button')[2])
    await input(host.querySelector('dialog textarea'), 'Trench was obscured by another robot.')
    await settle(() => host.textContent.includes('Draft saved on this device'), 'durable draft')
    await unmount(); await mount()
    await click(buttons('Scout match')[0])
    await settle(() => host.querySelector('dialog textarea')?.value === 'Trench was obscured by another robot.', 'restored draft')
    expect(host.querySelector('dialog fieldset button[aria-pressed="true"]').textContent).toBe('Did not see')
    const spy = failReads()
    await act(async () => setOnline(false))
    await click(buttons('Save observation')[0])
    await settle(() => !host.querySelector('dialog'), 'local save')
    const store = await createScoutingStore()
    let queue = await store.listQueue(IDS.student, EVENT)
    expect(queue).toHaveLength(1); expect(queue[0].status).toBe('local')
    expect(queue[0].args.p_payload.answers).toEqual({ trench: 'did_not_see' })
    const operation = queue[0].id
    await unmount(); await mount()
    await settle(() => host.textContent.includes('1 waiting to sync'), 'offline queue restore')
    expect(host.textContent).toContain('Trench was obscured by another robot.')
    spy.mockRestore()
    await act(async () => setOnline(true))
    await settle(() => host.textContent.includes('All saved work synced'), 'reconnection sync')
    queue = await store.listQueue(IDS.student, EVENT)
    expect(queue[0]).toMatchObject({ id: operation, status: 'synced' })
    expect(fixture.rows('scouting_records').filter(r => r.id === queue[0].record_id)).toHaveLength(1)
    await click(buttons('Sync now')[0])
    expect(fixture.rows('scouting_records').filter(r => r.id === queue[0].record_id)).toHaveLength(1)
    store.close()
  })

  it('does not expose the previous account draft or queued proposal after an account switch', async () => {
    const store = await createScoutingStore()
    await store.enqueue(IDS.student, EVENT, { kind: 'message', team_number: 5669, payload: { text: 'Private unsent scout proposal', status: 'open', request_delivery: false }, version: 0 })
    await act(async () => setOnline(false))
    await mount('student')
    await click(buttons('Pit messages')[0])
    expect(host.textContent).toContain('Private unsent scout proposal')
    await unmount(); await mount('student2')
    await click(buttons('Pit messages')[0])
    expect(host.textContent).not.toContain('Private unsent scout proposal')
    expect(host.textContent).toContain('All saved work synced')
    expect(await store.listQueue(IDS.student, EVENT)).toHaveLength(1)
    expect(await store.listQueue(IDS.student2, EVENT)).toHaveLength(0)
    store.close()
  })

  it('rejects a parent-only view while allowing the same account when it also has a staff role', async () => {
    await mount('parent')
    expect(buttons('New observation')).toHaveLength(0)
    expect(host.textContent).toContain('available to student and staff accounts')
    await unmount()
    fixture.insert('member_roles', { member_id: IDS.parent, role: 'mentor' })
    await mount('parent')
    expect(buttons('New observation')).toHaveLength(1)
    expect(host.textContent).toContain('Manage event')
  })

  it('shows setup missing rather than claiming an empty event is ready', async () => {
    fixture.setMigrations('none')
    await mount()
    expect(host.textContent).toContain('Scouting is not set up yet')
    expect(buttons('New observation')).toHaveLength(0)
    await unmount(); fixture.setMigrations('all'); await mount()
    expect(buttons('New observation')).toHaveLength(1)
  })

  it('rolls back a failed replacement transaction and claims once across two IDB connections', async () => {
    const store = await createScoutingStore(), other = await createScoutingStore()
    const proposal = { id: crypto.randomUUID(), kind: 'message', team_number: 5669, payload: { text: 'Keep this if disk fails', status: 'open' } }
    const op = await store.enqueue(IDS.student, EVENT, proposal)
    const claims = await Promise.all([store.claim(IDS.student, EVENT, op.id), other.claim(IDS.student, EVENT, op.id)])
    expect(claims.filter(Boolean)).toHaveLength(1)
    await store.finish(IDS.student, EVENT, op.id, claims.find(Boolean).lease, { status: 'failed', error: { code: '22023' } })
    const original = store.backend.transaction.bind(store.backend)
    const failing = vi.spyOn(store.backend, 'transaction').mockImplementation((names, mode, fn) => original(names, mode, tx => fn({ ...tx,
      put: async (...args) => { await tx.put(...args); throw new Error('simulated quota failure during transaction') },
    })))
    await expect(store.replaceConflict(IDS.student, EVENT, op.id, proposal)).rejects.toThrow('simulated quota failure')
    failing.mockRestore()
    expect((await other.listQueue(IDS.student, EVENT)).map(x => x.id)).toEqual([op.id])
    const replacement = await store.replaceConflict(IDS.student, EVENT, op.id, { ...proposal, id: crypto.randomUUID(), version: 3 })
    expect((await other.listQueue(IDS.student, EVENT)).map(x => x.id)).toEqual([replacement.id])
    expect(replacement.args.p_expected_version).toBe(3)
    store.close(); other.close()
  })

  it('never lets an older synced queue receipt replace newer downloaded evidence', async () => {
    const store = await createScoutingStore()
    const row = fixture.rows('scouting_records').find(r => r.kind === 'observation' && r.member_id === IDS.student2)
    const op = await store.enqueue(IDS.student2, EVENT, row), claimed = await store.claim(IDS.student2, EVENT, op.id)
    await store.finish(IDS.student2, EVENT, op.id, claimed.lease, { status: 'synced', result: { ...row, payload: { ...row.payload, notes: 'Obsolete queue-only note' } } })
    fixture.patch('scouting_records', { id: row.id }, { version: 2, payload: { ...row.payload, notes: 'Corrected server evidence' } })
    await mount('student2')
    expect(host.textContent).toContain('Corrected server evidence')
    expect(host.textContent).not.toContain('Obsolete queue-only note')
    store.close()
  })

  it('keeps a rejected proposal until the reviewed replacement is atomically stored', async () => {
    const store = await createScoutingStore()
    const existing = fixture.rows('scouting_records').find(r => r.kind === 'pick_list' && r.member_id === IDS.student)
    const local = await store.enqueue(IDS.student, EVENT, { ...existing, payload: { entries: [{ team: 4414, tier: 3, rank: 1 }] }, version: 0 })
    const claimed = await store.claim(IDS.student, EVENT, local.id)
    await store.finish(IDS.student, EVENT, local.id, claimed.lease, { status: 'conflict', error: { code: '40001', message: 'Newer server version' } })
    await mount()
    await click(buttons('Review conflict')[0])
    expect(host.textContent).toContain('Your saved proposal')
    expect(host.textContent).toContain('Current server version 1')
    await click(buttons('Apply my reviewed proposal')[0])
    await settle(() => host.textContent.includes('All saved work synced'), 'reviewed conflict sync')
    const queue = await store.listQueue(IDS.student, EVENT)
    expect(queue).toHaveLength(1); expect(queue[0].id).not.toBe(local.id)
    expect(queue[0]).toMatchObject({ status: 'synced', result: { version: 2 } })
    expect(fixture.rows('scouting_records').find(r => r.id === existing.id).payload.entries).toEqual([{ team: 4414, tier: 3, rank: 1 }])
    store.close()
  })
})
