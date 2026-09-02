/**
 * Environment capability probe.
 *
 * `CLAUDE.md` documents a long list of things the Browser pane cannot do, and a
 * previous bundle recorded "the Browser pane would not composite frames in this
 * session" as the reason a whole verification pass reported computed values and
 * no images. Those are facts about THAT tool. This probe measures the same
 * questions against the Chromium THIS harness drives, so a future session reads
 * numbers instead of inheriting another tool's limits.
 *
 *   npm run verify:browser -- --probe
 */
import { launch, openPage, LAUNCH_ARGS, resolveExecutable } from './browser.mjs';

export async function probeEnvironment() {
  const resolution = resolveExecutable();
  const { browser, executablePath } = await launch();
  const version = browser.version();
  const { context, page } = await openPage(browser, { width: 1440 });

  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div id="spacer" style="height:4000px"></div>
    <div id="target" style="height:50px;background:#123">t</div>
    <div id="rs" style="width:100px;height:100px"></div>
    <canvas id="c" width="8" height="8"></canvas>
  </body></html>`);

  const results = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};

    out.rafFires = await new Promise((res) => {
      let done = false;
      requestAnimationFrame(() => { done = true; res(true); });
      setTimeout(() => { if (!done) res(false); }, 1500);
    });

    out.intersectionObserverFires = await new Promise((res) => {
      let fired = false;
      const io = new IntersectionObserver((entries) => { if (entries.length) { fired = true; res(true); } });
      io.observe(document.getElementById('target'));
      document.getElementById('target').scrollIntoView();
      setTimeout(() => { io.disconnect(); if (!fired) res(false); }, 1500);
    });

    out.resizeObserverDelivers = await new Promise((res) => {
      let fired = false;
      const el = document.getElementById('rs');
      const ro = new ResizeObserver(() => { fired = true; res(true); });
      ro.observe(el);
      el.style.width = '250px';
      setTimeout(() => { ro.disconnect(); if (!fired) res(false); }, 1500);
    });

    /* Canvas readback -- the mechanism every contrast measurement rests on. */
    try {
      const ctx = document.getElementById('c').getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = 'color-mix(in srgb, #ffffff 50%, #000000)';
      ctx.fillRect(0, 0, 8, 8);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out.canvasReadback = `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
      out.canvasParsesColorMix = d[0] > 100 && d[0] < 210;
    } catch (e) {
      out.canvasReadback = `threw: ${e.message}`;
      out.canvasParsesColorMix = false;
    }

    /* Web Animations interpolation: the documented way to prove two values
       interpolate rather than flip discretely. */
    try {
      const el = document.getElementById('target');
      const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000 });
      anim.pause();
      anim.currentTime = 500;
      out.animationMidpointOpacity = getComputedStyle(el).opacity;
      anim.cancel();
    } catch (e) {
      out.animationMidpointOpacity = `threw: ${e.message}`;
    }

    const el2 = document.getElementById('rs');
    el2.style.width = '333px';
    await wait(50);
    out.layoutAfterTimeoutPx = el2.getBoundingClientRect().width;

    out.devicePixelRatio = window.devicePixelRatio;
    out.prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return out;
  });

  /* Compositing: does a screenshot come back at all, and how big? */
  let screenshot = null;
  try {
    const buf = await page.screenshot({ timeout: 20_000 });
    screenshot = `${buf.length} bytes (PNG magic ${buf.slice(1, 4).toString() === 'PNG' ? 'ok' : 'MISSING'})`;
  } catch (e) {
    screenshot = `FAILED: ${e.message.split('\n')[0]}`;
  }

  await context.close();
  await browser.close();

  return {
    executablePath,
    executableResolution: resolution.tried,
    browserVersion: version,
    launchArgs: LAUNCH_ARGS,
    screenshot,
    ...results,
  };
}
