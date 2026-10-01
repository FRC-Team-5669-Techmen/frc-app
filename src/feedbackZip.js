// A small ZIP writer for the feedback console's "Zip with screenshots" export.
//
// WHY THIS EXISTS RATHER THAN A DEPENDENCY: the export needs exactly one thing
// from the format -- put some text files and some already-compressed images in
// one download -- and this repo adds no package for one screen. Screenshots are
// PNG / JPEG / WebP, all compressed already, so deflating them again buys
// nothing; the reports are a few kilobytes of text. So every entry is written
// with the STORE method (compression 0): the bytes go in as they are, and the
// only arithmetic the format then demands is a CRC-32 per entry.
//
// WHAT IT WRITES, per PKWARE APPNOTE 6.3: one local file header + the bytes for
// each entry, then the central directory, then the end-of-central-directory
// record. No data descriptors (sizes and CRC are known before the header is
// written), no ZIP64 (the console caps the images it will carry far below
// 4 GiB), no encryption. File names are UTF-8 and say so (general purpose bit
// 11), so a route or a name with an accent survives the round trip.
//
// Pure module: no React, no Supabase, no DOM. Unit-tested in
// tests/feedback-zip.test.js, which also parses the output back and checks every
// CRC, and the shell check `unzip -t` is run against a generated archive.

// ── CRC-32 (IEEE 802.3, reflected, polynomial 0xEDB88320) ──
// The table is built once, lazily, on first use.
let CRC_TABLE = null
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  CRC_TABLE = t
  return t
}

export function crc32(bytes) {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── DOS date/time ──
// The format stores a LOCAL wall-clock time with no zone, 2-second resolution,
// and cannot represent anything before 1980. The caller hands in the wall-clock
// parts it wants written (the console passes America/Los_Angeles), so this
// module never reads the machine's own time zone and the output is the same
// bytes on every machine for the same parts.
export function dosDateTime(parts) {
  const p = parts ?? { year: 1980, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
  const year = Math.min(Math.max(p.year, 1980), 2107)
  const date = ((year - 1980) << 9) | ((p.month & 0x0f) << 5) | (p.day & 0x1f)
  const time = ((p.hour & 0x1f) << 11) | ((p.minute & 0x3f) << 5) | ((p.second >> 1) & 0x1f)
  return { date, time }
}

const encoder = new TextEncoder()

function toBytes(data) {
  if (data instanceof Uint8Array) return data
  if (typeof data === 'string') return encoder.encode(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  throw new TypeError('zip entry data must be a string, Uint8Array or ArrayBuffer')
}

// A path inside the archive is relative, forward-slashed, and never climbs out
// of the folder it is unpacked into. Every path here is assembled by the
// console from fixed folder names and a report id, so this is not defending
// against a value the database can hold -- it is here because the whole point
// of the artifact is that somebody unzips it, and a path that could escape the
// target folder is the shape that becomes a zip-slip the day an input changes.
export function safeZipPath(path) {
  const parts = String(path)
    .replace(/\\/g, '/')
    .split('/')
    .filter(seg => seg && seg !== '.' && seg !== '..')
  if (!parts.length) throw new Error(`unusable zip path: ${JSON.stringify(path)}`)
  return parts.join('/')
}

// entries: [{ path, data }] where data is a string (written as UTF-8) or bytes.
// options.time: the wall-clock parts stamped on every entry (see dosDateTime).
// Returns one Uint8Array holding the whole archive.
export function buildZip(entries, options = {}) {
  const { date, time } = dosDateTime(options.time)
  const files = entries.map(e => {
    const name = encoder.encode(safeZipPath(e.path))
    const data = toBytes(e.data)
    return { name, data, crc: crc32(data) }
  })

  const seen = new Set()
  for (const f of files) {
    const key = new TextDecoder().decode(f.name)
    if (seen.has(key)) throw new Error(`duplicate zip path: ${key}`)
    seen.add(key)
  }

  let localSize = 0
  for (const f of files) localSize += 30 + f.name.length + f.data.length
  let centralSize = 0
  for (const f of files) centralSize += 46 + f.name.length
  const total = localSize + centralSize + 22
  if (total > 0xffffffff || files.length > 0xffff) {
    throw new Error('archive too large for a ZIP without ZIP64')
  }

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  let o = 0
  const u16 = v => { view.setUint16(o, v, true); o += 2 }
  const u32 = v => { view.setUint32(o, v >>> 0, true); o += 4 }
  const put = b => { out.set(b, o); o += b.length }

  const FLAG_UTF8 = 0x0800
  const offsets = []
  for (const f of files) {
    offsets.push(o)
    u32(0x04034b50)        // local file header signature
    u16(20)                // version needed to extract (2.0)
    u16(FLAG_UTF8)         // general purpose flags: names are UTF-8
    u16(0)                 // compression: 0 = stored
    u16(time)
    u16(date)
    u32(f.crc)
    u32(f.data.length)     // compressed size (stored: same)
    u32(f.data.length)     // uncompressed size
    u16(f.name.length)
    u16(0)                 // extra field length
    put(f.name)
    put(f.data)
  }

  const centralStart = o
  files.forEach((f, i) => {
    u32(0x02014b50)        // central directory header signature
    u16(20)                // version made by (2.0, MS-DOS attribute model)
    u16(20)                // version needed to extract
    u16(FLAG_UTF8)
    u16(0)                 // stored
    u16(time)
    u16(date)
    u32(f.crc)
    u32(f.data.length)
    u32(f.data.length)
    u16(f.name.length)
    u16(0)                 // extra field length
    u16(0)                 // file comment length
    u16(0)                 // disk number start
    u16(0)                 // internal attributes
    u32(0)                 // external attributes
    u32(offsets[i])        // offset of the local header
    put(f.name)
  })

  u32(0x06054b50)          // end of central directory signature
  u16(0)                   // this disk
  u16(0)                   // disk with the central directory
  u16(files.length)        // entries on this disk
  u16(files.length)        // entries in total
  u32(centralSize)         // size of the central directory
  u32(centralStart)
  u16(0)                   // comment length
  // The buffer was sized up front from the same arithmetic; landing anywhere
  // but its exact end means a header field above is the wrong width.
  if (o !== total) throw new Error(`zip writer size mismatch: wrote ${o}, sized ${total}`)
  return out
}
