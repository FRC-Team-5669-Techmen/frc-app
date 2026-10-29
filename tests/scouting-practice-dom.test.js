// @vitest-environment jsdom
// Feedback 387edf14 (Paul, via Isaac Lin): "I put in save observation and then
// the tab just disappeared. We should make it so that practice matches are
// unlimited." and 449543dd (Azad): "every robot does these areas."
// DOM + IndexedDB emulation against the fixture port of scouting_save. No
// claim about native dialogs, layout, phones or real SQL is made here.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
vi.mock('../src/supabase', async () => import('../src/dev/fixture/client.js'))
import ScoutingPage from '../src/ScoutingPage.jsx'
import { fixture, supabase } from '../src/dev/fixture/client.js'
import { IDS } from '../src/dev/fixture/personas.js'
import { _resetWriteVia } from '../src/writeVia.js'

const EVENT = '16000000-0000-4000-8000-000000000001'
let host, root, online
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function settle(check, message = 'condition') {
  for (let i = 0; i < 150; i++) {
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
async function mount(persona = 'student') {
  fixture.setPersona(persona)
  const { data } = await supabase.auth.getSession()
  const roles = fixture.rows('member_roles').filter(r => r.member_id === IDS[persona]).map(r => r.role)
  root = createRoot(host)
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [`/scouting/${EVENT}`] },
    React.createElement(Routes, null, React.createElement(Route, { path: '/scouting/:eventId?', element: React.createElement(ScoutingPage, { session: data.session, hasRole: r => roles.includes(r) }) })))))
  await settle(() => host.querySelector('[data-scout-page="event"]'), 'event page')
  await settle(() => !buttons('Sync now')[0].disabled, 'initial sync idle')
}
const dialog = () => host.querySelector('dialog')
const hint = () => dialog()?.querySelector('[data-match-hint]')?.textContent ?? ''
const savedBar = () => host.querySelector('[data-saved-confirmation]')
// The Teams tab is a table; a team's evidence card opens under its row.
async function expandTeams(...teams) {
  for (const team of teams) await click(host.querySelector(`.sc-team-table tr.sc-team-row[data-team="${team}"] th button`))
}
const mine = () => fixture.rows('scouting_records').filter(r => r.kind === 'observation' && r.member_id === IDS.student)
async function openObservation(team, match, note = `Fixture note ${match}`) {
  await click(buttons('New observation')[0]); await settle(() => dialog()?.querySelector('textarea'), 'form ready')
  await input(dialog().querySelector('input[type="number"]'), String(team))
  await input(dialog().querySelector('input[placeholder="qm1"]'), match)
  await input(dialog().querySelector('textarea[aria-label="Notes"]'), note)
}
async function submit() { await click(buttons('Save observation')[0]) }

beforeEach(() => {
  globalThis.React = React
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.indexedDB = new IDBFactory()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  Element.prototype.scrollIntoView = function () {}
  online = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  fixture.setMigrations('all'); fixture.reset(); fixture.setLatency(0); _resetWriteVia()
  host = document.createElement('div'); document.body.append(host)
})
afterEach(async () => { if (root) { await act(async () => root.unmount()); root = null } host.remove(); vi.restoreAllMocks() })

