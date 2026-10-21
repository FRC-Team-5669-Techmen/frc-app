import { describe, it, expect } from 'vitest'
import { prepareFootageRecord, footageLabel } from '../src/scouting/provenance.js'
import { reliability } from '../src/scouting/model.js'
import { scoutingDiscordPayload } from '../supabase/functions/scouting-dispatch/dispatch.js'
const external = { kind: 'observation', team_number: 5669, member_id: 'a', event_id: 'current', match_key: '2026cabb_qm1', payload: { answers: { trench: 'yes' }, source: 'video', video_url: 'https://example.org/match', source_scope: 'external', source_event: '2026cabb' } }
describe('source event provenance', () => {
  it('keeps prior-event footage out of current reliability while counting current-event video', () => {
    expect(reliability([external], 5669, 'trench')).toMatchObject({ denominator: 0, percent: null })
    const older = { ...external, version: 1, payload: { ...external.payload, source_scope: 'current' } }
    expect(reliability([older, { ...external, version: 2 }], 5669, 'trench').denominator).toBe(0)
    const current = { ...external, match_key: 'qm1', payload: { ...external.payload, source_scope: 'current', source_event: undefined, answers: { trench: 'no' } } }
    expect(reliability([external, current], 5669, 'trench')).toMatchObject({ yes: 0, no: 1, denominator: 1, percent: 0 })
    expect(footageLabel(external)).toContain('Prior-event footage · 2026cabb')
    expect(footageLabel(current)).toBe('This event · video')
    expect(footageLabel({ payload: { source: 'video' } })).toContain('scope not recorded')
  })
  it('requires a full external match identity, source event and reviewable URL', () => {
    expect(prepareFootageRecord(external)).toEqual(external)
    expect(() => prepareFootageRecord({ ...external, match_key: 'qm1' })).toThrow('full source match key')
    expect(() => prepareFootageRecord({ ...external, payload: { ...external.payload, source_event: '' } })).toThrow('source event key')
    expect(() => prepareFootageRecord({ ...external, payload: { ...external.payload, video_url: '' } })).toThrow('HTTPS video')
    expect(() => prepareFootageRecord({ ...external, payload: { ...external.payload, video_url: 'javascript:alert(1)' } })).toThrow('HTTPS video')
  })
  it('removes stale external fields when switching to live and labels prior-event Discord notes', () => {
    expect(prepareFootageRecord({ ...external, payload: { ...external.payload, source: 'live' } }).payload.source_event).toBeUndefined()
    const payload = scoutingDiscordPayload({ ...external, version: 1 })
    expect(payload.content).toContain('Prior-event footage: 2026cabb')
    expect(payload.allowed_mentions.parse).toEqual([])
  })
})

it('counts short and full current-event match labels once, retaining disputes and corrections', () => {
  const one = { ...external, match_key: 'qm1', payload: { source: 'live', answers: { trench: 'yes' } }, version: 1 }
  const same = { ...one, member_id: 'b', match_key: '2026current_qm1' }
  expect(reliability([one, same], 5669, 'trench').denominator).toBe(1)
  expect(reliability([one, { ...same, payload: { answers: { trench: 'no' } } }], 5669, 'trench')).toMatchObject({ disputed: 1, denominator: 0 })
  expect(reliability([one, { ...same, member_id: 'a', version: 2, payload: { answers: { trench: 'no' } } }], 5669, 'trench')).toMatchObject({ no: 1, denominator: 1 })
})

it('excludes unknown video provenance while preserving explicit live observations and reviewed scope', () => {
  const legacy = { ...external, id:'legacy', match_key:'qm2', payload:{source:'video',video_url:'https://example.org/old',answers:{trench:'yes'}} }
  const live = { ...external, id:'live', match_key:'qm1', payload:{source:'live',video_url:'https://example.org/reference',answers:{trench:'no'}} }
  expect(reliability([legacy,live],5669,'trench')).toMatchObject({yes:0,no:1,denominator:1,percent:0})
  const reviewed = {...legacy,version:2,payload:{...legacy.payload,source_scope:'current'}}
  expect(reliability([legacy,live,reviewed],5669,'trench')).toMatchObject({yes:1,no:1,denominator:2,percent:50})
  expect(reliability([reviewed,{...legacy,version:3}],5669,'trench').denominator).toBe(0)
})
