// The Meet a team form (0035, ledger 0026): validation, the save arguments,
// the chip vocabularies against the SQL CHECKs, grouping and search, and the
// offline draft.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  validateConnection, emptyForm, saveArgs, groupByTeam, ORG_TAGS, RESOURCE_TAGS, readDraft, writeDraft, clearDraft, draftHasContent, formFromConnection,
} from '../src/meetTeam.js'

const good = () => ({ ...emptyForm(), team_number: '254', does_well: 'Fast pit repairs', copy_this: 'A labeled spares cart' })

describe('validateConnection', () => {
  it('a filled form has no errors (positive control)', () => {
    expect(validateConnection(good())).toEqual({})
  })
  it('the empty form names exactly the three required fields', () => {
    expect(Object.keys(validateConnection(emptyForm())).sort()).toEqual(['copy_this', 'does_well', 'team_number'])
  })
  it('a team number must be 1 to 99999; whitespace-only text is blank', () => {
    for (const n of ['0', '100000', 'abc', '12.5']) expect(validateConnection({ ...good(), team_number: n }).team_number).toBeTruthy()
    for (const n of ['1', '99999', ' 5669 ']) expect(validateConnection({ ...good(), team_number: n }).team_number).toBeUndefined()
    expect(validateConnection({ ...good(), does_well: '   ' }).does_well).toBe('Say what they do well.')
  })
  it('contact fields are optional, but a bad email or role is caught', () => {
    expect(validateConnection({ ...good(), contact_email: 'not-an-email' }).contact_email).toBeTruthy()
    expect(validateConnection({ ...good(), contact_email: 'a@b.org' }).contact_email).toBeUndefined()
    expect(validateConnection({ ...good(), contact_role: 'parent' }).contact_role).toBeTruthy()
    expect(validateConnection({ ...good(), contact_role: 'mentor' }).contact_role).toBeUndefined()
  })
  it('an unknown chip and an overlong note are refused', () => {
    expect(validateConnection({ ...good(), org_tags: ['robot_cult'] }).org_tags).toBeTruthy()
    expect(validateConnection({ ...good(), org_tags: ['captains'] }).org_tags).toBeUndefined()
    expect(validateConnection({ ...good(), org_note: 'x'.repeat(1001) }).org_note).toBeTruthy()
  })
})

describe('saveArgs', () => {
  it('maps the form onto team_connection_save, trims, and drops the follow-up note when follow up is no', () => {
    const a = saveArgs({ ...good(), team_name: '  Poofs ', follow_up: false, follow_up_note: 'leftover', contact_name: ' Jo ' }, 'ev1')
    expect(a).toMatchObject({ p_id: null, p_event: 'ev1', p_team: 254, p_team_name: 'Poofs', p_follow_up: false, p_follow_up_note: null, p_contact: { name: 'Jo', email: null } })
    expect(saveArgs({ ...good(), follow_up: true, follow_up_note: 'Email their lead' }, 'ev1', 'id9')).toMatchObject({ p_id: 'id9', p_follow_up: true, p_follow_up_note: 'Email their lead' })
  })
  it('the arguments are exactly the function signature in 0035', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0035_meet_a_team.sql', import.meta.url), 'utf8')
    const sig = /create or replace function public\.team_connection_save\(([\s\S]*?)\)\s*returns/.exec(sql)[1]
    const names = [...sig.matchAll(/(p_[a-z_]+)\s/g)].map((m) => m[1])
    expect(Object.keys(saveArgs(good(), 'e')).sort()).toEqual(names.sort())
  })
})

describe('chip vocabularies', () => {
  it('equal the CHECK constraints on team_connections', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0035_meet_a_team.sql', import.meta.url), 'utf8')
    const list = (col) => [...new RegExp(`${col}\\s+text\\[\\][^\\n]*?array\\[([^\\]]*)\\]`).exec(sql)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(ORG_TAGS.map(([k]) => k)).toEqual(list('org_tags'))
    expect(RESOURCE_TAGS.map(([k]) => k)).toEqual(list('resource_tags'))
    expect(list('org_tags')).toHaveLength(8)
  })
})

describe('groupByTeam', () => {
  const notes = [
    { id: 1, team_number: 1678, team_name: 'Citrus Circuits', logged_by: 'Sam', does_well: 'Strategy binder', org_tags: ['strategy_team'], copy_this: 'Binder' },
    { id: 2, team_number: 254, team_name: '', logged_by: 'Riley', does_well: 'Spares cart', org_tags: [], copy_this: 'Labels' },
    { id: 3, team_number: 254, team_name: 'The Cheesy Poofs', logged_by: 'Casey', does_well: 'Driver practice', org_tags: [], copy_this: 'Daily practice' },
  ]
  it('groups by number ascending and takes the first name given', () => {
    const g = groupByTeam(notes)
    expect(g.map((x) => [x.team_number, x.team_name, x.notes.length])).toEqual([[254, 'The Cheesy Poofs', 2], [1678, 'Citrus Circuits', 1]])
  })
  it('search matches notes, names and chip labels; a miss returns nothing (against a hit)', () => {
    expect(groupByTeam(notes, 'strategy team').map((x) => x.team_number)).toEqual([1678])
    expect(groupByTeam(notes, 'casey').map((x) => x.notes.length)).toEqual([1])
    expect(groupByTeam(notes, 'zzz')).toEqual([])
  })
})

describe('the draft', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) } }
  it('survives a write and read, and clears', () => {
    const s = mem()
    expect(writeDraft('u', 'e', { form: good() }, s)).toBe(true)
    expect(readDraft('u', 'e', s)?.form.team_number).toBe('254')
    expect(readDraft('u', 'other', s)).toBe(null)
    clearDraft('u', 'e', s)
    expect(readDraft('u', 'e', s)).toBe(null)
  })
  it('a storage that throws is no draft and no crash', () => {
    const bad = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(readDraft('u', 'e', bad)).toBe(null)
    expect(writeDraft('u', 'e', { form: good() }, bad)).toBe(false)
    expect(() => clearDraft('u', 'e', bad)).not.toThrow()
  })
  it('only a form with something typed is worth restoring', () => {
    expect(draftHasContent(emptyForm())).toBe(false)
    expect(draftHasContent({ ...emptyForm(), org_tags: ['captains'] })).toBe(true)
  })
  it('a saved note round-trips into the form for editing', () => {
    const f = formFromConnection({ team_number: 254, team_name: 'P', does_well: 'x', copy_this: 'y', org_tags: ['captains'], contact: { name: 'Jo', role: 'mentor' }, follow_up: true })
    expect(f).toMatchObject({ team_number: '254', contact_name: 'Jo', contact_role: 'mentor', org_tags: ['captains'], follow_up: true })
    expect(validateConnection(f)).toEqual({})
  })
})