describe('practice matches at an event (feedback 387edf14)', () => {
  it('saves any number of practice matches for one robot, each its own record, typed any common way', async () => {
    await mount()
    const typed = ['Practice 1', 'P2', 'pm 3', 'practice match 4', 'PM5', 'p06', 'Practice #7', 'pm8', 'pm9', 'pm10', 'pm11', 'pm150']
    for (const match of typed) {
      await openObservation(5669, match)
      const expected = match === 'pm150' ? 'Practice 150' : `Practice ${typed.indexOf(match) + 1}`
      expect(hint()).toContain(`Saves as ${expected}`)
      await submit(); await settle(() => !dialog(), `form closes for ${match}`)
    }
    await settle(() => host.textContent.includes('All saved work synced'), 'all practice saves synced')
    const keys = mine().filter(r => r.team_number === 5669).map(r => r.match_key).sort()
    expect(keys).toHaveLength(12)
    expect(new Set(keys).size).toBe(12)
    expect(keys).toEqual(['pm1', 'pm10', 'pm11', 'pm150', 'pm2', 'pm3', 'pm4', 'pm5', 'pm6', 'pm7', 'pm8', 'pm9'])
    // Positive control on the same page: a qualification label still saves as qm.
    await openObservation(5669, '12'); expect(hint()).toContain('Saves as Qualification 12 (qm12)')
    await submit(); await settle(() => mine().some(r => r.match_key === 'qm12'), 'qualification save')
  })

  it('refuses a practice label with no number before the form closes, and saves once the number is added', async () => {
    await mount()
    const before = mine().length
    await openObservation(5669, 'practice')
    expect(hint()).toContain('Add the practice match number')
    await submit()
    expect(dialog()).toBeTruthy()
    expect(dialog().querySelector('[role="alert"]').textContent).toContain('Add the practice match number, such as pm3')
    expect(mine()).toHaveLength(before)
    await input(dialog().querySelector('input[placeholder="qm1"]'), 'practice 6')
    await submit(); await settle(() => !dialog(), 'form closes')
    await settle(() => mine().some(r => r.match_key === 'pm6'), 'pm6 saved')
    expect(mine()).toHaveLength(before + 1)
  })

  it('catches a second observation of the same robot in the same practice match in the form, not after sync', async () => {
    await mount()
    await openObservation(1538, 'pm3'); await submit(); await settle(() => !dialog(), 'first save')
    await settle(() => mine().some(r => r.match_key === 'pm3'), 'first synced')
    await openObservation(1538, 'Practice 3'); await submit()
    expect(dialog()).toBeTruthy()
    expect(dialog().querySelector('[role="alert"]').textContent).toContain('You already saved team 1538 in Practice 3')
    expect(mine().filter(r => r.match_key === 'pm3')).toHaveLength(1)
    // Positive control: the next practice match for the same robot is not a duplicate.
    await input(dialog().querySelector('input[placeholder="qm1"]'), 'Practice 4')
    await submit(); await settle(() => !dialog(), 'second practice match saved')
    await settle(() => mine().some(r => r.match_key === 'pm4' && r.team_number === 1538), 'pm4 synced')
  })

  it('keeps the assignment key on an observation from an assignment, which the server requires', async () => {
    const base = fixture.rows('scouting_records').find(r => r.kind === 'assignment')
    fixture.db.scouting_records.push({ ...base, id: '22000000-0000-4000-8000-000000000777', team_number: 1323, match_key: 'P7', payload: { assignee: IDS.student, status: 'assigned', instructions: 'Practice match from a pasted schedule.', video_url: '' } })
    await mount()
    const card = [...host.querySelectorAll('.sc-assignment')].find(c => c.textContent.includes('1323'))
    await click([...card.querySelectorAll('button')].find(b => b.textContent === 'Scout match'))
    await settle(() => dialog()?.querySelector('textarea'), 'form ready')
    expect(dialog().querySelector('input[placeholder="qm1"]').readOnly).toBe(true)
    expect(hint()).toContain('Match from your assignment')
    await input(dialog().querySelector('textarea[aria-label="Notes"]'), 'Assigned practice match')
    await submit(); await settle(() => !dialog(), 'form closes')
    await settle(() => savedBar()?.dataset.state === 'synced', 'assignment observation synced')
    expect(mine().find(r => r.team_number === 1323)?.match_key).toBe('P7')
    // Positive control: the canonical spelling with the same assignment is refused by the server rule.
    const refused = await supabase.rpc('scouting_save', { p_actor: IDS.student, p_id: '22000000-0000-4000-8000-000000000778', p_event: EVENT, p_kind: 'observation', p_team: 1323, p_match: 'pm7', p_payload: { answers: {}, notes: 'x', source: 'live', video_url: '', request_delivery: false, assignment_id: '22000000-0000-4000-8000-000000000777', source_scope: 'current' }, p_expected_version: 0, p_operation: '22000000-0000-4000-8000-000000000779' })
    expect(refused.error?.message).toContain('assignment does not match')
  })
})

describe('the saved confirmation stays on screen (feedback 387edf14)', () => {
  it('says what was saved and where, follows it to synced, never times out, and is dismissed by the scout', async () => {
    await mount()
    expect(savedBar()).toBeNull()
    await click(buttons('Teams')[0])
    await expandTeams(1538)
    const card = [...host.querySelectorAll('.sc-team-card')].find(c => c.textContent.includes('1538'))
    await click([...card.querySelectorAll('button')].find(b => b.textContent === 'Observe'))
    await settle(() => dialog()?.querySelector('textarea'), 'form ready')
    await input(dialog().querySelector('input[placeholder="qm1"]'), 'P2')
    await input(dialog().querySelector('textarea[aria-label="Notes"]'), 'Saved from the Teams tab')
    await submit(); await settle(() => !dialog(), 'form closes')
    expect(savedBar()).toBeTruthy()
    expect(savedBar().textContent).toContain('Observation saved')
    expect(savedBar().textContent).toContain('team 1538 · Practice 2')
    await settle(() => savedBar()?.dataset.state === 'synced', 'synced')
    expect(savedBar().textContent).toContain('Synced to the team server')
    expect(host.querySelector('.sc-notice')).toBeNull() // one confirmation, not two
    await act(async () => { await pause(300) })
    expect(savedBar()).toBeTruthy()
    await click(buttons('Show it')[0])
    expect(host.querySelector('[role="tab"][aria-selected="true"]').textContent).toContain('Scout this')
    expect(host.querySelector('#sc-observations input[inputmode="numeric"]').value).toBe('1538')
    await click(host.querySelector('[aria-label="Dismiss saved confirmation"]'))
    expect(savedBar()).toBeNull()
  })

  it('reports a save the server refuses instead of claiming it synced', async () => {
    await mount()
    // Another device already saved this scout's observation of 4414 in pm9; this page has not downloaded it.
    const base = fixture.rows('scouting_records').find(r => r.kind === 'observation')
    fixture.db.scouting_records.push({ ...base, id: '22000000-0000-4000-8000-000000000901', member_id: IDS.student, team_number: 4414, match_key: 'pm9' })
    await openObservation(4414, 'pm9'); await submit(); await settle(() => !dialog(), 'form closes')
    await settle(() => savedBar()?.dataset.state === 'problem', 'conflict reported')
    expect(savedBar().textContent).toContain('Not synced')
    expect(savedBar().textContent).not.toContain('Synced to the team server')
  })
})

