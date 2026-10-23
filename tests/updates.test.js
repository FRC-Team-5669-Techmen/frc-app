// What's new (ledger 0019): src/updates.js ordering, the unread rule, and
// that every link points at a real route.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { UPDATES, sortUpdates, newestKey, hasUnread, newSince, readSeen, markSeen, UPDATES_SEEN_KEY } from '../src/updates.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const routes = new Set([...APP.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map((m) => m[1]))
const L = [
  { date: '2026-10-01', title: 'Old', items: ['a'] },
  { date: '2026-10-23', title: 'B', items: ['b'] },
  { date: '2026-10-23', title: 'A', items: ['a'] },
  { date: '2026-10-10', title: 'Mid', items: ['m'] },
]

describe('ordering', () => {
  it('sorts newest first and keeps file order within a date', () => {
    expect(sortUpdates(L).map((u) => u.title)).toEqual(['B', 'A', 'Mid', 'Old'])
  })
  it('a reversed list sorts to the same dates (positive control on the sort itself)', () => {
    expect(sortUpdates([...L].reverse()).map((u) => u.date)).toEqual(['2026-10-23', '2026-10-23', '2026-10-10', '2026-10-01'])
  })
  it('the shipped file is already newest first, and every entry is well formed', () => {
    expect(sortUpdates(UPDATES)).toEqual([...UPDATES])
    expect(UPDATES.length).toBeGreaterThan(10)
    for (const u of UPDATES) {
      expect(u.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(u.title.length).toBeGreaterThan(0)
      expect(u.items.length).toBeGreaterThan(0)
    }
  })
  it('student copy has no em dashes and no weekday names', () => {
    const text = UPDATES.flatMap((u) => [u.title, ...u.items]).join(' ')
    expect(text).not.toMatch(/—/)
    expect(text).not.toMatch(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/)
  })
  it('every route is a real App.jsx route (and the parser sees /updates)', () => {
    expect(routes.has('/updates')).toBe(true)
    for (const u of UPDATES.filter((x) => x.route)) expect(routes.has(u.route), u.route).toBe(true)
  })
})

describe('unread', () => {
  it('a first visit is unread; after marking, it is read', () => {
    expect(hasUnread(L, null)).toBe(true)
    expect(hasUnread(L, newestKey(L))).toBe(false)
  })
  it('a new entry after the visit relights the dot', () => {
    const seen = newestKey(L)
    const next = [{ date: '2026-10-24', title: 'New', items: ['n'] }, ...L]
    expect(hasUnread(next, seen)).toBe(true)
    expect(newSince(next, seen).map((u) => u.title)).toEqual(['New'])
  })
  it('a new entry on the SAME date as the last visit still counts', () => {
    const seen = newestKey(L) // 2026-10-23|B
    const next = [{ date: '2026-10-23', title: 'Same day', items: ['s'] }, ...L]
    expect(hasUnread(next, seen)).toBe(true)
    expect(newSince(next, seen).map((u) => u.title)).toEqual(['Same day'])
  })
  it('a rolled-back build (seen is newer than anything here) stays read', () => {
    expect(hasUnread(L, '2026-12-01|Future')).toBe(false)
    expect(newSince(L, '2026-12-01|Future')).toEqual([])
  })
  it('an entry removed from the file falls back to dates', () => {
    expect(newSince(L, '2026-10-05|Gone').map((u) => u.title)).toEqual(['B', 'A', 'Mid'])
  })
  it('an empty list is never unread', () => {
    expect(hasUnread([], null)).toBe(false)
  })
  it('markSeen stores the newest key and readSeen returns it; a throwing store is survived', () => {
    const m = new Map()
    const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }
    expect(readSeen(s)).toBe(null)
    expect(markSeen(L, s)).toBe('2026-10-23|B')
    expect(m.get(UPDATES_SEEN_KEY)).toBe('2026-10-23|B')
    expect(hasUnread(L, readSeen(s))).toBe(false)
    const bad = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
    expect(readSeen(bad)).toBe(null)
    expect(() => markSeen(L, bad)).not.toThrow()
  })
})
