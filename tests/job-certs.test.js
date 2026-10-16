// src/jobCerts.js: what the Jobs page shows about a job's IDEA certification
// requirement (migration 0012, decision 27). The database decides who may
// claim (claim_task, proven by 0012_jobs_idea_cert_gate_rls_test.sql); this
// file holds the page to the same rule, and holds the page's column lists and
// RPC argument names to the migration so a typo cannot silently drop the page
// back onto the old path.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  JOB_CERT_REQ_SELECT, JOB_CERT_CATALOG_SELECT, JOB_CERT_HOLDER_SELECT, IDEA_CERTS_URL,
  ideaVerifyUrl, jobCertMode, requirementMap, requiredCode, heldCodes, canClaimIdea,
  describeRequirement, pickerOptions,
} from '../src/jobCerts.js'
import fixture from '../src/dev/fixture/features/jobcerts.js'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const SQL = read('../supabase/migrations/0012_jobs_idea_cert_gate.sql')
const SQL0001 = read('../supabase/migrations/0001_idea_certifications_mirror.sql')
const JOBS = read('../src/JobsPage.jsx')
const code = (s) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')

function tableColumns(sql, table) {
  const m = code(sql).match(new RegExp(`create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`))
  if (!m) return null
  return m[1].split('\n').map(l => l.trim().match(/^([a-z_]+)\s/)?.[1]).filter(Boolean)
}
const cols = (sel) => sel.split(',').map(s => s.trim())

const NOW = Date.parse('2026-10-16T20:00:00Z')
const DAY = 86400000
const iso = (ms) => new Date(ms).toISOString()
const ME = 'sam@boscotech.edu'

