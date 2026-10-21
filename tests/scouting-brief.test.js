import { JSDOM } from 'jsdom'
import { describe, it, expect } from 'vitest'
import { emptyBrief, briefLineup, briefInputs, freezeBrief, printableBrief, restoreBrief } from '../src/scouting/brief'
const draft = { ...emptyBrief(), match: 'qm42', ours: '5669,101,202', opponents: '303 404 505', opening: '<script>alert(1)</script>' }
const context = { eventId: 'e', memberId: 'm', reviewer: '<img onerror=alert(1)>', pending: 2 }
const observation = (id, member, answer, match = 'qm1') => ({ id, version: 1, event_id: 'e', member_id: member, kind: 'observation', team_number: 5669, match_key: match, payload: { answers: { trench: answer } } })
describe('reviewed match brief', () => {
  it('requires an explicit unique six-team lineup and a match', () => {
    expect(briefLineup(draft)).toEqual({ ours: [5669,101,202], opponents: [303,404,505] })
    for (const bad of [{ match: '' }, { opponents: '101 404 505' }, { ours: '5669,101' }, { ours: '5669,1e2,202' }, { ours: '5669,0,202' }]) expect(() => briefLineup({ ...draft, ...bad })).toThrow()
  })
  it('freezes attributed confirmed inputs, excludes pending/foreign evidence, and preserves unknowns', () => {
    const records = [observation('a','s1','yes'), observation('b','s2','no'), observation('c','s3','did_not_see'), observation('d','s1','yes','qm2'),
      { ...observation('pending','s1','no','qm3'), localStatus: 'local' }, { ...observation('foreign','s1','no','qm4'), event_id: 'other' }]
    const inputs = briefInputs(draft, records, context), frozen = freezeBrief(inputs, '2026-10-21T16:00:00Z')
    expect(frozen.records.map(r => r.id)).toEqual(['a','b','c','d'])
    expect(frozen.teams[0].capabilities[0]).toMatchObject({ denominator: 1, yes: 1, no: 0, disputed: 1, didNotSee: 1, percent: 100, sufficient: false })
    expect(frozen.teams[1].capabilities[0]).toMatchObject({ denominator: 0, percent: null })
    records[0].payload.answers.trench = 'no'; draft.opening = 'Changed'
    expect(frozen.records[0].payload.answers.trench).toBe('yes')
    expect(frozen.plan.opening).toContain('<script>')
    expect(JSON.stringify(inputs)).not.toBe(JSON.stringify(briefInputs(draft, records, context)))
  })
  it('prints escaped text without active scripts/assets and labels stale estimates', () => {
    const d = { ...draft, opening: '<script>alert(1)</script>' }
    const records = [{ id: 't', event_id: 'e', version: 1, kind: 'team', team_number: 5669, payload: { name: '<img src=x onerror=alert(1)>', epa: 10, epa_fetched_at: '2026-10-01' } }]
    const brief = freezeBrief(briefInputs(d, records, { ...context, cachedAt: 1792594800000 }), '2026-10-21T16:00:00Z'), html = printableBrief(brief)
    expect(brief.teams[0].estimate.stale).toBe(true)
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img')
    expect(new JSDOM(html).window.document.querySelectorAll('script,img,iframe,link,[src],[onerror]')).toHaveLength(0)
    expect(html).toContain('Evidence cache: 2026-10-21T15:00:00.000Z'); expect(brief.context.cachedAt).toBe(1792594800000)
    expect(html).toContain('No decisive evidence'); expect(html).toContain('Pending event saves excluded: 2')
  })
  it('takes attribution from the record envelope even if payload text imitates metadata', () => {
    const row = observation('authentic','author','yes')
    row.payload = { ...row.payload, id:'spoof', member:'someone else', version:99, match:'fake' }
    const brief = freezeBrief(briefInputs(draft, [row], context))
    expect(brief.teams[0].observations[0]).toMatchObject({id:'authentic',member:'author',version:1,match:'qm1'})
  })
  it('exports an explicit exclusion for unverified video scope without changing the raw record', () => {
    const row = observation('legacy','author','yes')
    row.payload.source = 'video'
    const brief = freezeBrief(briefInputs(draft,[row],context))
    expect(brief.teams[0].unverifiedVideos).toBe(1)
    expect(brief.teams[0].capabilities[0].percent).toBeNull()
    expect(brief.records[0]).toEqual(row)
    expect(printableBrief(brief)).toContain('1 videos excluded: event scope unverified')
  })
  it('restores only bounded known text fields', () => {
    expect(restoreBrief({ match: 42, ours: {}, roles: 'x'.repeat(3000), unknown: 'ignored' })).toEqual({ ...emptyBrief(), roles: 'x'.repeat(2000) })
  })
})
