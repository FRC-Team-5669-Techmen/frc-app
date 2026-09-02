/**
 * NEGATIVE CONTROLS. A check that has never failed has not been tested.
 *
 *   npm run verify:browser -- --selftest
 *
 * Every check is put to a PAIR of fixtures: one built to BREAK it and one built
 * to pass it. Both measured values are printed. A check that comes back green
 * on the broken fixture, or red on the sound one, is a broken instrument -- and
 * this file exits non-zero for it, because unlike the measuring run there IS a
 * right answer here.
 *
 * The fixtures are self-contained documents rather than a mutation of `src/`. A
 * mutation proves a check once, in a tree that then has to be restored
 * byte-identically; this proves it on every run, for any future session, and
 * touches nothing. (`--break` is the complementary live control: it injects a
 * defect into the real page, which is the half a fixture cannot do.)
 */
import { launch, openPage, settle } from './browser.mjs';
import {
  horizontalScroll, contrast, tapTargets, presence, textContains, orderResult,
  consoleErrors, verdicts, faultMarkers, prepareClickResult, prepareWaitResult, prepareEvalResult,
} from './checks.mjs';

const shell = (body, head = '') =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    html,body{margin:0;padding:0;background:#0A0B0D;color:#E6E6E6;font:16px/1.4 sans-serif}
    ${head}</style></head><body>${body}</body></html>`;

const CASES = [
  {
    group: 'horizontal-scroll',
    bad: {
      name: 'a 1200px nowrap row inside a 375px viewport',
      html: shell('<div id="row" style="white-space:nowrap;width:1200px">overflowing content</div>'),
      width: 375,
      run: (p) => horizontalScroll(p),
      expect: 'outside',
    },
    good: {
      name: 'the same row constrained, scrolling inside its own box',
      html: shell('<div style="max-width:100%;overflow-x:auto"><div style="white-space:nowrap;width:1200px">x</div></div>'),
      width: 375,
      run: (p) => horizontalScroll(p),
      expect: 'within',
    },
  },
  {
    group: 'presence (absence rows have a ceiling)',
    bad: {
      /* THE CASE THAT MADE `maxPresent` DEFAULT TO ZERO. Written as a floor,
         `expectPresent: 0` means `present >= 0`, which holds for any number of
         nodes -- so an absence row comes back green with the thing present. */
      name: 'a node that must not exist, and does',
      html: shell('<div class="forbidden">I should not be here</div>'),
      run: (p) => presence(p, { selector: '.forbidden', expectPresent: 0 }),
      expect: 'outside',
    },
    good: {
      name: 'the same absence row with nothing matching',
      html: shell('<div class="fine">ok</div>'),
      run: (p) => presence(p, { selector: '.forbidden', expectPresent: 0 }),
      expect: 'within',
    },
  },
  {
    group: 'presence (ancestor opacity)',
    bad: {
      /* opacity is NOT inherited: the child computes opacity 1 while being
         painted nowhere. Without the ancestor walk this reads visible. */
      name: 'a node inside an opacity:0 ancestor',
      html: shell('<div style="opacity:0"><p id="t">painted nowhere</p></div>'),
      run: (p) => presence(p, { selector: '#t', expectPresent: 1, expectVisible: 1 }),
      expect: 'outside',
    },
    good: {
      name: 'the same node with the ancestor painted',
      html: shell('<div style="opacity:1"><p id="t">painted</p></div>'),
      run: (p) => presence(p, { selector: '#t', expectPresent: 1, expectVisible: 1 }),
      expect: 'within',
    },
  },
  {
    group: 'contrast (alpha and color-mix)',
    bad: {
      /* The ground is a color-mix on an ancestor and the text is
         semi-transparent: a regex over computed styles reads neither. */
      name: 'dim text over a color-mix ground, alpha on the text',
      html: shell('<div style="background:color-mix(in srgb, #ffffff 12%, #0A0B0D)"><p id="t" style="color:rgba(230,230,230,0.26)">barely there</p></div>'),
      run: (p) => contrast(p, { selector: '#t', min: 4.5 }),
      expect: 'outside',
    },
    good: {
      name: 'the same ground with the app ink at full alpha',
      html: shell('<div style="background:color-mix(in srgb, #ffffff 12%, #0A0B0D)"><p id="t" style="color:#E6E6E6">readable</p></div>'),
      run: (p) => contrast(p, { selector: '#t', min: 4.5 }),
      expect: 'within',
    },
  },
  {
    group: 'contrast (real ancestor ground, not the page plate)',
    bad: {
      /* Proves the check composites the REAL ground rather than assuming the
         page: this text would pass against #0A0B0D. */
      name: 'pale ink on a gold card that sits on a dark page',
      html: shell('<div style="background:#FFE629;padding:8px"><p id="t" style="color:#FFF06B">on gold</p></div>'),
      run: (p) => contrast(p, { selector: '#t', min: 4.5 }),
      expect: 'outside',
    },
    good: {
      name: 'near-black ink on that same gold card',
      html: shell('<div style="background:#FFE629;padding:8px"><p id="t" style="color:#0A0B0D">on gold</p></div>'),
      run: (p) => contrast(p, { selector: '#t', min: 4.5 }),
      expect: 'within',
    },
  },
  {
    group: 'tap-target',
    bad: {
      name: 'a 20px control',
      html: shell('<button id="b" style="width:20px;height:20px;padding:0">x</button>'),
      run: (p) => tapTargets(p, { selector: '#b', min: 44, floor: 24 }),
      expect: 'outside',
    },
    good: {
      name: 'the same control at the 44px target',
      html: shell('<button id="b" style="min-width:44px;min-height:44px;padding:0">x</button>'),
      run: (p) => tapTargets(p, { selector: '#b', min: 44, floor: 24 }),
      expect: 'within',
    },
  },
  {
    group: 'tap-target (measured at the label)',
    bad: {
      name: 'a 22px input in a 22px label',
      html: shell('<label style="display:inline-block;height:22px"><input id="i" type="checkbox" style="width:22px;height:22px;margin:0"></label>'),
      run: (p) => tapTargets(p, { selector: '#i', min: 44, floor: 24 }),
      expect: 'outside',
    },
    good: {
      /* A control wrapped in a label is measured AT THE LABEL, which is what a
         finger hits: 22px input, 44px label, passes. */
      name: 'the same 22px input in a 44px label',
      html: shell('<label style="display:inline-flex;align-items:center;min-height:44px;min-width:44px"><input id="i" type="checkbox" style="width:22px;height:22px;margin:0"></label>'),
      run: (p) => tapTargets(p, { selector: '#i', min: 44, floor: 24 }),
      expect: 'within',
    },
  },
  {
    group: 'ds-verdicts (a FAIL verdict)',
    bad: {
      name: 'one verdict rendering FAIL',
      html: shell('<div class="ds-section" id="s"><span class="ds-verdict ds-verdict-ok">PASS a</span><span class="ds-verdict ds-verdict-fail">FAIL b</span></div>'),
      run: (p) => verdicts(p, { minTotal: 1 }),
      expect: 'outside',
    },
    good: {
      name: 'the same panel with both verdicts passing',
      html: shell('<div class="ds-section" id="s"><span class="ds-verdict ds-verdict-ok">PASS a</span><span class="ds-verdict ds-verdict-ok">PASS b</span></div>'),
      run: (p) => verdicts(p, { minTotal: 1 }),
      expect: 'within',
    },
  },
  {
    group: 'ds-verdicts (PENDING is not passing)',
    bad: {
      /* A proof that never resolved leaves `…` on screen, which looks harmless
         and means the measurement did not happen. */
      name: 'a verdict still pending',
      html: shell('<div class="ds-section" id="s"><span class="ds-verdict ds-verdict-ok">PASS a</span><span class="ds-verdict ds-verdict-pending">… b</span></div>'),
      run: (p) => verdicts(p, { minTotal: 1 }),
      expect: 'outside',
    },
    good: {
      name: 'the same panel once the proof resolved',
      html: shell('<div class="ds-section" id="s"><span class="ds-verdict ds-verdict-ok">PASS a</span><span class="ds-verdict ds-verdict-ok">PASS b</span></div>'),
      run: (p) => verdicts(p, { minTotal: 1 }),
      expect: 'within',
    },
  },
  {
    group: 'ds-verdicts (an empty panel proves nothing)',
    bad: {
      name: 'no verdicts rendered at all',
      html: shell('<div class="ds-section" id="s">the proofs never mounted</div>'),
      run: (p) => verdicts(p, { minTotal: 1 }),
      expect: 'outside',
    },
    good: {
      name: 'one verdict rendered',
      html: shell('<div class="ds-section" id="s"><span class="ds-verdict ds-verdict-ok">PASS</span></div>'),
      run: (p) => verdicts(p, { minTotal: 1 }),
      expect: 'within',
    },
  },
  {
    group: 'fault-markers',
    bad: {
      name: 'one more marker than the route expects',
      html: shell('<div class="frc-fault">a tripped guard</div><div class="frc-fault">another</div>'),
      run: (p) => faultMarkers(p, { expected: 1 }),
      expect: 'outside',
    },
    good: {
      name: 'exactly the expected count',
      html: shell('<div class="frc-fault">a tripped guard</div>'),
      run: (p) => faultMarkers(p, { expected: 1 }),
      expect: 'within',
    },
  },
  {
    group: 'text-contains',
    bad: {
      name: 'the required string missing from a present, visible node',
      html: shell('<footer id="f"><p>&nbsp;</p></footer>'),
      run: (p) => textContains(p, { selector: '#f', must: ['TECHMEN'] }),
      expect: 'outside',
    },
    good: {
      name: 'the same node carrying it',
      html: shell('<footer id="f"><p>TECHMEN 5669</p></footer>'),
      run: (p) => textContains(p, { selector: '#f', must: ['TECHMEN'] }),
      expect: 'within',
    },
  },
  {
    group: 'order-result',
    bad: {
      name: 'a page-side array that disagrees with the expectation',
      html: shell('<div id="a"></div><div id="b"></div>'),
      run: (p) => orderResult(p, { evaluate: '() => ["b", "a"]', expected: ['a', 'b'], label: 'order' }),
      expect: 'outside',
    },
    good: {
      name: 'the same expression agreeing',
      html: shell('<div id="a"></div><div id="b"></div>'),
      run: (p) => orderResult(p, { evaluate: '() => ["a", "b"]', expected: ['a', 'b'], label: 'order' }),
      expect: 'within',
    },
  },
];

/** Cases that need no page at all -- the pure result shapers. */
const PURE_CASES = [
  {
    group: 'console-errors',
    bad: {
      name: 'an unignored page error',
      run: () => consoleErrors([{ type: 'pageerror', text: 'TypeError: x is not a function' }], { blockedCount: 0 }),
      expect: 'outside',
    },
    good: {
      name: 'the same error matched by an explicit ignore pattern',
      run: () => consoleErrors([{ type: 'pageerror', text: 'TypeError: x is not a function' }], { ignore: [/x is not a function/] }),
      expect: 'within',
    },
  },
  {
    group: 'console-errors (our own blocking is not a page defect)',
    bad: {
      /* If the builtin pattern were added unconditionally, a REAL ERR_FAILED on
         a run that blocked nothing would be swallowed. It is added only when a
         block actually happened. */
      name: 'ERR_FAILED on a run that blocked nothing',
      run: () => consoleErrors([{ type: 'error', text: 'Failed to load resource: net::ERR_FAILED' }], { blockedCount: 0 }),
      expect: 'outside',
    },
    good: {
      name: 'the same line on a run that did block requests',
      run: () => consoleErrors([{ type: 'error', text: 'Failed to load resource: net::ERR_FAILED' }], { blockedCount: 3 }),
      expect: 'within',
    },
  },
  {
    group: 'prepare-click (attempts === 0 is a finding)',
    bad: {
      /* A predicate satisfiable by the page's RESTING state short-circuits the
         click, and the report still says "clicked". */
      name: 'a predicate already true, so the click never fired',
      run: () => prepareClickResult({ click: '.x', until: '() => true' }, { ok: true, matched: 1, attempts: 0, reason: 'already satisfied' }),
      expect: 'outside',
    },
    good: {
      name: 'the same step with force: true, which fires and says so',
      run: () => prepareClickResult({ click: '.x', until: '() => true', force: true }, { ok: true, matched: 1, attempts: 1, reason: 'predicate satisfied' }),
      expect: 'within',
    },
  },
  {
    group: 'prepare-wait (0ms is NOT a finding)',
    bad: {
      name: 'a predicate that never held',
      run: () => prepareWaitResult({ waitFor: '() => false' }, { ok: false, waitedMs: 30000, reason: 'predicate never satisfied within 30000ms' }),
      expect: 'outside',
    },
    good: {
      /* Unlike a click, waiting is not supposed to CAUSE anything, so a state
         that had already arrived is the step working. */
      name: 'a payload that had already landed',
      run: () => prepareWaitResult({ waitFor: '() => true' }, { ok: true, waitedMs: 0, reason: 'already satisfied' }),
      expect: 'within',
    },
  },
  {
    group: 'prepare-eval',
    bad: {
      name: 'a step that throws',
      run: () => prepareEvalResult({ evaluate: '() => { throw new Error("nope") }' }, { ok: false, err: 'nope' }),
      expect: 'outside',
    },
    good: {
      name: 'a step that returns a printable value',
      run: () => prepareEvalResult({ evaluate: '() => 9' }, { ok: true, v: 9 }),
      expect: 'within',
    },
  },
];

export async function runSelfTest() {
  const { browser, executablePath } = await launch();
  console.log(`browser  : ${executablePath}`);
  console.log(`controls : ${CASES.length * 2} in-page + ${PURE_CASES.length * 2} pure = ${(CASES.length + PURE_CASES.length) * 2}\n`);

  let broken = 0;
  let run = 0;

  const report = (group, side, name, r, want) => {
    run += 1;
    const got = r.withinThreshold ? 'within' : 'outside';
    const ok = got === want;
    if (!ok) broken += 1;
    console.log(`${ok ? '  ok ' : ' >>> '} ${group} / ${side}`);
    console.log(`        ${name}`);
    console.log(`        measured ${r.measured}   (threshold ${r.threshold}) -> ${got}, wanted ${want}`);
  };

  for (const c of CASES) {
    for (const side of ['bad', 'good']) {
      const fx = c[side];
      const { context, page } = await openPage(browser, { width: fx.width ?? 1440 });
      try {
        await page.setContent(fx.html);
        await settle(page, { settleMs: 80 });
        const r = await fx.run(page);
        report(c.group, side, fx.name, r, fx.expect);
      } finally {
        await context.close();
      }
    }
  }
  await browser.close();

  for (const c of PURE_CASES) {
    for (const side of ['bad', 'good']) {
      const fx = c[side];
      report(c.group, side, fx.name, fx.run(), fx.expect);
    }
  }

  console.log(`\n${run} control(s), ${broken} broken.`);
  if (broken) console.error('A check came back the wrong way on a fixture built to decide it. That is a broken instrument, not a finding about a page.');
  return broken ? 1 : 0;
}
