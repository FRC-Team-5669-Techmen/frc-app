// @vitest-environment jsdom
// Observation options (0037, ledger 0029) through the real scouting page on
// the fixture. DOM + IndexedDB emulation only: no claim about layout or phones.
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


const optionRows = () => fixture.rows('scouting_options')
const card = () => host.querySelector('[data-observation-options]')

describe('observation options on the scouting page', () => {
  it('a scout sees only the options that are on, answers one, and the saved observation carries it', async () => {
    await mount('student')
    await settle(() => card(), 'options card')
    expect(card().textContent).toContain('2 on')
    expect(card().textContent).toContain('Passes FUEL from')
    expect(card().textContent).not.toContain('Ready for each phase shift')
    expect(card().textContent).not.toContain('to review')
    await click(buttons('New observation')[0])
    await settle(() => host.querySelector('[data-option-fields]'), 'option fields in the form')
    const fields = host.querySelector('[data-option-fields]')
    expect(fields.textContent).toContain('Passes FUEL from')
    expect(fields.textContent).toContain('Passes reach a partner')
    expect(fields.textContent).not.toContain('Ready for each phase shift')
    await input(host.querySelector('dialog input[type="number"]'), '4414')
    await input(host.querySelector('dialog input[placeholder="qm1"]'), 'Q9')
    const zone = fields.querySelector('[data-field="passing_zone"]')
    await click([...zone.querySelectorAll('button')].find(b => b.textContent === 'Neutral zone'))
    await click(buttons('Save observation')[0])
    await settle(() => fixture.rows('scouting_records').some(r => r.kind === 'observation' && r.team_number === 4414 && r.match_key === 'qm9'), 'observation saved')
    const saved = fixture.rows('scouting_records').find(r => r.kind === 'observation' && r.team_number === 4414 && r.match_key === 'qm9')
    expect(saved.payload.custom).toEqual({ passing_zone: 'neutral' })
    expect('passing_works' in saved.payload.custom).toBe(false)
  })

  it('an observation with no option answered carries no custom key (skipped is never zero)', async () => {
    await mount('student')
    await click(buttons('New observation')[0])
    await settle(() => host.querySelector('[data-option-fields]'))
    await input(host.querySelector('dialog input[type="number"]'), '1323')
    await input(host.querySelector('dialog input[placeholder="qm1"]'), 'qm10')
    await input(host.querySelector('dialog textarea[aria-label="Notes"]'), 'Fast cycles')
    await click(buttons('Save observation')[0])
    await settle(() => fixture.rows('scouting_records').some(r => r.team_number === 1323 && r.match_key === 'qm10'))
    expect('custom' in fixture.rows('scouting_records').find(r => r.team_number === 1323 && r.match_key === 'qm10').payload).toBe(false)
  })

  it('a scout suggests an option from inside an observation; it waits for the lead and appears on no form', async () => {
    await mount('student')
    await click(buttons('New observation')[0])
    await settle(() => host.querySelector('dialog [data-suggest-open]'))
    await input(host.querySelector('dialog input[type="number"]'), '1538')
    await input(host.querySelector('dialog input[placeholder="qm1"]'), 'qm4')
    await click(host.querySelector('dialog [data-suggest-open]'))
    await input(host.querySelector('dialog [data-suggest] input[maxlength="120"]'), 'Plays defense in the neutral zone')
    await click(buttons('Send to scouting lead')[0])
    await settle(() => optionRows().some(o => o.label === 'Plays defense in the neutral zone'), 'request saved')
    const row = optionRows().find(o => o.label === 'Plays defense in the neutral zone')
    expect(row).toMatchObject({ status: 'requested', type: 'yesno', example_team: 1538, key: 'plays_defense_in_the_neutral_zone' })
    expect(row.request_note).toContain('Team 1538')
    await settle(() => host.textContent.includes('Sent to your scouting lead'))
    expect(host.querySelector('[data-option-fields]').textContent).not.toContain('Plays defense in the neutral zone')
  })

  it('the lead reviews a request and turns it on; then every scout gets it', async () => {
    await mount('admin')
    await settle(() => card() && card().textContent.includes('1 to review'), 'review count')
    const req = card().querySelector('[data-option="handles_shifts"]')
    expect(req.textContent).toContain('Some robots sit idle')
    await click([...req.querySelectorAll('button')].find(b => b.textContent === 'Turn on'))
    await settle(() => optionRows().find(o => o.key === 'handles_shifts').status === 'active', 'approved')
    expect(card().textContent).toContain('3 on')
    await unmount(); host.innerHTML = ''
    await mount('student')
    await click(buttons('New observation')[0])
    await settle(() => host.querySelector('[data-option-fields]'))
    expect(host.querySelector('[data-option-fields]').textContent).toContain('Ready for each phase shift')
  })

  it('a scout has no manage controls; the lead does (both directions on one fixture)', async () => {
    await mount('student')
    await settle(() => card())
    const scoutButtons = [...card().querySelectorAll('button')].map(b => b.textContent)
    expect(scoutButtons.filter(t => ['Turn on', 'Turn off', 'Edit', 'Add an observation option'].includes(t))).toHaveLength(0)
    await unmount(); host.innerHTML = ''
    await mount('admin')
    await settle(() => card())
    const leadButtons = [...card().querySelectorAll('button')].map(b => b.textContent)
    expect(leadButtons.filter(t => ['Turn on', 'Turn off', 'Edit', 'Add an observation option'].includes(t)).length).toBeGreaterThanOrEqual(4)
  })

  it('the lead adds a pick-one option; the type locks once used', async () => {
    await mount('admin')
    await settle(() => host.querySelector('[data-option-add]'))
    await click(host.querySelector('[data-option-add]'))
    const editor = () => card().querySelector('[aria-label="New observation option"]')
    await input(editor().querySelector('input[maxlength="120"]'), 'Climb speed')
    await click([...editor().querySelectorAll('button')].find(b => b.textContent === 'Pick one'))
    await input(editor().querySelector('textarea'), 'Fast\nSlow\nFailed')
    await click([...editor().querySelectorAll('button')].find(b => b.textContent === 'Turn on for every scout'))
    await settle(() => optionRows().some(o => o.label === 'Climb speed'))
    const o = optionRows().find(x => x.label === 'Climb speed')
    expect(o).toMatchObject({ status: 'active', type: 'choice', was_active: true, choices: [['fast', 'Fast'], ['slow', 'Slow'], ['failed', 'Failed']] })
    const r = await supabase.rpc('scouting_option_save', { p_id: o.id, p_label: 'Climb speed', p_type: 'rating', p_choices: null, p_phase: 'endgame', p_help: null, p_status: 'active', p_position: null })
    expect(r.error?.message).toMatch(/cannot change/)
  })

  it('before 0037 the page shows no options card and the form keeps the built-in fields (schema missing)', async () => {
    fixture.setMigrations(['0022', '0027', '0030'])
    fixture.reset()
    await mount('student')
    await settle(() => host.querySelector('[data-scout-page="event"]'))
    expect(card()).toBe(null)
    await click(buttons('New observation')[0])
    await settle(() => host.querySelector('dialog'))
    expect(host.querySelector('[data-option-fields]')).toBe(null)
    expect(host.querySelector('[data-suggest-open]')).toBe(null)
  })
})
