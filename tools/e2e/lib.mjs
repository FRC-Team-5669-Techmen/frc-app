/**
 * Shared plumbing for the fixture-mode end-to-end tools (checkin.mjs,
 * shoot.mjs): boot `vite --mode fixture`, launch the container's Chromium, and
 * make contexts that look like the phones and laptops students actually use.
 *
 * The browser is found through tools/browser-verify/browser.mjs's resolution
 * chain, not chromium.executablePath(): playwright-core here wants a build this
 * image does not ship (that file says why, measured).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveExecutable, LAUNCH_ARGS } from '../browser-verify/browser.mjs';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));

export const VIEWPORTS = Object.freeze({
  375: {
    name: '375',
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    // An Android phone running Chrome: the platform Web NFC exists on.
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  },
  1440: {
    name: '1440',
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
});

export function viewportFor(width) {
  const w = Number(width);
  if (VIEWPORTS[w]) return VIEWPORTS[w];
  return { name: String(w), viewport: { width: w, height: w < 700 ? 812 : 900 }, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: w < 700 ? 2 : 1 };
}

export function flag(args, name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return v == null || v.startsWith('--') ? true : v;
}

async function probe(url, timeoutMs = 2000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// The checkout a fixture-mode dev server serves, or null when the server is
// not one (any other server answers that path with HTML or a 404).
async function servedRoot(origin) {
  try {
    const res = await fetch(`${origin}/__fixture/root`, { signal: AbortSignal.timeout(3000) });
    const text = (await res.text()).trim();
    return res.ok && path.isAbsolute(text) && !text.includes('\n') ? path.resolve(text) : null;
  } catch {
    return null;
  }
}

/**
 * Boot `vite --mode fixture` on `port`, or reuse a server already answering
 * there (the caller then proves it is fixture mode by finding window.__fx).
 * The server is polled on a real route, never trusted from its banner.
 */
export async function startFixtureServer({ port = 5401, host = '127.0.0.1', bootTimeoutMs = 120_000, quiet = true } = {}) {
  const origin = `http://${host}:${port}`;
  if ((await probe(`${origin}/_fixture`)) !== null) {
    // Reuse only a fixture server serving THIS checkout. Several worktrees can
    // hold the same default port; reusing another's would test its code and
    // report it as this tree's (vite.config.js answers /__fixture/root).
    const served = await servedRoot(origin);
    if (served !== path.resolve(REPO)) {
      throw new Error(`A server on ${origin} is not a fixture server for this checkout (it serves ${served ?? 'something else'}; this is ${path.resolve(REPO)}). Stop it, or pass --port to use a free port.`);
    }
    return { origin, reused: true, stop: async () => {}, log: () => '(reused a running server)' };
  }
  const vite = fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url));
  if (!existsSync(vite)) throw new Error('node_modules/vite is missing. Run `npm install` first.');
  const lines = [];
  const child = spawn(process.execPath, [vite, '--mode', 'fixture', '--host', host, '--port', String(port), '--strictPort'], {
    cwd: REPO,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const grab = (b) => { const s = b.toString(); lines.push(s); if (!quiet) process.stderr.write(s); };
  child.stdout.on('data', grab);
  child.stderr.on('data', grab);
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal }; });
  const started = Date.now();
  while (Date.now() - started < bootTimeoutMs) {
    if (exited) throw new Error(`vite exited early (code=${exited.code}):\n${lines.join('')}`);
    if ((await probe(`${origin}/_fixture`, 5000)) === 200) {
      return {
        origin,
        reused: false,
        bootMs: Date.now() - started,
        log: () => lines.join(''),
        stop: async () => {
          child.kill('SIGTERM');
          await new Promise((r) => setTimeout(r, 400));
          if (exited === null) child.kill('SIGKILL');
        },
      };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill('SIGKILL');
  throw new Error(`vite --mode fixture did not answer on ${origin} within ${bootTimeoutMs}ms:\n${lines.join('')}`);
}

export async function launchBrowser() {
  const { path, tried } = resolveExecutable();
  if (!path) throw new Error(`No Chromium binary found. Tried:\n${tried.map((t) => `  ${t.path}`).join('\n')}`);
  return chromium.launch({ executablePath: path, args: LAUNCH_ARGS });
}

/**
 * A context in America/Los_Angeles at the given viewport, with every
 * non-loopback request blocked (the fixture needs none; one that leaves the
 * machine is a finding, and is counted).
 */
export async function newContext(browser, vp, { geolocation = null, permissions = [] } = {}) {
  const context = await browser.newContext({
    viewport: vp.viewport,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    deviceScaleFactor: vp.deviceScaleFactor,
    ...(vp.userAgent ? { userAgent: vp.userAgent } : {}),
    timezoneId: 'America/Los_Angeles',
    locale: 'en-US',
    ...(geolocation ? { geolocation } : {}),
    permissions,
    serviceWorkers: 'block',
  });
  const blocked = [];
  await context.route((url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'), (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  return { context, blocked };
}

/** Console errors and uncaught exceptions on a page, as they happen. */
export function watchConsole(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push({ type: 'console', text: msg.text(), url: page.url() });
  });
  page.on('pageerror', (err) => errors.push({ type: 'pageerror', text: `${err.name}: ${err.message}`, url: page.url() }));
  return errors;
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Wait until window.__fx exists: the page is running the fixture client. */
export async function waitForFixture(page, timeoutMs = 30_000) {
  await page.waitForFunction(() => !!window.__fx && !!window.__fx.db, null, { timeout: timeoutMs });
}
