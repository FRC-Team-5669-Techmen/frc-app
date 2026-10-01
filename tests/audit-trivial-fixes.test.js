// Pins for the overhaul audit's trivial fixes (2026-10-01) that have a pure
// half: the service-hour letter's method sentence and capped mark, the e2e
// viewport spec parser, the job-link scheme guard, and where the check-in
// pages put their live regions. The rendered halves are in the browser:
// tools/e2e/checkin.mjs step a counts the alerts on a real confirm screen and
// a real receipt.
//
// Every "absent" below is paired with the same fixture driven the other way,
// so a module that had stopped producing anything could not pass.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buildRows, letterData, letterHtml } from '../src/reporting.js'
import { MAX_SESSION_HOURS } from '../src/hoursUtils.js'
import { viewportFor, VIEWPORTS } from '../tools/e2e/lib.mjs'

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('service-hour letter (audit item 28b)', () => {
  const team = { name: 'Techmen', org: 'Don Bosco Technical Institute' }
  // One plain 3h volunteer session, and one forgotten sign-out: 14h, which the
  // cap counts as MAX_SESSION_HOURS.
  const rows = buildRows({ m1: 'Sam' }, [
    { id: 'i1', user_id: 'm1', type: 'in', event_time: '2026-09-10T22:00:00+00:00', category: 'volunteer' },
    { id: 'o1', user_id: 'm1', type: 'out', event_time: '2026-09-11T01:00:00+00:00' },
    { id: 'i2', user_id: 'm1', type: 'in', event_time: '2026-09-12T16:00:00+00:00', category: 'volunteer' },
    { id: 'o2', user_id: 'm1', type: 'out', event_time: '2026-09-13T06:00:00+00:00' },
  ], [], {})
  const html = letterHtml(
    letterData(rows, { memberId: 'm1', memberName: 'Sam', from: '2026-09-01', to: '2026-09-30', categories: ['volunteer'] }),
    { preparedBy: 'A mentor', generatedAt: 'now', team })

  test('the method sentence says a long session counts at the cap, not that it is excluded', () => {
    expect(html).toContain(`a session longer than ${MAX_SESSION_HOURS} hours`)
    expect(html).toContain(`is counted as ${MAX_SESSION_HOURS} hours and marked capped below`)
    expect(html).not.toContain('exceeding the daily cap')
  })

  test('the capped row is marked; the plain row is not (positive control)', () => {
    const capped = /<td>2026-09-12<\/td>\s*<td>Volunteer<\/td>\s*<td>Attendance \(capped\)<\/td>\s*<td class="num">(\d+)<\/td>/.exec(html)
    expect(capped?.[1]).toBe(String(MAX_SESSION_HOURS))
    expect(html).toMatch(/<td>2026-09-10<\/td>\s*<td>Volunteer<\/td>\s*<td>Attendance<\/td>\s*<td class="num">3<\/td>/)
    expect(html.match(/\(capped\)/g)).toHaveLength(1)
  })
})

describe('e2e viewport specs (audit item 65)', () => {
  test('WIDTHxHEIGHT builds the reported phone size', () => {
    expect(viewportFor('342x673')).toMatchObject({ name: '342x673', viewport: { width: 342, height: 673 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    expect(viewportFor('384x692').viewport).toEqual({ width: 384, height: 692 })
    expect(viewportFor('800x600')).toMatchObject({ viewport: { width: 800, height: 600 }, isMobile: false, deviceScaleFactor: 1 })
  })

  test('a bare width still gets its preset, numeric or string (positive control)', () => {
    expect(viewportFor(375)).toBe(VIEWPORTS[375])
    expect(viewportFor('375')).toBe(VIEWPORTS[375])
    expect(viewportFor(1440)).toBe(VIEWPORTS[1440])
    expect(viewportFor(500)).toMatchObject({ name: '500', viewport: { width: 500, height: 812 }, isMobile: true })
    // ...while a spec that names a height never takes the preset's.
    expect(viewportFor('375x667')).not.toBe(VIEWPORTS[375])
    expect(viewportFor('375x667').viewport).toEqual({ width: 375, height: 667 })
  })
})

describe('job reference links (audit item 81)', () => {
  const jobs = src('src/JobsPage.jsx')
  // The guard as shipped, read out of the component so this cannot drift from it.
  const m = /href=\{\/(.+?)\/i\.test\(l\.url \?\? ''\) \? l\.url : undefined\}/.exec(jobs)

  test('the link renders through the scheme guard, never href={l.url} directly', () => {
    expect(m).not.toBeNull()
    expect(jobs).not.toMatch(/href=\{l\.url\}/)
  })

  test('the guard refuses script and data schemes and accepts http(s) (positive control)', () => {
    const guard = new RegExp(m[1], 'i')
    for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,hi', 'vbscript:x', ' javascript:x', '//evil.example', 'ftp://x.example']) {
      expect(guard.test(bad), bad).toBe(false)
    }
    for (const good of ['https://www.andymark.com/part', 'http://example.com', 'HTTPS://EXAMPLE.COM/A']) {
      expect(guard.test(good), good).toBe(true)
    }
  })

  test('a job row opens from the keyboard', () => {
    // The opening tag, up to its own closing '>' line (the handlers contain '=>').
    const row = /<li\s+key=\{t\.id\}\s+className=\{`jobs-row[\s\S]*?\n\s*>\n/.exec(jobs)?.[0] ?? ''
    expect(row).toContain('role="button"')
    expect(row).toContain('tabIndex={0}')
    expect(row).toMatch(/onKeyDown=\{e => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\)/)
  })
})

describe('check-in live regions (audit items 13 and 31)', () => {
  // The result screens announce; the confirm screens share .checkin-status and
  // must not, or a screen reader would read every prompt as an alert.
  const pages = {
    'src/CheckinPage.jsx': {
      results: ['{msg.detail}', 'ALREADY {verb}', 'CHECKED {verb}'],
      prompts: ['Tap to confirm your check-in', 'Checked in since'],
    },
    'src/VolunteerCheckinPage.jsx': {
      results: ['{msg.detail}', 'ALREADY {verb}', 'VOLUNTEER · CHECKED {verb}'],
      prompts: ['Volunteering since'],
    },
  }
  const statusLines = (text) => [...text.matchAll(/<p className="checkin-status"([^>]*)>\s*([^<\n]*)/g)]
    .map(([, attrs, body]) => ({ alert: attrs.includes('role="alert"'), body: body.trim() }))

  for (const [file, { results, prompts }] of Object.entries(pages)) {
    test(`${file}: exactly the three result lines are role=alert`, () => {
      const lines = statusLines(src(file))
      const alerts = lines.filter((l) => l.alert)
      expect(alerts).toHaveLength(3)
      for (const r of results) expect(alerts.some((l) => l.body.startsWith(r)), r).toBe(true)
      // Positive control: the prompts are found by the same scan, and are not alerts.
      for (const p of prompts) {
        const hit = lines.find((l) => l.body.startsWith(p))
        expect(hit, p).toBeTruthy()
        expect(hit.alert, p).toBe(false)
      }
    })

    test(`${file}: the fault line carries the error code and the mentor sentence`, () => {
      const text = src(file)
      expect(text).toMatch(/setFault\(err\?\.code \|\| err\?\.message \|\| null\)/g)
      expect(text.match(/setFault\(err\?\.code/g)).toHaveLength(text.match(/setStatus\('error'\)/g).length)
      expect(text).toContain("${fault ? ` (${fault})` : ''}. Try again. If it happens again, show this screen to a mentor.")
    })
  }
})
