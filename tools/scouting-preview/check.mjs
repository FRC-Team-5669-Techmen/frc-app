// Executes the compiled review document under DOM/IndexedDB emulation. This
// verifies the portable bundle, not browser layout or native phone behavior.
import {JSDOM,VirtualConsole} from 'jsdom'
import {IDBFactory} from 'fake-indexeddb'
import {readFileSync,writeFileSync} from 'node:fs'
import {webcrypto} from 'node:crypto'
import assert from 'node:assert/strict'
const errors=[]
const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',e=>errors.push(String(e)))
const dom=new JSDOM(readFileSync('artifacts/scouting-review/REVIEW.html','utf8'),{url:'https://scouting-review.invalid',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.indexedDB=new IDBFactory();w.structuredClone=structuredClone;w.crypto.randomUUID=()=>webcrypto.randomUUID();w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
 w.fetch=()=>Promise.reject(new Error('Review must not use network'))
}})
const doc=dom.window.document,wait=ms=>new Promise(r=>setTimeout(r,ms))
async function until(test){for(let i=0;i<100;i++){if(test())return;await wait(20)}throw new Error('Review did not reach expected UI state')}
try {
 await until(()=>doc.querySelector('[data-scout-page="event"]'))
 assert(doc.getElementById('root').textContent.includes('Fixture Regional'))
 for(const label of ['Teams','Pit messages','Pick lists','Practice']) {
  console.log('Checking tab:',label)
  const button=[...doc.querySelectorAll('.sc-tabs button')].find(b=>b.textContent.trim()===label)
  assert(button,`missing ${label}`);button.click();await wait(100)
 }
 assert(doc.getElementById('root').textContent.includes('Sort the evidence'))
 console.log('Checking mentor persona');
 const persona=doc.querySelector('.review-bar select');persona.value='mentor';persona.dispatchEvent(new dom.window.Event('change',{bubbles:true}))
 await until(()=>doc.querySelector('.sc-planner'))
 assert(doc.querySelector('.sc-planner'))
 console.log('Checking parent persona');
 persona.value='parent';persona.dispatchEvent(new dom.window.Event('change',{bubbles:true}))
 await until(()=>doc.getElementById('root').textContent.includes('available to student and staff accounts'))
 assert.equal(!!doc.querySelector('[data-scout-page="event"]'),false)
 console.log('Returning to student');
 persona.value='student';persona.dispatchEvent(new dom.window.Event('change',{bubbles:true}))
 await until(()=>doc.querySelector('[data-scout-page="event"]'))
 const teams=[...doc.querySelectorAll('.sc-tabs button')].find(b=>b.textContent.trim()==='Teams');teams.click();await wait(100)
 assert.equal(doc.querySelectorAll('.sc-team-card').length,4)
 console.log('Checking fictional map download in portable bundle');
 doc.querySelector('.sc-pit-map').open=true
 await until(()=>!doc.querySelector('[aria-label="Nexus event key"]').disabled)
 const mapKey=doc.querySelector('[aria-label="Nexus event key"]')
 Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(mapKey,'2026dal')
 mapKey.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait(30)
 const download=[...doc.querySelectorAll('.sc-pit-map button')].find(b=>b.textContent==='Download / refresh map')
 assert.equal(download.disabled,false);download.click()
 await until(()=>doc.querySelectorAll('.sc-map-pits').length===4)
 assert(doc.querySelector('.sc-pit-map').textContent.includes('Map saved on this device for offline use.'))
 assert.equal(doc.querySelector('.sc-map-pits rect').getAttribute('x'),'-50')
 assert.deepEqual(errors,[])
 doc.querySelectorAll('script').forEach(e=>e.remove())
 writeFileSync('artifacts/scouting-review/static-render.html',dom.serialize())
 console.log('Portable review: real route/all five tabs, mentor planner, parent denial and fictional map cache verified; zero script errors (DOM emulation).')
}finally{dom.window.close()}
