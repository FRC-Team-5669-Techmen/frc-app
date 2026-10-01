// `src/fetchAllRows.js` (was src/myHoursFetch.js) -- reading a whole
// attendance ledger, one member's or the team's, past the PostgREST max-rows
// cap, which truncates an unranged select silently.
//
// The fake below behaves like PostgREST: `.range(from, to)` returns at most
// `maxRows` rows of that window, and an unranged await returns at most
// `maxRows` rows full stop. The first test is the positive control that the
// fake really truncates, so "every row came back" means the paging did it.

import { describe, expect, test } from 'vitest'
import { fetchAllRows } from '../src/fetchAllRows.js'

function fakeTable(n, { maxRows = 1000, failAt = null, ignoreRange = false, noRange = false } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `e${String(i).padStart(5, '0')}`, type: i % 2 ? 'out' : 'in' }))
  const calls = []
  const answer = (from, to) => {
    calls.push([from, to])
    if (failAt != null && calls.length === failAt) return Promise.resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    const end = Math.min(to + 1, from + maxRows, rows.length)
    return Promise.resolve({ data: rows.slice(from, end), error: null })
  }
  const makeQuery = () => {
    const q = { then: (ok, bad) => answer(0, Infinity).then(ok, bad) }
    if (!noRange) q.range = ignoreRange ? () => answer(0, Infinity) : (from, to) => answer(from, to)
    return q
  }
  return { rows, calls, makeQuery }
}

describe('fetchAllRows', () => {
  test('POSITIVE CONTROL: an unranged read of the fake stops at max rows', async () => {
    const t = fakeTable(2500)
    const { data } = await t.makeQuery()
    expect(data).toHaveLength(1000)
  })

  test('2,500 rows under a 1,000-row cap all come back, in order, with no duplicates', async () => {
    const t = fakeTable(2500)
    const { data, error } = await fetchAllRows(t.makeQuery)
    expect(error).toBe(null)
    expect(data).toHaveLength(2500)
    expect(data.map(r => r.id)).toEqual(t.rows.map(r => r.id))
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999], [2500, 3499]])
  })

  test('a project max-rows LOWER than the page size is still read in full', async () => {
    const t = fakeTable(2500, { maxRows: 400 })
    const { data } = await fetchAllRows(t.makeQuery)
    expect(data).toHaveLength(2500)
    expect(t.calls.slice(0, 3)).toEqual([[0, 999], [400, 1399], [800, 1799]])
  })

  test('a small ledger is one page plus the empty page that ends it', async () => {
    const t = fakeTable(37)
    const { data } = await fetchAllRows(t.makeQuery)
    expect(data).toHaveLength(37)
    expect(t.calls).toHaveLength(2)
  })

  test('an empty ledger is an empty array, not null', async () => {
    const { data, error } = await fetchAllRows(fakeTable(0).makeQuery)
    expect(data).toEqual([])
    expect(error).toBe(null)
  })

  test('an error on ANY page returns the error and no partial rows', async () => {
    // A short total is the exact failure this exists to prevent; a page that
    // failed must not quietly become a smaller ledger.
    const t = fakeTable(2500, { failAt: 2 })
    const { data, error } = await fetchAllRows(t.makeQuery)
    expect(data).toBe(null)
    expect(error.code).toBe('57014')
  })

  test('running out of pages before the end is an error, never the rows so far', async () => {
    // 2,500 rows take three pages of data and an empty fourth that says "done".
    // Two pages is the oldest 2,000: exactly the short ledger this prevents.
    const short = fakeTable(2500)
    const cut = await fetchAllRows(short.makeQuery, { maxPages: 2 })
    expect(cut.data).toBe(null)
    expect(cut.error.code).toBe('PAGE_LIMIT')
    expect(short.calls).toHaveLength(2)
    // Positive control: the same table with the four pages it needs is whole.
    const enough = await fetchAllRows(fakeTable(2500).makeQuery, { maxPages: 4 })
    expect(enough.error).toBe(null)
    expect(enough.data).toHaveLength(2500)
  })

  test('a builder that ignores .range() is read once and the repeat is recognised', async () => {
    const t = fakeTable(300, { ignoreRange: true })
    const { data } = await fetchAllRows(t.makeQuery)
    expect(data).toHaveLength(300)
    expect(t.calls).toHaveLength(2)
  })

  test('a builder with no .range() at all is awaited as-is', async () => {
    const t = fakeTable(300, { noRange: true })
    const { data } = await fetchAllRows(t.makeQuery)
    expect(data).toHaveLength(300)
    expect(t.calls).toEqual([[0, Infinity]])
  })
})
