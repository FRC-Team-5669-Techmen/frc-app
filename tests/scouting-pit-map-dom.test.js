// @vitest-environment jsdom
// DOM/IndexedDB emulation; Chromium checks live in the retained scouting spec.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import PitMap from '../src/scouting/PitMap.jsx'
import { createScoutingStore } from '../src/scouting/storage.js'
import { PIT_MAP_DRAFT } from '../src/scouting/pitMap.js'
import { nexusMap } from '../src/dev/fixture/nexus-map.js'
let host, root, store, props
const at = '2026-10-21T08:00:00Z'
const result = { map:nexusMap,event_key:'2026dal',source:'nexus',fetched_at:at }
const pause = () => new Promise(r=>setTimeout(r,0))
async function settle(check) { for(let i=0;i<100;i++){await act(async()=>{await pause()});if(check())return}throw new Error(host.textContent) }
async function render(patch={}) { props={...props,...patch};await act(async()=>root.render(React.createElement(PitMap, props)));await settle(()=>!host.textContent.includes('Opening saved map…')) }
async function input(label,value) {
  const element = host.querySelector(`[aria-label="${label}"]`)
  await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));await pause()})
}
async function click(text) { const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);expect(button?.disabled).toBe(false);await act(async()=>{button.click();await pause()}) }
async function download() {await input('Nexus event key','2026dal');await click('Download / refresh map');await settle(()=>!!host.querySelector('svg'))}
beforeEach(async()=>{
  globalThis.React=React;globalThis.IS_REACT_ACT_ENVIRONMENT=true
  store=await createScoutingStore({indexedDB:new IDBFactory()})
  host=document.createElement('div');document.body.append(host);root=createRoot(host)
  props={store,uid:'member-a',eventId:'event-a',records:[{kind:'pit',team_number:4414,payload:{pit_location:'A12'},updated_at:at}],online:true,client:{functions:{invoke:vi.fn(async()=>({data:structuredClone(result)}))}}}
})
afterEach(async()=>{await act(async()=>root.unmount());store.close();host.remove();vi.restoreAllMocks()})
it('durably downloads and renders source geometry, then flags location disagreements without rewriting them',async()=>{
  await render();await download()
  expect((await store.getDraft('member-a','event-a',PIT_MAP_DRAFT)).event_key).toBe('2026dal')
  expect(props.client.functions.invoke).toHaveBeenCalledWith('scouting-import',{body:{event_id:'event-a',event_key:'2026dal',mode:'pit_map'}})
  expect(host.querySelector('.sc-map-pits').getAttribute('transform')).toBe('translate(70 1020) rotate(0)')
  expect(host.querySelector('.sc-map-pits rect').getAttribute('x')).toBe('-50')
  expect(host.querySelectorAll('.sc-map-walls')).toHaveLength(1)
  expect(host.querySelectorAll('.sc-map-arrows')).toHaveLength(2)
  await input('Highlight pit','A1')
  expect(host.querySelector('.sc-map-selection').textContent).toContain('Scout pit report says A12')
  expect(host.querySelectorAll('.sc-map-selected')).toHaveLength(1)
  expect(props.records[0].payload.pit_location).toBe('A12')
  await click('Rotate map')
  expect(host.querySelector('svg').getAttribute('viewBox')).toBe('0 0 1293 840')
})
it('restores the map offline and keeps another account or event empty',async()=>{
  await render();await download()
  await act(async()=>root.unmount());root=createRoot(host)
  props.client.functions.invoke.mockClear()
  await render({online:false})
  expect(host.textContent).toContain('Showing the map saved on this device')
  expect(host.querySelector('svg')).toBeTruthy()
  expect(props.client.functions.invoke).not.toHaveBeenCalled()
  await act(async()=>root.unmount());root=createRoot(host)
  await render({uid:'member-b'})
  expect(host.querySelector('svg')).toBeNull()
  expect(host.textContent).toContain('No map has been downloaded')
  await act(async()=>root.unmount());root=createRoot(host)
  await render({uid:'member-a',eventId:'event-b'})
  expect(host.querySelector('svg')).toBeNull()
})
it('keeps the previous map and its key/time when a refresh fails or returns invalid data',async()=>{
  await render();await download()
  await input('Nexus event key','2026cabb')
  props.client.functions.invoke.mockResolvedValue({error:{message:'unavailable'}})
  await click('Download / refresh map')
  await settle(()=>!!host.querySelector('[role="alert"]'))
  expect(host.querySelector('svg title').textContent).toContain('2026dal')
  expect(host.textContent).toContain('previous map is unchanged')
  expect((await store.getDraft('member-a','event-a',PIT_MAP_DRAFT)).fetched_at).toBe(at)
  props.client.functions.invoke.mockResolvedValue({data:{...result,event_key:'2026cabb',map:{}}})
  await click('Download / refresh map')
  await settle(()=>!!host.querySelector('[role="alert"]'))
  expect((await store.getDraft('member-a','event-a',PIT_MAP_DRAFT)).event_key).toBe('2026dal')
  expect(host.querySelector('svg')).toBeTruthy()
})
it('does not promise offline availability after a failed durable save, and an explicit retry recovers',async()=>{
  await render()
  const original=store.saveDraft
  store.saveDraft=vi.fn(async()=>{throw new Error('Device storage is full.')})
  await input('Nexus event key','2026dal');await click('Download / refresh map')
  await settle(()=>!!host.querySelector('[role="alert"]'))
  expect(host.textContent).toContain('Device storage is full')
  expect(host.querySelector('svg')).toBeNull()
  expect(await store.getDraft('member-a','event-a',PIT_MAP_DRAFT)).toBeNull()
  store.saveDraft=original;await download()
  expect(host.textContent).toContain('Map saved on this device for offline use')
})
