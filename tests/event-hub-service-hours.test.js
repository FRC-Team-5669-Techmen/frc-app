// The parent service hours note (0011) in src/eventHub.js and src/csv.js:
// which of the five spots show something, and the service hours CSV.
//
// Every absence sits beside its presence on the same fixture, counted both
// ways, so a helper that returned nothing at all would fail here.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  SERVICE_HOURS_COLUMNS, SERVICE_HOURS_CSV_NOTE, SERVICE_HOURS_LABELS, hasServiceHoursData, serviceHoursNote,
  serviceHoursRecords, serviceHoursSpots,
} from '../src/eventHub.js'
import { toCsv } from '../src/csv.js'

const NOTE = 'Driving, attending, and volunteering at Beach Blitz all count toward parent service hours.'
const EVENT = { id: 'e1', title: 'Beach Blitz 2026', parent_service_hours_note: NOTE, links: { volunteer: 'https://beachblitz.org/volunteer/index.html' } }
const SPOTS = ['join', 'banner', 'drive', 'adults', 'info']
const shown = (spots) => SPOTS.filter((k) => spots[k] != null)

describe('the five spots', () => {
  test('with a note, all five spots show; with none, null or blank, or before 0011, none do', () => {
    const on = serviceHoursSpots(EVENT)
    expect(shown(on)).toEqual(SPOTS)
    for (const off of [
      { ...EVENT, parent_service_hours_note: null },
      { ...EVENT, parent_service_hours_note: '   ' },
      { id: 'e1', title: 'Before 0011', links: EVENT.links },
      null,
    ]) {
      expect(shown(serviceHoursSpots(off))).toEqual([])
    }
    // Both counts, on the same event: 5 with the note, 0 without.
    expect(shown(on).length).toBe(5)
    expect(shown(serviceHoursSpots({ ...EVENT, parent_service_hours_note: null })).length).toBe(0)
  })

  test('the join and banner spots show the stored note; the rest are the fixed short labels', () => {
    const s = serviceHoursSpots({ ...EVENT, parent_service_hours_note: `  ${NOTE}  ` })
    expect(s.join).toBe(NOTE)
    expect(s.banner).toBe(NOTE)
    expect(s.drive).toBe('Driving counts toward parent service hours.')
    expect(s.adults).toBe('Adults who attend count toward parent service hours.')
    expect(s.info).toEqual({
      title: 'Parent service hours', note: NOTE,
      volunteer: { href: 'https://beachblitz.org/volunteer/index.html', label: 'Volunteer at the event: also counts' },
    })
    expect(serviceHoursNote(EVENT)).toBe(NOTE)
    expect(serviceHoursNote({ parent_service_hours_note: '' })).toBeNull()
  })

  test('Event info offers the volunteer link only when the event has a web address for it', () => {
    expect(serviceHoursSpots(EVENT).info.volunteer).not.toBeNull()
    expect(serviceHoursSpots({ ...EVENT, links: {} }).info.volunteer).toBeNull()
    expect(serviceHoursSpots({ ...EVENT, links: { volunteer: 'ask a mentor' } }).info.volunteer).toBeNull()
    // The section itself stays, with the note, when there is no link.
    expect(serviceHoursSpots({ ...EVENT, links: {} }).info.note).toBe(NOTE)
  })

  test('the copy keeps the house rules: no em dash, no British spelling', () => {
    const all = [...Object.values(SERVICE_HOURS_LABELS), SERVICE_HOURS_CSV_NOTE, ...SERVICE_HOURS_COLUMNS.map(([, h]) => h)]
    for (const t of all) {
      expect(t).not.toMatch(/—/)
      expect(t).not.toMatch(/colour|organis|licence|programme/i)
    }
  })

  test('nothing in src/ names Beach Blitz', () => {
    for (const f of ['eventHub.js', 'EventJoinPage.jsx', 'EventFamilyPage.jsx', 'EventFamilyParts.jsx', 'EventHubBoards.jsx', 'TripsAdmin.jsx']) {
      expect(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).not.toMatch(/beach blitz/i)
    }
  })
})

