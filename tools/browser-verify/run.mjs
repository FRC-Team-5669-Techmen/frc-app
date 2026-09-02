#!/usr/bin/env node
/**
 * tools/browser-verify -- the repeatable visual pass.
 *
 *   npm run verify:browser                 both widths, every listed route
 *   npm run verify:browser -- --probe      what this container's browser can do
 *   npm run verify:browser -- --selftest   negative controls (exits 1 if a check is broken)
 *   npm run verify:browser -- --break overflow|tiny-taps|invisible|console-error|fault
 *                                          inject that defect into the REAL page and confirm
 *                                          the matching check reddens on this surface
 *   npm run verify:browser -- --route _ds --width 1440
 *   npm run verify:browser -- --json out.json --verbose
 *   npm run verify:browser -- --strict     exit 1 when a measurement is outside its threshold
 *
 * Default exit code is 0 even with findings: this is a MEASURING instrument,
 * not a gate. `--strict` makes it a gate. See README.md for why it is
 * deliberately outside `npm test` and outside CI.
 */
import { writeFileSync } from 'node:fs';
import { launch, openPage, settle, waitForApp, clickUntil, waitUntil } from './browser.mjs';
import { startDevServer } from './server.mjs';
import {
  horizontalScroll, contrast, tapTargets, presence, textContains, orderResult,
  consoleErrors, verdicts, faultMarkers,
  prepareClickResult, prepareWaitResult, prepareEvalResult,
} from './checks.mjs';
import { probeEnvironment } from './probe.mjs';
import { runSelfTest } from './selftest.mjs';
import { WIDTHS, selectRoutes, urlFor } from './routes.mjs';

/**
 * Defects injected by `--break`, for proving a check bites on a REAL surface
 * rather than only on a fixture. Each is the smallest thing that should move
 * exactly one measurement and leave the rest green -- that property is what
 * makes a live control worth anything.
 */
export const BREAKAGE = {
  /* Something wider than the viewport that cannot wrap. NAMES EVERY ROOM
     WRAPPER, not just one: a preset that silently fails to inject its defect is
     a control that proves nothing, and it proves nothing in the reassuring
     direction. */
  overflow: '.ds-root, .ds-main, .ds-section, .frc-deck, main, #root > div { min-width: 2400px !important; }',
  /* Drop every control below the floor. */
  'tiny-taps': 'button, [role="button"], a.ds-nav-link, .ds-tabs button { min-height: 0 !important; height: 14px !important; min-width: 0 !important; padding: 0 !important; line-height: 14px !important; }',
  /* Present in the DOM, painted nowhere -- the case the presence check exists
     for, and the case the ancestor-opacity walk exists for. */
  invisible: '.ds-root, .ds-main, .ds-section, .ds-verdict { opacity: 0 !important; }',
  /* Not CSS: a thrown error, which is how a real dead-handler regression
     surfaces -- silently, with the page still painted. */
  'console-error': { js: 'throw new Error("injected by --break console-error")' },
  /* A guard fault marker where the route does not expect one. */
  fault: { js: 'const d=document.createElement("div"); d.className="frc-fault"; d.textContent="injected fault marker"; document.querySelector(".ds-main")?.prepend(d);' },
};

function parseArgs(argv) {
  const out = { routes: [], widths: [], probe: false, selftest: false, brk: null, strict: false, json: null, port: 5199, settleMs: 700, verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--probe') out.probe = true;
    else if (a === '--selftest') out.selftest = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a === '--route') out.routes.push(argv[++i]);
    else if (a === '--width') out.widths.push(Number(argv[++i]));
    else if (a === '--port') out.port = Number(argv[++i]);
    else if (a === '--settle') out.settleMs = Number(argv[++i]);
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--break') out.brk = argv[++i];
  }
  return out;
}

const pad = (s, n) => String(s).padEnd(n);
const mark = (ok) => (ok ? '  ok ' : ' >>> ');

