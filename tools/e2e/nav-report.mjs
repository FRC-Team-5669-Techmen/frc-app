#!/usr/bin/env node
// Package every measured role/theme/width, refusing missing or failing views.
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { flag } from './lib.mjs'
import { pageCommands, PRIVATE_LINKS } from '../../src/navigation.js'
import { toolsFor } from '../../src/adminTools.js'
const args = process.argv.slice(2)
const beforeDir = path.resolve(String(flag(args, 'before', 'work/frc-nav/before')))
const afterDir = path.resolve(String(flag(args, 'after', 'work/frc-nav/after')))
const out = path.resolve(String(flag(args, 'out', 'artifacts/nav-report')))
const before = JSON.parse(readFileSync(path.join(beforeDir, 'nav.json'))).results
const captured = JSON.parse(readFileSync(path.join(afterDir, 'nav.json')))
const after = captured.results
const key = r => `${r.role}/${r.width}/${r.theme}`
if (before.length !== 54 || after.length !== 54 || new Set(after.map(key)).size !== 54 || after.some(r => !r.ok)) throw Error('Expected all 54 passing, unique configurations')
for (const r of after) {
  const allowed = new Set(r.inventory.palette)
  const links = [...r.inventory.hours.map(h => h.path), ...r.inventory.robot, ...r.inventory.manage]
  if (links.some(p => !allowed.has(p))) throw Error(`Unsearchable navigation link in ${key(r)}`)
  const staff = ['mentor', 'admin', 'staff-lead', 'parent-staff'].includes(r.role)
  const expectedTools = staff ? toolsFor({ isAdmin: r.role === 'admin' }).map(t => t.path) : []
  if (r.inventory.manage.length !== expectedTools.length || expectedTools.some(p => !r.inventory.manage.includes(p))) throw Error(`Unexpected staff tool access in ${key(r)}`)
}
const paired = after.map(a => { const b = before.find(b => key(b) === key(a)); if (!b) throw Error(`Missing before ${key(a)}`); return { ...a, before: { entries: b.entries, visibleControls: b.visibleControls, top: b.top, states: b.states } } })
const viewers = { member: {}, 'scout-lead': {}, driver: {}, mentor: { isStaff: true }, admin: { isStaff: true, isAdmin: true }, parent: { isParent: true }, 'staff-lead': { isStaff: true }, approver: { canApproveSignouts: true }, 'parent-staff': { isParent: true, isStaff: true } }
const inventories = Object.fromEntries(Object.entries(viewers).map(([role, viewer]) => [role, pageCommands({ ...viewer, memberId: 'invented-member' }).map(({ path, to, title, hint }) => ({ path, to, title, hint }))]))
const sourceFiles = ['src/NavBar.jsx', 'src/NavBar.css', 'src/CommandPalette.jsx', 'src/CommandPalette.css', 'src/navigation.js', 'src/featureGuide.js', 'src/App.jsx']
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]))
if (JSON.stringify(sourceHashes) !== JSON.stringify(captured.sourceHashes)) throw Error('Capture does not match current application source')
const evidence = { sourceHashes, baseline: '5aede08', widths: [375, 1152, 1440], themes: ['dark', 'light'], privateLinkReasons: PRIVATE_LINKS, inventories, paired }
mkdirSync(out, { recursive: true })
cpSync(beforeDir, path.join(out, 'before'), { recursive: true })
cpSync(afterDir, path.join(out, 'after'), { recursive: true })
writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(evidence, null, 2))
const table = ['| Role | Primary before → after | Account links/actions before | Collapsed account controls before → after | Palette route entries |', '| --- | --- | --- | --- | --- |', ...Object.keys(viewers).map(role => { const a = paired.find(r => r.role === role); return `| ${role} | ${a.before.top.length} → ${a.top.length} | ${a.before.entries} | ${a.before.visibleControls} → ${a.visibleControls} | ${inventories[role].length} |` })].join('\n')
writeFileSync(path.join(out, 'report.md'), `# Techmen navigation audit\n\n${table}\n\nBefore link/action counts exclude the three theme radios. After counts include every collapsed branch, including the My record and Preferences disclosures. Ordinary roles now have five top-level branches; staff and the student approver have six. The earlier primary navigation and Robot/Team admin hubs were already built. The concurrently landed guided-training job adds Training / Replay tour in Preferences, one searchable page per role and Training progress in the staff hub; these final captures include that work. The historical 15 to 20 profile buttons are not present at baseline 5aede08.\n\nAll 54 configurations passed menu/palette viewport bounds, document overflow and console checks. The gallery includes 54 before account views and ${paired.reduce((n,r) => n+r.states.length,0)} after account, expanded-group, Hours and palette views. Both themes at 375, 1152 and 1440.\n\nParameter pages use the current matching event/trip/match or an explicitly labeled chooser. The member result opens the viewer's own member page; other members are reached through Team Hours. Three private emailed token routes stay private. Search reads no team tables and grants no permission.\n\nThese are fictional fixture accounts in Chromium. Real devices, Safari, hardware NFC, production sign-in and live database policies are not established by this evidence. No new decision is needed from Mr. Pina.\n`)
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Techmen navigation audit</title><style>body{font:16px/1.5 system-ui;margin:24px;color:#20242a;background:#f3f4f6}h1{font-size:24px}label{display:inline-block;margin:0 16px 16px 0}select{font:inherit;padding:8px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}figure{margin:0;overflow:auto;background:white;border:1px solid #9aa1ab;padding:12px}img{max-width:100%;height:auto;display:block}figcaption{font-weight:bold;margin-bottom:12px}pre{white-space:pre-wrap}a{color:#214b83}@media(max-width:700px){main{grid-template-columns:1fr}}</style><h1>Techmen navigation: before and after</h1><p>54 configurations, both themes, three widths. All people shown are fictional. <a href="report.md">Audit and counts</a> · <a href="measurements.json">Raw measurements</a></p><label>Role <select id="role"></select></label><label>Width <select id="width"><option>375</option><option>1152</option><option>1440</option></select></label><label>Theme <select id="theme"><option>dark</option><option>light</option></select></label><label>After state <select id="state"><option>account</option><option>groups</option><option>palette</option><option>hours</option></select></label><pre id="counts"></pre><main><figure><figcaption>Before: account menu</figcaption><img id="before" alt="Before navigation"></figure><figure><figcaption>After</figcaption><img id="after" alt="After navigation"></figure></main><script>const data=${JSON.stringify(paired).replaceAll('<', '\\u003c')}; const roles=[...new Set(data.map(r=>r.role))]; const el=id=>document.getElementById(id); roles.forEach(r=>{const o=document.createElement('option');o.textContent=r;el('role').append(o)});function render(){const role=el('role').value,width=el('width').value,theme=el('theme').value,state=el('state').value;el('before').src='before/'+role+'-'+width+'-'+theme+'-account.png';const chosen=state==='hours'&&role==='parent'?'account':state;el('after').src='after/'+role+'-'+width+'-'+theme+'-'+chosen+'.png';const r=data.find(r=>r.role===role&&r.width===Number(width)&&r.theme===theme);el('counts').textContent='Primary entries: '+r.before.top.length+' → '+r.top.length+' | Visible collapsed account controls: '+r.before.visibleControls+' → '+r.visibleControls+' | Horizontal overflow: '+Math.max(...r.states.map(s=>s.overflow))+'px';}document.querySelectorAll('select').forEach(e=>e.onchange=render);render();</script></html>`
writeFileSync(path.join(out, 'index.html'), html)
console.log(table)
console.log(`Packaged ${paired.length} configurations, ${paired.reduce((n,r) => n+r.states.length,0)} after states at ${out}`)
