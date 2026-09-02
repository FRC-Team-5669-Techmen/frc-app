/**
 * Browser launch and page setup for the verification harness.
 *
 * THE RESOLUTION CHAIN IS LOAD-BEARING HERE, NOT DEFENSIVE PADDING. Measured in
 * this container on 2026-09-02: `chromium.executablePath()` from
 * playwright-core@1.62.1 answers
 * `/opt/pw-browsers/chromium-1234/chrome-linux64/chrome`, which DOES NOT EXIST.
 * Playwright pins a chromium build number per release and 1.62.1 wants build
 * 1234; the image ships build **1194** at
 * `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (note `chrome-linux`,
 * not `chrome-linux64` -- the directory name changed between builds too).
 * Launching against the real path works: version 141.0.7390.37, a real layout
 * (a 100px box measures 100), and a real 4832-byte PNG screenshot.
 *
 * So the first candidate below is expected to MISS in this environment and the
 * third is the one that hits. Every candidate is reported on failure, because
 * "browser not found" otherwise reads like a missing tool rather than a version
 * skew. Do not "fix" this by upgrading playwright-core: the download it would
 * then want is not reachable, and the failure mode moves from a fallback that
 * works to an install step that cannot.
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

/** Fallbacks in order. The first that exists wins; all are reported. */
export const EXECUTABLE_CANDIDATES = [
  () => {
    try {
      return chromium.executablePath();
    } catch {
      return null;
    }
  },
  () => process.env.CHROMIUM_PATH || null,
  () => '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  () => '/opt/pw-browsers/chromium/chrome-linux/chrome',
  () => '/opt/pw-browsers/chromium',
  () => '/usr/bin/chromium',
  () => '/usr/bin/chromium-browser',
  () => '/opt/google/chrome/chrome',
  () => '/usr/bin/google-chrome',
];

export function resolveExecutable() {
  const tried = [];
  for (const get of EXECUTABLE_CANDIDATES) {
    let p = null;
    try { p = get(); } catch { p = null; }
    if (!p) continue;
    const ok = existsSync(p);
    tried.push({ path: p, exists: ok });
    if (ok) return { path: p, tried };
  }
  return { path: null, tried };
}

/**
 * Chromium here has no dbus and no GPU, and the container runs as root, which
 * is why --no-sandbox is required rather than merely convenient.
 */
export const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
];

export async function launch() {
  const { path, tried } = resolveExecutable();
  if (!path) {
    const lines = tried.map((t) => `  ${t.exists ? 'present' : 'MISSING'}  ${t.path}`).join('\n');
    throw new Error(`No Chromium binary found. Candidates tried:\n${lines}`);
  }
  const browser = await chromium.launch({ executablePath: path, args: LAUNCH_ARGS });
  return { browser, executablePath: path, tried };
}

/**
 * Freeze TRANSITIONS only, never animations.
 *
 * Killing `animation` as well freezes entrance animations at frame 0, so real
 * elements come back at opacity 0 and read as failures. This repo's design
 * system makes that concrete: `frc-slide-boot`'s first frame is
 * `scale(1.015) blur(16px) opacity(0)`, and a previous measurement pass in this
 * repo reported nine phantom overflow findings from exactly that. Animations
 * are left to run and the page is settled on a timeout instead.
 */
export const FREEZE_TRANSITIONS_CSS = '*, *::before, *::after { transition: none !important; }';

export async function openPage(browser, { width, height = 900, blockExternal = true, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion,
  });
  const page = await context.newPage();

  /* Block every non-loopback request.
   *
   * Two reasons, and the second is the one that matters for correctness. The
   * app boots a Supabase client at module load from `.env.dsspec`'s placeholder
   * URL, which points at a port nothing listens on; letting that request go out
   * costs a connection timeout on every page. And a run that reaches the
   * network is not deterministic. Every block is COUNTED and reported, so
   * "this measurement was taken with external requests blocked" is never a
   * silent condition.
   *
   * A PREDICATE, not a match-everything glob: globbing every URL routes each
   * vite dev module request out to this Node handler and back. */
  const blockedExternal = [];
  if (blockExternal) {
    await page.route(
      (url) => !(url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
      (route) => {
        blockedExternal.push(route.request().url());
        return route.abort();
      },
    );
  }

  const failedResponses = [];
  page.on('response', (res) => {
    if (res.status() >= 400) failedResponses.push({ url: res.url(), status: res.status() });
  });

  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', (msg) => {
    let text = msg.text();
    /* Chromium never puts the URL in a resource-load failure's console text,
       only in a location this client does not expose for that message type. So
       a failed response is paired FIFO with the next matching console error --
       without it, an ignore pattern can only match the whole class of
       "something failed to load", which is a blanket ignore wearing a regex. */
    if (msg.type() === 'error' && /Failed to load resource/.test(text) && failedResponses.length) {
      const hit = failedResponses.shift();
      text = `${text} [${hit.status} ${hit.url}]`;
    }
    const entry = { type: msg.type(), text, url: page.url() };
    if (msg.type() === 'error') consoleErrors.push(entry);
    else if (msg.type() === 'warning') consoleWarnings.push(entry);
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: `${err.name}: ${err.message}`, url: page.url() });
  });
  /* A request the harness itself aborted is not a page defect. It is counted in
     blockedExternal and reported there; repeating it as a failure manufactures a
     finding out of our own policy. */
  const requestFailures = [];
  page.on('requestfailed', (req) => {
    if (blockedExternal.includes(req.url())) return;
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? 'unknown' });
  });

  return { context, page, consoleErrors, consoleWarnings, requestFailures, blockedExternal };
}