function printResult(r, indent = '    ') {
  const head = r.label ? `${r.check} [${r.label}]` : r.check;
  console.log(`${indent}${mark(r.withinThreshold)} ${pad(head, 46)} ${r.measured}   (threshold ${r.threshold})`);
}

function printDetail(r, indent = '        ') {
  if (r.check === 'horizontal-scroll') {
    for (const o of r.data.offenders) console.log(`${indent}overhang ${o.overhangPx}px  right=${o.right}  ${o.path}`);
  }
  if (r.check === 'presence') {
    for (const x of r.data.results.filter((v) => !v.visible).slice(0, 8)) {
      console.log(`${indent}present but NOT visible (${x.reasons.join(', ')}) box=${x.box}  ${x.path}`);
    }
  }
  if (r.check === 'contrast') {
    for (const x of r.data.results.slice(0, 8)) {
      console.log(`${indent}${x.ratio}:1  ${x.fontSizePx}px/${x.fontWeight}  ground from ${x.groundSource}${x.groundHasImage ? ' [background-image present]' : ''}${x.landedOnCanvas ? ' [landed on canvas]' : ''}  ${x.path}`);
    }
  }
  if (r.check === 'tap-target') {
    for (const x of r.data.results.filter((v) => v.visible && v.minDim < 44).slice(0, 8)) {
      console.log(`${indent}${x.w}x${x.h} (min ${x.minDim}px, at ${x.measuredAt}${x.measuredAt === 'label' ? `, own ${x.ownW}x${x.ownH}` : ''}) hit=${x.centreHitsSelf ? 'self' : x.hitPath}  ${x.path}`);
    }
  }
  if (r.check === 'ds-verdicts') {
    for (const x of r.data.fail) console.log(`${indent}FAIL  [${x.section}] ${x.text}`);
    for (const x of r.data.pending) console.log(`${indent}PENDING (the proof never resolved)  [${x.section}] ${x.text}`);
  }
  if (r.check === 'fault-markers') {
    for (const x of r.data.where) console.log(`${indent}[${x.section}] ${x.text}  ${x.path}`);
  }
  if (r.check === 'console-errors') {
    for (const e of r.data.errors) console.log(`${indent}[${e.type}] ${e.text.split('\n')[0].slice(0, 220)}`);
    for (const e of r.data.ignored) console.log(`${indent}(ignored) ${e.text.split('\n')[0].slice(0, 140)}`);
  }
}

