/**
 * The member handbook (/handbook: src/HandbookPage.jsx over src/handbook/,
 * signatures in migration 0013).
 *
 * Claims under test, each against a presence on the same fixture:
 *  - the quick reference opens first with the three standards, the standards
 *    diagram drawn in theme colors (its words are not black), no page scroll;
 *  - the Handbook tab shows sections 1 to 22 in order, all open, with 18
 *    checks between them and an index of all 24 sections; terms are
 *    underlined and a term opens its glossary line;
 *  - search narrows the sections to the ones that match and marks the words
 *    (sports: Section 6 among them, fewer than 22); a word in no section
 *    shows 0 and says so; clearing it brings back 22 and the 18 checks;
 *  - /handbook?section=6 and ?section=4 land on that section; ?tab=lessons,
 *    the old name, still opens the Handbook tab;
 *  - a wrong answer is marked and does not pass; answering every question
 *    right (found by trying options, not by reading the answer key) passes
 *    all 18 and moves the meter from 0/18 to 18/18;
 *  - a student cannot sign before passing (0 sign buttons, 18 to go) and can
 *    after (1); signing writes ONE row {student, 2026-10-20, lessons 18},
 *    which survives a reload; with 0013 off the Sign tab says it is not set up
 *    and offers 0 sign buttons;
 *  - a mentor signs without lessons and sees the signer list; the student
 *    sees no list (0 against 1); a parent signs the 5 parent lines, a student
 *    the 8 student lines;
 *  - every tab, option and the section menu at least 44px on the phone.
 */
import { P } from './_util.mjs';

async function passAll(t) {
  const checks = await t.count('.hb-check');
  for (let i = 0; i < checks; i += 1) {
    const check = t.page.locator('.hb-check').nth(i);
    for (let qi = 0; qi < 2; qi += 1) {
      const q = check.locator('.hb-q').nth(qi);
      for (let oi = 0; oi < 3; oi += 1) {
        if (await q.locator('.hb-feedback-ok').count()) break;
        await t.press(q.locator('.hb-opt').nth(oi));
      }
    }
  }
}

