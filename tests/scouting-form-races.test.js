// @vitest-environment jsdom
// Deferred durable writes make the timing oracle independent of IndexedDB speed.
// This is DOM emulation, not a claim about phone keyboards or native dialogs.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import RecordForm from '../src/scouting/RecordForm.jsx'
let root, host
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b }); return { promise, resolve, reject } }
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function type(selector, value) {
  await act(async () => {
    const field = host.querySelector(selector), prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function mount(store, onSave = vi.fn(), onClose = vi.fn()) {
  await act(async () => root.render(React.createElement(RecordForm, { kind: 'observation', team: 5669, members: [], store, uid: 'member', eventId: 'event', onSave, onClose })))
  await settle()
}
beforeEach(() => { globalThis.React=React; globalThis.IS_REACT_ACT_ENVIRONMENT=true; HTMLDialogElement.prototype.showModal=function(){this.open=true}; HTMLDialogElement.prototype.close=function(){this.open=false}; host=document.createElement('div');document.body.append(host);root=createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

it('does not say the latest draft is saved when only an earlier write has finished', async () => {
  const first=deferred(), second=deferred(), store={getDraft:async()=>null, saveDraft:vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)}
  await mount(store)
  await type('textarea','First note')
  await type('textarea','Second note')
  expect(host.textContent).toContain('Saving draft…')
  await act(async()=>first.resolve());await settle()
  expect(store.saveDraft).toHaveBeenCalledTimes(2)
  expect(host.textContent).toContain('Saving draft…')
  expect(host.textContent).not.toContain('Draft saved on this device')
  await act(async()=>second.resolve());await settle()
  expect(host.textContent).toContain('Draft saved on this device')
  expect(store.saveDraft.mock.calls[1][3].payload.notes).toBe('Second note')
})

it('freezes fields and rejects repeated submission until the exact captured draft is committed', async () => {
  const durable=deferred(), onSave=vi.fn(()=>durable.promise), onClose=vi.fn()
  const store={getDraft:async()=>null, saveDraft:vi.fn(async()=>{}), deleteDraft:vi.fn(async()=>{})}
  await mount(store,onSave,onClose)
  await type('input[placeholder="qm1"]','qm20');await type('textarea','Visible attempt before final horn')
  await act(async()=>{
    host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
    host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
  });await settle()
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(host.querySelector('textarea').matches(':disabled')).toBe(true)
  expect(host.querySelector('button[aria-label="Close form"]').disabled).toBe(true)
  // Even an artificially dispatched change cannot race the pending commit.
  await type('textarea','A late edit after submit')
  expect(store.saveDraft).toHaveBeenCalledTimes(2)
  expect(onSave.mock.calls[0][0].payload.notes).toBe('Visible attempt before final horn')
  expect(store.deleteDraft).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled()
  await act(async()=>durable.resolve());await settle()
  expect(store.deleteDraft).toHaveBeenCalledTimes(1);expect(onClose).toHaveBeenCalledTimes(1)
})

it('keeps an unsuccessful save editable with the original draft intact', async () => {
  const onSave=vi.fn(async()=>{throw new Error('Disk full')}), onClose=vi.fn()
  const store={getDraft:async()=>null,saveDraft:vi.fn(async()=>{}),deleteDraft:vi.fn(async()=>{})}
  await mount(store,onSave,onClose)
  await type('input[placeholder="qm1"]','qm21');await type('textarea','Keep this failed-save note')
  await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await settle()
  expect(host.textContent).toContain('Disk full')
  expect(host.querySelector('textarea').matches(':disabled')).toBe(false)
  expect(host.querySelector('textarea').value).toBe('Keep this failed-save note')
  expect(store.deleteDraft).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled()
  onSave.mockResolvedValueOnce({id:'saved'})
  await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await settle()
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('refuses to replace an unread existing draft and restores it after an explicit retry', async () => {
  const old = { id: crypto.randomUUID(), version: 0, team_number: '5669', match_key: 'qm45', payload: { source: 'live', answers: { trench: 'did_not_see' }, notes: 'Original unread draft', request_delivery: false, video_url: '' } }
  const store = { getDraft: vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValueOnce(old), saveDraft: vi.fn(), deleteDraft: vi.fn() }
  await mount(store)
  expect(host.textContent).toContain('Retry before editing')
  expect(host.querySelector('textarea')).toBeNull()
  expect(host.querySelector('button[type="submit"]').disabled).toBe(true)
  expect(store.saveDraft).not.toHaveBeenCalled()
  const retry = [...host.querySelectorAll('button')].find(button => button.textContent === 'Retry loading draft')
  await act(async () => retry.click()); await settle()
  expect(host.querySelector('textarea').value).toBe('Original unread draft')
  expect(host.querySelector('button[type="submit"]').disabled).toBe(false)
  expect(host.querySelector('button[aria-pressed="true"]').textContent).toBe('Did not see')
  expect(store.saveDraft).not.toHaveBeenCalled()
})


it('returns focus to the opening control when React removes the dialog', async () => {
  const opener=document.createElement('button');opener.textContent='Open observation';document.body.prepend(opener);opener.focus()
  const store={getDraft:async()=>null,saveDraft:vi.fn(),deleteDraft:vi.fn()}
  try {
    await mount(store);host.querySelector('textarea').focus()
    expect(document.activeElement).toBe(host.querySelector('textarea'))
    await act(async()=>root.unmount())
    expect(document.activeElement).toBe(opener)
  } finally {opener.remove()}
})
