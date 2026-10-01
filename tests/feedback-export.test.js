// The feedback console's exports (src/feedbackExport.js): the chat-sized
// markdown parts, MARK_SEEN.sql, the role-only digest, and the zip archive,
// read back entry by entry.
//
// The two properties that matter most are both "never silent": a bundle over
// the size cap SPLITS rather than truncates (every report appears exactly once
// across the parts), and an image that did not make it into the archive is
// NAMED in its report rather than quietly absent. Each has a positive control.

import { describe, expect, test } from 'vitest'
import {
  PART_CHARS, buildArchive, digestText, identitiesText, imageName, markSeenSql,
  markdownParts, numberReports, quoteText, reportFolder, reportMarkdown,
} from '../src/feedbackExport.js'
import { crc32 } from '../src/feedbackZip.js'

const dec = new TextDecoder()

// A compact independent reader (the full one, with its own positive controls,
// is in tests/feedback-zip.test.js).
function unzip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out = new Map()
  for (let i = 0; i < count; i += 1) {
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 20, true)
    const nlen = v.getUint16(p + 28, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen))
    p += 46 + nlen
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = bytes.subarray(start, start + size)
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`)
    out.set(name, data)
  }
  return out
}

const ROLES = { m1: 'student', m2: 'student', a1: 'admin' }
const roleOf = id => ROLES[id] ?? null
const SAM = { full_name: 'Sam Student', nickname: null }
const ADA = { full_name: 'Ada Admin', nickname: null }

const mk = (n, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  member_id: 'm1',
  author: SAM,
  category: 'bug',
  status: 'new',
  route: '/schedule',
  viewport: '390x844',
  user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  build: 'abc1234',
  message: `Report number ${n}`,
  image_paths: [],
  created_at: new Date(Date.UTC(2026, 8, 1, 17, n)).toISOString(),
  ...extra,
})

describe('numbering', () => {
  test('R01 is the oldest, whatever order the console showed them in', () => {
    const n = numberReports([mk(3), mk(1), mk(2)])
    expect(n.map(x => [x.rid, x.row.message])).toEqual([
      ['R01', 'Report number 1'], ['R02', 'Report number 2'], ['R03', 'Report number 3'],
    ])
  })

  test('the number widens past 99 so it still sorts', () => {
    const many = Array.from({ length: 120 }, (_, i) => mk(i))
    expect(numberReports(many)[0].rid).toBe('R001')
  })

  test('a report folder is its number and the start of its id, and nothing else gets in', () => {
    expect(reportFolder('R03', '1a2b3c4d-0000-4000-8000-000000000000')).toBe('reports/R03-1a2b3c4d')
    expect(reportFolder('R03', '../../etc/passwd')).toBe('reports/R03-etcpassw')
  })
})

describe('quoteText', () => {
  test('nothing a reporter typed can become a heading, a rule or a nested quote', () => {
    const q = quoteText('### not a heading\nline\n-----\n> quoted\n\nend')
    expect(q).toBe('> \\### not a heading\n> line\n> \\-----\n> \\> quoted\n>\n> end')
  })

  test('an ordinary bullet the reporter typed is left as a bullet (positive control)', () => {
    expect(quoteText('- first\n- second')).toBe('> - first\n> - second')
  })
})

describe('reportMarkdown', () => {
  test('carries every field a session needs, with times in Los Angeles', () => {
    const md = reportMarkdown({ row: mk(1, { tried: 'reloaded twice', image_paths: ['a.png', 'b.png'] }), rid: 'R01' }, { roleOf })
    expect(md).toContain('### R01 · Bug · /schedule')
    expect(md).toContain('- Status: New')
    expect(md).toContain('- Filed: Sep 1, 2026, 10:01 AM (Los Angeles)')
    expect(md).toContain('- From: Sam Student (student)')
    expect(md).toContain('- Browser: Safari on iOS')
    expect(md).toContain('- Build: abc1234')
    expect(md).toContain('- Screenshots: 2 attached.')
    expect(md).toContain('What they tried:\n\n> reloaded twice')
  })

  test('with names withheld the reporter is a role, and the name is nowhere', () => {
    const md = reportMarkdown({ row: mk(1), rid: 'R01' }, { roleOf, names: false })
    expect(md).toContain('- From: a student (name withheld)')
    expect(md).not.toContain('Sam')
    const admin = reportMarkdown({ row: mk(2, { member_id: 'a1', author: ADA }), rid: 'R02' }, { roleOf, names: false })
    expect(admin).toContain('- From: an admin (name withheld)')
  })

  test('a row filed before 0002 says its build was not recorded, and a legacy status reads in the new words', () => {
    const md = reportMarkdown({ row: mk(1, { build: null, status: 'dismissed', category: 'feedback' }), rid: 'R01' }, {})
    expect(md).toContain('- Build: not recorded')
    expect(md).toContain("- Status: Won't do")
    expect(md).toContain('· General ·')
  })
})

describe('markdownParts', () => {
  test('a small export is one part with no "part 1 of 1" noise', () => {
    const { parts, count } = markdownParts([mk(1), mk(2)], { filterText: 'status New', exportedAt: '2026-10-01T21:05:00Z', build: 'abc1234' })
    expect(count).toBe(2)
    expect(parts).toHaveLength(1)
    expect(parts[0].text.startsWith('# Techmen feedback\n')).toBe(true)
    expect(parts[0].text).toContain('Exported Oct 1, 2026, 2:05 PM (Los Angeles), from build abc1234.')
    expect(parts[0].text).toContain('Filter: status New.')
    expect(parts[0].text).not.toContain('part 1 of')
  })

  test('over the cap it SPLITS: every report exactly once, each part under the cap, each with its own header', () => {
    const rows = Array.from({ length: 60 }, (_, i) => mk(i, { message: `Report number ${i}\n${'detail '.repeat(60)}` }))
    const cap = 8_000
    const { parts } = markdownParts(rows, { cap })
    expect(parts.length).toBeGreaterThan(3)
    const all = parts.map(p => p.text).join('\n')
    for (let i = 0; i < 60; i += 1) {
      const rid = `R${String(i + 1).padStart(2, '0')}`
      expect(all.split(`### ${rid} ·`).length - 1).toBe(1)
    }
    parts.forEach((p, i) => {
      expect(p.text.length).toBeLessThanOrEqual(cap)
      expect(p.text).toContain(`# Techmen feedback, part ${i + 1} of ${parts.length}`)
      expect(p.text).toContain(`This part: ${p.from} to ${p.to}.`)
      expect(p.over).toBe(false)
    })
    expect(parts[0].from).toBe('R01')
    expect(parts[parts.length - 1].to).toBe('R60')
  })

  test('a single report longer than the cap gets its own part, whole, and that part says so', () => {
    const huge = 'stack frame\n'.repeat(1_000)
    const { parts } = markdownParts([mk(1), mk(2, { message: huge }), mk(3)], { cap: 4_000 })
    const big = parts.find(p => p.from === 'R02')
    expect(big.to).toBe('R02')
    expect(big.over).toBe(true)
    expect(big.text).toContain('It was not cut.')
    expect(big.text.split('> stack frame').length - 1).toBe(1_000)
  })

  test('the default cap is the documented 50,000 characters', () => {
    expect(PART_CHARS).toBe(50_000)
  })
})