async function runRoute(browser, origin, spec, width, opts) {
  const { context, page, consoleErrors: errs, requestFailures, blockedExternal } = await openPage(browser, { width });
  const results = [];
  const url = `${origin}${urlFor(spec)}`;
  let navStatus = null;
  let render = { rendered: false, waitedMs: 0 };
  const notes = [];

  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    navStatus = res ? res.status() : null;
    render = await waitForApp(page);

    if (opts.brk) {
      const defect = BREAKAGE[opts.brk];
      if (!defect) throw new Error(`Unknown --break preset "${opts.brk}". Known: ${Object.keys(BREAKAGE).join(', ')}`);
      if (typeof defect === 'string') await page.addStyleTag({ content: defect });
      else if (defect.css) await page.addStyleTag({ content: defect.css });
      else await page.addScriptTag({ content: defect.js }).catch(() => {});
      notes.push(`INJECTED DEFECT "${opts.brk}" -- this run is a negative control, not a reading of the real surface`);
    }

    /* Reach the state the spec means to measure. EVERY STEP IS A MEASUREMENT,
       pushed into `results` FIRST so a red step sits above the numbers it
       invalidates. A step that failed silently used to be invisible to the
       summary count and to --strict. */
    for (const step of spec.prepare ?? []) {
      if (step.click) {
        const r = await clickUntil(page, step.click, step.until, {
          attempts: step.attempts ?? 12, gapMs: step.gapMs ?? 250, force: step.force ?? false,
        });
        results.push(prepareClickResult(step, r));
      }
      if (step.waitFor) {
        const r = await waitUntil(page, step.waitFor, { timeoutMs: step.timeoutMs ?? 30_000 });
        results.push(prepareWaitResult(step, r));
      }
      if (step.evaluate) {
        const out = await page
          .evaluate(`(${step.evaluate})()`)
          .then((v) => ({ ok: true, v }))
          .catch((e) => ({ ok: false, err: e.message.split('\n')[0] }));
        results.push(prepareEvalResult(step, out));
      }
      await page.waitForTimeout(step.waitMs ?? 200);
    }

    await settle(page, { settleMs: spec.settleMs ?? opts.settleMs });

    results.push(await horizontalScroll(page));
    for (const c of spec.presence ?? []) results.push(await presence(page, c));
    for (const c of spec.contrast ?? []) results.push(await contrast(page, c));
    for (const c of spec.tapTargets ?? []) results.push(await tapTargets(page, c));
    for (const c of spec.textContains ?? []) results.push(await textContains(page, c));
    for (const c of spec.orderResult ?? []) results.push(await orderResult(page, c));
    if (spec.verdicts) results.push(await verdicts(page, spec.verdicts === true ? {} : spec.verdicts));
    if (spec.faultMarkers !== undefined) results.push(await faultMarkers(page, spec.faultMarkers));
    results.push(consoleErrors(errs, { ignore: spec.ignoreConsole ?? [], blockedCount: blockedExternal.length }));
  } catch (err) {
    results.push({
      check: 'route',
      measured: `THREW: ${err.message.split('\n')[0]}`,
      threshold: 'the route loads and every check runs',
      withinThreshold: false,
      data: {},
    });
  } finally {
    await context.close();
  }

  return { spec, width, url, navStatus, render, results, notes, blocked: blockedExternal.length, requestFailures };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.probe) {
    const p = await probeEnvironment();
    console.log(JSON.stringify(p, null, 2));
    return 0;
  }
  if (opts.selftest) return runSelfTest();

  const widths = opts.widths.length ? opts.widths : WIDTHS;
  const specs = selectRoutes(opts.routes);
  if (specs.length === 0) {
    console.error(`No route matched ${JSON.stringify(opts.routes)}.`);
    return 1;
  }

  const server = await startDevServer({ port: opts.port });
  const { browser, executablePath } = await launch();

  console.log(`browser  : ${executablePath}`);
  console.log(`server   : ${server.origin}${server.alreadyRunning ? ' (reused)' : ` (booted in ${server.bootMs}ms, first probe ${server.firstProbeStatus})`}`);
  console.log(`routes   : ${specs.length} spec(s) x ${widths.length} width(s)`);
  if (opts.brk) console.log(`BREAK    : ${opts.brk} -- this is a negative control run`);
  console.log('');

  const runs = [];
  try {
    for (const spec of specs) {
      for (const width of widths) {
        const run = await runRoute(browser, server.origin, spec, width, opts);
        runs.push(run);
        const outside = run.results.filter((r) => !r.withinThreshold).length;
        console.log(`${run.url}  @${width}px  -- ${run.render.rendered ? `rendered in ${run.render.waitedMs}ms` : `DID NOT RENDER (${run.render.waitedMs}ms)`}, HTTP ${run.navStatus}, ${run.blocked} external request(s) blocked`);
        for (const n of run.notes) console.log(`    NOTE  ${n}`);
        for (const r of run.results) {
          printResult(r);
          if (!r.withinThreshold || opts.verbose) printDetail(r);
        }
        console.log(`    ${outside === 0 ? 'all within threshold' : `${outside} measurement(s) OUTSIDE threshold`}`);
        console.log('');
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }

  const total = runs.reduce((n, r) => n + r.results.length, 0);
  const outside = runs.reduce((n, r) => n + r.results.filter((x) => !x.withinThreshold).length, 0);
  console.log(`${runs.length} route/width run(s), ${total} measurement(s), ${outside} outside threshold.`);

  if (opts.json) {
    writeFileSync(opts.json, JSON.stringify({ runs, total, outside, executablePath }, null, 2));
    console.error(`wrote ${opts.json}`);
  }

  return opts.strict && outside > 0 ? 1 : 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(err); process.exitCode = 1; },
);
