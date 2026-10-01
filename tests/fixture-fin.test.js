// Three feature fixtures the 2026-10-01 reviewers found wrong, each held here
// as the merged browser seed builds it (core + every features/*.js, through
// the same engine, as tests/fixture-seed.test.js does):
//
//   a.js  the student personas' IDEA holder rows carry their SIGN-IN emails,
//         so "Your certifications" lights up on the seed as shipped;
//   d.js  lane d's history sits on its own member, so the core seed's build
//         sessions cannot interleave with it and swallow CAPPED and REVIEW;
//   e.js  /announce sees the function as NOT DEPLOYED (a 404), and a role
//         added through the editor is stored with the live defaults.
//
// Every "it works now" is paired with the defect reproduced on the same seed,
// so a check that could not see the defect cannot pass.

import { describe, expect, it } from 'vitest'
import { createEngine, uuid } from '../src/dev/fixture/engine.js'
import { SCHEMA } from '../src/dev/fixture/schema.js'
import { CORE_IDS } from '../src/dev/fixture/seed.js'
import { IDS, PERSONAS, resolvePersona } from '../src/dev/fixture/personas.js'
import core from '../src/dev/fixture/core.js'
import { FEATURES, PLUGINS } from '../src/dev/fixture/plugins.js'
import a from '../src/dev/fixture/features/a.js'
import d, { D_IDS } from '../src/dev/fixture/features/d.js'
import e from '../src/dev/fixture/features/e.js'
import { ownCertifications } from '../src/ideaCerts.js'
import { sessionsFromEvents } from '../src/hoursUtils.js'
import { classifyInvoke } from '../src/discordAnnounce.js'

const NOW = new Date('2026-10-01T16:00:00-07:00') // the fixture clock the e2e runs use
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Seed exactly as client.js reseed() does, signed in as `persona`.
function build(plugins = PLUGINS, migrations = 'all', persona = 'admin') {
  const store = { db: {} }
  const engine = createEngine({
    schema: SCHEMA,
    plugins,
    store,
    now: () => NOW,
    context: () => ({ user: { id: PERSONAS[persona].id, email: PERSONAS[persona].email }, persona: resolvePersona(persona, store.db), migrations }),
  })
  const problems = engine.seedAll({ ids: { ...IDS, ...CORE_IDS }, now: NOW, uuid })
  return { engine, db: store.db, problems }
}

describe('features/a.js: holder rows by the personas\' sign-in emails', () => {
  const { db, problems } = build()
  const holders = db.idea_cert_holders

  it('seeds cleanly and is the plugin the browser loads', () => {
    expect(problems).toEqual([])
    // plugins.js spreads each default export under its file name
    expect(FEATURES.find((f) => f.name === 'a')?.seed).toBe(a.seed)
  })

  it('"Your certifications" finds Sam\'s 4 rows (2 held) and Riley\'s 3 rows (1 held) by sign-in email', () => {
    const sam = ownCertifications(holders, PERSONAS.student.email, NOW.getTime())
    const riley = ownCertifications(holders, PERSONAS.student2.email, NOW.getTime())
    expect(sam.map((r) => r.serial).sort()).toEqual(['IDEA-FX-0001', 'IDEA-FX-0002', 'IDEA-FX-0003', 'IDEA-FX-0004'])
    expect(sam.filter((r) => r.held)).toHaveLength(2)
    expect(riley.map((r) => r.serial).sort()).toEqual(['IDEA-FX-0005', 'IDEA-FX-0006', 'IDEA-FX-0007'])
    expect(riley.filter((r) => r.held)).toHaveLength(1)
  })

  it('positive control: the same rows under the old fallback emails are nobody\'s (0 for Sam, 0 for Riley)', () => {
    const OLD = { [PERSONAS.student.email]: 'student@fixture.techmen.test', [PERSONAS.student2.email]: 'student2@fixture.techmen.test' }
    const before = holders.map((h) => ({ ...h, email: OLD[h.email] ?? h.email }))
    expect(before.filter((h) => Object.values(OLD).includes(h.email))).toHaveLength(7)
    expect(ownCertifications(before, PERSONAS.student.email, NOW.getTime())).toHaveLength(0)
    expect(ownCertifications(before, PERSONAS.student2.email, NOW.getTime())).toHaveLength(0)
  })
})

