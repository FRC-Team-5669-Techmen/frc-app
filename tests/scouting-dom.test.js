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
async function mount(persona = 'student', roles, route = `/scouting/${EVENT}`) {
  fixture.setPersona(persona)
  const { data } = await supabase.auth.getSession()
  const actualRoles = roles ?? fixture.rows('member_roles').filter(r => r.member_id === IDS[persona]).map(r => r.role)
  root = createRoot(host)
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [route] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/scouting/:eventId?', element: React.createElement(ScoutingPage, { session: data.session, hasRole: r => actualRoles.includes(r) }) })))))
  await settle(() => host.querySelector('[data-scout-page="event"]') || host.querySelector('[data-scout-page="events"]') || host.textContent.includes('available to student and staff accounts') || host.textContent.includes('not set up yet') || host.textContent.includes('Scouting access unavailable'), 'event render')
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
  it('lists competitions without routine calendar training, builds or meetings', async () => {
    const base = fixture.rows('events')[0]
    fixture.db.events = ['competition', 'training', 'build', 'meeting'].map((kind, i) => ({ ...base, id: `16000000-0000-4000-8000-00000000000${i+1}`, kind, title: `Calendar ${kind}` }))
    await mount('student', undefined, '/scouting')
    await settle(() => host.querySelectorAll('.sc-event-card').length === 1)
    expect(host.querySelector('.sc-event-card').textContent).toContain('Calendar competition')
    expect(host.textContent).not.toContain('Calendar training')
    expect(fixture.rows('events')).toHaveLength(4)
  })
  it('filters old offline indexes and explains a calendar with no competitions', async () => {
    const store = await createScoutingStore()
    const events = [{ id: EVENT, kind: 'competition', title: 'Regional' }, { id: 'training', kind: 'training', title: 'After School FRC Training' }]
    await store.saveDraft(IDS.student, 'event-index', 'events', events)
    setOnline(false)
    await mount('student', undefined, '/scouting')
    await settle(() => host.querySelectorAll('.sc-event-card').length === 1)
    expect(host.querySelector('.sc-event-card').textContent).toContain('Regional')
    expect(host.textContent).not.toContain('After School FRC Training')
    await unmount()
    await store.saveDraft(IDS.student, 'event-index', 'events', events.slice(1))
    await mount('student', undefined, '/scouting')
    await settle(() => host.textContent.includes('No competitions scheduled'))
    expect(host.querySelectorAll('.sc-event-card')).toHaveLength(0)
    expect(host.querySelector('a[href="/schedule"]')).not.toBeNull()
    expect(await store.getDraft(IDS.student, 'event-index', 'events')).toEqual(events.slice(1))
    store.close()
  })
  it.each(['42501', 'PGRST301', 'ACCOUNT_CHANGED'])('hides cached receipts and drafting controls after definitive %s denial without deleting local work', async code => {
    await mount(); await settle(() => !buttons('Sync now')[0]?.disabled, 'initial sync idle')
    const store = await createScoutingStore()
    await store.enqueue(IDS.student, EVENT, {kind:'observation',team_number:5669,match_key:'qm999',payload:{source:'live',answers:{trench:'yes'},notes:'Retained receipt must not bypass denial'}})
    await click(buttons('Sync now')[0]); await settle(() => !buttons('Sync now')[0]?.disabled, 'receipt saved')
    await unmount()
    const before = await store.listQueue(IDS.student, EVENT)
    expect(before[0]).toMatchObject({status:'synced'})
    const spy = vi.spyOn(supabase, 'from').mockImplementation(() => {
      const q = { select: () => q, eq: () => q, in: () => q, order: () => q, range: () => q,
        then: (resolve, reject) => Promise.resolve({data:null,error:{code,message:'Denied'}}).then(resolve,reject) }
      return q
    })
    // mount's readiness helper also accepts this explicit refusal surface.
    await mount()
    expect(host.textContent).toContain('Scouting access unavailable')
    expect(host.textContent).not.toContain('Retained receipt must not bypass denial')
    expect(host.querySelector('[role="tablist"]')).toBeNull()
    expect(await store.listQueue(IDS.student, EVENT)).toEqual(before)
    await settle(() => !buttons('Retry scouting access')[0]?.disabled, 'denied sync idle')
    spy.mockRestore(); await click(buttons('Retry scouting access')[0])
    await settle(() => host.querySelector('[data-scout-page="event"]'))
    expect(host.textContent).toContain('Retained receipt must not bypass denial')
    store.close()
  })

  it('keeps confirmed master votes and coverage visible while corrections wait offline', async () => {
    const template = fixture.rows('scouting_records').find(row => row.kind === 'team')
    const base = { ...template, member_id: IDS.student, team_number: 5669, version: 1 }
    const ballot = { ...base, id: '33000000-0000-4000-8000-000000000001', kind: 'pick_list', team_number: null, payload: { entries: [{team:5669,tier:1,rank:1}] } }
    const observation = { ...base, id: '33000000-0000-4000-8000-000000000002', kind: 'observation', match_key:'qm1', payload:{answers:{trench:'yes'}} }
    const pit = { ...base, id: '33000000-0000-4000-8000-000000000003', kind:'pit', payload:{capabilities:{trench:'yes'}} }
    fixture.db.scouting_records = [ballot, observation, pit, {...base, kind:'team', payload:{name:'Techmen',source:'manual'}}]
    await mount(); await unmount()
    const store = await createScoutingStore()
    await store.enqueueBatch(IDS.student, EVENT, [
      {...ballot,payload:{entries:[{team:5669,tier:3,rank:3}]}},
      {...observation,payload:{answers:{trench:'no'}}},
      {...pit,payload:{capabilities:{trench:'no'}}},
    ])
    failReads(); online = false; await mount()
    await click(buttons('Pick lists')[0]); await click(buttons('Master list')[0])
    expect(host.querySelector('.sc-master').textContent).toContain('Median tier 1, rank 1')
    await click(buttons('Teams')[0])
    expect(host.querySelector('.sc-coverage summary').textContent).toContain('1/1 pit reports')
    expect(host.querySelector('.sc-team-card .sc-ratio').textContent).toContain('1/1 observed matches')
    store.close()
  })

  it('pages large team lists without hiding search matches or fabricating empty evidence', async () => {
    const template = fixture.rows('scouting_records').find(row => row.kind === 'team')
    fixture.db.scouting_records = Array.from({ length: 67 }, (_, i) => ({ ...template, id: `33000000-0000-4000-8000-${String(i).padStart(12, '0')}`, team_number: 8000 + i, payload: { name: `Synthetic ${8000 + i}`, source: 'manual' } }))
    fixture.db.scouting_revisions = []; fixture.db.scouting_delivery = []
    await mount(); await click(buttons('Teams')[0])
    const cards = () => [...host.querySelectorAll('.sc-team-card')]
    expect(cards()).toHaveLength(30)
    expect(host.textContent).toContain('Showing 1–30 of 67 teams')
    expect(buttons('Previous teams')[0].disabled).toBe(true)
    await click(buttons('Next teams')[0]); expect(cards()).toHaveLength(30)
    await click(buttons('Next teams')[0]); expect(cards()).toHaveLength(7)
    expect(buttons('Next teams')[0].disabled).toBe(true)
    expect(cards().at(-1).textContent).toContain('Synthetic 8066')
    await input(host.querySelector('input[type="search"]'), '8001')
    expect(cards()).toHaveLength(1); expect(cards()[0].textContent).toContain('Synthetic 8001')
    expect(cards()[0].textContent).toContain('No evidence')
    await input(host.querySelector('input[type="search"]'), 'absent team')
    expect(cards()).toHaveLength(0); expect(host.textContent).toContain('No teams match this search.')
    await input(host.querySelector('input[type="search"]'), '')
    expect(cards()).toHaveLength(30); expect(host.textContent).toContain('Showing 1–30 of 67 teams')
  })

  it('restores a draft, retains an offline observation across remount, then syncs exactly once', async () => {
    await mount()
    await click(buttons('Scout match')[0])
    await settle(() => host.querySelector('dialog textarea'), 'observation draft')
    // By name, not position: the REBUILT match fields (0027) sit above the capabilities.
    const trench = () => [...host.querySelectorAll('dialog fieldset')].find(f => f.querySelector('legend')?.textContent === 'Passes under the TRENCH')
    await click(trench().querySelectorAll('button')[2])
    await input(host.querySelector('dialog textarea'), 'Trench was obscured by another robot.')
    await settle(() => host.textContent.includes('Draft saved on this device'), 'durable draft')
    await unmount(); await mount()
    await click(buttons('Scout match')[0])
    await settle(() => host.querySelector('dialog textarea')?.value === 'Trench was obscured by another robot.', 'restored draft')
    expect(trench().querySelector('button[aria-pressed="true"]').textContent).toBe('Did not see')
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
    await settle(() => !buttons('Sync now')[0].disabled, 'sync idle')
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

  it('keeps conflict review closed until its current server evidence finishes refreshing', async () => {
    fixture.setPersona('student')
    const initial = await supabase.rpc('scouting_save', { p_actor: IDS.student, p_id: crypto.randomUUID(), p_event: EVENT,
      p_kind: 'observation', p_team: 5669, p_match: 'qm991', p_payload: { source: 'live', answers: { trench: 'no' }, notes: 'Original confirmed note' },
      p_expected_version: 0, p_operation: crypto.randomUUID() })
    expect(initial.data.version).toBe(1)
    await mount(); await settle(() => !buttons('Sync now')[0]?.disabled, 'initial sync idle')
    const store = await createScoutingStore()
    const before = initial.data
    const concurrent = await supabase.rpc('scouting_save', { p_actor: IDS.student, p_id: before.id, p_event: EVENT, p_kind: before.kind,
      p_team: before.team_number, p_match: before.match_key, p_payload: { ...before.payload, notes: 'Latest independently saved server note' },
      p_expected_version: before.version, p_operation: crypto.randomUUID() })
    expect(concurrent.data.version).toBe(2)
    const proposal = await store.enqueue(IDS.student, EVENT, { ...before, payload: { ...before.payload, notes: 'My held correction proposal' } })
    let release, reads = 0
    const gate = new Promise(resolve => { release = resolve }), original = supabase.from.bind(supabase)
    const spy = vi.spyOn(supabase, 'from').mockImplementation((...args) => {
      const query = original(...args), then = query.then.bind(query)
      query.then = (resolve, reject) => { reads++; return gate.then(() => then(resolve, reject)) }
      return query
    })
    try {
      await click(buttons('Sync now')[0]); await settle(() => reads > 0, 'held evidence refresh')
      expect((await store.listQueue(IDS.student, EVENT)).find(op => op.id === proposal.id)).toMatchObject({ status: 'conflict', args: { p_payload: { notes: 'My held correction proposal' } } })
      expect(buttons('Sync now')[0].disabled).toBe(true)
      expect(buttons('Review conflict')).toHaveLength(0)
      release(); await settle(() => buttons('Review conflict').length === 1, 'review ready with refreshed evidence')
      await click(buttons('Review conflict')[0])
      const review = host.querySelector('.sc-conflict').textContent
      expect(review).toContain('Current server version 2')
      expect(review).toContain('Latest independently saved server note')
      expect(review).toContain('My held correction proposal')
    } finally { release(); spy.mockRestore(); await act(async () => { await pause(20) }); store.close() }
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

describe('assignment batch durability', () => {
  it('commits a whole shift, rolls back quota failures and blocks concurrent same-match assignments', async () => {
    const store = await createScoutingStore(), other = await createScoutingStore()
    const rows = [1, 2].map(n => ({ kind: 'assignment', match_key: 'qm'+n, team_number: 5669, payload: { assignee: IDS.student, status: 'assigned' } }))
    const original = store.backend.transaction.bind(store.backend)
    let puts = 0
    const failing = vi.spyOn(store.backend, 'transaction').mockImplementation((names, mode, fn) => original(names, mode, tx => fn({ ...tx,
      put: async (...args) => { await tx.put(...args); if (++puts === 2) throw new Error('disk full') },
    })))
    await expect(store.enqueueBatch(IDS.admin, EVENT, rows)).rejects.toThrow('disk full')
    failing.mockRestore()
    expect(await other.listQueue(IDS.admin, EVENT)).toHaveLength(0)
    const result = await store.enqueueBatch(IDS.admin, EVENT, rows)
    expect(result).toHaveLength(2); expect(await other.listQueue(IDS.admin, EVENT)).toHaveLength(2)
    await expect(other.enqueueBatch(IDS.admin, EVENT, [{ ...rows[0], team_number: 4414 }])).rejects.toThrow('queued assignment')
    expect(await other.listQueue(IDS.admin, EVENT)).toHaveLength(2)
    store.close(); other.close()
  })
  it('previews a pasted schedule in the manager view and saves only after explicit review', async () => {
    await mount('admin')
    const text = [...host.querySelectorAll('label')].find(l => l.textContent.startsWith('Match schedule')).querySelector('textarea')
    await settle(() => !text.closest('fieldset').disabled, 'planner ready')
    await input(text, 'qm80, 5669\nqm81, 4414')
    const scout = host.querySelector('.sc-planner .sc-choice button')
    await click(scout)
    await click(buttons('Preview assignment plan')[0])
    expect(host.textContent).toContain('2 new assignments')
    expect(fixture.rows('scouting_records').filter(r => ['qm80', 'qm81'].includes(r.match_key))).toHaveLength(0)
    await click(buttons('Save 2 assignments')[0])
    await settle(() => fixture.rows('scouting_records').filter(r => ['qm80', 'qm81'].includes(r.match_key)).length === 2, 'saved plan')
    await unmount(); await mount('admin')
    await settle(() => host.querySelector('.sc-planner textarea')?.value.includes('qm80'), 'schedule restored')
    await click(buttons('Preview assignment plan')[0])
    expect(host.textContent).toContain('0 new assignments')
    expect(host.textContent).toContain('2 already covered')
  })
})

describe('practice and list draft recovery', () => {
  it('retains incomplete training decisions, notes, active mission and footage after remount', async () => {
    await mount()
    await click(buttons('Practice')[0])
    await settle(() => host.textContent.includes('Practice record loaded'), 'practice loaded')
    const card = host.querySelector('[aria-label="Interactive practice"] fieldset')
    await click(card.querySelector('button'))
    const note = host.querySelector('.sc-training-lesson > .sc-practice-fields > label textarea')
    await input(note, 'I must keep a pit claim separate from observation evidence.')
    await click(buttons('Next mission')[0])
    await click(buttons('Add practice footage')[0])
    const url = [...host.querySelectorAll('.sc-training input')].find(e=>e.type==='url')
    await input(url, 'https://www.youtube.com/watch?v=abcdefghijk')
    await settle(()=>host.textContent.includes('Practice saved on this device.'),'practice durable')
    await unmount(); await mount(); await click(buttons('Practice')[0])
    await settle(()=>host.querySelector('.sc-training nav button[aria-current="step"]')?.textContent.includes('pit conversation'),'mission restored')
    expect(host.querySelector('.sc-training input[type=url]').value).toContain('abcdefghijk')
    await click(buttons('Previous mission')[0])
    expect(host.querySelector('[aria-label="Interactive practice"] fieldset button[aria-pressed=true]').textContent).toBe('Pit claim')
    expect(host.querySelector('.sc-training-lesson > .sc-practice-fields > label textarea').value).toContain('pit claim separate')
    expect(buttons('Record mission practice')[0].disabled).toBe(true)
  })
  it('never calls a full practice mission complete based only on quiz answers', async () => {
    const store = await createScoutingStore()
    await store.saveDraft(IDS.student, EVENT, 'training:2026.1', { evidence:{ answers:{0:2,1:0}, didActivity:true, note:'Specific practice evidence' } })
    await mount(); await click(buttons('Practice')[0])
    await settle(()=>host.textContent.includes('Practice record loaded'),'loaded')
    expect(buttons('Record mission practice')[0].disabled).toBe(true)
    const choices = ['Pit claim','Scout observation','Official alliance result','Statistical estimate','Not established','Not established']
    for (let i=0;i<choices.length;i++) {
      const field = host.querySelectorAll('[aria-label="Interactive practice"] fieldset')[i]
      await click([...field.querySelectorAll('button')].find(b=>b.textContent===choices[i]))
    }
    await click(buttons('Review practice decisions')[0])
    await click(buttons('Record mission practice')[0])
    await settle(()=>host.textContent.includes('Practice saved on this device.'),'saved mission')
    const saved = await store.getDraft(IDS.student,EVENT,'training:2026.1')
    expect(saved.evidence.completed).toBe(true)
    expect(saved.evidence.practice.attempts.at(-1)).toMatchObject({correct:6,total:6})
    store.close()
  })
})

describe('pit conversation and assignment eligibility', () => {
  it('allows a different scout to reply while retaining the original author and message', async () => {
    await mount('student'); await click(buttons('Pit messages')[0])
    const original = fixture.rows('scouting_records').find(r=>r.kind==='message')
    await click(buttons('Reply to pit conversation')[0])
    await settle(()=>host.querySelector('dialog textarea'),'reply ready')
    expect(host.querySelector('dialog input[type=number]').readOnly).toBe(true)
    await input(host.querySelector('dialog textarea'),'Pit crew confirms the intake repair; test still pending.')
    await click(buttons('Save message')[0])
    await settle(()=>fixture.rows('scouting_records').some(r=>r.payload.reply_to===original.id),'reply synced')
    const reply=fixture.rows('scouting_records').find(r=>r.payload.reply_to===original.id)
    expect(reply.member_id).toBe(IDS.student)
    expect(reply.payload.request_delivery).toBe(false)
    expect(fixture.rows('scouting_records').find(r=>r.id===original.id)).toEqual(original)
    expect(host.textContent).toContain('Reply to: Ask whether the intake jam was repaired.')
  })
  it('shows eligible students and staff in the planner and excludes parent-only and inactive members', async () => {
    fixture.patch('profiles',{id:IDS.student2},{status:'inactive'})
    await mount('admin')
    await settle(()=>host.querySelectorAll('.sc-planner .sc-choice button').length>0,'eligible roster')
    const names=[...host.querySelectorAll('.sc-planner .sc-choice button')].map(b=>b.textContent)
    const name=id=>{const p=fixture.rows('profiles').find(r=>r.id===id);return p.nickname||p.full_name}
    expect(names).toContain(name(IDS.student));expect(names).toContain(name(IDS.admin))
    expect(names).not.toContain(name(IDS.parent));expect(names).not.toContain(name(IDS.student2))
  })
})

describe('scout review and truthful draft status', () => {
  it('reopens the original assignment observation for correction instead of creating a duplicate', async () => {
    await mount(); await click(buttons('Scout match')[0]); await settle(()=>host.querySelector('dialog textarea'),'draft')
    await input(host.querySelector('dialog textarea'),'First attributed note.')
    await click(buttons('Save observation')[0])
    await settle(()=>buttons('Review observation').length===1 && !buttons('Review observation')[0].disabled,'review action')
    await click(buttons('Review observation')[0]); await settle(()=>host.querySelector('dialog textarea'),'correction form')
    expect(host.querySelector('dialog textarea').value).toBe('First attributed note.')
    await input(host.querySelector('dialog textarea'),'Corrected after reviewing the video.')
    await click(buttons('Save observation')[0])
    await settle(()=>fixture.rows('scouting_records').some(r=>r.kind==='observation' && r.member_id===IDS.student && r.version===2),'corrected')
    const rows=fixture.rows('scouting_records').filter(r=>r.kind==='observation'&&r.member_id===IDS.student&&r.match_key==='qm1')
    expect(rows).toHaveLength(1);expect(rows[0].version).toBe(2)
  })
  it('shows a pick draft storage failure without discarding the current list', async () => {
    const {ScoutingStore}=await import('../src/scouting/storage.js')
    const original=ScoutingStore.prototype.saveDraft
    vi.spyOn(ScoutingStore.prototype,'saveDraft').mockImplementation(function(member,event,key,value){
      return key==='pick-list'?Promise.reject(new Error('simulated quota')):original.call(this,member,event,key,value)
    })
    await mount();await click(buttons('Pick lists')[0]);await settle(()=>!host.querySelector('[aria-label="Remove 4414 from list"]').disabled,'list ready')
    await click(host.querySelector('[aria-label="Remove 4414 from list"]'))
    await settle(()=>host.textContent.includes('Draft is not saved'),'visible draft failure')
    expect(host.textContent).toContain('simulated quota')
    expect(host.querySelector('[aria-label="Remove 1538 from list"]')).toBeTruthy()
    expect(host.querySelector('[aria-label="Remove 4414 from list"]')).toBeNull()
    expect(fixture.rows('scouting_records').find(r=>r.kind==='pick_list'&&r.member_id===IDS.student).payload.entries.some(e=>e.team===4414)).toBe(true)
  })
})

describe('sync recovery scheduling', () => {
  it('does not spin on a local queue when the account changes before sync', async () => {
    await mount();await settle(()=>!buttons('Sync now')[0].disabled,'initial sync idle')
    const store=await createScoutingStore()
    await store.enqueue(IDS.student,EVENT,{kind:'message',team_number:5669,payload:{text:'Keep this original account proposal',status:'open'}})
    const original=supabase.auth.getSession
    const session=await original()
    const spy=vi.spyOn(supabase.auth,'getSession').mockResolvedValue({data:{session:{...session.data.session,user:{...session.data.session.user,id:IDS.student2}}},error:null})
    await click(buttons('Sync now')[0]);await settle(()=>buttons('Retry scouting access')[0] && !buttons('Retry scouting access')[0].disabled,'refused sync idle')
    const calls=spy.mock.calls.length
    await act(async()=>{await pause(100)})
    expect(spy.mock.calls.length).toBe(calls)
    expect((await store.listQueue(IDS.student,EVENT))[0].status).toBe('local')
    spy.mockRestore();await click(buttons('Retry scouting access')[0]);await settle(()=>buttons('Sync now')[0] && !buttons('Sync now')[0].disabled,'access restored');await click(buttons('Sync now')[0])
    await settle(()=>fixture.rows('scouting_records').some(r=>r.payload.text==='Keep this original account proposal'),'original account sync')
    store.close()
  })
})

describe('fixture actor boundary', () => {
  it('refuses a changed account actor and accepts the signed-in actor', async () => {
    fixture.setPersona('student')
    const args={p_id:crypto.randomUUID(),p_event:EVENT,p_kind:'message',p_team:5669,p_match:null,p_payload:{text:'An attributed fixture note',status:'open'},p_expected_version:0,p_operation:crypto.randomUUID()}
    expect((await supabase.rpc('scouting_save',{...args,p_actor:IDS.student2})).error.code).toBe('42501')
    expect((await supabase.rpc('scouting_save',{...args,p_actor:IDS.student})).data.member_id).toBe(IDS.student)
  })
})

describe('event recovery and footage provenance', () => {
  it('keeps an import preview after a failed atomic save, then saves every reviewed team on retry', async () => {
    const { ScoutingStore } = await import('../src/scouting/storage.js')
    const teams = [9005, 9006].map(team_number => ({ team_number, payload: { name: `Import ${team_number}`, source: 'manual' } }))
    vi.spyOn(supabase.functions, 'invoke').mockResolvedValue({ data: { teams, matches: [], sources: [{ source: 'tba', status: 'ok' }] }, error: null })
    await mount('admin')
    await input(host.querySelector('input[placeholder="2026cabb"]'), '2026cabb')
    await click(buttons('Preview event import')[0])
    await settle(() => buttons('Save imported teams')[0], 'import review')
    expect(fixture.rows('scouting_records').some(r => r.team_number === 9005)).toBe(false)
    const fail = vi.spyOn(ScoutingStore.prototype, 'enqueueBatch').mockRejectedValueOnce(new Error('disk full'))
    await click(buttons('Save imported teams')[0])
    await settle(() => host.textContent.includes('The import was not saved. disk full'), 'atomic failure')
    expect(fixture.rows('scouting_records').some(r => r.team_number === 9005 || r.team_number === 9006)).toBe(false)
    fail.mockRestore()
    await click(buttons('Save imported teams')[0])
    await settle(() => fixture.rows('scouting_records').filter(r => [9005, 9006].includes(r.team_number)).length === 2, 'all imported teams')
  })
  it('records prior-event footage with explicit provenance and excludes it from current reliability', async () => {
    await mount()
    await click(buttons('New observation')[0])
    await settle(() => host.querySelector('dialog input[type="number"]'), 'observation form')
    await input(host.querySelector('dialog input[type="number"]'), '5669')
    await input(host.querySelector('dialog input[placeholder="qm1"]'), '2026cabb_qm90')
    const select = async (label, value) => {
      const element = [...host.querySelectorAll('dialog label')].find(l => l.textContent.startsWith(label)).querySelector('select')
      await act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); await pause(1) })
    }
    await select('Source', 'video')
    await input(host.querySelector('dialog input[type="url"]'), 'https://example.org/review')
    await select('Footage event', 'external')
    await input(host.querySelector('dialog input[placeholder="2026cabb"]'), '2026cabb')
    await click([...host.querySelectorAll('dialog fieldset')].find(f => f.querySelector('legend')?.textContent === 'Passes under the TRENCH').querySelector('button'))
    await click(buttons('Save observation')[0])
    await settle(() => fixture.rows('scouting_records').some(r => r.match_key === '2026cabb_qm90'), 'footage saved')
    const row = fixture.rows('scouting_records').find(r => r.match_key === '2026cabb_qm90')
    expect(row.payload).toMatchObject({ source: 'video', source_scope: 'external', source_event: '2026cabb', answers: { trench: 'yes' } })
    await settle(() => host.textContent.includes('Prior-event footage · 2026cabb'), 'provenance displayed')
    const { reliability } = await import('../src/scouting/model.js')
    expect(reliability([row], 5669, 'trench').denominator).toBe(0)
  })
  it('reports a failed backup without changing queued work or claiming download success', async () => {
    const { ScoutingStore } = await import('../src/scouting/storage.js')
    await mount()
    vi.spyOn(ScoutingStore.prototype, 'exportBackup').mockRejectedValueOnce(new Error('read interrupted'))
    await click(buttons('Export event data')[0])
    await settle(() => host.textContent.includes('Backup could not be created'), 'backup error')
    expect(host.textContent.includes('Backup prepared:')).toBe(false)
    expect(buttons('Export event data')[0].disabled).toBe(false)
  })
})

 it('downloads saved practice and event evidence together through the export action', async () => {
   const backup = await import('../src/scouting/backup.js')
   const download = vi.spyOn(backup, 'downloadArchive').mockImplementation(() => {})
   const store = await createScoutingStore()
   await store.saveDraft(IDS.student, EVENT, 'training:2026.1', { _activeMission: 3 })
   await mount()
   await click(buttons('Export event data')[0])
   await settle(() => download.mock.calls.length === 1, 'portable archive')
   const archive = download.mock.calls[0][0]
   expect(archive.format).toBe('techmen-scouting-v2')
   expect(archive.records.length).toBeGreaterThan(0)
   expect(archive.device_backup.drafts).toEqual(expect.arrayContaining([expect.objectContaining({ draft_key: 'training:2026.1', value: { _activeMission: 3 } })]))
   expect(archive.exported_by).toBe(IDS.student)
   store.close()
 })

it('previews a backup without writing, holds its recovered request across remount, then explicitly retries it', async () => {
  const { buildEventArchive } = await import('../src/scouting/backup.js')
  const donor = await createScoutingStore({ dbName: 'separate-lost-device' })
  const original = await donor.enqueue(IDS.student, EVENT, { kind: 'observation', team_number: 5669, match_key: 'qm301', payload: { answers: { trench: 'did_not_see' }, source: 'live', notes: 'Recovered evidence must wait for server validation.' } })
  const archive = buildEventArchive({ memberId: IDS.student, eventId: EVENT, snapshot: {}, local: await donor.exportBackup(IDS.student, EVENT) })
  donor.close()
  const target = await createScoutingStore()
  async function choose(value) {
    const field = host.querySelector('input[type="file"]'), text = JSON.stringify(value)
    Object.defineProperty(field, 'files', { configurable: true, value: [{ size: text.length, text: async () => text }] })
    await act(async () => { field.dispatchEvent(new Event('change', { bubbles: true })); await pause(1) })
  }
  try {
    await mount()
    await choose({ ...archive, exported_by: IDS.student2 })
    await settle(() => host.textContent.includes('original member account and event'), 'scope refusal')
    expect(await target.listQueue(IDS.student, EVENT)).toEqual([])
    await choose(archive)
    await settle(() => host.textContent.includes('1 recoverable'), 'recovery preview')
    expect(await target.listQueue(IDS.student, EVENT)).toEqual([])
    await click(buttons('Select all recoverable saves')[0])
    await click(buttons('Restore 1 selected saves for review')[0])
    await settle(() => host.textContent.includes('Recovered · awaiting review'), 'held recovery')
    expect((await target.listQueue(IDS.student, EVENT))[0].args).toEqual(original.args)
    expect(fixture.rows('scouting_records').some(row => row.id === original.record_id)).toBe(false)
    expect([...host.querySelectorAll('.sc-evidence-record')].some(row => row.textContent.includes('Recovered evidence'))).toBe(false)
    await unmount(); await mount()
    await settle(() => !buttons('Sync now')[0].disabled, 'sync idle')
    await click(buttons('Sync now')[0]); await settle(() => !buttons('Sync now')[0].disabled)
    expect((await target.listQueue(IDS.student, EVENT))[0].status).toBe('recovered')
    expect(fixture.rows('scouting_records').some(row => row.id === original.record_id)).toBe(false)
    await click(buttons('Review recovered save')[0]);await click(buttons('Retry original save')[0])
    await settle(() => host.textContent.includes('All saved work synced'), 'reviewed original request sync')
    expect(fixture.rows('scouting_records').filter(row => row.id === original.record_id)).toHaveLength(1)
    expect(fixture.rows('scouting_revisions').filter(row => row.record_id === original.record_id)).toHaveLength(1)
    await choose(archive);await settle(() => host.textContent.includes('0 recoverable · 1 already present'), 'duplicate recovery skipped')
    expect((await target.listQueue(IDS.student, EVENT))[0]).toMatchObject({ id: original.id, status: 'synced' })
  } finally { target.close() }
})

it('keeps new work visible while an earlier queue snapshot finishes and drains it without duplicate submissions', async () => {
  await mount(); await settle(() => !buttons('Sync now')[0].disabled, 'initial sync idle')
  const original = supabase.rpc.bind(supabase), releases = [], calls = []
  vi.spyOn(supabase, 'rpc').mockImplementation((name, args) => {
    if (name !== 'scouting_save') return original(name, args)
    calls.push(args)
    return new Promise(resolve => releases.push(async () => resolve(await original(name, args))))
  })
  async function capture(match) {
    await click(buttons('New observation')[0]);await settle(() => host.querySelector('dialog textarea'))
    await input(host.querySelector('dialog input[type="number"]'), '5669')
    await input(host.querySelector('dialog input[placeholder="qm1"]'), match)
    await input(host.querySelector('dialog textarea'), 'Concurrent local save '+match)
    await click(buttons('Save observation')[0]);await settle(() => !host.querySelector('dialog'))
  }
  await capture('qm510');await settle(() => calls.length === 1, 'first held RPC')
  await capture('qm511');await settle(() => host.textContent.includes('2 waiting to sync'), 'second durable proposal')
  let falseSynced = false
  const observer = new MutationObserver(() => { if (host.textContent.includes('All saved work synced')) falseSynced = true })
  observer.observe(host, { childList: true, subtree: true, characterData: true })
  await act(async () => releases[0]());await settle(() => calls.length === 2, 'fresh local work drains')
  expect(falseSynced).toBe(false)
  expect(host.textContent).toContain('1 waiting to sync')
  observer.disconnect()
  await act(async () => releases[1]());await settle(() => host.textContent.includes('All saved work synced'), 'both confirmed')
  expect(calls.map(row => row.p_match)).toEqual(['qm510', 'qm511'])
  expect(fixture.rows('scouting_records').filter(row => ['qm510','qm511'].includes(row.match_key))).toHaveLength(2)
})
