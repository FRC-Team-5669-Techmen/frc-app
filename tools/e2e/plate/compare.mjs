#!/usr/bin/env node
/**
 * Decoded-pixel comparison of two shot sets.
 *
 *   node tools/e2e/plate/compare.mjs artifacts/shots/plate/base artifacts/shots/plate/const-empty
 *   node tools/e2e/plate/compare.mjs <a> <b> --diffs artifacts/shots/plate/diff-base-off --json out.json
 *
 * For every PNG under <a> (relative path <persona>/<width>/<slug>.png) it
 * decodes the same path under <b> and compares size and every pixel. PNG
 * bytes are compared first as a shortcut, but a byte difference is never
 * reported as a pixel difference on its own: two encoders can write the same
 * pixels differently, so only decoded pixels decide.
 *
 * Prints one line per differing pair (pixels differing, their bounding box)
 * and a summary `compare: N identical of M (K differ, J missing)`. Exit code 0
 * only when all M are identical. --diffs writes a red-on-grey diff image per
 * differing pair. --only <regex> limits the walk.
 */
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const [A, B] = pos;
if (!A || !B) { console.error('usage: compare.mjs <setA> <setB> [--diffs dir] [--json file] [--only regex] [--quiet]'); process.exit(2); }
const diffDir = opt('diffs');
const only = opt('only') ? new RegExp(opt('only')) : null;
const quiet = args.includes('--quiet');

function walk(dir, base = dir) {
  const outList = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) outList.push(...walk(p, base));
    else if (e.endsWith('.png')) outList.push(path.relative(base, p));
  }
  return outList.sort();
}

export function comparePngs(fa, fb) {
  const ba = readFileSync(fa);
  const bb = readFileSync(fb);
  if (ba.equals(bb)) return { identical: true, bytes: true };
  const a = decodePng(ba);
  const b = decodePng(bb);
  if (a.width !== b.width || a.height !== b.height) {
    return { identical: false, size: `${a.width}x${a.height} vs ${b.width}x${b.height}`, a, b };
  }
  let n = 0; let x0 = Infinity; let y0 = Infinity; let x1 = -1; let y1 = -1;
  const w = a.width;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      n++;
      const p = i / 4; const x = p % w; const y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return n === 0 ? { identical: true, bytes: false } : { identical: false, pixels: n, of: a.width * a.height, box: [x0, y0, x1, y1], a, b };
}

function diffImage(a, b) {
  const w = Math.max(a.width, b.width); const h = Math.max(a.height, b.height);
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const ia = y < a.height && x < a.width ? (y * a.width + x) * 4 : -1;
      const ib = y < b.height && x < b.width ? (y * b.width + x) * 4 : -1;
      const same = ia >= 0 && ib >= 0 && a.data[ia] === b.data[ib] && a.data[ia + 1] === b.data[ib + 1] && a.data[ia + 2] === b.data[ib + 2];
      const g = ia >= 0 ? Math.round((a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 3 * 0.35) : 0;
      d[o] = same ? g : 255; d[o + 1] = same ? g : 0; d[o + 2] = same ? g : 0; d[o + 3] = 255;
    }
  }
  return encodePng({ width: w, height: h, data: d });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const files = walk(A).filter((f) => !only || only.test(f));
  const rows = [];
  let same = 0; let missing = 0;
  for (const f of files) {
    const fb = path.join(B, f);
    if (!existsSync(fb)) { missing++; rows.push({ file: f, missing: true }); console.log(`MISSING  ${f}`); continue; }
    const r = comparePngs(path.join(A, f), fb);
    if (r.identical) { same++; rows.push({ file: f, identical: true, bytes: r.bytes }); continue; }
    const { a, b, ...rest } = r;
    rows.push({ file: f, ...rest });
    if (!quiet) console.log(`DIFFERS  ${f}  ${r.size ? `size ${r.size}` : `${r.pixels} px (${(100 * r.pixels / r.of).toFixed(3)}%) box ${r.box.join(',')}`}`);
    if (diffDir) {
      const p = path.join(diffDir, f);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, diffImage(a, b));
    }
  }
  const differ = rows.filter((r) => !r.identical && !r.missing).length;
  if (opt('json')) writeFileSync(opt('json'), JSON.stringify({ a: A, b: B, total: files.length, identical: same, differ, missing, rows }, null, 2));
  console.log(`compare: ${same} identical of ${files.length} (${differ} differ, ${missing} missing)  ${A} vs ${B}`);
  process.exit(same === files.length ? 0 : 1);
}