describe('MARK_SEEN.sql', () => {
  const n = numberReports([mk(1), mk(2, { status: 'done' }), mk(3, { status: 'open' })])
  const admin = '00000000-0000-0000-0000-0000000000a1'

  test('after 0002: moves only rows still New (either spelling) to seen, and returns them', () => {
    const sql = markSeenSql(n, { migrated: true, adminId: admin })
    expect(sql).toContain(`set status = 'seen', reviewed_by = '${admin}', reviewed_at = now()`)
    expect(sql).toContain("where status in ('new', 'open')")
    for (const { row } of n) expect(sql).toContain(`'${row.id}'`)
    expect(sql).toContain('returning id, status, route;')
    expect(sql).toContain('2 were New when it was taken')
  })

  test('before 0002 it writes the legacy spelling the old CHECK admits', () => {
    expect(markSeenSql(n, { migrated: false, adminId: admin })).toContain("set status = 'reviewed'")
  })

  test('an admin id that is not a uuid is never interpolated', () => {
    const sql = markSeenSql(n, { adminId: "x'; drop table feedback; --" })
    expect(sql).toContain('reviewed_by = null')
    expect(sql).not.toContain('drop table')
  })

  test('an empty export changes nothing and says so', () => {
    const sql = markSeenSql([], {})
    expect(sql).toContain('select 0 as reports_marked;')
    expect(sql).not.toContain('update public.feedback')
  })
})

describe('digest and identities', () => {
  const n = numberReports([mk(1, { tried: 'cleared cache' }), mk(2, { member_id: 'a1', author: ADA })])

  test('the digest names every reporter by role, never by name', () => {
    const d = digestText(n, { roleOf })
    expect(d).toContain('R01 [bug] status=new route=/schedule by=student filed=2026-09-01 10:01 PT')
    expect(d).toContain('R02 [bug] status=new route=/schedule by=admin')
    expect(d).toContain('  > Report number 1')
    expect(d).toContain('  tried: cleared cache')
    expect(d).not.toContain('Sam')
    expect(d).not.toContain('Ada')
  })

  test('identities lists every name and name part (positive control for the sweep)', () => {
    expect(identitiesText(n.map(x => x.row)).trim().split('\n')).toEqual(['Ada', 'Ada Admin', 'Admin', 'Sam', 'Sam Student', 'Student'])
  })
})

