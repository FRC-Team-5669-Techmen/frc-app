#!/usr/bin/env node
// Package the measured before/after runs as a reviewable PR description and
// an offline screenshot viewer. Refuses missing, duplicated or failing views.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { REPO, flag } from './lib.mjs'
import { LAYOUT_PAGES, LAYOUT_WIDTHS, layoutSlug } from './layout.mjs'

const args = process.argv.slice(2)
const beforeDirs = String(flag(args, 'before', '')).split(',').filter(Boolean)
const afterDir = String(flag(args, 'after', ''))
const out = path.resolve(REPO, String(flag(args, 'out', 'artifacts/desktop-layout-report')))
if (!beforeDirs.length || !afterDir) throw new Error('Pass --before <dir,dir> --after <dir>')
const load = dir => JSON.parse(readFileSync(path.resolve(REPO, dir, 'layout.json'), 'utf8')).map(r => ({ ...r, source: path.resolve(REPO, dir, r.png || '') }))
const before = beforeDirs.flatMap(load), after = load(afterDir)
const key = r => [r.persona, r.label, r.url, r.viewport, r.theme].join('|')
const index = rows => {
  const m = new Map()
  for (const r of rows) { if (m.has(key(r))) throw new Error(`Duplicate view: ${key(r)}`); m.set(key(r), r) }
  return m
}
const bi = index(before), ai = index(after)

