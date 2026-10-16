// "Export sync log" (decision 34): the whole idea_cert_sync_log as one zip of
// README.txt + sync-log.json + sync-log.csv. Read back with an independent
// reader so the archive, not the writer's intent, is what is checked.

import { describe, it, expect } from 'vitest'
import { buildSyncLogExport, syncLogReadme, SYNC_LOG_COLUMNS } from '../src/ideaSyncLogExport.js'
import { SYNC_LOG_SELECT } from '../src/ideaCerts.js'

const dec = new TextDecoder()
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  if (v.getUint32(eocd, true) !== 0x06054b50) throw new Error('no EOCD')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out = {}
  for (let i = 0; i < count; i += 1) {
    const size = v.getUint32(p + 20, true)
    const nlen = v.getUint16(p + 28, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen))
    const lnlen = v.getUint16(local + 26, true)
    const lxlen = v.getUint16(local + 28, true)
    const start = local + 30 + lnlen + lxlen
    out[name] = dec.decode(bytes.subarray(start, start + size))
    p += 46 + nlen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
  }
  return out
}

const ROWS = [
  { id: 2, received_at: '2026-10-15T19:00:00+00:00', source_revision: 'rev-42', catalog_count: 6, holder_count: 11, ok: false,
    error: '=1 problem(s): holders[10] (IDEA-C-000111): code NOPE-1 is not in this snapshot, "quoted"' },
  { id: 1, received_at: '2026-10-15T17:00:00+00:00', source_revision: 'rev-41', catalog_count: 6, holder_count: 10, ok: true, error: null },
  { id: 3, received_at: '2026-10-16T17:00:00+00:00', source_revision: null, catalog_count: null, holder_count: null, ok: false, error: 'holders is not an array' },
]
const AT = new Date('2026-10-16T21:05:00Z')

describe('the export archive', () => {
  const out = buildSyncLogExport(ROWS, { exportedAt: AT, exportedBy: 'admin@boscotech.edu' })
  const files = readZip(out.bytes)
  const folder = 'idea-cert-sync-log-2026-10-16-1405'

  it('is one zip named for the LA minute, holding exactly the three files', () => {
    expect(out.name).toBe(`${folder}.zip`)
    expect(Object.keys(files).sort()).toEqual([`${folder}/README.txt`, `${folder}/sync-log.csv`, `${folder}/sync-log.json`])
    expect(out.count).toBe(3)
  })

  it('JSON holds every row, oldest first, exactly as stored', () => {
    const json = JSON.parse(files[`${folder}/sync-log.json`])
    expect(json.map(r => r.id)).toEqual([1, 2, 3])
    expect(json[1].error).toBe(ROWS[0].error)
    expect(json[2]).toEqual({ id: 3, received_at: ROWS[2].received_at, ok: false, source_revision: null, catalog_count: null, holder_count: null, error: 'holders is not an array' })
  })

  it('CSV has a header and one line per row, with the formula guard on text', () => {
    const csv = files[`${folder}/sync-log.csv`].replace(/^﻿/, '').trim().split('\r\n')
    expect(csv[0]).toBe(SYNC_LOG_COLUMNS.map(([, h]) => h).join(','))
    expect(csv.length).toBe(4)
    expect(csv[2]).toContain(`"'=1 problem(s)`)
    expect(csv[2]).toContain('""quoted""')
    expect(csv[1]).toMatch(/^1,2026-10-15T17:00:00\+00:00,yes,rev-41,6,10,$/)
  })

  it('README states the counts, the range, who exported, and that wrong-secret calls are absent', () => {
    const r = files[`${folder}/README.txt`]
    expect(r).toContain('3 row(s): 1 accepted, 2 refused.')
    expect(r).toContain('Exported 2026-10-16 14:05 America/Los_Angeles by admin@boscotech.edu.')
    expect(r).toContain('First 2026-10-15 10:00, last 2026-10-16 10:00')
    expect(r).toMatch(/wrong or missing secret writes no row/)
  })

  it('the export columns are exactly the log columns the page selects', () => {
    expect(SYNC_LOG_COLUMNS.map(([k]) => k).sort()).toEqual(SYNC_LOG_SELECT.split(',').map(s => s.trim()).sort())
  })

  it('an empty log still exports, and says so', () => {
    const empty = readZip(buildSyncLogExport([], { exportedAt: AT }).bytes)
    expect(JSON.parse(empty[`${folder}/sync-log.json`])).toEqual([])
    expect(syncLogReadme([], { exportedAt: AT })).toContain('The log is empty')
  })
})