describe('the team card leads with what tells robots apart (feedback 449543dd)', () => {
  function seed({ bumpFailure = false } = {}) {
    const base = fixture.rows('scouting_records').find(r => r.kind === 'observation')
    const rows = fixture.db.scouting_records
    const set = (id, patch) => { const r = rows.find(x => x.id === id); r.payload = { ...r.payload, ...patch } }
    set('22000000-0000-4000-8000-000000000040', { custom: { passing_zone: 'alliance', passing_works: 3 } })
    set('22000000-0000-4000-8000-000000000041', { custom: { passing_zone: 'alliance', passing_works: 3 } })
    rows.push({ ...base, id: '22000000-0000-4000-8000-000000000950', team_number: 1538, match_key: 'qm5', payload: { answers: { trench: 'yes', bump: 'yes', ground_intake: 'yes' }, notes: '', source: 'live', video_url: '', custom: { passing_zone: 'neutral', passing_works: 3 } } })
    if (bumpFailure) rows.push({ ...base, id: '22000000-0000-4000-8000-000000000951', team_number: 1538, match_key: 'qm6', payload: { answers: { bump: 'no' }, notes: '', source: 'live', video_url: '' } })
  }
  const card = team => [...host.querySelectorAll('.sc-team-card')].find(c => c.querySelector('.sc-team-number')?.textContent === String(team))
  const keysIn = (el, selector) => [...el.querySelectorAll(selector)].map(x => x.dataset.evidenceKey)

  it('moves answers every observed robot shares into one folded line each, and leads with the ones that vary', async () => {
    seed()
    await mount(); await click(buttons('Teams')[0])
    expect(card(1538)).toBeUndefined()
    await expandTeams(1538, 1323, 5669)
    await settle(() => card(1538)?.querySelector('[data-shared-evidence]'), 'shared evidence')
    const c = card(1538)
    // TRENCH: 4414 passed in qm3 and failed in qm4, so it varies; BUMP and floor intake: every observed robot yes.
    expect(keysIn(c, '.sc-evidence')).toEqual(['trench'])
    expect(c.querySelector('[data-evidence-key="trench"]').textContent).toContain('Varies by robot')
    expect(keysIn(c, '.sc-shared-list li')).toEqual(['passing_works', 'bump', 'ground_intake'])
    const shared = c.querySelector('[data-shared-evidence]')
    expect(shared.hasAttribute('open')).toBe(false)
    expect(shared.querySelector('summary').textContent).toBe('Same for every robot observed so far (3)')
    const bump = shared.querySelector('[data-evidence-key="bump"]').textContent
    expect(bump).toContain('Every robot observed so far does this (2 robots).')
    expect(bump).toContain('This robot: 1/1 observed matches · Pit claim: Not recorded')
    expect(shared.querySelector('[data-evidence-key="passing_works"]').textContent).toContain('Same for every robot observed so far: median 3 (2 robots).')
    // Options: where it passes from varies (alliance vs neutral) and leads, marked.
    expect(keysIn(c, '[data-option-summary] > div')).toEqual(['passing_zone'])
    expect(c.querySelector('[data-option-summary]').textContent).toContain('Varies by robot')
    // A robot with no observations is never shown a 0: its shared lines say so.
    const empty = card(1323).querySelector('[data-shared-evidence]').textContent
    expect(empty).toContain('This robot: No evidence yet')
    expect(empty).not.toMatch(/This robot: 0/)
    expect(card(5669).querySelector('[data-evidence-key="bump"]').textContent).toContain('Pit claim: Yes')
  })

  it('a single observed failure moves the answer back up for every robot (positive control on the same fixture)', async () => {
    seed({ bumpFailure: true })
    await mount(); await click(buttons('Teams')[0])
    await expandTeams(1538, 4414, 1323)
    await settle(() => card(1538)?.querySelector('[data-shared-evidence]'), 'shared evidence')
    for (const team of [1538, 4414, 1323]) {
      expect(keysIn(card(team), '.sc-evidence')).toEqual(['trench', 'bump'])
      expect(keysIn(card(team), '.sc-shared-list li')).toEqual(['passing_works', 'ground_intake'])
    }
    expect(card(1538).querySelector('[data-evidence-key="bump"]').textContent).toContain('Varies by robot')
    expect(card(1538).querySelector('[data-evidence-key="bump"] .sc-ratio').textContent).toContain('1/2 observed matches')
  })
})