// Notes describe the actual fixture surface, including empty/setup states.
const notes = {
  '/': ['Hero above feature cards.', 'Hero beside the feature overview; bounded navigation and footer.'],
  '/login': ['Both sign-in methods stacked in a small card.', 'School and guest methods share a two-column card.'],
  '/parent/:token': ['Questionnaire in one narrow column.', 'Independent questions share two columns; instructions keep a short line length.'],
  '/family/:token': ['Student records and forms stacked.', 'Record cards share two columns; handbook stays readable.'],
  '/rules': ['Quick-reference cards already use a grid.', 'Wider reference grid; reading paragraphs remain capped.'],
  '/e/:token': ['Part heading above the family questions.', 'Part heading beside the questions; tracker stays across the frame.'],
  '/join': ['Student picker above contact fields.', 'Student picker beside contact and consent fields.'],
  '/dashboard': ['Compact mission board with a full-width task list.', 'Wider mission grid and two-column task list.'],
  '/schedule': ['Calendar above the selected day.', 'Calendar beside selected-day details; event actions below the description.'],
  '/my-hours': ['Summary and history cards stacked.', 'Summary across a two-column evidence/history dashboard.'],
  '/log-hours': ['Entry form above saved entries.', 'Entry form beside saved history; totals span both columns.'],
  '/hours': ['Wide category/member table.', 'Table uses the shared frame; matrix scrolling stays inside its own box.'],
  '/jobs': ['Grouped job rows; selected job opened over the list.', 'Wide rows; selecting a job opens a work pane beside the list.'],
  '/members/:id': ['Identity above certification information.', 'Identity beside certification information.'],
  '/profile': ['Identity, form and integrations stacked.', 'Identity/editing beside appearance, calendar and notifications.'],
  '/survey': ['Questions in a narrow vertical form.', 'Questions share two columns; the submit row spans the form.'],
  '/display': ['Timeline stretches across the viewport.', 'Timeline and coverage use a bounded wide frame.'],
  '/certifications': ['Catalog and holder rows in one column.', 'Catalog and holder grids use the wider frame.'],
  '/handbook': ['Reference grid; reading view has an index.', 'Wider reference grid and reading/index layout; prose capped at 72ch.'],
  '/trips': ['Trip rows stacked above Create.', 'Trip cards share two columns above Create.'],
  '/batteries': ['Responsive fleet card grid.', 'Fleet grid uses the shared frame and gains room for cards.'],
  '/robot': ['Compact tool-card grid.', 'Tool cards use a three-column desktop grid.'],
  '/manage': ['Waiting and admin tool grids.', 'Four-column tool grids retain waiting tools first.'],
  '/roles/:eventId': ['Wide role-assignment table.', 'Bounded role table retains its local scroller and assignment controls.'],
  '/my-schedule': ['Compact station and day list.', 'Current work spans the frame; schedule entries share two columns.'],
  '/autos': ['Routine rows stacked.', 'Routine cards share two columns.'],
  '/meet': ['Competition links stacked.', 'Competition cards share three columns.'],
  '/meet/:eventId': ['Log form before progress and shared notes.', 'Log form beside progress and shared notes.'],
  '/drivers': ['Wide leaderboard with practice/rating columns.', 'Leaderboard and practice/rating columns use the shared frame.'],
  '/human-player': ['Wide leaderboard and training panels.', 'Leaderboard and training panels use the shared frame.'],
  '/match-sim': ['Setup above match history.', 'Setup beside match history; full-screen running clock retained.'],
  '/robot/matches': ['Match records stacked under filters.', 'Match records share two columns under the filters.'],
  '/robot/matches/:id': ['Metrics, phase bars and battery data already use grids.', 'Existing detail grids use the shared frame.'],
  '/updates': ['Release dates in one narrow timeline.', 'Release-date groups share two columns.'],
  '/standing': ['Standing and checklist cards in a compact grid.', 'Standing cards use the wider grid; explanations keep a short line length.'],
  '/scouting': ['Event chooser and preparation cards in a compact frame.', 'Chooser and preparation cards use the shared frame.'],
  '/scouting/:eventId': ['Wide event workspace with tabs and assignment panels.', 'Workspace is bounded; existing tab and panel grids retained.'],
  '/scouting/:eventId/board': ['Three work panes on wide screens; two on smaller laptops.', 'Same pane arrangement within the shared frame; phone tabs retained.'],
  '/rosters': ['Event links in a compact list.', 'Events share two columns with dates/status alongside titles.'],
  '/leaderboard': ['Ranked names and hours in one list.', 'Ranked entries share two columns with explicit rank numbers.'],
  '/status-reports': ['Subteam reports stacked.', 'Subteam report cards share two columns.'],
  '/driver-docs': ['Upload and document lists stacked.', 'Upload beside personal documents; staff records span the frame.'],
  '/emergency-info': ['Staff emergency sheet table.', 'Emergency sheet uses the shared frame; table scrolling stays local.'],
  '/no-photo': ['Short exception list and member picker.', 'Picker and exception list use the shared frame; short copy stays readable.'],
  '/rosters/:id': ['Roster controls and attendance list.', 'Roster controls and attendance list use the shared frame.'],
  '/trips/:id': ['Trip sections, day selectors and carpool cards.', 'Trip boards use the shared frame; local board layouts retained.'],
  '/verify-hours': ['Review queues in one narrow column.', 'Review cards share two columns; bulk controls span the queue.'],
  '/reports': ['Report tabs, filters and export table.', 'Filters and tables use the shared frame with local table scrolling.'],
  '/activity': ['Compact member/status/time table.', 'Activity table and manual controls use the shared frame.'],
  '/readiness': ['Action counts and coverage panels already use a grid.', 'Existing readiness grid uses the shared frame.'],
  '/signouts': ['Compact waiting, present and decision panels.', 'Waiting and present panels share the width; decisions span the frame.'],
  '/standing/team': ['Standing tabs, roster table and action panels.', 'Standing workspace and existing panel grids use the shared frame.'],
  '/squad': ['Position cards in a compact grid.', 'Position cards use the wider grid.'],
  '/access-requests': ['Invite, parent links and access requests stacked.', 'Invite spans the frame; parent links and access requests sit beside each other.'],
  '/applications': ['Application stats, filters and table.', 'Stats, filters and table use the shared frame; table scrolling stays local.'],
  '/surveys': ['Create/list above the selected survey.', 'Create/list beside the selected survey editor and results.'],
  '/trips/:id/manage': ['Trip readiness and management tabs.', 'Readiness and management workspace use the shared frame.'],
  '/roster': ['Capabilities grid, filters and member rows.', 'Capabilities and member rows use the wider frame.'],
  '/feedback': ['Report list; selection opens an overlay.', 'Report cards use a grid; selection opens a pane beside the list.'],
  '/announce': ['Composer and preview already share two columns.', 'Composer/preview layout retained within the shared frame.'],
  '/connector/*': ['Narrow connector setup instructions in this fixture.', 'Wider bounded frame and short instructions; populated sections have a two-column layout.'],
  '/checkin': ['Centered sign-out note and status.', 'Note beside status on desktop; lightweight phone flow retained.'],
  '/checkin-volunteer': ['Minimal switch-to-volunteer confirmation.', 'Status beside the confirmation action inside a bounded receipt.'],
}
const alias = { '/e': '/join', '/join/:eventId': '/join', '/skills': '/certifications', '/study': '/certifications', '/certify': '/certifications', '/coverage': '/certifications' }
const noteFor = p => p.action === 'application' ? ['Application introduction above a narrow step form.', 'Introduction/progress beside the current step.']
  : p.label === 'Access gate' ? ['Pending-access notice centered in a narrow column.', 'Identity beside the pending notice and sign-out control.']
  : p.persona === 'parent' && p.path === '/dashboard' ? ['Student cards, glance and link request stacked.', 'Student records beside glance and link request.']
  : p.label === 'Scouting practice' ? ['Practice missions already use responsive panels.', 'Practice panels use the bounded shared frame.']
  : notes[alias[p.path] || p.path]

