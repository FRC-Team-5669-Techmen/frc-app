#!/usr/bin/env node
/**
 * Crop a region out of one or more PNGs and stack them side by side, for
 * looking at a measured difference rather than guessing at it.
 *
 *   node tools/e2e/plate/crop.mjs out.png x,y,w,h a.png [b.png ...] [--scale 2]
 *
 * The region is clamped to each image. Images are placed left to right with a
 * 6px mid-grey gutter; --scale enlarges by an integer factor (nearest pixel).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const args = process.argv.slice(2);
const si = args.indexOf('--scale');
const scale = si >= 0 ? Math.max(1, Number(args[si + 1]) | 0) : 1;
const rest = si >= 0 ? args.filter((_, i) => i !== si && i !== si + 1) : args;
const [outFile, region, ...inputs] = rest;
if (!outFile || !region || !inputs.length) {
  console.error('usage: crop.mjs out.png x,y,w,h a.png [b.png ...] [--scale N]');
  process.exit(2);
}
const [x, y, w, h] = region.split(',').map(Number);
const GUT = 6;
const tiles = inputs.map((f) => decodePng(readFileSync(f)));
const W = (w * scale + GUT) * tiles.length - GUT;
const H = h * scale;
const out = new Uint8Array(W * H * 4).fill(96);
tiles.forEach((img, t) => {
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < w * scale; xx++) {
      const sx = x + Math.floor(xx / scale); const sy = y + Math.floor(yy / scale);
      const o = (yy * W + t * (w * scale + GUT) + xx) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { out[o + 3] = 255; continue; }
      const i = (sy * img.width + sx) * 4;
      out[o] = img.data[i]; out[o + 1] = img.data[i + 1]; out[o + 2] = img.data[i + 2]; out[o + 3] = 255;
    }
  }
});
for (let i = 3; i < out.length; i += 4) out[i] = 255;
writeFileSync(outFile, encodePng({ width: W, height: H, data: out }));
console.log(`crop: ${inputs.length} x ${w}x${h} at ${x},${y} (scale ${scale}) -> ${outFile}`);
