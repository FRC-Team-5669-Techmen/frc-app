#!/usr/bin/env node
// ONE-SHOT: the 2026-09-02 split of CLAUDE.md's "Last reviewed" paragraph into
// `docs/history/record-NN-<slug>.md`, one file per bundle.
//
// It reads the frozen paragraph at `_source/claude-md-log-2026-09-02.txt` and
// cuts it at every " Earlier" that opens a bundle (the paragraph chained
// bundles newest-first with "Earlier the same day", "Earlier -- <date>",
// "Earlier (<date>)" and "Earlier same day"). The cuts are BYTE OFFSETS, so a
// body is a raw slice and the concatenation of all bodies in `record_order` is
// the paragraph again, which `verify-split.mjs` proves.
//
// Dates come from the commit each bundle describes (git log, unshallowed),
// not from the paragraph's "same day" chain, which was written relative to a
// header date and disagrees with the commit date in three places. Branches
// are recorded only where the merge commit named one. Migrations are every
// `supabase/<name>.sql` or `sql/<name>.sql` the body mentions.
//
// Not idempotent by design: it refuses to run if any record- file exists.
//
// Run: node docs/history/_tools/split-source.mjs

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_DIR } from './front-matter.mjs';

const SOURCE = join(HISTORY_DIR, '_source', 'claude-md-log-2026-09-02.txt');

