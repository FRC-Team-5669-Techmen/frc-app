#!/usr/bin/env node
/**
 * The development harness never reaches students: a production build of this
 * tree, served by `vite preview`, renders the same 404 element for /_fixture
 * (the fixture-mode harness that renders every route with fixture data) as
 * for /_ds, and the fixture client's marker string is nowhere in dist/.
 *
 *   npm run build && node tools/e2e/plate/prod404.mjs --port 5413
 *
 * POSITIVE CONTROL: on the same server, /login must render the real login
 * card, so a preview that served nothing at all cannot pass as "404".
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { REPO, flag, launchBrowser } from './common.mjs';

const port = Number(flag(process.argv.slice(2), 'port', 5413));
const dist = path.join(REPO, 'dist');
if (!existsSync(dist)) { console.error('dist/ is missing: run npm run build first'); process.exit(2); }

function walk(d) {
  return readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
const marker = 'techmen-fixture-client';
const withMarker = walk(dist).filter((f) => readFileSync(f).includes(marker));

const vite = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: REPO, stdio: 'ignore' });
const origin = `http://127.0.0.1:${port}`;
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try { up = (await fetch(`${origin}/`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); }
}
const browser = await launchBrowser();
const read = async (url) => {
  const page = await browser.newPage();
  await page.goto(origin + url);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ text: (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120), fx: !!window.__fx, html: document.getElementById('root')?.innerHTML.length ?? 0 }));
  await page.close();
  return r;
};
let ok = withMarker.length === 0;
try {
  const fx = await read('/_fixture');
  const ds = await read('/_ds');
  const login = await read('/login');
  console.log(`prod404: /_fixture -> "${fx.text}" (window.__fx ${fx.fx})`);
  console.log(`prod404: /_ds      -> "${ds.text}"`);
  console.log(`prod404: /login    -> "${login.text.slice(0, 60)}" (positive control)`);
  const same = fx.text === ds.text && /404/.test(fx.text);
  if (!same || fx.fx) ok = false;
  if (/404/.test(login.text) || !/Techmen/i.test(login.text)) { console.log('prod404: POSITIVE CONTROL FAILED: /login did not render'); ok = false; }
  console.log(`prod404: marker "${marker}" in dist: ${withMarker.length} file(s); /_fixture ${same ? 'is' : 'is NOT'} the same 404 element as /_ds -> ${ok ? 'PASS' : 'FAIL'}`);
} finally {
  await browser.close();
  child.kill('SIGTERM');
}
process.exit(ok ? 0 : 1);
