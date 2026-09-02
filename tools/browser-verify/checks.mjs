/**
 * The checks. EVERY CHECK RETURNS A MEASURED VALUE, never a bare pass/fail: a
 * number is auditable by the next reader and a green tick is not. Where a
 * threshold exists it is printed beside the measurement, never instead of it.
 *
 * Each check's own comment says what it can and cannot see. A check that fires
 * on legitimate code gets commented out and is then worse than not existing, so
 * every narrowing is written down where the narrowing is.
 */

/** Page-side helpers, installed once per page. */
const HELPERS = `
window.__bvHelpers = {
  cssPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = (n.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  },
  /* VISIBILITY WALKS ANCESTORS FOR OPACITY, because opacity is NOT inherited.
     A child of an opacity:0 parent computes opacity 1 and would otherwise
     report itself visible while being painted nowhere -- the exact false green
     this check exists to prevent. The reason string NAMES the ancestor. */
  isVisible(el) {
    const reasons = [];
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0) reasons.push('zero box');
    if (cs.display === 'none') reasons.push('display:none');
    if (cs.visibility === 'hidden') reasons.push('visibility:hidden');
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (parseFloat(s.opacity) === 0) {
        reasons.push(n === el ? 'opacity:0' : 'opacity:0 on ancestor ' + this.cssPath(n));
        break;
      }
      if (s.display === 'none' && n !== el) { reasons.push('display:none on ancestor ' + this.cssPath(n)); break; }
      n = n.parentElement;
    }
    /* aria-hidden is a THIRD question, not a visual one. Folding it into
       visibility reports a perfectly painted decorative glyph as invisible. */
    const ariaHidden = !!el.closest('[aria-hidden="true"]');
    return { visible: reasons.length === 0, ariaHidden, reasons, rect: { w: r.width, h: r.height } };
  },
  /* Colour is resolved BY PAINTING, not by parsing a computed string: a regex
     over computed styles skips color-mix() and color(srgb ...) silently and
     then reports the plate instead of the real ground. */
  toRgb(value) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  },
  groundOf(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      const bg = getComputedStyle(n).backgroundColor;
      const [r, g, b, a] = this.toRgb(bg);
      if (a > 0.99) return { rgb: [r, g, b], source: this.cssPath(n), hasImage: getComputedStyle(n).backgroundImage !== 'none' };
      n = n.parentElement;
    }
    return { rgb: [255, 255, 255], source: 'canvas', hasImage: false, landedOnCanvas: true };
  },
  lum([r, g, b]) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  },
  ratio(fg, bg) {
    const a = this.lum(fg), b = this.lum(bg);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  },
};
true;
`;

export async function ensureHelpers(page) {
  await page.evaluate(HELPERS);
}

export async function horizontalScroll(page, { tolerancePx = 0.5 } = {}) {
  await ensureHelpers(page);
  const data = await page.evaluate(() => {
    const h = window.__bvHelpers;
    const de = document.documentElement;
    const over = de.scrollWidth - de.clientWidth;
    const offenders = [];
    if (over > 0.5) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const overhang = Math.round((r.right - de.clientWidth) * 10) / 10;
        if (overhang > 0.5) offenders.push({ path: h.cssPath(el), right: Math.round(r.right), overhangPx: overhang });
      }
      offenders.sort((a, b) => b.overhangPx - a.overhangPx);
    }
    return { over: Math.round(over * 10) / 10, scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, offenders: offenders.slice(0, 8) };
  });
  return {
    check: 'horizontal-scroll',
    measured: `${data.over}px (scrollWidth ${data.scrollWidth} vs clientWidth ${data.clientWidth})`,
    threshold: `<= ${tolerancePx}px`,
    withinThreshold: data.over <= tolerancePx,
    data,
  };
}

/**
 * present / visible / aria-hidden are THREE questions.
 *
 * `expectPresent` and `expectVisible` are FLOORS. At zero a floor asserts
 * NOTHING -- `present >= 0` holds for any number of nodes -- which is the worse
 * half of the axis, because an absence row is exactly where zero is written.
 * So `maxPresent` DEFAULTS TO ZERO when `expectPresent` is zero: a caller
 * asking for zero is stating an absence, and there is no legitimate `>= 0`.
 */