/**
 * Wait for the app to actually be on screen.
 *
 * `domcontentloaded` is not enough and the failure is SILENT: the route answers
 * 200 with an empty shell, every selector matches 0 nodes, and the console is
 * clean -- which reads exactly like markup that changed. Vite dev compiles the
 * module graph on first request, so the first visit to a route is far slower
 * than the rest of a run.
 *
 * This waits for painted content and then for the DOM to STOP CHANGING, which
 * is what a React tree finishing its effects looks like from outside. It
 * reports READABILITY, which is all a measurement needs; anything that clicks
 * retries against its own effect (`clickUntil`) rather than trusting a timer.
 */
export async function waitForApp(page, { timeoutMs = 60_000 } = {}) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      () => {
        const body = document.body;
        if (!body) return false;
        /* The FIRST candidate WITH A BOX, not simply the first candidate. A
           zero-box element early in the body (a live region, an empty portal
           root) otherwise makes this predicate never hold on every route at
           once -- and the symptom is a run that got slow, not a run that went
           red, which is the hardest kind to notice. */
        const cands = [...body.querySelectorAll('main, h1, [data-frc], .ds-section, #root > *')];
        const el = cands.find((c) => {
          const r = c.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (!el) return false;
        return (body.innerText || '').trim().length > 0;
      },
      { timeout: timeoutMs, polling: 100 },
    );
    const stable = await page
      .waitForFunction(
        ({ polls }) => {
          const w = window;
          const sig =
            document.getElementsByTagName('*').length +
            ':' +
            (document.body.innerText || '').length +
            ':' +
            Math.round(document.body.getBoundingClientRect().height);
          if (w.__bvSig === sig) w.__bvSigCount = (w.__bvSigCount || 0) + 1;
          else { w.__bvSig = sig; w.__bvSigCount = 0; }
          return w.__bvSigCount >= polls;
        },
        { polls: 3 },
        { timeout: 20_000, polling: 150 },
      )
      .then(() => true)
      .catch(() => false);
    return { rendered: true, domStable: stable, waitedMs: Date.now() - started };
  } catch {
    return { rendered: false, domStable: false, waitedMs: Date.now() - started };
  }
}

/**
 * Click something and keep clicking until it demonstrably worked.
 *
 * There is no reliable "the handlers are attached" signal to wait on, so the
 * EFFECT is the signal. `until` is a predicate evaluated in the page and the
 * ATTEMPT COUNT is returned and printed: a step that needed four tries is
 * telling you something a silent success would not.
 *
 * `page.evaluate(string)` treats its argument as an EXPRESSION, so an arrow
 * function source handed over bare evaluates to a function OBJECT and is never
 * `=== true`. It is invoked here. That trap costs an afternoon every time.
 */
export async function clickUntil(page, selector, until, { attempts = 12, gapMs = 250, force = false } = {}) {
  const matched = await page.locator(selector).count();
  if (matched === 0) return { ok: false, matched: 0, attempts: 0, reason: 'no match' };

  const satisfied = async () => {
    if (!until) return null;
    try {
      return (await page.evaluate(`(${until})()`)) === true;
    } catch {
      return false;
    }
  };
  /* Without `force`, a predicate satisfiable by the page's RESTING state reads
     "already satisfied" and the click never physically fires -- while the
     report still says "clicked". A caller in that shape passes force: true,
     which is annotated in the report so the next reader learns it from the
     line rather than from the spec file. */
  if (!force && (await satisfied()) === true) {
    return { ok: true, matched, attempts: 0, reason: 'already satisfied' };
  }

  for (let i = 1; i <= attempts; i += 1) {
    try {
      const loc = page.locator(selector).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      const box = await loc.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      else await loc.click({ timeout: 5000 });
    } catch {
      await page.waitForTimeout(gapMs);
      continue;
    }
    await page.waitForTimeout(gapMs);
    const s = await satisfied();
    if (s === null) return { ok: true, matched, attempts: i, reason: 'clicked (no predicate given)' };
    if (s === true) return { ok: true, matched, attempts: i, reason: 'predicate satisfied' };
  }
  return { ok: false, matched, attempts, reason: 'predicate never satisfied' };
}

/**
 * Wait for a page-side predicate to hold, and REPORT HOW LONG IT TOOK.
 *
 * Not a longer `settleMs`, and the difference is the point: a fixed timeout
 * that happens to be long enough today measures an empty page the day the work
 * gets slower, silently, because every selector honestly matches nothing.
 */
export async function waitUntil(page, until, { timeoutMs = 30_000, pollMs = 150 } = {}) {
  const started = Date.now();
  const satisfied = async () => {
    try {
      return (await page.evaluate(`(${until})()`)) === true;
    } catch {
      return false;
    }
  };
  if (await satisfied()) return { ok: true, waitedMs: 0, reason: 'already satisfied' };
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(pollMs);
    if (await satisfied()) return { ok: true, waitedMs: Date.now() - started, reason: 'predicate satisfied' };
  }
  return { ok: false, waitedMs: Date.now() - started, reason: `predicate never satisfied within ${timeoutMs}ms` };
}

/** Settle on a TIMEOUT, never on rAF. */
export async function settle(page, { freezeTransitions = true, settleMs = 700 } = {}) {
  if (freezeTransitions) await page.addStyleTag({ content: FREEZE_TRANSITIONS_CSS });
  await page.waitForTimeout(settleMs);
}