// Newest first, as the paragraph reads. `at` is the byte offset of the cut
// (the first entry starts at 0). Verified against the text before cutting:
// every offset below is the index of a " Earlier" that opens a bundle.
const TABLE = [
  { at: 0,      date: '2026-08-30', slug: 'survey-management-surface',       commits: ['e07375f'], branches: ['claude/survey-management-surface-gaku2o'], subsystems: ['Surveys', 'CI'],
    title: 'Survey management surface at /surveys, and the repo\'s first GitHub Actions workflow' },
  { at: 5186,   date: '2026-08-30', slug: 'weekly-survey',                   commits: ['900baf6'], branches: ['claude/weekly-survey-feature-ior6p1'], subsystems: ['Surveys'],
    title: 'Weekly survey: member form at /survey, mentor authoring and results at /surveys' },
  { at: 9435,   date: '2026-08-30', slug: 'feedback-widget-inbox',           commits: ['9f43650'], branches: [], subsystems: ['Feedback'],
    title: 'In-app feedback widget and admin inbox at /feedback, plus public.is_admin()' },
  { at: 13908,  date: '2026-08-30', slug: 'anomalies-inline-bulk-resolve',   commits: ['af612d3'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Attendance anomalies resolvable inline and in bulk on /verify-hours; src/hoursResolve.js' },
  { at: 16881,  date: '2026-08-30', slug: 'anomaly-stepper-void',            commits: ['77034af'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Anomaly resolve block: half-hour stepper and one-click void' },
  { at: 19669,  date: '2026-08-30', slug: 'anomalies-resolve-button',        commits: ['33a5f9a'], branches: ['claude/anomaly-resolve-workflow-zq8e30'], subsystems: ['Hours and attendance'],
    title: 'Capped and double-in anomalies gain a Resolve button into MemberHoursAdmin' },
  { at: 22231,  date: '2026-08-29', slug: 'config-toml-verify-jwt',          commits: ['2d92be5'], branches: [], subsystems: ['Supabase functions'],
    title: 'supabase/config.toml pins verify_jwt = false for the cron and capability-URL functions' },
  { at: 22789,  date: '2026-08-29', slug: 'discord-calendar-failure-isolation', commits: ['2f9c4c8'], branches: [], subsystems: ['Discord'],
    title: 'Discord calendar sync: non-fatal cancellation sweep, bounded auth retry, reminder_missed' },
  { at: 24960,  date: '2026-08-26', slug: 'reminder-24h-retired',            commits: ['644b809'], branches: [], subsystems: ['Discord'],
    title: 'reminder_24h retired from the Discord calendar sync; the subteam divergence recorded as intentional' },
  { at: 25467,  date: '2026-08-26', slug: 'week-ahead-discord-post',         commits: ['46cbedc', '0030564'], branches: [], subsystems: ['Discord'],
    title: 'Week-ahead Discord schedule post (Vercel cron)' },
  { at: 27333,  date: '2026-08-24', slug: 'decksteps',                       commits: ['22f337a'], branches: [], subsystems: ['Design system'],
    title: 'DeckSteps: stepped reveal as a second behaviour component' },
  { at: 30738,  date: '2026-08-24', slug: 'host-transparency',               commits: ['1e51879', '381af50'], branches: [], subsystems: ['Design system'],
    title: 'Host transparency: the design system stops assuming direct children' },
  { at: 34519,  date: '2026-08-24', slug: 'sheet-distribution-axis',         commits: ['c16a373'], branches: [], subsystems: ['Design system'],
    title: 'Sheet content distribution axis landed and measured' },
  { at: 37909,  date: '2026-08-24', slug: 'deckfooter-mark-season-artwork',  commits: ['27306ae'], branches: [], subsystems: ['Design system'],
    title: 'DeckFooter mark option, the 56px rail mark, the 2027 season artwork, three gaps scoped' },
  { at: 40921,  date: '2026-08-23', slug: 'logotypes-seal-rolecard',         commits: ['ce82863'], branches: [], subsystems: ['Design system'],
    title: 'Team logotypes wired, the seal refused as near-gold, RoleCard density and media slot' },
  { at: 46375,  date: '2026-08-23', slug: 'subteams-strategy-management',    commits: ['458c9ab'], branches: [], subsystems: ['Subteams'],
    title: 'Subteam vocabulary grows by two: Strategy and Scouting, Management' },
  { at: 48534,  date: '2026-08-23', slug: 'ds-audit-checks-16-27',           commits: ['7cca550', '665673c'], branches: [], subsystems: ['Design system'],
    title: 'ds:audit grows the source-side counterparts of the pre-delivery checks (16-27) and ds:audit:controls' },
  { at: 49910,  date: '2026-08-23', slug: 'governing-docs-deckstage-resync', commits: ['c62eda1', '646d654'], branches: [], subsystems: ['Design system'],
    title: 'Governing docs committed, DeckStage reconciled against them, resynced to 16, check 43 measured' },
  { at: 54078,  date: '2026-08-23', slug: 'deckstage-built',                 commits: ['b6034e6'], branches: [], subsystems: ['Design system'],
    title: 'DeckStage built; the deck shell demoted to reference' },
  { at: 58291,  date: '2026-08-23', slug: 'failsafe-ground-templates',       commits: ['cc9498e'], branches: [], subsystems: ['Design system'],
    title: 'Fail-safe default ground, and templates/ confirmed unshippable' },
  { at: 62190,  date: '2026-08-23', slug: 'ds-synced-core-brand',            commits: ['cf75106'], branches: [], subsystems: ['Design system'],
    title: 'Design system synced to Claude Design: the Core and Brand 15, verified on a real deck' },
  { at: 65892,  date: '2026-08-22', slug: 'app-gold-corrected',              commits: ['f9279ab', '7d8f35f', '3170623'], branches: [], subsystems: ['Theme'],
    title: 'App gold corrected to the published Techmen Gold; area reduced, not saturation' },
  { at: 68793,  date: '2026-08-22', slug: 'team-mark-asset-swap',            commits: ['6707455'], branches: [], subsystems: ['Design system', 'Theme'],
    title: 'Team mark asset swap: canonical Mark-{Gold,White,Black}.svg, provenance pinned' },
  { at: 70660,  date: '2026-08-22', slug: 'ds-cleanup-pass',                 commits: ['fa3d409'], branches: [], subsystems: ['Design system'],
    title: 'Design system cleanup pass against spec v1.2: guards, harness, marks, capture' },
  { at: 73338,  date: '2026-08-22', slug: 'ds-pass-3-sheets',                commits: ['685c70c'], branches: [], subsystems: ['Design system'],
    title: 'Design system pass 3: the twenty-six sheet patterns, the specimen, SKILL.md' },
  { at: 76668,  date: '2026-08-22', slug: 'ds-pass-2-data-surfaces-forms',   commits: ['c1ad90d'], branches: [], subsystems: ['Design system'],
    title: 'Design system pass 2: data, surfaces and forms component groups' },
  { at: 80172,  date: '2026-08-22', slug: 'design-system-new',               commits: ['9d0f75a'], branches: [], subsystems: ['Design system'],
    title: 'New design system at src/lib/design-system, built fresh from spec, with the dev-only /_ds specimen' },
  { at: 82815,  date: '2026-08-20', slug: 'training-event-kind',             commits: ['ac2d498'], branches: [], subsystems: ['Schedule', 'Discord'],
    title: 'Added training as an events.kind' },
  { at: 84413,  date: '2026-08-20', slug: 'discord-calendar-ported-edge',    commits: ['a7dda5e'], branches: [], subsystems: ['Discord'],
    title: 'Discord calendar posting ported off Vercel to a Supabase Edge Function plus pg_cron' },
  { at: 86989,  date: '2026-08-20', slug: 'discord-calendar-vercel-build',   commits: ['b734a61'], branches: [], subsystems: ['Discord'],
    title: 'Discord calendar posting: the original Vercel cron build, report-only by default' },
  { at: 89325,  date: '2026-08-18', slug: 'application-schedule-discord-fll', commits: ['1230fa1'], branches: [], subsystems: ['Member application'],
    title: 'Member application: year-round schedule, Discord invite, FLL interest field' },
  { at: 91197,  date: '2026-08-18', slug: 'discord-provisioning-ambiguities', commits: ['588a723'], branches: [], subsystems: ['Discord'],
    title: 'Discord provisioning: all ten spec ambiguities resolved in SERVER_SPEC.md' },
  { at: 93660,  date: '2026-08-18', slug: 'discord-server-provisioning',     commits: ['2066524'], branches: [], subsystems: ['Discord'],
    title: 'Discord server provisioning: spec-driven, idempotent, dry-run by default' },
  { at: 94902,  date: '2026-08-18', slug: 'drop-build-ack-check',            commits: ['67ea6ae'], branches: [], subsystems: ['Member application'],
    title: 'Fix member_applications_build_ack_chk breaking every application submission' },
  { at: 96344,  date: '2026-08-17', slug: 'parent-response-flow',            commits: ['5c2c3a2', 'a2310a9'], branches: [], subsystems: ['Member application'],
    title: 'Parent response flow: capability-token questionnaire that gates nothing' },
  { at: 98024,  date: '2026-08-17', slug: 'subteams-tasks-constraint',       commits: ['bf2deff', '39ffc1e'], branches: [], subsystems: ['Subteams', 'Jobs'],
    title: 'Subteam vocabulary: remaining non-canonical paths closed, tasks.subteam constrained' },
  { at: 99012,  date: '2026-08-17', slug: 'subteams-consolidation',          commits: ['ee0c822'], branches: [], subsystems: ['Subteams'],
    title: 'Subteam vocabulary consolidated into src/subteams.js' },
  { at: 100402, date: '2026-08-17', slug: 'member-application',              commits: ['ee72469', 'daddea7', 'c457fe6', '947062a'], branches: [], subsystems: ['Member application'],
    title: 'Member application: per-season authenticated onboarding form and staff view' },
  { at: 101470, date: '2026-06-25', slug: 'admin-hours-management',          commits: ['69a8d61', '0723025'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Admin hours management: per-member edit, add, delete and hour adjustments' },
  { at: 102410, date: '2026-06-25', slug: 'three-hours-additions',           commits: ['418fe16'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Three hours additions: category picker order, 10h session cap, logged-hours corrections' },
  { at: 103146, date: '2026-06-24', slug: 'navigation-restructure',          commits: ['c5ce606'], branches: [], subsystems: ['Navigation'],
    title: 'Navigation restructure: hours and skills tools co-located, staff menu regrouped, kiosk removed' },
  { at: 103931, date: '2026-06-24', slug: 'hour-categories-reduced',         commits: ['699288d'], branches: [], subsystems: ['Hours and attendance', 'Schedule'],
    title: 'Hour categories reduced from six to four; volunteering event kind added' },
  { at: 104680, date: '2026-06-24', slug: 'reporting-export-tooling',        commits: ['2e46968'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Reporting and export tooling at /reports' },
  { at: 105381, date: '2026-06-24', slug: 'accountability-tooling',          commits: ['cf36990'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Accountability and eligibility tooling: goals, anomalies, days present' },
  { at: 105999, date: '2026-06-24', slug: 'session-integrity-tooling',       commits: ['3c30eca', '8af9f45'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Session-integrity tooling: cap, audit trail, manual entry, corrections' },
  { at: 106657, date: '2026-06-24', slug: 'hour-category-system',            commits: ['24e0eb7', '0fab62a'], branches: [], subsystems: ['Hours and attendance'],
    title: 'Hour category system across check-in and the hours boards' },
  { at: 107648, date: '2026-06-23', slug: 'jobs-open-create',                commits: ['c7ab456'], branches: [], subsystems: ['Jobs', 'Schedule', 'Hours and attendance'],
    title: 'Jobs creation opened to all members; schedule tabs reordered; Team Hours drill-down' },
  { at: 108021, date: '2026-06-19', slug: 'hoursboard-matrix-view',          commits: ['73dcb43', 'e93b5ae', '83792cb'], branches: [], subsystems: ['Hours and attendance', 'Jobs'],
    title: 'HoursBoard Matrix view, shared display-name resolver, Jobs For-you sort and due dates' },
  { at: 108462, date: '2026-06-18', slug: 'calendar-phase-1-2',              commits: ['06d3acd', 'de7a038'], branches: [], subsystems: ['Schedule'],
    title: 'Calendar Phase 1 views and filters; Phase 2 iCalendar subscription feed' },
  { at: 108868, date: '2026-06-18', slug: 'admin-roster-and-jobs-redesign',  commits: ['53239a3', '64509f9', '792ddfb', '5847824'], branches: [], subsystems: ['Roster and access', 'Jobs'],
    title: 'Admin roster reliability, parent link requests, Jobs page redesign and content' },
];

const existing = readdirSync(HISTORY_DIR).filter((f) => f.startsWith('record-'));
if (existing.length) {
  throw new Error(`refusing to run twice: ${existing.length} record- file(s) already exist in ${HISTORY_DIR}`);
}
if (!existsSync(SOURCE)) throw new Error(`frozen source missing: ${SOURCE}`);

const raw = readFileSync(SOURCE, 'utf8');

// The frozen file is CLAUDE.md line 128 verbatim, so it opens with the label
// `Last reviewed: `. That label is not part of any bundle -- it belonged to the
// line, not to the record -- so it is cut off here and `verify-split.mjs`
// re-adds it when it reassembles. Every entry body therefore starts at real
// content.
const PREFIX = 'Last reviewed: ';
if (!raw.startsWith(PREFIX)) throw new Error(`frozen source does not open with ${JSON.stringify(PREFIX)}`);
const text = raw.slice(PREFIX.length);

// Every cut must land exactly on a " Earlier" that opens a bundle.
for (const row of TABLE.slice(1)) {
  if (!text.startsWith(' Earlier', row.at)) {
    throw new Error(`offset ${row.at} (${row.slug}) does not start a bundle: ${JSON.stringify(text.slice(row.at, row.at + 40))}`);
  }
}

const quote = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const list = (xs) => `[${xs.map(quote).join(', ')}]`;

// Chronological file numbers: 01 = the oldest bundle (the last in the
// paragraph), so `ls docs/history` reads oldest to newest. record_order is
// the paragraph position (1 = newest) and is what verify-split reassembles on.
const total = TABLE.length;
let written = 0;
TABLE.forEach((row, i) => {
  const end = i + 1 < total ? TABLE[i + 1].at : text.length;
  const body = text.slice(row.at, end);
  const migrations = [...new Set((body.match(/\b(?:supabase|sql)\/[a-z0-9_]+\.sql/g) ?? []).map((m) => m.replace(/^supabase\//, '')))];
  const number = String(total - i).padStart(2, '0');
  const file = `record-${number}-${row.slug}.md`;
  const fm = [
    '---',
    `title: ${quote(row.title)}`,
    `date: ${row.date}`,
    `branches: ${list(row.branches)}`,
    `commits: ${list(row.commits)}`,
    `migrations: ${list(migrations)}`,
    `subsystems: ${list(row.subsystems)}`,
    `record_order: ${i + 1}`,
    '---',
    '',
    '',
  ].join('\n');
  writeFileSync(join(HISTORY_DIR, file), fm + body);
  written += 1;
});

console.log(`wrote ${written} record- entries from ${text.length} characters of source`);
