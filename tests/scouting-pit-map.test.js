import { describe, it, expect, vi } from 'vitest'
import { normalizePitMap, mapDirectory, mapIsStale, importedMapKey } from '../src/scouting/pitMap.js'
import { importScouting } from '../supabase/functions/scouting-import/import.js'
import { nexusMap } from '../src/dev/fixture/nexus-map.js'

const event = '20000000-0000-4000-8000-000000000002'
const body = { event_id: event, event_key: '2026dal', mode: 'pit_map' }
const at = '2026-10-21T08:00:00Z'
function adapter({ access = true, user = true, visible = true, kind = 'competition' } = {}) {
  return {
    body, env: { NEXUS_API_KEY: 'private-map-key' }, now: () => at,
    userClient: {
      auth: { getUser: async () => ({ data: { user: user ? { id: 'student' } : null } }) },
      rpc: vi.fn(async name => ({ data: name === 'scouting_can_access' && access })),
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visible ? { id: event, kind } : null }) }) }) })),
    },
    fetchImpl: vi.fn(async () => new Response(JSON.stringify(nexusMap))),
  }
}
describe('published Nexus map geometry and navigation', () => {
  it('preserves centered shapes, rotations, unassigned pits and optional collections', () => {
    const map = normalizePitMap(nexusMap)
    expect(map.size).toEqual({ x: 840, y: 1293 })
    // Independent hand calculation from the published example, not a renderer helper.
    expect(map.pits.A1.position.x - map.pits.A1.size.x/2).toBe(20)
    expect(map.pits.A1.position.y - map.pits.A1.size.y/2).toBe(970)
    expect(map.walls.w0.position.x - map.walls.w0.size.x/2).toBe(0)
    expect(map.pits.B1.angle).toBe(15)
    expect(map.pits.B2.team).toBe(null)
    expect(map.arrows.r0.type).toBe('single')
    expect(map.arrows.r1.type).toBe('double')
    expect(normalizePitMap({ size: { x: 100, y: 100 }, pits: {}, walls: null }).walls).toEqual({})
  })
  it.each([
    raw => { raw.size.x = 0 }, raw => { raw.pits.A1.position.y = '970' },
    raw => { raw.walls.w0.size.x = -1 }, raw => { raw.pits.A1.angle = Infinity },
    raw => { raw.pits.A1.team = 4414 }, raw => { raw.arrows.r0.type = 'unknown' },
    raw => { raw.pits = [] }, raw => { raw.labels.l0.label = {} },
    raw => { raw.pits = Object.fromEntries(Array.from({length:1001},(_,i)=>[i,raw.pits.A1])) },
  ])('rejects malformed maps completely, including malformed walls', mutate => {
    const raw = structuredClone(nexusMap); mutate(raw)
    expect(() => normalizePitMap(raw)).toThrow()
    expect(normalizePitMap(nexusMap).pits.A1.team).toBe('4414')
  })
  it('filters address/team without filling unassigned pits, and exposes contradictory reports', () => {
    const records = [{ kind: 'pit', team_number: 4414, payload: { pit_location: 'A12' }, updated_at: at }]
    const map = normalizePitMap(nexusMap)
    expect(mapDirectory(map, records, '4414').map(p=>[p.address,p.conflict,p.location.value])).toEqual([['A1',true,'A12']])
    expect(mapDirectory(map, records, ' b2 ').map(p=>[p.address,p.team])).toEqual([['B2',null]])
    expect(mapDirectory(map, records, 'not-a-pit')).toEqual([])
    expect(records[0].payload.pit_location).toBe('A12')
  })
  it('warns on missing, old and future retrieval times', () => {
    const now = Date.parse(at)
    expect(mapIsStale(at,now)).toBe(false)
    expect(mapIsStale(null,now)).toBe(true)
    expect(mapIsStale('bad',now)).toBe(true)
    expect(mapIsStale('2026-10-20T07:59:59Z',now)).toBe(true)
    expect(mapIsStale('2026-10-21T08:00:01Z',now)).toBe(true)
  })
  it('suggests only one unambiguous imported event key', () => {
    const row = key => ({kind:'team',payload:{source:'tba',source_url:`https://www.thebluealliance.com/event/${key}`}})
    expect(importedMapKey([row('2026dal'),row('2026dal')])).toBe('2026dal')
    expect(importedMapKey([row('2026dal'),row('2026cabb')])).toBe('')
    expect(importedMapKey([row('../bad')])).toBe('')
  })
})
describe('read-only map adapter authorization and failure boundaries (mocked providers)', () => {
  it('allows eligible students, uses a fixed URL and retains source time without a write', async () => {
    const f = adapter(), result = await importScouting(f)
    expect(result).toMatchObject({ http:200,event_key:'2026dal',fetched_at:at,source:'nexus',schema:'nexus-v1.8.0' })
    expect(result.map.pits.A1.team).toBe('4414')
    expect(f.userClient.rpc.mock.calls.map(c=>c[0])).toEqual(['scouting_can_access'])
    expect(f.userClient.from).toHaveBeenCalledWith('events')
    expect(f.fetchImpl.mock.calls[0][0]).toBe('https://frc.nexus/api/v1/event/2026dal/map')
    expect(f.fetchImpl.mock.calls[0][1].headers).toEqual({'Nexus-Api-Key':'private-map-key'})
    expect(JSON.stringify(result)).not.toContain('private-map-key')
  })
  it.each([{user:false},{access:false},{visible:false},{kind:'meeting'}])('refuses unauthorized or irrelevant events before fetching', async options => {
    const f = adapter(options)
    expect((await importScouting(f)).http).toBeGreaterThanOrEqual(400)
    expect(f.fetchImpl).not.toHaveBeenCalled()
    expect((await importScouting(adapter())).http).toBe(200)
  })
  it('does not widen manager-only roster import, accept arbitrary URLs or unknown modes', async () => {
    for (const patch of [{mode:undefined},{event_key:'../../private'},{mode:'write'}]) {
      const f = adapter(); f.body = {...body,...patch}
      expect((await importScouting(f)).http).toBeGreaterThanOrEqual(400)
      expect(f.fetchImpl).not.toHaveBeenCalled()
    }
  })
  it.each(['no-key','404','network','schema','oversize'])('reports %s failure without a replacement map or credentials', async mode => {
    const f = adapter()
    if (mode === 'no-key') f.env = {}
    else f.fetchImpl = vi.fn(async () => {
      if (mode === 'network') throw new Error('private-map-key')
      if (mode === '404') return new Response('{}',{status:404})
      if (mode === 'oversize') return new Response('{}',{headers:{'content-length':'4000001'}})
      return new Response('{"size":{},"pits":{}}')
    })
    const result = await importScouting(f)
    expect(result.http).toBe(503); expect(result.map).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('private-map-key')
    if (mode === 'no-key') expect(f.fetchImpl).not.toHaveBeenCalled()
    expect((await importScouting(adapter())).http).toBe(200)
  })
})