describe('imageName', () => {
  test('the stored type first, then the path, then a neutral .bin', () => {
    expect(imageName(1, 'image/jpeg', 'x.png')).toBe('screenshot-1.jpg')
    expect(imageName(2, 'application/octet-stream', 'report/u/z.webp')).toBe('screenshot-2.webp')
    expect(imageName(3, null, 'noext')).toBe('screenshot-3.bin')
  })
})

describe('buildArchive', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
  const rows = [
    mk(1, { image_paths: ['report/m1/ok.png'] }),
    mk(2, { image_paths: ['report/m1/gone.png', 'report/m1/throws.png'], tried: 'refreshed' }),
    mk(3, { member_id: 'a1', author: ADA, image_paths: ['report/a1/big.png'] }),
    mk(4),
  ]
  const fetchImage = async (path) => {
    if (path.endsWith('ok.png')) return { bytes: PNG, contentType: 'image/png' }
    if (path.endsWith('big.png')) return { bytes: new Uint8Array(64), contentType: 'image/png' }
    if (path.endsWith('throws.png')) throw new Error('network')
    return null
  }
  const opts = { roleOf, exportedAt: '2026-10-01T21:05:00Z', build: 'abc1234', adminId: '00000000-0000-0000-0000-0000000000a1', budget: 40, filterText: 'status any' }

  test('every file is where index says, and every screenshot listed is in the zip and vice versa', async () => {
    const a = await buildArchive(rows, fetchImage, opts)
    const files = unzip(a.bytes)
    const root = 'techmen-feedback-2026-10-01-1405'
    expect(a.name).toBe(`${root}.zip`)
    for (const f of ['README.md', 'reports.md', 'reports.json', 'digest.txt', 'MARK_SEEN.sql', 'identities.txt']) {
      expect(files.has(`${root}/${f}`)).toBe(true)
    }
    const index = JSON.parse(dec.decode(files.get(`${root}/reports.json`)))
    expect(index.count).toBe(4)
    const listed = index.reports.flatMap(r => r.files.screenshots)
    const inZip = [...files.keys()].filter(k => /screenshot-\d/.test(k)).map(k => k.slice(root.length + 1))
    expect(listed.sort()).toEqual(inZip.sort())
    expect(inZip).toEqual(['reports/R01-00000000/screenshot-1.png'])
    expect([...files.get(`${root}/reports/R01-00000000/screenshot-1.png`)]).toEqual([...PNG])
    for (const r of index.reports) expect(files.has(`${root}/${r.files.report}`)).toBe(true)
  })

  test('an image that did not make it is NAMED, with its reason, never silently absent', async () => {
    const a = await buildArchive(rows, fetchImage, opts)
    const files = unzip(a.bytes)
    const root = a.root
    expect(a.missing.map(m => m.reason).sort()).toEqual(['not-retrieved', 'not-retrieved', 'over-budget'])
    const r2 = dec.decode(files.get(`${root}/reports/R02-00000000/report.md`))
    expect(r2).toContain('2 more NOT in this archive (could not be read back from storage)')
    const r3 = dec.decode(files.get(`${root}/reports/R03-00000000/report.md`))
    expect(r3).toContain('NOT in this archive (over the archive size cap')
    const r1 = dec.decode(files.get(`${root}/reports/R01-00000000/report.md`))
    expect(r1).toContain('[screenshot 1](./screenshot-1.png)')
    const readme = dec.decode(files.get(`${root}/README.md`))
    expect(readme).toContain('## Screenshots that are not here')
    expect(readme).toContain('1 did not fit')
    expect(readme).toContain('2 could not be read back from storage')
  })

  test('reports.md links images from the archive root; MARK_SEEN covers every report', async () => {
    const a = await buildArchive(rows, fetchImage, opts)
    const files = unzip(a.bytes)
    const md = dec.decode(files.get(`${a.root}/reports.md`))
    expect(md).toContain('[screenshot 1](reports/R01-00000000/screenshot-1.png)')
    const sql = dec.decode(files.get(`${a.root}/MARK_SEEN.sql`))
    for (const r of rows) expect(sql).toContain(`'${r.id}'`)
  })

  test('names withheld: no reporter name in ANY file and no identities.txt (names on is the positive control)', async () => {
    const on = unzip((await buildArchive(rows, fetchImage, { ...opts, names: true })).bytes)
    const onText = [...on.entries()].filter(([k]) => !/screenshot-/.test(k)).map(([, v]) => dec.decode(v)).join('\n')
    expect(onText).toContain('Sam Student')

    const offA = await buildArchive(rows, fetchImage, { ...opts, names: false })
    const off = unzip(offA.bytes)
    expect([...off.keys()].some(k => k.endsWith('identities.txt'))).toBe(false)
    const offText = [...off.entries()].filter(([k]) => !/screenshot-/.test(k)).map(([, v]) => dec.decode(v)).join('\n')
    for (const name of ['Sam', 'Ada', 'Student', 'm1']) expect(offText).not.toContain(name)
    expect(offText).toContain('Names: WITHHELD at export.')
  })
})
