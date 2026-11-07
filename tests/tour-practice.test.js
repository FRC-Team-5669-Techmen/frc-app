// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../src/supabase', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: { id: 'sample' }, error: null })),
  },
}))
import { supabase } from '../src/supabase'
import { AbsenceForm } from '../src/StandingPage.jsx'
const roots = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.replaceChildren()
  vi.clearAllMocks()
})
globalThis.IS_REACT_ACT_ENVIRONMENT = true
function mount(practice) {
  const node = document.createElement('div')
  document.body.append(node)
  const root = createRoot(node)
  roots.push(root)
  const done = vi.fn()
  act(() =>
    root.render(
      React.createElement(AbsenceForm, {
        practice,
        events: [
          {
            id: 'sample',
            title: 'Sample meeting',
            kind: 'meeting',
            starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          },
        ],
        absences: [],
        onDone: done,
      }),
    ),
  )
  return { node, done }
}
async function send(node) {
  await act(async () => {
    const select = node.querySelector('select')
    select.value = 'sample'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () =>
    [...node.querySelectorAll('[role=radio]')]
      .find((b) => b.textContent === 'Medical visit')
      .click(),
  )
  await act(async () =>
    node
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
}
describe('shared absence practice', () => {
  it('labels the reason group and note for screen readers', () => {
    const { node } = mount(true)
    expect(
      node.querySelector('[role=radiogroup]').getAttribute('aria-label'),
    ).toBe('Reason')
    expect(
      node
        .querySelector('input[placeholder^="Note"]')
        .getAttribute('aria-label'),
    ).toBe('Note for the mentor')
  })
  it('practice validates and completes without a real request; the live counterpart still sends', async () => {
    const practice = mount(true)
    await act(async () =>
      practice.node
        .querySelector('form')
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    )
    expect(practice.done).not.toHaveBeenCalled()
    await send(practice.node)
    expect(practice.done).toHaveBeenCalledOnce()
    expect(supabase.rpc).not.toHaveBeenCalled()
    const live = mount(false)
    await send(live.node)
    expect(supabase.rpc).toHaveBeenCalledWith(
      'request_absence',
      expect.objectContaining({ p_event: 'sample', p_reason: 'medical' }),
    )
    expect(live.done).toHaveBeenCalledOnce()
  })
})