// Shaped like _hub_export after 0011: two families, three days.
const day = (date, d, extra) => ({ day: d, date, attending: 'yes', adults: 1, to: 'carpool', home: 'carpool', drove: false, ...extra })
const EXPORT = [
  {
    student: 'Casey Exempt', parent_name: 'Morgan Exempt', parent_email: 'casey.family@example.com', emails: 'casey.family@example.com',
    days: [
      day('2026-10-31', 'Sat', { drove: true, adults: 2, to: 'driving', home: 'driving' }),
      day('2026-10-30', 'Fri', { drove: true }),
      day('2026-11-01', 'Sun', { attending: 'no', adults: 3 }),
    ],
  },
  {
    student: 'Sam Student', parent_name: null, parent_email: null, emails: 'parent.test@example.com',
    days: [day('2026-10-30', 'Fri', { adults: null }), day('2026-10-31', 'Sat'), day('2026-11-01', 'Sun', { attending: null, adults: null })],
  },
]

describe('the service hours CSV', () => {
  test('one row per family per day, in date order, with drove and adults as the form recorded them', () => {
    const rows = serviceHoursRecords(EXPORT)
    expect(rows.length).toBe(6)
    expect(rows.slice(0, 3)).toEqual([
      { parent_name: 'Morgan Exempt', parent_email: 'casey.family@example.com', student: 'Casey Exempt', day: 'Fri, Oct 30', drove: true, adults: 1 },
      { parent_name: 'Morgan Exempt', parent_email: 'casey.family@example.com', student: 'Casey Exempt', day: 'Sat, Oct 31', drove: true, adults: 2 },
      // Not coming that day: the question is not asked, so 0 (a stored 3 is not counted).
      { parent_name: 'Morgan Exempt', parent_email: 'casey.family@example.com', student: 'Casey Exempt', day: 'Sun, Nov 1', drove: false, adults: 0 },
    ])
    // No parent email answered yet: the invite emails stand in.
    expect(rows[3]).toEqual({ parent_name: null, parent_email: 'parent.test@example.com', student: 'Sam Student', day: 'Fri, Oct 30', drove: false, adults: null })
    // Positive and negative on the same fixture: 2 drove, 4 did not.
    expect(rows.filter((r) => r.drove).length).toBe(2)
    expect(rows.filter((r) => !r.drove).length).toBe(4)
  })

  test('the file opens with the count-not-names note above the header, and guards formulas', () => {
    const rows = serviceHoursRecords([{ ...EXPORT[0], parent_name: '=HYPERLINK("x")' }])
    const text = toCsv(SERVICE_HOURS_COLUMNS, rows, { note: SERVICE_HOURS_CSV_NOTE })
    const lines = text.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines[0]).toMatch(/COUNT of adults, not their names/)
    expect(lines[1]).toBe('Parent name,Parent email,Student,Day,Drove,Adults attending')
    expect(lines.length).toBe(2 + 3)
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",casey.family@example.com,Casey Exempt,"Fri, Oct 30",yes,1`)
    expect(lines[4]).toMatch(/,no,0$/)
    // Without a note the header is the first line, as before.
    expect(toCsv(SERVICE_HOURS_COLUMNS, rows).replace(/^﻿/, '').split('\r\n')[0]).toBe(lines[1])
  })

  test('the list is offered only on export rows that carry 0011 (drove)', () => {
    expect(hasServiceHoursData(EXPORT)).toBe(true)
    const before = EXPORT.map((r) => ({ ...r, days: r.days.map(({ drove, date, ...d }) => d) }))
    expect(hasServiceHoursData(before)).toBe(false)
    expect(hasServiceHoursData([])).toBe(false)
  })
})