describe('the page reads only columns 0012 and 0001 create', () => {
  it('finds the tables it parses (positive control for the parser)', () => {
    expect(tableColumns(SQL, 'task_idea_cert_requirements')).toEqual(['task_id', 'code', 'source', 'set_by', 'set_at'])
    expect(tableColumns(SQL0001, 'idea_cert_holders')).toContain('serial')
    expect(tableColumns(SQL, 'no_such_table')).toBeNull()
  })
  it('every selected column exists', () => {
    const req = tableColumns(SQL, 'task_idea_cert_requirements')
    const cat = tableColumns(SQL0001, 'idea_cert_catalog')
    const hold = tableColumns(SQL0001, 'idea_cert_holders')
    expect(cols(JOB_CERT_REQ_SELECT).filter(c => !req.includes(c))).toEqual([])
    expect(cols(JOB_CERT_CATALOG_SELECT).filter(c => !cat.includes(c))).toEqual([])
    expect(cols(JOB_CERT_HOLDER_SELECT).filter(c => !hold.includes(c))).toEqual([])
    // Negative control: a misspelt column is caught.
    expect(['cdoe'].filter(c => !req.includes(c))).toEqual(['cdoe'])
  })
  it('the admin RPC is called with the argument names 0012 declares', () => {
    expect(code(SQL)).toMatch(/function public\.admin_set_task_cert\(p_task uuid, p_code text\)/)
    expect(JOBS).toMatch(/rpc\('admin_set_task_cert', \{ p_task: taskId, p_code: /)
    expect(JOBS).toMatch(/runRpc\('claim_task',\s+\{ p_task: id \}/)
  })
  it('the requirement table has no foreign key to the catalog (the sync replaces it wholesale)', () => {
    const body = code(SQL).match(/create table if not exists public\.task_idea_cert_requirements\s*\(([\s\S]*?)\n\);/)[1]
    expect(body).not.toMatch(/idea_cert_catalog/)
    expect(body).toMatch(/references public\.tasks\(id\) on delete cascade/)
  })
})

describe('jobCertMode', () => {
  it('falls back to the old path ONLY when the table is missing', () => {
    expect(jobCertMode({ code: 'PGRST205' })).toBe('old')
    expect(jobCertMode({ code: '42P01' })).toBe('old')
    expect(jobCertMode(null)).toBe('idea')
    // A real failure must not put the retired gate back on screen.
    expect(jobCertMode({ code: '42501', message: 'permission denied' })).toBe('idea')
    expect(jobCertMode({ code: 'PGRST301' })).toBe('idea')
  })
})

describe('requirementMap / requiredCode', () => {
  const m = requirementMap([
    { task_id: 't1', code: 'MECH-1', source: 'admin' },
    { task_id: 't2', code: null, source: 'unmapped' },
    null,
  ])
  it('a job with a code requires it; an unmapped row and a missing row require nothing', () => {
    expect(requiredCode(m, 't1')).toBe('MECH-1')
    expect(requiredCode(m, 't2')).toBeNull()
    expect(requiredCode(m, 'tX')).toBeNull()
    expect(m.get('t2')).toEqual({ code: null, source: 'unmapped' })
    expect(m.size).toBe(2)
  })
})

describe('heldCodes: the same rule as the claim path', () => {
  const rows = [
    { email: ME, code: 'A', status: 'active', expires_at: null },
    { email: ME, code: 'B', status: 'active', expires_at: iso(NOW + 30 * DAY) },
    { email: ME, code: 'C', status: 'active', expires_at: iso(NOW - DAY) },      // lapsed
    { email: ME, code: 'D', status: 'suspended', expires_at: null },
    { email: ME, code: 'E', status: 'revoked', expires_at: null },
    { email: ME, code: 'F', status: 'expired', expires_at: null },
    { email: 'someone.else@boscotech.edu', code: 'G', status: 'active', expires_at: null },
  ]
  it('active and unexpired codes are held (positive control)', () => {
    expect([...heldCodes(rows, ME, NOW)].sort()).toEqual(['A', 'B'])
  })
  it('lapsed, suspended, revoked, expired and another email are not', () => {
    const held = heldCodes(rows, ME, NOW)
    for (const c of ['C', 'D', 'E', 'F', 'G']) expect(held.has(c)).toBe(false)
  })
  it('matches the sign-in email case-insensitively, and nothing without one', () => {
    expect([...heldCodes(rows, '  SAM@BoscoTech.edu ', NOW)].sort()).toEqual(['A', 'B'])
    expect(heldCodes(rows, '', NOW).size).toBe(0)
  })
  it('canClaimIdea: no requirement is claimable, a requirement needs the code', () => {
    const held = heldCodes(rows, ME, NOW)
    expect(canClaimIdea(null, held)).toBe(true)
    expect(canClaimIdea('A', held)).toBe(true)
    expect(canClaimIdea('C', held)).toBe(false)
    expect(canClaimIdea('Z', new Set())).toBe(false)
  })
})

describe('describeRequirement and pickerOptions', () => {
  const catalog = [
    { code: 'B', name: 'Bee', level: 2, active: true, sort_order: 2 },
    { code: 'A', name: 'Ay', level: 1, active: true, sort_order: 1 },
    { code: 'R', name: 'Retired one', level: 1, active: false, sort_order: 0 },
  ]
  const by = new Map(catalog.map(c => [c.code, c]))
  it('names the state of a code', () => {
    expect(describeRequirement('A', by)).toEqual({ code: 'A', name: 'Ay', state: 'current' })
    expect(describeRequirement('R', by)).toEqual({ code: 'R', name: 'Retired one', state: 'retired' })
    expect(describeRequirement('GONE', by)).toEqual({ code: 'GONE', name: null, state: 'missing' })
    expect(describeRequirement(null, by)).toBeNull()
  })
  it('offers active codes in IDEA order, and keeps a retired or missing current code', () => {
    expect(pickerOptions(catalog).map(o => o.code)).toEqual(['A', 'B'])
    expect(pickerOptions(catalog, 'R').map(o => o.code)).toEqual(['R', 'A', 'B'])
    expect(pickerOptions(catalog, 'GONE')[0]).toEqual({ code: 'GONE', label: 'GONE (no longer in IDEA)' })
    expect(pickerOptions(catalog, 'A').map(o => o.code)).toEqual(['A', 'B'])
  })
})

describe('links to IDEA', () => {
  it('earn and verify point at ideabosco.com/certifications', () => {
    expect(IDEA_CERTS_URL).toBe('https://ideabosco.com/certifications')
    expect(ideaVerifyUrl('IDEA-C-000101')).toBe('https://ideabosco.com/certifications/verify?serial=IDEA-C-000101')
    expect(ideaVerifyUrl('a b&c')).toBe('https://ideabosco.com/certifications/verify?serial=a%20b%26c')
  })
})

describe('the fixture plugin models 0012', () => {
  it('declares 0012 and seeds requirements for the core jobs', () => {
    expect(fixture.migration).toBe('0012')
    const rows = fixture.seed().task_idea_cert_requirements
    expect(rows.filter(r => r.code).map(r => r.code).sort()).toEqual(['ELEC-1', 'MECH-1', 'MILL-2', 'SAFE-2'])
    expect(rows.filter(r => !r.code).every(r => r.source === 'unmapped')).toBe(true)
  })
  it('its claim handler refuses without the code and accepts with it', () => {
    const inserted = []
    const engine = { insertRow: (t, r) => inserted.push([t, r]) }
    const db = {
      tasks: [{ id: 't', status: 'open', max_claimants: null }],
      task_claims: [],
      task_idea_cert_requirements: [{ task_id: 't', code: 'A' }],
      idea_cert_holders: [{ email: ME, code: 'A', status: 'active', expires_at: null }],
    }
    const call = (email) => fixture.rpcs.claim_task({ args: { p_task: 't' }, db, user: { id: 'u' }, persona: { email }, engine, now: new Date(NOW) })
    expect(call('other@boscotech.edu').error.code).toBe('42501')
    expect(inserted.length).toBe(0)
    expect(call(ME).error).toBeNull()
    expect(inserted.length).toBe(1)
  })
})
