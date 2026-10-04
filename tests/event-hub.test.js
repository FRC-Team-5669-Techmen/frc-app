// src/eventHub.js and src/csv.js: the event family hub's pure helpers.
//
// Every refusal or absence below sits beside its presence on the same input,
// so a helper that returned nothing would fail here rather than pass.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  ALLERGENS, allergyStrip, carStatus, createSaver, daySheetHtml, exportColumns, exportRecords, fmtDate, fmtDay, fmtPhone,
  fmtTime, formDays, gapLine, headcountLine, isoToZoned, leavesEarly, missingFor, needsSeat, nightOptions,
  parseInfoLine, sameNights, statusLine, textToLines, visibleSections, zonedToIso,
} from '../src/eventHub.js'
import { csvCell, toCsv } from '../src/csv.js'

const SQL = readFileSync(new URL('../supabase/migrations/0005_event_family_hub.sql', import.meta.url), 'utf8')
const TZ = 'America/Los_Angeles'

describe('vocabulary', () => {
  test('the allergen list is exactly the one the database CHECKs, in both places 0005 spells it', () => {
    const lists = [...SQL.matchAll(/array\[('peanut'[^\]]*)\]::text\[\]/g)].map((m) => m[1].replace(/'/g, '').split(','))
    expect(lists.length).toBe(2)
    for (const l of lists) expect(l).toEqual(ALLERGENS.map((a) => a.key))
    // Positive control: a list missing one key would not match.
    expect(lists[0]).not.toEqual(ALLERGENS.slice(1).map((a) => a.key))
  })
})

describe('time', () => {
  test('a wall-clock meet time crosses the fall-back change correctly', () => {
    expect(zonedToIso('2026-10-31', '05:45', TZ)).toBe('2026-10-31T12:45:00.000Z')
    expect(zonedToIso('2026-11-01', '05:45', TZ)).toBe('2026-11-01T13:45:00.000Z')
    expect(isoToZoned('2026-11-01T13:45:00.000Z', TZ)).toEqual({ date: '2026-11-01', time: '05:45' })
    expect(isoToZoned('2026-10-31T12:45:00.000Z', TZ)).toEqual({ date: '2026-10-31', time: '05:45' })
    expect(zonedToIso('2026-10-31', '', TZ)).toBeNull()
  })

  test('clock times and days read in the event time zone, not UTC', () => {
    expect(fmtTime('2026-10-31T13:02:00Z', TZ)).toBe('6:02 AM')
    expect(fmtDay('2026-10-29T06:59:00Z', TZ)).toBe('Wed, Oct 28')
    expect(fmtDate('2026-10-31')).toBe('Saturday, Oct 31')
    expect(fmtDate('2026-10-31', 'short')).toBe('Sat')
  })

  test('a ten-digit phone reads as (555) 555-0101; anything else stays as typed', () => {
    expect(fmtPhone('5555550101')).toBe('(555) 555-0101')
    expect(fmtPhone('+1 555-555-0101')).toBe('(555) 555-0101')
    expect(fmtPhone('ext 12')).toBe('ext 12')
  })
})

describe('the status line', () => {
  const ev = {
    title: 'Beach Blitz 2026', timezone: TZ, starts_on: '2026-10-30',
    phase1_due_at: '2026-10-24T06:59:00Z', lockin_opens_at: '2026-10-24T07:00:00Z', lockin_due_at: '2026-10-29T06:59:00Z',
  }
  const line = (event, progress) => statusLine({ event: { ...ev, ...event }, progress })

  test('one line per state, each from the progress the database computed', () => {
    expect(line({ lockin_open: false }, { phase1_done: false, missing: [{}, {}, {}] })).toBe('Sign-up due Fri, Oct 23. 3 answers to go.')
    expect(line({ lockin_open: false }, { phase1_done: false, missing: [{}] })).toBe('Sign-up due Fri, Oct 23. 1 answer to go.')
    expect(line({ lockin_open: false }, { phase1_done: true })).toBe('Sign-up done. Lock-in opens Sat, Oct 24.')
    expect(line({ lockin_open: true }, { phase1_done: true, lockin_done: false })).toBe('Sign-up done. Lock-in due Wed, Oct 28.')
    expect(line({ lockin_open: true }, { phase1_done: true, lockin_done: true })).toBe('All set. See you Fri, Oct 30.')
    expect(line({ over: true }, { phase1_done: true, lockin_done: true })).toBe('Beach Blitz 2026 is over. Thank you!')
  })

  test('no em dash and no "your son" anywhere in the line', () => {
    for (const p of [{ phase1_done: false, missing: [{}] }, { phase1_done: true }, { phase1_done: true, lockin_done: true }]) {
      for (const open of [true, false]) expect(line({ lockin_open: open }, p)).not.toMatch(/—|your son/i)
    }
  })

  test('missingFor picks one step', () => {
    const progress = { missing: [{ step: 'days', key: 'a' }, { step: 'food', key: 'b' }, { step: 'days', key: 'c' }] }
    expect(missingFor(progress, 'days').map((m) => m.key)).toEqual(['a', 'c'])
    expect(missingFor(progress, 'contacts')).toEqual([])
  })
})

describe('days, runs and the board view model', () => {
  const days = [
    { id: 'fri', date: '2026-10-30', position: 3 },
    { id: 'sat', date: '2026-10-31', position: 1 },
    { id: 'sun', date: '2026-11-01', position: 2 },
  ]

  test('the form follows position (Sat, Sun, Fri); the nights follow the calendar', () => {
    expect(formDays(days).map((d) => d.id)).toEqual(['sat', 'sun', 'fri'])
    expect(nightOptions(days).map((o) => o.label)).toEqual(['No, driving each day', 'Friday night', 'Saturday night', 'Both'])
    expect(nightOptions(days)[3].value).toEqual(['2026-10-30', '2026-10-31'])
    expect(sameNights(['2026-10-31', '2026-10-30'], ['2026-10-30', '2026-10-31'])).toBe(true)
    expect(sameNights([], ['2026-10-30'])).toBe(false)
    expect(sameNights(null, [])).toBe(false)
  })

  test('a student needs a seat only when coming and riding the team carpool that run', () => {
    expect(needsSeat({ attending: 'yes', eff_to: 'carpool', eff_home: 'self' }, 'to')).toBe(true)
    expect(needsSeat({ attending: 'yes', eff_to: 'carpool', eff_home: 'self' }, 'home')).toBe(false)
    expect(needsSeat({ attending: 'unsure', eff_to: 'carpool' }, 'to')).toBe(false)
    expect(needsSeat(null, 'to')).toBe(false)
  })

  test('car status labels and the gap read what the database decided', () => {
    expect(carStatus({ status: 'left', left_at: '2026-10-31T13:02:00Z' }, TZ).label).toBe('Left 6:02 AM')
    expect(carStatus({ status: 'arrived', arrived_at: '2026-10-31T13:58:00Z' }, TZ).label).toBe('Arrived 6:58 AM')
    expect(carStatus({ status: 'pending' }).label).toBe('Pending')
    expect(carStatus({ status: 'full' }).label).toBe('Full')
    expect(carStatus({ status: 'filling' }).label).toBe('Filling')
    expect(gapLine({ needs_seat: 3, open_seats: 5 })).toMatchObject({ text: 'Needs a seat: 3 · Open seats: 5', covered: true })
    expect(gapLine({ needs_seat: 4, open_seats: 2 }).covered).toBe(false)
  })

  test('a car that leaves before the day ends says when; one that stays says nothing', () => {
    const day = { venue_closes_at: '2026-11-01T01:15:00Z' }
    expect(leavesEarly({ leave_by: '2026-10-31T22:00:00Z' }, day, TZ)).toBe('3:00 PM')
    expect(leavesEarly({ leave_by: '2026-11-01T01:15:00Z' }, day, TZ)).toBeNull()
    expect(leavesEarly({ leave_by: null }, day, TZ)).toBeNull()
  })

  test('allergy strip and headcount', () => {
    expect(allergyStrip([{ allergen: 'peanut', count: 2 }, { allergen: 'shellfish', count: 1 }])).toBe('Peanut (2), Shellfish (1)')
    expect(allergyStrip([])).toBe('')
    expect(headcountLine({ students: 14, adults: 6, firm: false })).toBe('14 students + 6 adults, estimate')
    expect(headcountLine({ students: 1, adults: 1, firm: true })).toBe('1 student + 1 adult, firm')
  })
})

describe('Event info lines', () => {
  const links = { stream: 'https://twitch.tv/ocfirst', team_list: '' }

  test('rows, links, link keys, missing links and plain text', () => {
    expect(parseInfoLine('Live stream | link:stream', links)).toEqual({ kind: 'link', label: 'Live stream', href: 'https://twitch.tv/ocfirst' })
    expect(parseInfoLine('Team list | link:team_list', links)).toEqual({ kind: 'row', label: 'Team list', value: 'Not posted yet', missing: true })
    expect(parseInfoLine('Kabobaholic | https://thekabobaholic.com/', links)).toMatchObject({ kind: 'link', href: 'https://thekabobaholic.com/' })
    expect(parseInfoLine('Friday | 5:00 to 9:00 PM', links)).toEqual({ kind: 'row', label: 'Friday', value: '5:00 to 9:00 PM' })
    expect(parseInfoLine('No prop weapons.', links)).toEqual({ kind: 'text', text: 'No prop weapons.' })
    expect(textToLines('a\n\n  b \n')).toEqual(['a', 'b'])
  })

  test('a section tied to a link shows only when that link is set', () => {
    const info = { sections: [{ key: 'a', title: 'A', lines: [] }, { key: 'pc', title: 'Parent chat', if_link: 'parent_channel', lines: [] }] }
    expect(visibleSections(info, { parent_channel: '' }).map((s) => s.key)).toEqual(['a'])
    expect(visibleSections(info, { parent_channel: 'https://groupme.com/join' }).map((s) => s.key)).toEqual(['a', 'pc'])
  })
})

describe('autosave', () => {
  const instant = () => Promise.resolve()

  test('a failed save keeps the value and retries until it lands; nothing typed is lost', async () => {
    const sent = []
    const states = []
    let fails = 2
    const saver = createSaver({
      wait: instant,
      send: async (p) => { sent.push(p.value); if (fails-- > 0) return { kind: 'error' }; return { kind: 'ok', data: { saved_at: '2026-10-20T21:41:00Z' } } },
      onState: (k, s) => states.push(s.state),
    })
    await saver.save('parent_phone', { value: '5555550101' })
    expect(sent).toEqual(['5555550101', '5555550101', '5555550101'])
    expect(states).toEqual(['saving', 'retrying', 'retrying', 'retrying', 'retrying', 'saved'])
    expect(saver.hasPending()).toBe(false)
  })

  test('the latest value wins: typed during a save, it is sent next, and an older value is never sent after it', async () => {
    const sent = []
    let release
    const gate = new Promise((r) => { release = r })
    const saver = createSaver({
      wait: instant,
      send: async (p) => { sent.push(p.value); if (p.value === 'Al') await gate; return { kind: 'ok', data: {} } },
    })
    const first = saver.save('parent_name', { value: 'Al' })
    saver.save('parent_name', { value: 'Alex' })
    saver.save('parent_name', { value: 'Alex Avila' })
    release()
    await first
    expect(sent).toEqual(['Al', 'Alex Avila'])
  })

  test('a rule refusal is shown and not retried; a network failure is retried', async () => {
    let calls = 0
    const states = []
    const saver = createSaver({
      wait: instant,
      send: async () => { calls += 1; return { kind: 'refused', message: 'Keep this filled in while you are driving.' } },
      onState: (k, s) => states.push(s),
    })
    await saver.save('car_description', { value: '' })
    expect(calls).toBe(1)
    expect(states.at(-1)).toEqual({ state: 'refused', message: 'Keep this filled in while you are driving.' })
  })

  test('a value that never landed is kept in the store and replayed on the next visit', async () => {
    let box = {}
    const store = { get: () => box, set: (v) => { box = v } }
    let online = false
    const sent = []
    const first = createSaver({ store, wait: () => new Promise(() => {}), send: async (p) => { sent.push(p); return online ? { kind: 'ok', data: {} } : { kind: 'offline' } } })
    first.save('dietary', { field: 'dietary', value: 'Vegetarian' })
    await Promise.resolve(); await Promise.resolve()
    expect(box).toEqual({ dietary: { field: 'dietary', value: 'Vegetarian' } })
    first.stop()
    online = true
    const second = createSaver({ store, wait: () => Promise.resolve(), send: async (p) => { sent.push(p); return { kind: 'ok', data: {} } } })
    expect(second.hasPending()).toBe(true)
    await second.replay()
    expect(sent.at(-1)).toEqual({ field: 'dietary', value: 'Vegetarian' })
    expect(box).toEqual({})
  })
})

describe('CSV formula guard (decision 18, option A)', () => {
  test('text that a spreadsheet would run is written as text; everything else is untouched', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"')
    expect(csvCell('+1 555 555 0101')).toBe("'+1 555 555 0101")
    expect(csvCell('-3')).toBe("'-3")
    expect(csvCell('@sum')).toBe("'@sum")
    expect(csvCell('Chicken tray')).toBe('Chicken tray')
    expect(csvCell(-3)).toBe('-3')
    expect(csvCell(true)).toBe('yes')
    expect(csvCell(null)).toBe('')
    expect(csvCell('a, b')).toBe('"a, b"')
  })

  test('toCsv writes a BOM, a header and one guarded row per record', () => {
    const csv = toCsv([['a', 'A'], ['b', 'B']], [{ a: '=1+1', b: 2 }])
    expect(csv.startsWith('﻿A,B\r\n')).toBe(true)
    expect(csv).toContain("'=1+1,2")
  })

  test('the export flattens each day into its own columns', () => {
    const rows = [{ student: 'Sam', days: [{ day: 'Sat', attending: 'yes', to_car: 'Dana Diaz' }] }]
    const cols = exportColumns(rows).map(([k]) => k)
    expect(cols).toContain('Sat:attending')
    expect(cols).toContain('Sat:to_car')
    expect(exportRecords(rows)[0]).toMatchObject({ student: 'Sam', 'Sat:attending': 'yes', 'Sat:to_car': 'Dana Diaz' })
  })
})

