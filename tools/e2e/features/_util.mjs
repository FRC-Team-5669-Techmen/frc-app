/**
 * Shared constants and oracles for the feature specs (tools/e2e/features.mjs).
 * Plain node: no browser, no app import. A spec computes what a page SHOULD
 * show from the fixture store with these, then reads what it DOES show.
 */
import { inflateRawSync, crc32 } from 'node:zlib';

// Thursday 2026-10-01, 4:00 PM PDT: the shop is open (the same instant
// tools/e2e/checkin.mjs uses). The fixture reseeds relative to this clock.
export const CLOCK_START = new Date('2026-10-01T16:00:00-07:00');

// src/dev/fixture/personas.js, by key. Copied rather than imported so a spec
// cannot pass merely because it read the same table as the page.
export const P = Object.freeze({
  admin: { id: '00000000-0000-0000-0000-0000000000a1', email: 'admin.test@boscotech.edu', nick: 'Ada' },
  mentor: { id: '00000000-0000-0000-0000-0000000000b1', email: 'mentor.test@boscotech.edu', nick: 'Coach Max' },
  student: { id: '00000000-0000-0000-0000-0000000000c1', email: 'student.one@boscotech.edu', nick: 'Sam' },
  student2: { id: '00000000-0000-0000-0000-0000000000c2', email: 'student.two@boscotech.edu', nick: 'Riley' },
  exempt: { id: '00000000-0000-0000-0000-0000000000c3', email: 'student.exempt@boscotech.edu', nick: 'Casey' },
  parent: { id: '00000000-0000-0000-0000-0000000000d1', email: 'parent.test@example.com', nick: null },
});

/** "21h 35m" / "7h" / "40m" / "0h" -> hours. null when it does not parse. */
export function parseHours(text) {
  const s = String(text ?? '').trim();
  const m = s.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?$/);
  if (!m || (m[1] == null && m[2] == null)) return null;
  return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60;
}

/** Hours -> the app's "Xh Ym" format, rounded to the minute, "—" under a minute (src/hoursUtils.js fmtHours shape). */
export function fmtHours(h) {
  if (!h || h < 0.01) return '\u2014';
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh && mm) return `${hh}h ${mm}m`;
  if (hh) return `${hh}h`;
  return `${mm}m`;
}

/** Minutes between two numbers of hours, for "equal to the minute" checks. */
export const sameMinute = (a, b) => Math.abs(Math.round(a * 60) - Math.round(b * 60)) === 0;

/**
 * Read a zip archive from its bytes: every entry's name and decompressed
 * content, with each entry's CRC-32 checked against the central directory.
 * Throws on anything malformed. Stored (0) and deflated (8) entries only,
 * which is everything a browser-built archive uses.
 */
export function readZip(buf) {
  const b = Buffer.from(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65_535); i -= 1) {
    if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n += 1) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error(`bad central directory entry ${n}`);
    const method = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const csize = b.readUInt32LE(p + 20);
    const size = b.readUInt32LE(p + 24);
    const nlen = b.readUInt16LE(p + 28);
    const xlen = b.readUInt16LE(p + 30);
    const clen = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (b.readUInt32LE(local) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const lnlen = b.readUInt16LE(local + 26);
    const lxlen = b.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lxlen;
    const raw = b.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`${name}: compression method ${method}`);
    if (data.length !== size) throw new Error(`${name}: ${data.length} bytes, directory says ${size}`);
    if ((crc32(data) >>> 0) !== (crc >>> 0)) throw new Error(`${name}: CRC mismatch`);
    entries.push({ name, data, text: () => data.toString('utf8') });
  }
  return entries;
}