export async function presence(page, { selector, label = selector, expectPresent = 1, maxPresent, expectVisible, maxVisible } = {}) {
  const presentCeiling = maxPresent === undefined ? (expectPresent === 0 ? 0 : undefined) : maxPresent;
  const wantVisible = expectVisible === undefined ? expectPresent : expectVisible;
  await ensureHelpers(page);
  const data = await page.evaluate((sel) => {
    const h = window.__bvHelpers;
    const nodes = [...document.querySelectorAll(sel)];
    const results = nodes.map((el) => {
      const v = h.isVisible(el);
      return { path: h.cssPath(el), visible: v.visible, ariaHidden: v.ariaHidden, reasons: v.reasons, box: `${v.rect.w.toFixed(1)}x${v.rect.h.toFixed(1)}` };
    });
    return {
      present: nodes.length,
      visible: results.filter((r) => r.visible).length,
      ariaHidden: results.filter((r) => r.ariaHidden).length,
      results: results.slice(0, 12),
    };
  }, selector);

  const presentOk = presentCeiling === undefined || data.present <= presentCeiling;
  const visibleOk = maxVisible === undefined || data.visible <= maxVisible;
  const presentPart = presentCeiling === undefined
    ? `>= ${expectPresent} present`
    : presentCeiling === expectPresent ? `exactly ${expectPresent} present` : `${expectPresent} to ${presentCeiling} present`;
  const visiblePart = maxVisible !== undefined
    ? `${wantVisible} to ${maxVisible} visible`
    : wantVisible > 0 ? `>= ${wantVisible} visible` : 'visible unconstrained';

  return {
    check: 'presence',
    label,
    measured: `present ${data.present}, visible ${data.visible}, aria-hidden ${data.ariaHidden}`,
    threshold: `${presentPart}, ${visiblePart}`,
    withinThreshold: data.present >= expectPresent && presentOk && data.visible >= wantVisible && visibleOk,
    data,
  };
}

export async function contrast(page, { selector, label = selector, min = 4.5 } = {}) {
  await ensureHelpers(page);
  const data = await page.evaluate((sel) => {
    const h = window.__bvHelpers;
    const out = [];
    for (const el of [...document.querySelectorAll(sel)].slice(0, 40)) {
      const v = h.isVisible(el);
      if (!v.visible) continue;
      const cs = getComputedStyle(el);
      const [fr, fg2, fb, fa] = h.toRgb(cs.color);
      const ground = h.groundOf(el.parentElement || el);
      // Composite alpha on the text over the real ground before taking a ratio.
      const fg = [
        Math.round(fr * fa + ground.rgb[0] * (1 - fa)),
        Math.round(fg2 * fa + ground.rgb[1] * (1 - fa)),
        Math.round(fb * fa + ground.rgb[2] * (1 - fa)),
      ];
      out.push({
        path: h.cssPath(el),
        ratio: h.ratio(fg, ground.rgb),
        fontSizePx: Math.round(parseFloat(cs.fontSize)),
        fontWeight: cs.fontWeight,
        groundSource: ground.source,
        groundHasImage: ground.hasImage,
        landedOnCanvas: !!ground.landedOnCanvas,
      });
    }
    return { results: out };
  }, selector);

  const worst = data.results.length ? Math.min(...data.results.map((r) => r.ratio)) : null;
  return {
    check: 'contrast',
    label,
    measured: data.results.length ? `${data.results.length} node(s), worst ${worst}:1` : 'no visible node matched',
    threshold: `>= ${min}:1`,
    withinThreshold: data.results.length > 0 && worst >= min,
    data,
  };
}

/**
 * Each control's box, its smallest dimension, and a centre hit-test.
 *
 * A control inside a `<label>` is measured AT THE LABEL, which is what a finger
 * hits, and both boxes are printed. The centre hit-test is RECORDED but is only
 * meaningful IN THE VIEWPORT -- `elementFromPoint` answers null outside it and
 * this harness never scrolls -- so it changes no verdict; the gate is geometry.
 */
export async function tapTargets(page, { selector, label = selector, min = 44, floor = 24 } = {}) {
  await ensureHelpers(page);
  const data = await page.evaluate(({ sel }) => {
    const h = window.__bvHelpers;
    const out = [];
    for (const el of [...document.querySelectorAll(sel)].slice(0, 60)) {
      const v = h.isVisible(el);
      const lab = el.closest('label');
      const target = lab && lab !== el ? lab : el;
      const r = target.getBoundingClientRect();
      const own = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const inView = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
      const hit = inView ? document.elementFromPoint(cx, cy) : null;
      out.push({
        path: h.cssPath(el),
        visible: v.visible,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        minDim: Math.round(Math.min(r.width, r.height) * 10) / 10,
        measuredAt: target === el ? 'self' : 'label',
        ownW: Math.round(own.width * 10) / 10,
        ownH: Math.round(own.height * 10) / 10,
        inView,
        centreHitsSelf: !!hit && (hit === el || el.contains(hit) || target.contains(hit)),
        hitPath: hit ? h.cssPath(hit) : 'offscreen',
      });
    }
    return { results: out };
  }, { sel: selector });

  const vis = data.results.filter((r) => r.visible);
  const smallest = vis.length ? Math.min(...vis.map((r) => r.minDim)) : null;
  const underMin = vis.filter((r) => r.minDim < min).length;
  const underFloor = vis.filter((r) => r.minDim < floor).length;
  return {
    check: 'tap-target',
    label,
    measured: vis.length ? `${vis.length} visible, smallest ${smallest}px, ${underMin} under ${min}px, ${underFloor} under ${floor}px` : 'no visible control matched',
    threshold: `every visible control >= ${floor}px (absolute floor); ${min}px is the target`,
    withinThreshold: vis.length > 0 && underFloor === 0,
    data: { ...data, smallest, underMin, underFloor },
  };
}

