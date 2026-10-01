// The feedback export's ZIP writer (src/feedbackZip.js).
//
// The writer is checked two ways. Here, a small independent READER parses the
// archive back -- end record, central directory, every local header -- and
// recomputes each entry's CRC from the bytes it finds, so a header field written
// at the wrong width or a size that disagrees with the data fails loudly. In the
// shell, `unzip -t` is run against an archive this module wrote (recorded in the
// lane report), which is the check that a real tool agrees.
//
// POSITIVE CONTROLS: the reader is only worth anything if it can fail, so the
// same archive is corrupted on purpose and the reader must refuse it.

import { describe, expect, test } from 'vitest'
import { buildZip, crc32, dosDateTime, safeZipPath } from '../src/feedbackZip.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

// An independent reader: written against the format, not against the writer.
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = bytes.length - 22
  if (v.getUint32(eocd, true) !== 0x06054b50) throw new Error('no end-of-central-directory record')
  const count = v.getUint16(eocd + 10, true)
  const cdSize = v.getUint32(eocd + 12, true)
  const cdStart = v.getUint32(eocd + 16, true)
  if (cdStart + cdSize !== eocd) throw new Error('central directory does not end at the EOCD')
  const out = []
  let p = cdStart
  for (let i = 0; i < count; i += 1) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error(`bad central header ${i}`)
    const flags = v.getUint16(p + 8, true)
    const method = v.getUint16(p + 10, true)
    const time = v.getUint16(p + 12, true)
    const date = v.getUint16(p + 14, true)
    const crc = v.getUint32(p + 16, true)
    const csize = v.getUint32(p + 20, true)
    const usize = v.getUint32(p + 24, true)
    const nlen = v.getUint16(p + 28, true)
    const xlen = v.getUint16(p + 30, true)
    const clen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen))
    p += 46 + nlen + xlen + clen

    if (v.getUint32(local, true) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const lcrc = v.getUint32(local + 14, true)
    const lsize = v.getUint32(local + 18, true)
    const lnlen = v.getUint16(local + 26, true)
    const lxlen = v.getUint16(local + 28, true)
    const lname = dec.decode(bytes.subarray(local + 30, local + 30 + lnlen))
    if (lname !== name) throw new Error(`local/central name mismatch: ${lname} vs ${name}`)
    if (lcrc !== crc || lsize !== csize) throw new Error(`local/central size or crc mismatch for ${name}`)
    const start = local + 30 + lnlen + lxlen
    const data = bytes.subarray(start, start + csize)
    if (method !== 0) throw new Error(`unexpected compression ${method}`)
    if (csize !== usize) throw new Error('stored entry with differing sizes')
    if (crc32(data) !== crc) throw new Error(`CRC mismatch for ${name}`)
    out.push({ name, data, flags, time, date })
  }
  return out
}

describe('crc32', () => {
  test('matches the published check values', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(enc.encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  test('changes when one bit changes (positive control for the equality above)', () => {
    const a = enc.encode('123456789')
    const b = a.slice()
    b[4] ^= 1
    expect(crc32(b)).not.toBe(crc32(a))
  })
})

describe('dosDateTime', () => {
  test('packs the wall-clock parts it is given, independent of the machine zone', () => {
    const { date, time } = dosDateTime({ year: 2026, month: 10, day: 1, hour: 14, minute: 5, second: 31 })
    expect(date >> 9).toBe(46)              // 2026 - 1980
    expect((date >> 5) & 0x0f).toBe(10)
    expect(date & 0x1f).toBe(1)
    expect(time >> 11).toBe(14)
    expect((time >> 5) & 0x3f).toBe(5)
    expect((time & 0x1f) * 2).toBe(30)      // two-second resolution
  })
})

describe('safeZipPath', () => {
  test('never lets a path climb out of the folder it is unpacked into', () => {
    expect(safeZipPath('../../etc/passwd')).toBe('etc/passwd')
    expect(safeZipPath('a/./b/../c')).toBe('a/b/c')
    expect(safeZipPath('\\win\\path.txt')).toBe('win/path.txt')
    expect(() => safeZipPath('../..')).toThrow()
  })

  test('leaves an ordinary nested path exactly as written (positive control)', () => {
    expect(safeZipPath('techmen-feedback/reports/R01-abc/report.md'))
      .toBe('techmen-feedback/reports/R01-abc/report.md')
  })
})

describe('buildZip', () => {
  const time = { year: 2026, month: 10, day: 1, hour: 14, minute: 5, second: 30 }
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 255])
  const entries = [
    { path: 'root/README.md', data: '# Techmen feedback\n' },
    { path: 'root/reports/R01-0a1b2c3d/report.md', data: 'Route: /schedule\nAccented: José\n' },
    { path: 'root/reports/R01-0a1b2c3d/screenshot-1.png', data: png },
    { path: 'root/empty.txt', data: '' },
  ]

  test('every entry reads back byte-for-byte, with a matching CRC', () => {
    const zip = buildZip(entries, { time })
    const read = readZip(zip)
    expect(read.map(e => e.name)).toEqual(entries.map(e => e.path))
    expect(dec.decode(read[0].data)).toBe('# Techmen feedback\n')
    expect(dec.decode(read[1].data)).toBe('Route: /schedule\nAccented: José\n')
    expect([...read[2].data]).toEqual([...png])
    expect(read[3].data.length).toBe(0)
  })

  test('names are flagged UTF-8 and every entry carries the stamped time', () => {
    const read = readZip(buildZip(entries, { time }))
    const stamp = dosDateTime(time)
    for (const e of read) {
      expect(e.flags & 0x0800).toBe(0x0800)
      expect(e.time).toBe(stamp.time)
      expect(e.date).toBe(stamp.date)
    }
  })

  test('the same input is the same bytes (diffable exports)', () => {
    expect([...buildZip(entries, { time })]).toEqual([...buildZip(entries, { time })])
  })

  test('refuses two entries at one path rather than writing an ambiguous archive', () => {
    expect(() => buildZip([{ path: 'a.txt', data: '1' }, { path: 'a.txt', data: '2' }])).toThrow(/duplicate/)
  })

  test('POSITIVE CONTROL: the reader refuses an archive with one data byte flipped', () => {
    const zip = buildZip(entries, { time })
    const bad = zip.slice()
    // The first entry's data starts right after its 30-byte header and name.
    const firstData = 30 + enc.encode(entries[0].path).length
    bad[firstData] ^= 0xff
    expect(() => readZip(bad)).toThrow(/CRC mismatch/)
    expect(() => readZip(zip)).not.toThrow()
  })

  test('POSITIVE CONTROL: the reader refuses a central directory with a wrong offset', () => {
    const zip = buildZip(entries, { time })
    const bad = zip.slice()
    const v = new DataView(bad.buffer)
    const eocd = bad.length - 22
    v.setUint32(eocd + 16, v.getUint32(eocd + 16, true) + 1, true)
    expect(() => readZip(bad)).toThrow()
  })
})
