// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import MatchBrief from '../src/scouting/MatchBrief'
import ObservationBrowser, { disputedMatches } from '../src/scouting/ObservationBrowser'
let host, root
beforeEach(() => { globalThis.React = React; globalThis.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
const render = async view => act(async () => root.render(view))
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)
const field = text => [...host.querySelectorAll('label')].find(l => l.firstChild?.textContent === text)?.querySelector('input,textarea,select')
async function input(el, value) { await act(async () => { Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }) }
const click = async text => act(async () => button(text).click())
const draft = { match: 'qm42', ours: '5669 101 202', opponents: '303 404 505', roles: 'Initial plan' }
const props = { uid: 'm', eventId: 'e', eventTitle: 'Test', records: [], cachedAt: '2026-10-21T16:00:00Z', pending: 0, reviewer: 'Scout' }
it('restores a scoped brief, saves changes, and invalidates review after plan or evidence changes', async () => {
  const store = { getDraft: vi.fn().mockResolvedValue(draft), saveDraft: vi.fn().mockResolvedValue() }
  await render(React.createElement(MatchBrief, { ...props, store }))
  expect(store.getDraft).toHaveBeenCalledWith('m','e','match-brief')
  expect(field('Brief match').value).toBe('qm42')
  expect(button('Export reviewed brief JSON').disabled).toBe(true)
  await click('Confirm lineup and review brief')
  expect(button('Export reviewed brief JSON').disabled).toBe(false)
  await input(field('Robot roles and priorities'), 'Updated plan')
  expect(store.saveDraft).toHaveBeenLastCalledWith('m','e','match-brief', expect.objectContaining({ roles: 'Updated plan' }))
  expect(button('Export printable brief').disabled).toBe(true)
  await click('Confirm lineup and review brief'); expect(button('Export printable brief').disabled).toBe(false)
  await render(React.createElement(MatchBrief, { ...props, pending: 1, store }))
  expect(button('Export printable brief').disabled).toBe(true)
  expect(host.textContent).toContain('Review again before exporting')
})
it('blocks editing after a failed draft read and blocks review after a failed write, with recovery', async () => {
  const store = { getDraft: vi.fn().mockRejectedValueOnce(new Error('read denied')).mockResolvedValue(draft), saveDraft: vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue() }
  await render(React.createElement(MatchBrief, { ...props, store }))
  expect(host.querySelector('fieldset').disabled).toBe(true)
  await click('Retry brief load'); expect(host.querySelector('fieldset').disabled).toBe(false)
  await input(field('Robot roles and priorities'), 'Unsaved')
  expect(host.textContent).toContain('Brief is not saved')
  expect(button('Confirm lineup and review brief').disabled).toBe(true)
  await click('Retry brief save')
  expect(button('Confirm lineup and review brief').disabled).toBe(false)
})
it('does not mark the latest draft saved when only an earlier write has finished', async () => {
  let releaseFirst, releaseLast
  const store = { getDraft: vi.fn().mockResolvedValue(draft), saveDraft: vi.fn().mockImplementationOnce(() => new Promise(r => { releaseFirst = r })).mockImplementationOnce(() => new Promise(r => { releaseLast = r })) }
  await render(React.createElement(MatchBrief, { ...props, store }))
  await input(field('Robot roles and priorities'), 'First'); await input(field('Robot roles and priorities'), 'Last')
  await act(async () => releaseFirst()); expect(button('Confirm lineup and review brief').disabled).toBe(true)
  await act(async () => releaseLast()); expect(button('Confirm lineup and review brief').disabled).toBe(false)
})
it('finds old observations beyond page 30 and exposes authors without granting another scout correction', async () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ id: String(i).padStart(3,'0'), event_id: 'e', member_id: i === 64 ? 'me' : 'other', team_number: 5669, kind: 'observation', match_key: `2026test_qm${i+1}`, version: 1, updated_at: '2026-10-21', payload: { notes: i === 64 ? 'Old recovery note' : 'Observed', answers: {} } }))
  const onEdit = vi.fn()
  await render(React.createElement(ObservationBrowser, { records: rows, confirmedRecords: rows, team: '', onTeam: () => {}, memberName: x => x, nameFor: () => 'Techmen', canEdit: r => r.member_id === 'me', onEdit, revisions: [] }))
  expect(host.querySelectorAll('article')).toHaveLength(30)
  await click('Next observations'); await click('Next observations'); expect(host.querySelectorAll('article')).toHaveLength(5)
  await input(field('Search observations'), 'qm65')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.textContent).toContain('Old recovery note')
  await click('Correct observation'); expect(onEdit).toHaveBeenCalledWith(rows[64])
  await input(field('Search observations'), 'qm1'); expect(button('Correct observation')).toBeUndefined()
  await input(field('Search observations'), 'missing'); expect(host.textContent).toContain('No observations match')
  await click('Reset observation filters'); expect(host.querySelectorAll('article')).toHaveLength(30)
})
it('groups normalized current matches for dispute review while excluding prior footage and superseded answers', () => {
  const row = (id, member, answer, extra={}) => ({ id, event_id:'e', member_id: member, team_number:5669, kind:'observation', match_key:'qm1', version:1, payload:{ answers:{trench:answer}}, ...extra })
  const rows = [row('a','s1','yes'), row('b','s2','no',{ match_key:'2026test_qm1' }), row('c','s3','did_not_see')]
  expect([...disputedMatches(rows)]).toEqual(['e:5669:qm1'])
  expect(disputedMatches([rows[0], {...rows[1], payload: { ...rows[1].payload, source_scope:'external', source_event:'2026test' }}]).size).toBe(0)
  expect(disputedMatches([...rows, {...rows[1], version:2, payload:{answers:{trench:'yes'}}}]).size).toBe(0)
})

it('offers a separate review filter for unverified video scope, excluding it from current evidence', async () => {
  const base = {id:'legacy',event_id:'e',member_id:'me',team_number:5669,kind:'observation',match_key:'qm1',version:1,payload:{source:'video',answers:{trench:'yes'}}}
  const rows = [base,{...base,id:'live',match_key:'qm2',payload:{source:'live',answers:{trench:'no'}}}]
  await render(React.createElement(ObservationBrowser,{records:rows,confirmedRecords:rows,team:'',onTeam:()=>{},memberName:x=>x,nameFor:()=>'',canEdit:()=>true,onEdit:()=>{},revisions:[]}))
  await input(field('Evidence source'),'unverified')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.querySelector('article').textContent).toContain('event scope not recorded')
  await input(field('Evidence source'),'current')
  expect(host.querySelectorAll('article')).toHaveLength(1)
  expect(host.querySelector('article').textContent).toContain('Live match')
  expect(host.querySelector('article').textContent).toContain('No')
})