/**
 * THE `/_ds` ASSERTION SURFACE. The specimen route runs its own proofs in the
 * browser and renders each conclusion as a `.ds-verdict` span carrying
 * `-ok` / `-fail` / `-pending`. Reading those is how this harness inherits every
 * measurement that route already makes without restating any of them here.
 *
 * PENDING IS NOT PASSING. A proof that never resolved leaves its verdict at
 * `…`, which looks harmless on screen and means the measurement did not happen.
 * It is reported separately and gated separately.
 */
export async function verdicts(page, { minTotal = 1, maxPending = 0 } = {}) {
  await ensureHelpers(page);
  const data = await page.evaluate(() => {
    const h = window.__bvHelpers;
    const nodes = [...document.querySelectorAll('.ds-verdict')];
    const read = (el) => ({
      path: h.cssPath(el),
      section: el.closest('.ds-section')?.id ?? el.closest('[data-proof]')?.getAttribute('data-proof') ?? '(unsectioned)',
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
    });
    return {
      total: nodes.length,
      ok: nodes.filter((e) => e.classList.contains('ds-verdict-ok')).length,
      fail: nodes.filter((e) => e.classList.contains('ds-verdict-fail')).map(read),
      pending: nodes.filter((e) => e.classList.contains('ds-verdict-pending')).map(read),
    };
  });
  return {
    check: 'ds-verdicts',
    measured: `${data.total} verdict(s): ${data.ok} PASS, ${data.fail.length} FAIL, ${data.pending.length} still pending`,
    threshold: `>= ${minTotal} verdicts, 0 FAIL, <= ${maxPending} pending`,
    withinThreshold: data.total >= minTotal && data.fail.length === 0 && data.pending.length <= maxPending,
    data,
  };
}

/**
 * Invariant guard fault markers (`.frc-fault`).
 *
 * A marker is a CAUGHT DEFECT, not an accepted state -- except on `/_ds`, where
 * a section deliberately mounts broken components to prove the guards trip. So
 * this takes an EXPECTED count rather than asserting zero, and the count is the
 * route spec's to state and to justify.
 */
export async function faultMarkers(page, { expected = 0, label = 'guard fault markers' } = {}) {
  await ensureHelpers(page);
  const data = await page.evaluate(() => {
    const h = window.__bvHelpers;
    const nodes = [...document.querySelectorAll('.frc-fault')];
    return {
      count: nodes.length,
      where: nodes.slice(0, 12).map((el) => ({
        section: el.closest('.ds-section')?.id ?? '(unsectioned)',
        path: h.cssPath(el),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      })),
    };
  });
  return {
    check: 'fault-markers',
    label,
    measured: `${data.count} marker(s)` + (data.where.length ? ` in: ${[...new Set(data.where.map((w) => w.section))].join(', ')}` : ''),
    threshold: `exactly ${expected}`,
    withinThreshold: data.count === expected,
    data,
  };
}

/**
 * Text that must (and must not) appear inside a selector's subtree.
 *
 * READS `textContent`, NEVER `innerText`, AND THAT IS THE WHOLE CARE IN THIS
 * CHECK. `innerText` is the RENDERED text, so it applies `text-transform` --
 * and this app uppercases plenty of chrome. Measured on `/_ds`: the header's
 * `textContent` is `v1.1.0 . /_ds . dev only` while its `innerText` is
 * `V1.1.0 . /_DS . DEV ONLY`, so a spec asserting the authored string `/_ds`
 * came back with it "missing" from a node plainly containing it. The design
 * system's own standards record the identical defect ("a dropped-copy detector
 * reporting false positives because it compared against innerText while CSS
 * uppercased the source"), which is how it was recognised rather than worked
 * around with a lowercased haystack.
 *
 * The cost is that a real CASING regression in the source is still caught (the
 * source is what is compared) while a change to the CSS that uppercases it is
 * not. That is the right way round: the CSS is presentation, the source is copy.
 */