mkdirSync(out, { recursive: true })
const pages = []
for (const p of LAYOUT_PAGES) {
  const notes = noteFor(p)
  if (!notes) throw new Error(`Missing visual note: ${p.path}`)
  const views = []
  for (const width of LAYOUT_WIDTHS) for (const theme of ['dark', 'light']) {
    const k = key({ ...p, viewport: width, theme })
    const b = bi.get(k), a = ai.get(k)
    if (!b || !a || !b.png || !a.png) throw new Error(`Missing before/after: ${k}`)
    if (Object.values(a.checks).some(v => !v)) throw new Error(`Failing after view: ${k}`)
    for (const [phase, r] of [['before', b], ['after', a]]) {
      const folder = path.join(out, 'screenshots', phase)
      mkdirSync(folder, { recursive: true })
      copyFileSync(r.source, path.join(folder, r.png))
    }
    views.push({ width, theme,
      before: { ...b, source: undefined, png: `screenshots/before/${b.png}` },
      after: { ...a, source: undefined, png: `screenshots/after/${a.png}` },
    })
  }
  pages.push({ ...p, slug: layoutSlug(p), notes, views })
}
const data = { base: '4b4516a2800f7d7ce53b6e9836f19c7290e196aa', pages }
writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(data, null, 2))
const triplet = (p, phase) => LAYOUT_WIDTHS.map(w => {
  const vs = p.views.filter(v => v.width === w).map(v => v[phase].width)
  return vs[0] === vs[1] ? String(vs[0]) : vs.join('/')
}).join(' · ')
const md = [
  '# Make every application page work on phones and computers', '',
  'Addresses codex-desktop-layout using main `4b4516a` as the base. Desktop pages use a shared 1280px frame, dashboard and queue grids, calendar/day and list/detail workspaces, and short prose lines. Phones retain their stacked layouts. Existing light/dark tokens and fonts are unchanged.', '',
  `The evidence covers all 69 non-development routes plus 14 role/reading/detail states: ${pages.length} states × 3 widths × 2 themes = ${pages.length * 6} before and ${pages.length * 6} after views. Every after view has 0 horizontal document overflow, no escaping content and a frame within the viewport and 1280px cap. Tables keep local scrollers. The development-only /_fixture controls and /_ds presentation specimen are outside this app-layout change.`, '',
  'The interactive index.html contains every original full-page screenshot, exact geometry and theme. Measurements below are content widths in px at **375 · 1152 · 1440**; a slash distinguishes dark/light where they differ. Each row describes its before and after screenshots.', '',
  '| Page / persona | Before widths | After widths | Before → after screenshot description |',
  '| --- | --- | --- | --- |',
  ...pages.map(p => `| ${p.path} — ${p.label} (${p.persona}) | ${triplet(p, 'before')} | ${triplet(p, 'after')} | ${p.notes[0]} → ${p.notes[1]} |`), '',
  'Verification uses the real React routes and Chromium with fictional in-memory fixtures. It does not establish real-device Safari/NFC, school OAuth/OTP, live database policies or deployed production behavior.', '',
].join('\n')
writeFileSync(path.join(out, 'PR_DESCRIPTION.md'), md)
const tokens = readFileSync(path.join(REPO, 'src/theme.css'), 'utf8').replace(/^@import.*$/gm, '')
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const options = pages.map((p, i) => `<option value="${i}">${escape(`${p.path} · ${p.label} · ${p.persona}`)}</option>`).join('')
writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="en" data-theme="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Techmen desktop layout evidence</title><style>${tokens}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-ui);line-height:1.5}main{max-width:1280px;margin:auto;padding:24px}h1{margin:0}p{max-width:72ch}a{color:var(--gold)}.controls{display:flex;flex-wrap:wrap;gap:16px;position:sticky;top:0;background:var(--bg);padding:16px 0;z-index:2}label{display:grid;gap:4px}select,button{font:inherit;padding:10px;background:var(--surface);color:var(--text);border:1px solid var(--border-strong);min-height:44px;max-width:100%}.page{flex:1;min-width:250px}.compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{min-width:0}figure{margin:0;max-height:72vh;overflow:auto;border:1px solid var(--border-strong)}img{display:block;width:100%;height:auto}.metrics{font-family:var(--font-mono);padding:12px;background:var(--surface)}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid var(--border-strong);padding:8px;text-align:left}.table{overflow:auto}details{margin-top:24px}summary{cursor:pointer;min-height:44px}button:focus-visible,select:focus-visible{outline:2px solid var(--gold)}@media(max-width:700px){.compare{grid-template-columns:1fr}main{padding:16px}}
</style><main><h1>Techmen · computer layout evidence</h1><p>69 application routes and 14 additional states. Full-page captures and measurements at 375, 1152 and 1440 px, in light and dark. Baseline: main 4b4516a.</p><p><a href="PR_DESCRIPTION.md">Pull request description and every page's widths</a> · <a href="measurements.json">Raw measurements</a></p><div class="controls"><label class="page">Page<select id="page">${options}</select></label><label>Width<select id="width"><option>375</option><option>1152</option><option selected>1440</option></select></label><label>Theme<select id="theme"><option>dark</option><option>light</option></select></label><button id="prev">Previous</button><button id="next">Next</button></div><h2 id="title"></h2><div class="compare"><article><h3>Before</h3><p id="before-note"></p><div class="metrics" id="before-metrics"></div><figure><a id="before-link" target="_blank"><img id="before-img" alt="Before full-page screenshot"></a></figure></article><article><h3>After</h3><p id="after-note"></p><div class="metrics" id="after-metrics"></div><figure><a id="after-link" target="_blank"><img id="after-img" alt="After full-page screenshot"></a></figure></article></div><details><summary>All page measurements</summary><div class="table"><table><thead><tr><th>Page</th><th>Before at 375 · 1152 · 1440</th><th>After at 375 · 1152 · 1440</th><th>After overflow</th></tr></thead><tbody>${pages.map(p => `<tr><td>${escape(p.label)} (${p.persona})</td><td>${triplet(p, 'before')}</td><td>${triplet(p, 'after')}</td><td>0 px</td></tr>`).join('')}</tbody></table></div></details><p>Fixture verification does not establish real-device Safari/NFC, school sign-in, live RLS or deployed production behavior.</p></main><script>const data=${JSON.stringify(data).replace(/</g, '\\u003c')};const el=id=>document.getElementById(id);function render(){const p=data.pages[+el('page').value];const v=p.views.find(v=>v.width===+el('width').value&&v.theme===el('theme').value);document.documentElement.dataset.theme=v.theme;el('title').textContent=p.label+' · '+p.persona;['before','after'].forEach((phase,i)=>{const r=v[phase];el(phase+'-note').textContent=p.notes[i];el(phase+'-metrics').textContent='content '+r.width+'px at '+r.left+'…'+r.right+' · overflow '+r.overflow+'px · '+r.chars+' text characters';el(phase+'-img').src=r.png;el(phase+'-link').href=r.png;});}['page','width','theme'].forEach(id=>el(id).addEventListener('change',render));['prev','next'].forEach((id,i)=>el(id).onclick=()=>{el('page').selectedIndex=(el('page').selectedIndex+(i?1:-1)+data.pages.length)%data.pages.length;render()});render();</script></html>`)
console.log(`layout report: ${pages.length} states, ${pages.length * 12} screenshots; every before/after pair present`)
