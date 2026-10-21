// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import PickLists from '../src/scouting/PickLists.jsx'
import SchedulePlanner from '../src/scouting/SchedulePlanner.jsx'
let host, root
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
const button = text => [...host.querySelectorAll('button')].find(row => row.textContent === text)
beforeEach(() => { globalThis.React=React; globalThis.IS_REACT_ACT_ENVIRONMENT=true; host=document.createElement('div');document.body.append(host);root=createRoot(host) })
afterEach(async () => { await act(async () => root.unmount());host.remove();vi.restoreAllMocks() })

it('keeps pick-list edits and comparison closed after a read failure, then restores the original draft', async () => {
  const draft = { entries: [{ team: 4414, tier: 2, rank: 1 }], baseVersion: 2, recordId: 'existing-list' }
  const store = { getDraft: vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(draft), saveDraft: vi.fn() }
  const records = [{ id: 'team', event_id: 'event', kind: 'team', team_number: 5669, payload: { name: 'Techmen' } }, { id: 'existing-list', kind: 'pick_list', member_id: 'member', version: 2, payload: { entries: [{ team: 5669, tier: 1, rank: 1 }] } }]
  await act(async () => root.render(React.createElement(PickLists, { records, uid: 'member', eventId: 'event', store, onSave: vi.fn(), nameFor: () => '' })))
  await settle()
  expect(host.textContent).toContain('Retry before editing')
  expect(button('Save pick list').disabled).toBe(true)
  expect(host.querySelector('select[aria-label="Tier for 5669"]').disabled).toBe(true)
  expect(host.querySelector('select[aria-label="Team 1"]')).toBeNull()
  await act(async () => button('Retry loading pick-list draft').click());await settle()
  expect(host.querySelector('select[aria-label="Tier for 4414"]').value).toBe('2')
  expect(host.querySelector('select[aria-label="Tier for 4414"]').disabled).toBe(false)
  expect(button('Save pick list').disabled).toBe(false)
  expect(store.saveDraft).not.toHaveBeenCalled()
})

it('protects unread planner configuration and only announces the most recent durable draft', async () => {
  const draft = { text: 'qm1,5669', matches: [], scouts: [], unavailable: {}, targets: '', start: '0', end: '', mode: 'live', source: 'manual', fetchedAt: null }
  let first, second
  const one = new Promise(resolve => {first=resolve}), two = new Promise(resolve => {second=resolve})
  const store = { getDraft: vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(draft), saveDraft: vi.fn().mockReturnValueOnce(one).mockReturnValueOnce(two) }
  await act(async () => root.render(React.createElement(SchedulePlanner, { store, uid: 'member', eventId: 'event', members: [], records: [], imported: null, onSaveBatch: vi.fn() })))
  await settle()
  expect(host.textContent).toContain('Retry before editing')
  expect(host.querySelector('textarea').matches(':disabled')).toBe(true)
  await act(async () => button('Retry loading planner draft').click());await settle()
  expect(host.querySelector('textarea').value).toBe('qm1,5669')
  expect(host.querySelector('textarea').matches(':disabled')).toBe(false)
  async function input(value) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(host.querySelector('textarea'),value);host.querySelector('textarea').dispatchEvent(new Event('input',{bubbles:true})) }) }
  await input('qm2,4414');await input('qm3,1538')
  await act(async () => first());await settle()
  expect(host.textContent).toContain('Saving planner draft…')
  expect(host.textContent).not.toContain('Planner draft saved on this device.')
  await act(async () => second());await settle()
  expect(host.textContent).toContain('Planner draft saved on this device.')
  expect(store.saveDraft.mock.calls[1][3].text).toBe('qm3,1538')
})