export async function textContains(page, { selector, label = selector, must = [], mustNot = [] } = {}) {
  const data = await page.evaluate(({ sel, must, mustNot }) => {
    const nodes = [...document.querySelectorAll(sel)];
    const text = nodes.map((n) => n.textContent || '').join('\n');
    return {
      matched: nodes.length,
      chars: text.length,
      missing: must.filter((m) => !text.includes(m)),
      forbidden: mustNot.filter((m) => text.includes(m)),
    };
  }, { sel: selector, must, mustNot });
  return {
    check: 'text-contains',
    label,
    measured: `${data.matched} node(s), ${data.chars} chars, ${data.missing.length} missing, ${data.forbidden.length} forbidden present`,
    threshold: `${must.length} required string(s) present, ${mustNot.length} forbidden absent`,
    withinThreshold: data.matched > 0 && data.missing.length === 0 && data.forbidden.length === 0,
    data,
  };
}

/** An array a page-side expression returns, compared element for element. */
export async function orderResult(page, { evaluate, expected, label } = {}) {
  const got = await page.evaluate(`(${evaluate})()`).catch((e) => ({ __threw: e.message.split('\n')[0] }));
  const ok = !got?.__threw && JSON.stringify(got) === JSON.stringify(expected);
  return {
    check: 'order-result',
    label,
    measured: got?.__threw ? `THREW: ${got.__threw}` : JSON.stringify(got),
    threshold: JSON.stringify(expected),
    withinThreshold: ok,
    data: { got, expected },
  };
}

export function consoleErrors(collected, { ignore = [], blockedCount = 0 } = {}) {
  /* The harness aborts external requests on purpose and Chromium logs a console
     error for each. Attributing our own policy to the page is how a clean
     surface acquires a permanent finding -- so this pattern is added ONLY when
     a block actually happened, and the entries are REPORTED in `ignored`
     rather than dropped. */
  const builtin = blockedCount > 0 ? [/Failed to load resource: net::ERR_FAILED/] : [];
  const patterns = [...builtin, ...ignore].map((p) => (p instanceof RegExp ? p : new RegExp(p)));
  const kept = [];
  const ignored = [];
  for (const e of collected) (patterns.some((p) => p.test(e.text)) ? ignored : kept).push(e);
  return {
    check: 'console-errors',
    measured: `${kept.length} error(s)${ignored.length ? `, ${ignored.length} ignored by pattern` : ''}`,
    threshold: '0',
    withinThreshold: kept.length === 0,
    data: { errors: kept.slice(0, 20), ignored: ignored.slice(0, 10), totalSeen: collected.length },
  };
}

/* --- prepare steps are MEASUREMENTS, not narration ------------------------ */

export function prepareClickResult(step, r) {
  /* attempts === 0 means the predicate was ALREADY TRUE and the click never
     physically fired, while the report would otherwise say "clicked". That is
     a finding: the predicate does not discriminate. `force: true` is the
     deliberate way out and annotates the row. */
  const forced = step.force === true;
  const vacuous = r.attempts === 0 && !forced;
  return {
    check: 'prepare-click',
    label: `${step.click}${forced ? ' [force: predicate not required to discriminate]' : ''}`,
    measured: `${r.matched} matched, ${r.attempts} attempt(s), ${r.reason}`,
    threshold: step.until ? 'the click fires and its predicate holds' : 'the click fires',
    withinThreshold: r.ok && !vacuous && (step.until ? true : r.matched > 0),
    data: r,
  };
}

export function prepareWaitResult(step, r) {
  /* Returning at 0ms is NOT a finding, unlike a click: waiting is not supposed
     to cause anything, so a state that had already arrived is the step working. */
  return {
    check: 'prepare-wait',
    label: String(step.waitFor).replace(/\s+/g, ' ').slice(0, 70),
    measured: r.ok ? `held after ${r.waitedMs}ms (${r.reason})` : `FAILED: ${r.reason}`,
    threshold: 'the predicate holds within the timeout',
    withinThreshold: r.ok,
    data: r,
  };
}

export function prepareEvalResult(step, out) {
  const said = typeof out.v === 'string' || typeof out.v === 'number' ? ` -- ${out.v}` : '';
  const src = String(step.evaluate).replace(/\s+/g, ' ').slice(0, 70);
  return {
    check: 'prepare-eval',
    label: src,
    measured: out.ok ? `returned${said || ' (nothing printable)'}` : `THREW: ${out.err}`,
    threshold: 'the step runs without throwing',
    withinThreshold: out.ok,
    data: out,
  };
}