describe('features/d.js: lane d\'s history on its own member', () => {
  const { db, problems } = build()
  const who = D_IDS.member
  const evs = db.attendance_events.filter((x) => x.user_id === who)
  const reviews = db.session_reviews.filter((r) => r.user_id === who)

  // What /display's history and the Team Hours drill-down pair, with the
  // review flag they read from session_reviews.
  function laneDSessions(rows, owner, reviewRows) {
    const pending = new Set(reviewRows.filter((r) => r.status === 'pending').map((r) => `${r.checkin_id}|${r.checkout_id}`))
    return sessionsFromEvents(rows.filter((x) => x.user_id === owner)).map((s) => ({ ...s, review: pending.has(`${s.inId}|${s.outId}`) }))
  }
  const dIds = new Set(d.seed({ ids: { ...IDS, ...CORE_IDS }, now: NOW, uuid }).attendance_events.map((x) => x.id))

  it('seeds cleanly; the member is no persona and is an active, approved, onboarded student', () => {
    expect(problems).toEqual([])
    expect(Object.values(IDS)).not.toContain(who)
    expect(who).toMatch(UUID)
    const p = db.profiles.filter((x) => x.id === who)
    expect(p).toHaveLength(1)
    expect({ status: p[0].status, approved: p[0].approved, onboarded: !!p[0].onboarded_at, name: p[0].nickname }).toEqual({ status: 'active', approved: true, onboarded: true, name: 'Emerson' })
    expect(db.member_roles.filter((r) => r.member_id === who).map((r) => r.role)).toEqual(['student'])
  })

  it('only lane d writes this member\'s attendance: exactly its 12 rows', () => {
    expect(evs).toHaveLength(12)
    expect(evs.every((x) => dIds.has(x.id))).toBe(true)
  })

  it('on the merged seed the 6 sessions form, with one CAPPED, one REVIEW, one MANUAL and one door change', () => {
    const s = laneDSessions(db.attendance_events, who, reviews)
    expect(s).toHaveLength(6)
    expect(s.filter((x) => x.wasCapped)).toHaveLength(1)
    expect(s.filter((x) => x.review)).toHaveLength(1)
    expect(s.filter((x) => x.manual)).toHaveLength(1)
    expect(s.filter((x) => x.inLoc === 'shop' && x.outLoc === 'side-door')).toHaveLength(1)
    // 2.5 + 1.5 + 3 + 10 (capped) + 40m, the review session excluded: 17h 40m.
    const counted = s.filter((x) => !x.review).reduce((n, x) => n + x.ms, 0)
    expect(Math.round(counted / 60_000)).toBe(17 * 60 + 40)
  })

  it('the one OUT at side-door in the whole store is this member\'s (how display-history.mjs finds them)', () => {
    const side = db.attendance_events.filter((x) => x.type === 'out' && x.location === 'side-door')
    expect(side.map((x) => x.user_id)).toEqual([who])
  })

  it('positive control: the same rows on Riley, as before, lose CAPPED and REVIEW to the core sessions', () => {
    // The old layout, rebuilt: lane d's rows re-owned by Riley beside Riley's
    // core and feature rows, then paired the way the history pairs them.
    const riley = IDS.student2
    const moved = db.attendance_events.map((x) => (x.user_id === who ? { ...x, user_id: riley } : x))
    const movedReviews = db.session_reviews.map((r) => (r.user_id === who ? { ...r, user_id: riley } : r))
    const ofLaneD = laneDSessions(moved, riley, movedReviews).filter((x) => dIds.has(x.inId) && dIds.has(x.outId))
    expect(ofLaneD.length).toBeLessThan(6)
    expect(ofLaneD.filter((x) => x.wasCapped).length + ofLaneD.filter((x) => x.review).length).toBeLessThan(2)
  })
})

