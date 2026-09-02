// THE FIRST SPEC, and for now the only one -- see `../routes.mjs` for why this
// app has exactly one route drivable without a real Supabase session.
//
// `/_ds` is the design-system specimen: dev-only (App.jsx creates its lazy
// import only under import.meta.env.DEV, so the chunk is absent from `dist`),
// let through both auth gates by a path check scoped to this one path, and it
// touches no Supabase table.
//
// ITS OWN VERDICT PANEL IS THE ASSERTION SURFACE. The route runs a long list of
// proofs in the browser -- alias resolution in three grounds, no rendered gold
// on paper, all four transitions, the guard refusals, host transparency,
// DeckStage's repaint, DeckSteps' stepping, sheet fill -- and renders each
// conclusion as a `.ds-verdict` span. Reading those is how this harness
// inherits every one of those measurements without restating a single one here,
// and it is why the `ds-verdicts` check treats PENDING as a failure: a proof
// that never resolved leaves `…` on screen, which looks fine and means nothing
// was measured.
export const order = 1;

import { IGNORED_CONSOLE } from './_shared.mjs';

export default {
  path: '/_ds',
  label: 'Design-system specimen: the whole component library, mounted, with its own proofs',

  // The proofs run in effects after mount and several measure across three
  // grounds, so the panel is not complete at first paint. Wait for the verdicts
  // to STOP BEING PENDING rather than for a fixed timeout: a timeout long
  // enough today measures a half-run panel the day a proof gets slower, and
  // reports honest zeros about a page that had not finished.
  // THE TRANSITION LAB IS INTERACTIVE AND ITS VERDICT IS PENDING UNTIL DRIVEN.
  // `TransitionLab` records animationstart/animationend from the real sheet
  // elements and renders `<Verdict state={allRan ? true : null}>`, where `null`
  // is the pending `...`. Its own caption says "Press each button". A first
  // version of this spec waited 60s for zero pending verdicts and reported the
  // route broken; the route was fine and the harness had simply never pressed
  // anything. So the four buttons are pressed here, which is also the only way
  // this pass proves the transitions run at all rather than reading a panel.
  //
  // `force: true` on each: the predicate below is satisfiable by a PREVIOUS
  // button's log entry, so without it `clickUntil` would short-circuit on
  // "already satisfied" from the second press onward and three of the four
  // transitions would never fire while the report said "clicked".
  prepare: [
    { click: '#motion button:has-text("frc-slide-shutter")', until: `() => !!document.querySelector('#motion .ds-transition-log')`, force: true, waitMs: 900 },
    { click: '#motion button:has-text("frc-slide-boot")', until: `() => !!document.querySelector('#motion .ds-transition-log')`, force: true, waitMs: 900 },
    { click: '#motion button:has-text("frc-slide-banner")', until: `() => !!document.querySelector('#motion .ds-transition-log')`, force: true, waitMs: 1100 },
    { click: '#motion button:has-text("frc-slide-cut")', until: `() => !!document.querySelector('#motion .ds-transition-log')`, force: true, waitMs: 900 },
    {
      // Wait for the panel to SETTLE rather than for a fixed timeout: several
      // proofs measure across three grounds in effects, and a timeout long
      // enough today reads a half-run panel the day one gets slower.
      waitFor: `() => {
        const all = document.querySelectorAll('.ds-verdict');
        if (all.length < 10) return false;
        return document.querySelectorAll('.ds-verdict-pending').length === 0;
      }`,
      timeoutMs: 60000,
    },
  ],

  // EVERY VERDICT MUST PASS, AND THERE MUST BE SOME.
  //
  // KNOWN FINDING, LIVE AS OF 2026-09-02 AND NOT THIS HARNESS'S TO FIX: the
  // `sheets` section reports FAIL, with all 26 patterns showing "0 slots, 0
  // chars". `specimen/proofs.js countSlots()` queries `sheet.querySelectorAll(
  // '[slot]')` and gates on `slots.length > 0`, but `components/slots.jsx`
  // renders every slot with `slot: undefined` (commit 8b2c41b, "rendering a
  // slot consumes its name"), so the attribute is gone from the DOM by the time
  // the proof looks. The copy itself renders -- the same rows report 32, 16, 29
  // text elements -- so this is a stale proof rather than lost copy. It lives
  // in `src/lib/design-system/`, which the bundle that wrote this harness may
  // not touch, so it is REPORTED here and left red: a threshold quietly widened
  // to accommodate it would hide the day it becomes a real regression.
  verdicts: { minTotal: 10, maxPending: 0 },

  // FOUR IS THE DOCUMENTED BASELINE, not zero, and this is the one number in
  // this file that is a snapshot rather than a rule. The DeckStage section
  // deliberately mounts broken decks to prove its six guard states trip, and
  // each renders a rust `.frc-fault` marker; `CLAUDE.md` records "4 fault
  // markers which is the documented DeckStage baseline" across several bundles.
  // A FIFTH marker is a guard tripping where nothing meant it to, which is
  // exactly the finding this pins. If a bundle legitimately adds a refusal
  // demo, this number moves in the same commit and the reason goes here.
  faultMarkers: { expected: 4, label: 'guard fault markers (4 = the DeckStage refusal demos)' },

  presence: [
    { selector: '[data-ds-root]', label: 'the specimen root', expectPresent: 1 },
    { selector: '.ds-section', label: 'proof sections', expectPresent: 20 },
    // Components are mounted from source and each root carries data-frc, so
    // this is live DOM rather than a list. A collapse here means the library
    // stopped mounting, which every other check would report as a clean page.
    { selector: '[data-frc]', label: 'mounted component roots', expectPresent: 50 },
  ],

  textContains: [
    {
      selector: '.ds-header',
      label: 'the route identifies itself as dev-only',
      must: ['/_ds', 'dev only'],
    },
  ],

  orderResult: [
    {
      // THE SCOPING RULE THE WHOLE DESIGN SYSTEM RESTS ON: every DS token is
      // scoped to `.frc-deck` and the three ground classes, never `:root`, so
      // loading the design system cannot collide with the app's own theme.css
      // (which defines --gold, --fault and --font-mono under :root). Asserted
      // as an outcome -- the app's gold and the deck's gold resolve
      // independently -- rather than by reading a stylesheet.
      evaluate: `() => {
        const root = getComputedStyle(document.documentElement);
        const deck = document.querySelector('.frc-deck');
        if (!deck) return ['no .frc-deck'];
        const d = getComputedStyle(deck);
        return [
          d.getPropertyValue('--gold').trim().toUpperCase(),
          root.getPropertyValue('--bg0').trim() === '',
        ];
      }`,
      expected: ['#FFE629', true],
      label: 'the deck resolves Techmen Gold; --bg0 is NOT declared at :root',
    },
  ],

  ignoreConsole: [
    ...IGNORED_CONSOLE,
    // THE REFUSAL DEMOS THROWING IS THE ROUTE WORKING. `/_ds` calls
    // `setHarnessMode(true)`, which makes every invariant guard THROW instead
    // of rendering a rust fault marker, and the `refusals` section then mounts
    // components in states that must be refused -- a SafetySheet with no
    // SafetyNote among them. React logs each as an uncaught error plus its own
    // "The above error occurred in <X>" line. Named individually rather than
    // swept up by a blanket pattern, so a DIFFERENT guard firing is still a
    // finding.
    /SafetySheet: Pass a SafetyNote as slot="note"/,
    /The above error occurred in the <SafetySheet> component/,
  ],
};
