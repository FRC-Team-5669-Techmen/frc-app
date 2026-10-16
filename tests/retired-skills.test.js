// Decision 27 (answered 2026-10-14): the app's old skills certification
// system and the Study page are retired from the UI. Their tables keep every
// row and are left in place, unread. This file holds the retirement in place:
// the four old addresses redirect to /certifications, no link anywhere in src/
// points at them, and nothing outside the Jobs page's pre-0012 fallback reads
// the old tables. Every absence below is measured against a presence found by
// the same scanner, so a scanner that stopped matching cannot pass.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = path.join(ROOT, 'src')
const RETIRED = ['/skills', '/certify', '/coverage', '/study']
const DELETED = ['SkillsCatalog', 'MemberSkillsHome', 'CertifyPage', 'CoverageMatrix', 'MemberSkillsPanel', 'DisciplinesCatalog', 'StudyPage']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) {
      // Fixture mode and the design system are not the app's UI.
      if (p.includes(`${path.sep}dev${path.sep}`) || p.endsWith(`${path.sep}dev`) || p.includes(`${path.sep}lib${path.sep}`)) continue
      walk(p, out)
    } else if (/\.(jsx?|mjs)$/.test(name)) out.push(p)
  }
  return out
}
const FILES = walk(SRC).map(p => ({ rel: path.relative(ROOT, p), src: readFileSync(p, 'utf8') }))
const APP = readFileSync(path.join(SRC, 'App.jsx'), 'utf8')

describe('the retired addresses', () => {
  it('each redirects to /certifications', () => {
    for (const p of RETIRED) {
      expect(APP).toMatch(new RegExp(`<Route path="${p}"\\s+element=\\{<Navigate to="/certifications" replace />\\} />`))
    }
    // Positive control: the same pattern does not match a live route.
    expect(APP).not.toMatch(/<Route path="\/jobs"\s+element=\{<Navigate to="\/certifications"/)
  })
  it('the retired page modules are gone and nothing imports them', () => {
    for (const m of DELETED) {
      expect(existsSync(path.join(SRC, `${m}.jsx`))).toBe(false)
      expect(FILES.filter(f => new RegExp(`from '\\./${m}'|import\\('\\./${m}'\\)`).test(f.src)).map(f => f.rel)).toEqual([])
    }
    // Positive control: the import scanner finds a module that is imported.
    expect(FILES.some(f => /import\('\.\/CertificationsPage'\)/.test(f.src))).toBe(true)
  })
})

describe('no link points at a retired address', () => {
  const linkTo = (p) => new RegExp(`(?:to|href)=["'{\`]+${p.replace('/', '\\/')}["'\`}]`)
  it('none in src/', () => {
    for (const p of RETIRED) {
      expect(FILES.filter(f => linkTo(p).test(f.src)).map(f => f.rel)).toEqual([])
    }
  })
  it('positive control: the same matcher finds the links to /certifications', () => {
    const hits = FILES.filter(f => linkTo('/certifications').test(f.src)).map(f => f.rel).sort()
    expect(hits).toEqual(expect.arrayContaining(['src/HomePage.jsx', 'src/NavBar.jsx', 'src/ParentHomePage.jsx']))
  })
})

describe('the old tables are read only by the Jobs page fallback', () => {
  const OLD = ['member_skills', 'cert_requests', 'skills', 'study_sessions', 'disciplines']
  const readsTable = (t) => new RegExp(`\\.from\\('${t}'\\)`)
  const OLD_RPCS = ['request_cert', 'approve_cert_request', 'deny_cert_request', 'study_summary']
  it('nothing but JobsPage reads member_skills or skills; nothing reads cert_requests or study_sessions', () => {
    const where = Object.fromEntries(OLD.map(t => [t, FILES.filter(f => readsTable(t).test(f.src)).map(f => f.rel).sort()]))
    expect(where.member_skills).toEqual(['src/JobsPage.jsx'])
    expect(where.skills).toEqual(['src/JobsPage.jsx'])
    expect(where.cert_requests).toEqual([])
    expect(where.study_sessions).toEqual([])
  })
  it('nothing calls the old certification or study RPCs', () => {
    for (const r of OLD_RPCS) {
      expect(FILES.filter(f => f.src.includes(`rpc('${r}'`)).map(f => f.rel)).toEqual([])
    }
    // Positive control: the same check sees an RPC that is called.
    expect(FILES.some(f => f.src.includes("rpc('admin_set_task_cert'"))).toBe(true)
  })
  it('the Jobs page reads the old tables only on its pre-0012 path', () => {
    const jobs = FILES.find(f => f.rel === 'src/JobsPage.jsx').src
    const oldBranch = jobs.slice(jobs.indexOf("// 0012 not applied yet: the old member_skills gate"), jobs.indexOf('setCertMode(mode)'))
    expect(oldBranch).toMatch(/\.from\('member_skills'\)/)
    const outside = jobs.replace(oldBranch, '')
    expect(outside).not.toMatch(/\.from\('member_skills'\)/)
    expect(outside).not.toMatch(/\.from\('skills'\)/)
  })
})