export default {
  async run(t) {
    t.as('student · quick reference');
    await t.open('/handbook', { persona: 'student', mig: 'all', reset: true, ready: '.hb-hero' });
    await t.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('techmen.handbook.')) localStorage.removeItem(k); });
    await t.open('/handbook', { persona: 'student', mig: 'all', ready: '.hb-hero' });
    t.eq('four tabs, quick reference selected', await t.texts('.hb-tab'), ['Quick reference', 'Handbook', 'Glossary', 'Sign']);
    t.eq('selected tab', await t.text('.hb-tab[aria-selected="true"]'), 'Quick reference');
    t.eq('meter starts at 0/18', await t.text('.hb-meter-n'), '0/18');
    t.eq('three standards', await t.texts('.hb-stat-n'), ['80%', '2 h', '2.0']);
    const ink = await t.evaluate(() => {
      const text = document.querySelector('.hb-glance .hb-diagram-svg text');
      const probe = document.createElement('span'); probe.style.color = 'var(--text)'; document.body.append(probe);
      const want = getComputedStyle(probe).color; probe.remove();
      return { fill: text ? getComputedStyle(text).fill : null, want };
    });
    t.check('the standards diagram draws its words in the theme ink, not black', ink.fill === ink.want && ink.fill !== 'rgb(0, 0, 0)', JSON.stringify(ink));
    await t.noHScroll();
    await t.tapTargets('.hb-tab', 'tabs at least 44px on the phone');
    await t.shot('quick');
    t.eq('Get help lists Mr. Pina with his email and phone, and no Mr. Garza', [((await t.text('.hb-contacts')) || '').includes('apina@boscotech.edu'), ((await t.text('.hb-contacts')) || '').includes('(626) 419-9320'), ((await t.text('.hb-contacts')) || '').includes('Garza')], [true, true, false]);
    t.eq('plain /handbook shows no section yet (0, against 22 on the Handbook tab)', await t.count('.hb-sec-card'), 0);

    t.as('student · citing a section by link');
    await t.open('/handbook?section=6', { persona: 'student', mig: 'all', ready: '#sec-6' });
    await t.settle();
    t.eq('?section=6 opens the Handbook tab with every section', [await t.text('.hb-tab[aria-selected="true"]'), await t.count('.hb-sec-card')], ['Handbook', 22]);
    t.eq('Sections 4, 6 and 7 carry their own numbers', [await t.text('#sec-4 .hb-sec-num'), await t.text('#sec-6 .hb-sec-num'), await t.text('#sec-7 .hb-sec-num')], ['Section 4', 'Section 6', 'Section 7']);
    t.check('Section 6 holds the sports rule', ((await t.text('#sec-6')) || '').includes('other clubs, sports and activities'), '');
    t.check('Section 6 is scrolled into view', await t.evaluate(() => { const r = document.getElementById('sec-6').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), '');
    await t.open('/handbook?section=4', { persona: 'student', mig: 'all', ready: '#sec-4' });
    t.check('?section=4 lands on Your week, with the Tuesday and Friday rule', ((await t.text('#sec-4')) || '').includes('Other activities never excuse a team meeting'), '');
    await t.open('/handbook?tab=lessons', { persona: 'student', mig: 'all', ready: '.hb-sec-card' });
    t.eq('the old ?tab=lessons link opens the Handbook tab', await t.text('.hb-tab[aria-selected="true"]'), 'Handbook');
    await t.open('/handbook', { persona: 'student', mig: 'all', ready: '.hb-hero' });

    t.as('student · the whole handbook');
    await t.press('.hb-tab:nth-child(2)');
    await t.waitFor('.hb-sec-card');
    t.eq('22 sections in order, 18 checks, an index of 24, none passed', [await t.count('.hb-sec-card'), await t.count('.hb-check'), await t.count('.hb-index-item'), await t.count('.hb-check[data-state="passed"]')], [22, 18, 24, 0]);
    const nums = await t.evaluate(() => [...document.querySelectorAll('.hb-sec-card')].map((el) => Number(el.id.slice(4))));
    t.check('sections run 1 to 22 with none missing', nums.every((n, i) => n === i + 1), nums.join(','));
    const terms = await t.count('#sec-1 .hb-term');
    t.check('Section 1 underlines terms', terms > 2, `${terms} terms`);
    t.eq('no definition open yet', await t.count('.hb-term-pop'), 0);
    await t.evaluate(() => document.querySelector('#sec-1 .hb-term')?.scrollIntoView({ block: 'center' }));
    await t.press('#sec-1 .hb-term');
    t.check('a tapped term opens its glossary line', (await t.count('.hb-term-pop')) === 1 && ((await t.text('.hb-term-def')) || '').length > 10, await t.text('.hb-term-pop'));
    await t.shot('term');
    await t.evaluate(() => document.querySelector('#sec-1 .hb-sec-title')?.scrollIntoView({ block: 'center' }));
    await t.press('#sec-1 .hb-sec-title');
    t.eq('a tap elsewhere closes it', await t.count('.hb-term-pop'), 0);
    await t.tapTargets('.hb-check .hb-opt', 'answer options at least 44px on the phone');
    await t.noHScroll();

    t.as('student · search');
    await t.page.fill('.hb-read-tools input[type="search"]', 'sports');
    await t.waitFor('.hb-hits');
    const sports = await t.count('.hb-sec-card');
    t.check('searching sports narrows to fewer sections, Section 6 among them', sports >= 1 && sports < 22 && (await t.count('#sec-6')) === 1, `${sports} sections`);
    t.check('the word is marked and the checks are hidden', (await t.count('.hb-hit')) > 0 && (await t.count('.hb-check')) === 0, `${await t.count('.hb-hit')} marks`);
    t.check('the count says how many match', ((await t.text('.hb-hits')) || '').startsWith(`${sports} section`), await t.text('.hb-hits'));
    await t.shot('search');
    await t.page.fill('.hb-read-tools input[type="search"]', 'zzqxv');
    await t.waitText('Nothing matches');
    t.eq('a word in no section: 0 sections, 0 marks', [await t.count('.hb-sec-card'), await t.count('.hb-hit')], [0, 0]);
    await t.page.fill('.hb-read-tools input[type="search"]', '');
    await t.waitFor('.hb-check');
    t.eq('clearing the search brings back 22 sections and 18 checks', [await t.count('.hb-sec-card'), await t.count('.hb-check')], [22, 18]);

    // A wrong answer: find one by trying, then check it does not pass.
    const q1 = t.page.locator('.hb-check').first().locator('.hb-q').first();
    let wrongSeen = false;
    for (let oi = 0; oi < 3 && !wrongSeen; oi += 1) {
      await t.press(q1.locator('.hb-opt').nth(oi));
      wrongSeen = (await q1.locator('.hb-feedback-no').count()) === 1;
    }
    t.check('a wrong answer is marked wrong', wrongSeen, wrongSeen ? 'Not quite shown' : 'every option read right');
    t.eq('and the check is not passed', await t.count('.hb-check[data-state="passed"]'), 0);

    t.as('student · sign locked');
    await t.press('.hb-tab:nth-child(4)');
    await t.waitFor('.hb-locked');
    t.eq('locked: 18 to go, no sign button', [await t.text('.hb-locked .hb-card-title'), await t.count('.hb-btn-primary')], ['18 checks to go', 0]);

    t.as('student · passing every check');
    await t.press('.hb-tab:nth-child(2)');
    await t.waitFor('.hb-check');
    await passAll(t);
    t.eq('all 18 passed, meter 18/18, ready to sign', [await t.count('.hb-check[data-state="passed"]'), await t.text('.hb-meter-n'), await t.text('.hb-meter .hb-pill')], [18, '18/18', 'Ready to sign']);
    await t.shot('passed');

    t.as('student · signing (0013 on)');
    await t.press('.hb-tab:nth-child(4)');
    await t.waitFor('.hb-sign-card');
    t.eq('8 student agreement lines and one sign button', [await t.count('.hb-agree li'), await t.count('.hb-btn-primary')], [8, 1]);
    t.check('sign is disabled until the box is ticked', await t.page.locator('.hb-btn-primary').isDisabled(), 'disabled');
    t.eq('no signer list for a student', await t.count('.hb-signers'), 0);
    await t.press('.hb-agree-box input');
    await t.press('.hb-btn-primary');
    await t.waitFor('.hb-signed');
    const mine = (await t.rows('handbook_acknowledgments')).filter((r) => r.member_id === P.student.id);
    t.eq('one row written', mine.map((r) => ({ v: r.version, role: r.signer_role, lessons: r.lessons_passed })), [{ v: '2026-10-20', role: 'student', lessons: 18 }]);
    await t.open('/handbook?tab=sign', { ready: '.hb-sign-card' });
    await t.waitFor('.hb-signed');
    t.check('still signed after a reload (read back from the table)', (await t.count('.hb-signed')) === 1, await t.text('.hb-signed'));
    await t.shot('signed');

    t.as('student · dashboard tile');
    await t.open('/dashboard', { ready: '[data-testid=mb-handbook-tile]' });
    t.eq('the dashboard tile reads 18/18 from this device', await t.text('[data-testid=mb-handbook-tile] .mb-tile-big'), '18/18');

    t.as('student · 0013 off');
    await t.open('/handbook?tab=sign', { persona: 'student', mig: 'none', reset: true, ready: '.hb-sign-card' });
    await t.waitText('not set up yet');
    t.eq('not set up: no sign button, no signed line', [await t.count('.hb-btn-primary'), await t.count('.hb-signed')], [0, 0]);

    t.as('mentor · signer list');
    await t.open('/handbook?tab=sign', { persona: 'mentor', mig: 'all', reset: true, ready: '.hb-sign-card' });
    await t.waitFor('.hb-signers');
    t.eq('a mentor signs without lessons: one statement, already signed by the seed', [await t.count('.hb-agree li'), await t.count('.hb-signed')], [1, 1]);
    await t.open('/dashboard', { ready: '.mb-status' });
    t.eq('no handbook tile on the staff dashboard (1 on the student one)', await t.count('[data-testid=mb-handbook-tile]'), 0);
    await t.open('/handbook?tab=sign', { ready: '.hb-signers' });
    t.check('the signer list shows the seeded signature (0 lists for the student above)', (await t.count('.hb-signer-list li')) === 1, await t.text('.hb-signer-list'));

    t.as('parent · parent lines');
    await t.open('/handbook?tab=sign', { persona: 'parent', mig: 'all', reset: true, ready: '.hb-sign-card' });
    t.eq('5 parent lines, a sign button, no signer list', [await t.count('.hb-agree li'), await t.count('.hb-btn-primary'), await t.count('.hb-signers')], [5, 1, 0]);

    t.as('student · glossary');
    await t.open('/handbook?tab=glossary', { persona: 'student', mig: 'all', ready: '.hb-terms' });
    t.eq('38 terms', await t.count('.hb-term-row'), 38);
    await t.page.fill('.hb-search input', 'probation');
    const hits = await t.count('.hb-term-row');
    t.check('search narrows the list', hits >= 1 && hits < 38, `${hits} rows`);
    await t.noHScroll();
  },
};