describe('the day sheet', () => {
  test('prints what the staff board carries, escaped', () => {
    const html = daySheetHtml({
      event: { title: 'Beach Blitz 2026', timezone: TZ },
      day: {
        id: 'sat', label: 'Saturday, Oct 31', meet_at: '2026-10-31T12:45:00Z', meet_place: 'Bosco Tech front parking lot', captain: 'Max Mentor',
        runs: [{ run: 'to', needs_seat: 1, open_seats: 2, unplaced: [{ name: 'Riley <b>Student</b>' }], nearby: [],
          cars: [{ driver: 'Dana Diaz', description: 'blue van', driver_phone: '5555551234', status: 'filling', seats: 3, riders_count: 1,
            riders: [{ name: 'Sam Student', pickup: true, spot: 'Main St and 1st', parent_phone: null }] }] }],
      },
      meals: [{ day_id: 'sat', label: 'Sat lunch', starts_at: '2026-10-31T19:00:00Z', allergy_names: [{ name: 'Sam Student', allergens: ['peanut'] }] }],
      printedAt: '2026-10-30T20:00:00Z',
    })
    expect(html).toContain('Meet 5:45 AM at Bosco Tech front parking lot')
    expect(html).toContain('Max Mentor')
    expect(html).toContain('5555551234')
    expect(html).toContain('pickup: Main St and 1st')
    expect(html).toContain('Sam Student: Peanut')
    expect(html).toContain('Riley &lt;b&gt;Student&lt;/b&gt;')
    expect(html).not.toContain('<b>Student</b>')
  })
})
