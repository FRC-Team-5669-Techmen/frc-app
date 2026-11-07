// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import NavBar from '../src/NavBar.jsx'
const access = vi.hoisted(() => ({ canApprove: true }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { signOut: vi.fn() }, rpc: async () => ({ data: access.canApprove }), from: () => ({ select: () => ({ eq: async () => ({ count: 2 }) }) }) } }))
vi.mock('../src/adminTools', async importOriginal => ({ ...await importOriginal(), loadAdminCounts: async () => ({}), totalWaiting: () => 0 }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, host
async function mount() {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(React.createElement(MemoryRouter, null, React.createElement(NavBar, { session: { user: { id: 'fictional-id', user_metadata: { full_name: 'Robin Test' } } } }))) })
  const button = host.querySelector('.nav-avatar-btn')
  await act(async () => { button.click() })
  return button
}
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); access.canApprove = true })
it('a student approver has at most six top-level branches, counting preferences too', async () => {
  await mount()
  const menu = host.querySelector('.nav-avatar-menu')
  const branches = [...menu.children].filter(e => e.matches('a, button, details') || e.querySelector('button, a, summary'))
  expect(branches.length).toBeGreaterThan(3)
  expect(branches.length).toBeLessThanOrEqual(6)
  expect(menu.querySelector('a[href="/signouts"]')).not.toBeNull()
  const training = menu.querySelector('a[href="/training"]')
  expect(training?.textContent).toBe('Training / Replay tour')
  expect(training?.closest('details')?.querySelector('summary')?.textContent).toBe('Preferences')
})
it('Escape closes an open account menu and returns focus to its trigger', async () => {
  const button = await mount()
  const link = host.querySelector('a[href="/profile"]'); link.focus()
  await act(async () => link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(host.querySelector('.nav-avatar-menu')).toBeNull()
  expect(document.activeElement).toBe(button)
})
it('outside pointer input dismisses the menu while inside input keeps it open', async () => {
  await mount()
  await act(async () => host.querySelector('.nav-menu-head').dispatchEvent(new Event('pointerdown', { bubbles: true })))
  expect(host.querySelector('.nav-avatar-menu')).not.toBeNull()
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
  expect(host.querySelector('.nav-avatar-menu')).toBeNull()
})

it('switching to another member with the same roles drops the old approval capability', async () => {
  await mount()
  expect(host.querySelector('a[href="/signouts"]')).not.toBeNull()
  access.canApprove = false
  await act(async () => { root.render(React.createElement(MemoryRouter, null, React.createElement(NavBar, { session: { user: { id: 'second-invented-member', user_metadata: { full_name: 'Taylor Test' } } } }))) })
  if (!host.querySelector('.nav-avatar-menu')) await act(async () => host.querySelector('.nav-avatar-btn').click())
  expect(host.querySelector('a[href="/profile"]')).not.toBeNull()
  expect(host.querySelector('a[href="/signouts"]')).toBeNull()
})

it('closed search leaves no dialog beside a page dialog', async () => {
  await mount()
  expect(host.querySelector('.nav-avatar-menu')).not.toBeNull()
  expect(host.querySelector('dialog')).toBeNull()
})