describe('features/e.js: the announce function is not deployed, and roles get the live defaults', () => {
  const PAGE_INSERT = { name: 'Pit Crew', role_id: '100000000000000099', notes: null, sort_order: 80 }

  it('the stand-in answers 404, which the page reads as not deployed', () => {
    const out = e.functions['discord-announce']({ body: { action: 'status' } })
    expect(out.status).toBe(404)
    // client.js functions.invoke: status >= 400 -> FunctionsHttpError, context.status
    expect(classifyInvoke({ errorName: 'FunctionsHttpError', status: out.status, body: null }).kind).toBe('not_deployed')
  })

  it('positive control: the client\'s answer for an unknown function is NOT read as not deployed', () => {
    expect(classifyInvoke({ status: 200, body: { ok: true, skipped: true } }).kind).not.toBe('not_deployed')
  })

  it('an editor insert stores active true, the given sort_order, a uuid id and a created_at', async () => {
    const { engine, db, problems } = build()
    expect(problems).toEqual([])
    const { error } = await engine.from('discord_announce_roles').insert(PAGE_INSERT)
    expect(error).toBeNull()
    const row = db.discord_announce_roles.find((r) => r.name === 'Pit Crew')
    expect(row.active).toBe(true)
    expect(row.sort_order).toBe(80)
    expect(row.id).toMatch(UUID)
    expect(Number.isFinite(Date.parse(row.created_at))).toBe(true)
    // sort_order omitted takes the column default, 0.
    await engine.from('discord_announce_roles').insert({ name: 'Bare', role_id: '100000000000000098' })
    expect(db.discord_announce_roles.find((r) => r.name === 'Bare').sort_order).toBe(0)
  })

  it('the table is strict: an unknown column is refused (PGRST204) and nothing is stored', async () => {
    const { engine, db } = build()
    const n = db.discord_announce_roles.length
    const { error } = await engine.from('discord_announce_roles').insert({ ...PAGE_INSERT, colour: 'gold' })
    expect(error?.code).toBe('PGRST204')
    expect(db.discord_announce_roles).toHaveLength(n)
  })

  it('positive control: without the column list, the same insert stores no active at all and takes any column', async () => {
    const loose = PLUGINS.map((p) => (p.name === 'e' ? { ...p, creates: { ...p.creates, columns: {} } } : p))
    expect(loose.filter((p, i) => p !== PLUGINS[i])).toHaveLength(1)
    const { engine, db } = build(loose)
    expect((await engine.from('discord_announce_roles').insert(PAGE_INSERT)).error).toBeNull()
    expect(db.discord_announce_roles.find((r) => r.name === 'Pit Crew').active).toBeUndefined()
    expect((await engine.from('discord_announce_roles').insert({ ...PAGE_INSERT, role_id: '100000000000000097', colour: 'gold' })).error).toBeNull()
  })

  it('without 0003 the table is missing (PGRST205) and the function falls back to the client\'s generic answer', async () => {
    const { engine } = build(PLUGINS, 'none')
    expect((await engine.from('discord_announce_roles').insert(PAGE_INSERT)).error?.code).toBe('PGRST205')
    expect(engine.edgeFunction('discord-announce')).toBeNull()
    // positive control: with 0003 the stand-in is what answers
    expect(build(PLUGINS, 'all').engine.edgeFunction('discord-announce')).toBe(e.functions['discord-announce'])
  })

  it('core alone has no stand-in either (so the 404 is e.js\'s, not the client\'s)', () => {
    expect(build([core], 'all').engine.edgeFunction('discord-announce')).toBeNull()
  })
})
