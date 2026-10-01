#!/usr/bin/env node
/**
 * Tile several screenshots side by side, shrunk by an integer factor (box
 * filter), each cut to a maximum height, for looking at many pages at once.
 *
 *   node tools/e2e/plate/montage.mjs out.png --shrink 2 --max-h 2400 a.png b.png ...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const shrink = Math.max(1, Number(opt('shrink', 2)) | 0);
const maxH = Number(opt('max-h', 4000));
const [outFile, ...inputs] = args;
const GUT = 8;
const tiles = inputs.map((f) => {
  const img = decodePng(readFileSync(f));
  const w = Math.floor(img.width / shrink); const h = Math.min(Math.floor(img.height / shrink), Math.floor(maxH / shrink));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0; let g = 0; let b = 0;
    for (let dy = 0; dy < shrink; dy++) for (let dx = 0; dx < shrink; dx++) {
      const i = ((y * shrink + dy) * img.width + (x * shrink + dx)) * 4;
      r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
    }
    const n = shrink * shrink; const o = (y * w + x) * 4;
    data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
  }
  return { w, h, data };
});
const W = tiles.reduce((s, t) => s + t.w, 0) + GUT * (tiles.length - 1);
const H = Math.max(...tiles.map((t) => t.h));
const out = new Uint8Array(W * H * 4);
for (let i = 0; i < out.length; i += 4) { out[i] = 70; out[i + 1] = 70; out[i + 2] = 70; out[i + 3] = 255; }
let ox = 0;
for (const t of tiles) {
  for (let y = 0; y < t.h; y++) out.set(t.data.subarray(y * t.w * 4, (y + 1) * t.w * 4), (y * W + ox) * 4);
  ox += t.w + GUT;
}
writeFileSync(outFile, encodePng({ width: W, height: H, data: out }));
console.log(`montage: ${tiles.length} tiles, ${W}x${H} -> ${outFile}`);
