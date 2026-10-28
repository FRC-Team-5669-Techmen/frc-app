// The connector gaps of 2026-10-28 (ledger 0028d) through the REAL tool
// runner and write engine over the in-memory backend:
//   place_in_car     a student into a car, out of one, or car to car, by
//                    name, one day or every day, there and home: one
//                    hub_staff_call move per (day, way), the mentor page's own
//                    Move, asked as ONE question (engine writeGroup)
//   trip_day_roster  per trip day, every student coming by name, how they get
//                    there and home, arrives and leaves
//   absences_waiting the absence requests waiting, with their ids
//   decide_absences  several decide_absence calls asked as ONE question
// The database half (the carpool rules, the 72-hour lock, decide_absence's
// gates) is the existing 0005/0016/0025 functions, proved by their own tests;
// tools/connector/harness/proof.mjs carries a hand sample for each function.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool, toolList } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { writeGroup } from '../api/_lib/connector/engine.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const NOW = Date.parse('2026-10-28T19:00:00Z')
const MEMBERS = [
  { id: 'm-mathias', full_name: 'Mathias Garcia', email: 'mgarcia@x.test', status: 'active', roles: ['student'] },
  { id: 'm-joaquin', full_name: 'Joaquin Whittemore', email: 'jw@x.test', status: 'active', roles: ['student'] },
  { id: 'm-riley', full_name: 'Riley Two', email: 'riley@x.test', status: 'active', roles: ['student'] },
  { id: 'm-sam', full_name: 'Sam One', email: 'sam@x.test', status: 'active', roles: ['student'] },
  { id: 'm-sam2', full_name: 'Sam Other', email: 'sam2@x.test', status: 'active', roles: ['student'] },
  { id: 'm-jo', full_name: 'Jo Three', email: 'jo@x.test', status: 'active', roles: ['student'] },
]
const car = (id, driver, description, seats, riders = []) => ({ id, driver, description, seats, riders_count: riders.length, riders, status: 'filling', leave_by: null })
const R = (name, invite_id) => ({ name, invite_id })
const FRI_HOME_OPTIONS = [{ key: 'pits', label: 'Leave at 9:00 PM when pits close', default: true }, { key: 'movie', label: 'Stay for the Halloween movie, home about 11:35 PM' }]

function makeBoard() {
  return {
    viewer: 'staff',
    days: [
      { id: 'd-fri', date: '2026-10-30', title: 'Load-in and practice', meet_at: '2026-10-30T22:15:00Z', meet_place: 'Bosco Tech front parking lot', target_arrival_at: '2026-10-31T00:00:00Z',
        venue_opens_at: '2026-10-31T00:00:00Z', venue_closes_at: '2026-10-31T05:30:00Z', pits_close_at: '2026-10-31T04:00:00Z', ask_pit_setup: true, home_options: FRI_HOME_OPTIONS,
        runs: [
          { run: 'to', unplaced: [R('Joaquin Whittemore', 'i-joaquin'), R('Mathias Garcia', 'i-mathias')],
            cars: [{ ...car('c-pina-f-to', 'Mr. Pina', 'Silver Odyssey', 4, [R('Riley Two', 'i-riley')]), leave_by: '2026-10-30T22:20:00Z' }, car('c-garcia-f-to', 'Maria Garcia', 'Black Tahoe', 3), car('c-sam-f-to', "Sam's family", 'Red Civic', 3)] },
          { run: 'home', unplaced: [R('Mathias Garcia', 'i-mathias')],
            cars: [{ ...car('c-pina-f-home', 'Mr. Pina', 'Silver Odyssey', 4, [R('Riley Two', 'i-riley'), R('Joaquin Whittemore', 'i-joaquin')]), leave_by: '2026-10-31T04:00:00Z' }] },
        ] },
      { id: 'd-sat', date: '2026-10-31', title: 'Qualifications', meet_at: '2026-10-31T12:45:00Z', target_arrival_at: '2026-10-31T14:00:00Z', venue_closes_at: '2026-11-01T01:15:00Z', home_options: [],
        runs: [
          { run: 'to', unplaced: [R('Mathias Garcia', 'i-mathias')], cars: [car('c-pina-s-to', 'Mr. Pina', 'Silver Odyssey', 4, [R('Riley Two', 'i-riley')]), car('c-garcia1-s-to', 'Maria Garcia', 'Black Tahoe', 3), car('c-garcia2-s-to', 'Luis Garcia', 'White F-150', 2)] },
          { run: 'home', unplaced: [R('Mathias Garcia', 'i-mathias')], cars: [car('c-pina-s-home', 'Mr. Pina', 'Silver Odyssey', 4, [R('Riley Two', 'i-riley')])] },
        ] },
      { id: 'd-sun', date: '2026-11-01', title: 'Playoffs', target_arrival_at: '2026-11-01T15:00:00Z', venue_closes_at: '2026-11-02T01:30:00Z', home_options: [],
        runs: [
          { run: 'to', unplaced: [R('Mathias Garcia', 'i-mathias')], cars: [car('c-pina-u-to', 'Mr. Pina', 'Silver Odyssey', 4)] },
          { run: 'home', unplaced: [R('Mathias Garcia', 'i-mathias')], cars: [car('c-tran-u-home', 'Tran family', 'Blue Sienna', 5)] },
        ] },
    ],
    meals: [],
  }
}

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const A3 = '33333333-3333-4333-8333-333333333333'
let tables, backend, ctx, refuse
beforeEach(() => {
  tables = {
    hub_invites: [
      { id: 'i-mathias', event_id: 'h1', student_id: 'm-mathias' }, { id: 'i-joaquin', event_id: 'h1', student_id: 'm-joaquin' },
      { id: 'i-riley', event_id: 'h1', student_id: 'm-riley' }, { id: 'i-sam', event_id: 'h1', student_id: 'm-sam' },
    ],
    hub_day_answers: [
      ...['d-fri', 'd-sat', 'd-sun'].map((day_id) => ({ invite_id: 'i-mathias', day_id, attending: 'yes', to_mode: null, home_mode: null })),
      { invite_id: 'i-joaquin', day_id: 'd-fri', attending: 'yes', pit_setup: true }, { invite_id: 'i-joaquin', day_id: 'd-sat', attending: 'no' }, { invite_id: 'i-joaquin', day_id: 'd-sun', attending: 'yes' },
      { invite_id: 'i-riley', day_id: 'd-fri', attending: 'yes', home_option: 'movie' }, { invite_id: 'i-riley', day_id: 'd-sat', attending: 'yes' },
      { invite_id: 'i-sam', day_id: 'd-fri', attending: 'yes', to_mode: 'driving', home_mode: 'self' }, { invite_id: 'i-sam', day_id: 'd-sat', attending: 'unsure' },
    ],
    hub_cars: [{ id: 'c-sam-f-to', day_id: 'd-fri', run: 'to', driver_invite_id: 'i-sam', leave_by: '2026-10-30T22:30:00Z', event_id: 'h1' }],
    absence_requests: [
      { id: A1, member_id: 'm-riley', event_id: 'e-build', reason: 'medical', emergency: false, note: 'Dentist', status: 'pending', requested_at: '2026-10-27T16:00:00Z' },
      { id: A2, member_id: 'm-sam', event_id: 'e-meeting', reason: 'illness', emergency: true, note: null, status: 'pending', requested_at: '2026-10-27T15:00:00Z' },
      { id: A3, member_id: 'm-jo', event_id: 'e-build', reason: 'school_event', emergency: false, note: null, status: 'approved', requested_at: '2026-10-25T15:00:00Z' },
    ],
    events: [
      { id: 'e-build', title: 'Saturday build', kind: 'meeting', starts_at: '2026-10-31T16:00:00Z' },
      { id: 'e-meeting', title: 'Team meeting', kind: 'meeting', starts_at: '2026-10-28T01:00:00Z' },
    ],
  }
  refuse = null
  backend = memoryBackend()
  backend.select = async (_s, spec) => {
    let rows = tables[spec.table] ?? []
    for (const [k, v] of Object.entries(spec.eq ?? {})) rows = rows.filter((r) => r[k] === v)
    for (const [k, v] of Object.entries(spec.in ?? {})) rows = rows.filter((r) => v.includes(r[k]))
    return { data: rows.map((r) => ({ ...r })), error: null }
  }
  const rpc = backend.rpc
  backend.rpc = async (s, fn, args) => {
    if (fn === 'admin_get_members') return { data: MEMBERS, error: null }
    if (fn === 'hub_member_events') return { data: [{ id: 'h1', title: 'Beach Blitz 2026', starts_on: '2026-10-30', over: false }], error: null }
    if (fn === 'hub_member_board') return { data: { event: { id: 'h1' }, board: makeBoard() }, error: null }
    if (fn === 'connector_call' && refuse) {
      const e = refuse(args)
      if (e) return { data: null, error: e }
    }
    return rpc(s, fn, args)
  }
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(NOW), random: testRandom(), cache: new Map() }
})

const moves = () => backend.state.calls.filter((c) => c.fn === 'hub_staff_call')
const decisions = () => backend.state.calls.filter((c) => c.fn === 'decide_absence')

describe('the registry', () => {
  it('names the existing staff functions, both ask first, both reads are read only', () => {
    expect(TOOLS.place_in_car).toMatchObject({ kind: 'function', function: 'hub_staff_call' })
    expect(TOOLS.decide_absences).toMatchObject({ kind: 'function', function: 'decide_absence' })
    expect(FUNCTIONS.hub_staff_call.level).toBe('confirm')
    expect(FUNCTIONS.decide_absence.level).toBe('confirm')
    const list = toolList()
    for (const n of ['trip_day_roster', 'absences_waiting']) expect(list.find((t) => t.name === n).annotations.readOnlyHint).toBe(true)
    expect(list.find((t) => t.name === 'place_in_car').inputSchema.properties).toHaveProperty('confirm_token')
    expect(list.find((t) => t.name === 'decide_absences').inputSchema.properties.requests).toMatchObject({ type: 'array', items: { type: 'string' } })
  })
})

describe('place_in_car', () => {
  it('Mathias into Mr. Pina\'s car every day, both ways: ONE preview, nothing written, then one confirm writes each move as him', async () => {
    const ask = { said: "put Mathias in Mr. Pina's car every day", student: 'Mathias', car: "Mr. Pina's car", day: 'all', request_id: 'r1' }
    const p = await runTool(ctx, 'place_in_car', ask)
    expect(p.status).toBe('preview')
    expect(p.student).toBe('Mathias Garcia')
    expect(p.changes.map((c) => `${c.day} ${c.way} ${c.from} > ${c.to}`)).toEqual([
      'Friday 2026-10-30 there no car > Mr. Pina', 'Friday 2026-10-30 home no car > Mr. Pina',
      'Saturday 2026-10-31 there no car > Mr. Pina', 'Saturday 2026-10-31 home no car > Mr. Pina',
      'Sunday 2026-11-01 there no car > Mr. Pina',
    ])
    expect(p.skipped).toEqual([{ day: 'Sunday 2026-11-01', way: 'home', why: 'no car from Mr. Pina\'s car that way' }])
    expect(p.confirm_token.split('.')).toHaveLength(5)
    expect(moves()).toHaveLength(0)
    expect(backend.state.audit).toHaveLength(0)

    const done = await runTool(ctx, 'place_in_car', { ...ask, confirm_token: p.confirm_token })
    expect(done).toMatchObject({ status: 'done', done: 5, refused: 0 })
    expect(moves()).toHaveLength(5)
    expect(moves().every((c) => c.uid === 'u-admin' && c.args.p_action === 'move' && c.args.p_args.invite_id === 'i-mathias')).toBe(true)
    expect(moves().map((c) => `${c.args.p_args.day_id}/${c.args.p_args.run}/${c.args.p_args.car_id}`)).toEqual([
      'd-fri/to/c-pina-f-to', 'd-fri/home/c-pina-f-home', 'd-sat/to/c-pina-s-to', 'd-sat/home/c-pina-s-home', 'd-sun/to/c-pina-u-to',
    ])
    expect(backend.state.audit).toHaveLength(5)
    // The same token a second time writes nothing more.
    const again = await runTool(ctx, 'place_in_car', { ...ask, confirm_token: p.confirm_token })
    expect(again.status).toBe('needs_confirmation')
    expect(moves()).toHaveLength(5)
  })

  it('Joaquin into the Garcia car Friday, there only: one move; the override reason is passed only when given', async () => {
    const ask = { said: 'move Joaquin to the Garcia car Friday', student: 'Joaquin', car: 'Garcia', day: 'Friday', run: 'there', override_reason: 'Mentor rides along' }
    const p = await runTool(ctx, 'place_in_car', ask)
    expect(p.status).toBe('preview')
    expect(p.changes).toEqual([{ day: 'Friday 2026-10-30', way: 'there', from: 'no car', to: 'Maria Garcia', seats_taken: '0 of 3' }])
    await runTool(ctx, 'place_in_car', { ...ask, confirm_token: p.confirm_token })
    expect(moves()).toHaveLength(1)
    expect(moves()[0].args.p_args).toEqual({ invite_id: 'i-joaquin', day_id: 'd-fri', run: 'to', car_id: 'c-garcia-f-to', override_reason: 'Mentor rides along' })
  })

  it('a move from one car to another names both; already in that car is skipped; none takes the student out (car null)', async () => {
    const p = await runTool(ctx, 'place_in_car', { said: 'move Riley to Garcia Friday', student: 'Riley', car: 'Maria Garcia', day: '2026-10-30', run: 'there' })
    expect(p.changes[0]).toMatchObject({ from: 'Mr. Pina', to: 'Maria Garcia' })
    const same = await runTool(ctx, 'place_in_car', { said: 'x', student: 'Riley', car: 'Pina', day: 'Friday', run: 'there' })
    expect(same).toMatchObject({ status: 'already', skipped: [{ why: "already in Mr. Pina's car" }] })
    const out = await runTool(ctx, 'place_in_car', { said: 'take Riley out of her car Friday', student: 'Riley', car: 'none', day: 'Friday' })
    expect(out.status).toBe('preview')
    expect(out.changes.map((c) => `${c.way}:${c.from}`)).toEqual(['there:Mr. Pina', 'home:Mr. Pina'])
    await runTool(ctx, 'place_in_car', { said: 'take Riley out of her car Friday', student: 'Riley', car: 'none', day: 'Friday', confirm_token: out.confirm_token })
    expect(moves().map((c) => c.args.p_args)).toEqual([
      { invite_id: 'i-riley', day_id: 'd-fri', run: 'to', car_id: null }, { invite_id: 'i-riley', day_id: 'd-fri', run: 'home', car_id: null },
    ])
  })

  it('NEGATIVE: an unknown or ambiguous student, a student not on the trip, a day not on it, an unknown or ambiguous car each write nothing', async () => {
    const said = 'x'
    expect((await runTool(ctx, 'place_in_car', { said, student: 'Zed', car: 'Pina', day: 'Friday' })).status).toBe('not_found')
    const amb = await runTool(ctx, 'place_in_car', { said, student: 'Sam', car: 'Pina', day: 'Friday' })
    expect(amb.status).toBe('ambiguous')
    expect(amb.message).toMatch(/Sam One.*Sam Other/)
    expect(await runTool(ctx, 'place_in_car', { said, student: 'Jo Three', car: 'Pina', day: 'Friday' })).toMatchObject({ status: 'not_found', message: expect.stringMatching(/not signed up for Beach Blitz 2026/) })
    expect((await runTool(ctx, 'place_in_car', { said, student: 'Mathias', car: 'Pina', day: 'Monday' })).status).toBe('not_found')
    expect(await runTool(ctx, 'place_in_car', { said, student: 'Mathias', car: 'Lopez', day: 'Friday', run: 'there' })).toMatchObject({ status: 'not_found', message: expect.stringMatching(/Mr\. Pina, Maria Garcia/) })
    expect((await runTool(ctx, 'place_in_car', { said, student: 'Mathias', car: 'Lopez', day: 'all' })).status).toBe('not_found')
    const twoGarcias = await runTool(ctx, 'place_in_car', { said, student: 'Mathias', car: 'Garcia', day: 'Saturday', run: 'there' })
    expect(twoGarcias.status).toBe('ambiguous')
    expect(twoGarcias.message).toMatch(/Maria Garcia.*Luis Garcia/)
    expect((await runTool(ctx, 'place_in_car', { said, student: 'Joaquin', car: 'Pina', day: 'Saturday', run: 'there' })).message).toMatch(/not marked coming/)
    expect((await runTool(ctx, 'place_in_car', { said, student: 'Sam One', car: 'Pina', day: 'Friday', run: 'there' })).message).toMatch(/family is driving/)
    expect(moves()).toHaveLength(0)
    expect(backend.state.audit).toHaveLength(0)
    expect(backend.state.confirmations.size).toBe(0)
  })

  it('a carpool rule the database refuses at preview offers nothing, and says it in the page words', async () => {
    refuse = (args) => (args.p_function === 'hub_staff_call' && args.p_args.p_args.car_id === 'c-pina-s-home' && args.p_mode === 'preview'
      ? { code: 'P0001', message: 'hub:car_full', details: 'That car just filled. Pick another.' } : null)
    const p = await runTool(ctx, 'place_in_car', { said: 'Mathias with Pina all weekend', student: 'Mathias', car: 'Pina', day: 'all' })
    expect(p.status).toBe('refused')
    expect(p.reason).toBe('car_full')
    expect(p.message).toMatch(/^That car just filled\. Pick another\. \(change 4 of 5; nothing was changed for any of them\)$/)
    expect(p.confirm_token).toBeUndefined()
    expect(moves()).toHaveLength(0)
  })

  it('the 72-hour lock: a refusal at commit is reported per change and the rest stand (partial)', async () => {
    const ask = { said: 'Mathias with Pina Friday', student: 'Mathias', car: 'Pina', day: 'Friday' }
    const p = await runTool(ctx, 'place_in_car', ask)
    refuse = (args) => (args.p_mode === 'commit' && args.p_args.p_args?.run === 'home'
      ? { code: '42501', message: 'The carpool plan is frozen in the last 12 hours before leaving' } : null)
    const out = await runTool(ctx, 'place_in_car', { ...ask, confirm_token: p.confirm_token })
    expect(out).toMatchObject({ status: 'partial', done: 1, refused: 1 })
    expect(out.items[1]).toMatchObject({ status: 'refused', message: expect.stringMatching(/frozen/) })
    expect(moves()).toHaveLength(1)
  })

  it('NEGATIVE: a token for different changes, or with a piece missing, writes nothing for anyone', async () => {
    const ask = { said: 'x', student: 'Mathias', car: 'Pina', day: 'Friday' }
    const p = await runTool(ctx, 'place_in_car', ask)
    const other = await runTool(ctx, 'place_in_car', { ...ask, day: 'Saturday', confirm_token: p.confirm_token })
    expect(other.status).toBe('needs_confirmation')
    const p2 = await runTool(ctx, 'place_in_car', ask)
    const short = await runTool(ctx, 'place_in_car', { ...ask, confirm_token: p2.confirm_token.split('.')[0] })
    expect(short.status).toBe('needs_confirmation')
    expect(moves()).toHaveLength(0)
    // POSITIVE CONTROL: a fresh preview and its own token do write.
    const p3 = await runTool(ctx, 'place_in_car', ask)
    expect((await runTool(ctx, 'place_in_car', { ...ask, confirm_token: p3.confirm_token })).status).toBe('done')
    expect(moves()).toHaveLength(2)
  })
})

describe('writeGroup', () => {
  it('refuses a plan that would not ask first (it would commit before the question)', async () => {
    await expect(writeGroup(ctx, 'x', [{ fn: 'staff_add_event', args: { p_member: 'm' } }])).rejects.toThrow(/asks first/)
    expect(backend.state.calls).toHaveLength(0)
  })
})

describe('trip_day_roster', () => {
  it('lists every student coming each day by name, how they get there and home, and their times; writes nothing', async () => {
    const out = await runTool(ctx, 'trip_day_roster', { said: 'who is coming each day of Beach Blitz' })
    expect(out.status).toBe('ok')
    const [fri, sat, sun] = out.days
    expect(fri.day).toBe('Friday 2026-10-30')
    expect(fri.students.map((s) => s.name)).toEqual(['Joaquin Whittemore', 'Mathias Garcia', 'Riley Two', 'Sam One'])
    const by = Object.fromEntries(fri.students.map((s) => [s.name, s]))
    expect(by['Riley Two']).toMatchObject({ arrives: '5:00 PM', in_car_there: true, in_car_home: true, there: { how: 'team carpool', car: 'Mr. Pina', car_leaves: '3:20 PM' }, home: { car: 'Mr. Pina' }, leaves: '9:00 PM', home_choice: 'Stay for the Halloween movie, home about 11:35 PM' })
    expect(by['Mathias Garcia']).toMatchObject({ in_car_there: false, in_car_home: false, there: { how: 'needs a seat' }, home: { how: 'needs a seat' }, leaves: null })
    expect(by['Joaquin Whittemore']).toMatchObject({ there: { how: 'needs a seat' }, home: { how: 'team carpool', car: 'Mr. Pina' }, pit_setup: true })
    expect(by['Sam One']).toMatchObject({ there: { how: 'family car', in_car: true, car: "Sam's family", car_leaves: '3:30 PM' }, home: { how: 'on their own', in_car: false } })
    expect(fri.times).toMatchObject({ meet: '3:15 PM', target_arrival: '5:00 PM', pits_close: '9:00 PM' })
    // Joaquin said no to Saturday: absent there (the positive control is Friday above). Sam is unsure.
    expect(sat.students.map((s) => s.name)).toEqual(['Mathias Garcia', 'Riley Two'])
    expect(sat.not_sure).toEqual(['Sam One'])
    expect(sun.students.map((s) => s.name)).toEqual(['Joaquin Whittemore', 'Mathias Garcia'])
    expect(sun.not_answered).toBe(2)
    expect(backend.state.audit).toHaveLength(0)
    expect(backend.state.calls.filter((c) => !c.direct)).toHaveLength(0)
  })
  it('one day by weekday; an unknown day or trip reads nothing', async () => {
    const out = await runTool(ctx, 'trip_day_roster', { said: "who's at the competition Saturday", day: 'saturday' })
    expect(out.days.map((d) => d.day)).toEqual(['Saturday 2026-10-31'])
    expect((await runTool(ctx, 'trip_day_roster', { said: 'x', day: 'Tuesday' })).status).toBe('not_found')
    expect((await runTool(ctx, 'trip_day_roster', { said: 'x', trip: 'Nationals' })).status).toBe('not_found')
  })
})

describe('absences_waiting', () => {
  it('lists the waiting requests oldest first with who, event, reason, note, when filed and the id; decided ones are left out', async () => {
    const out = await runTool(ctx, 'absences_waiting', { said: 'any absences waiting' })
    expect(out.status).toBe('ok')
    expect(out.waiting).toBe(2)
    expect(out.requests.map((r) => r.request_id).sort()).toEqual([A1, A2].sort())
    const riley = out.requests.find((r) => r.request_id === A1)
    expect(riley).toMatchObject({ who: 'Riley Two', event: 'Saturday build', event_day: '2026-10-31', reason: 'Medical visit', emergency: false, note: 'Dentist', filed: 'Tue, Oct 27 9:00 AM' })
    expect(riley.counts_as_approved).toBeUndefined()
    expect(out.requests.find((r) => r.request_id === A2)).toMatchObject({ who: 'Sam One', reason: 'Illness or injury', emergency: true, counts_as_approved: true })
    expect(out.requests.some((r) => r.who === 'Jo Three')).toBe(false)
    expect(backend.state.audit).toHaveLength(0)
  })
  it('filters by member and by event; an unknown member reads nothing', async () => {
    expect((await runTool(ctx, 'absences_waiting', { said: 'x', member: 'Riley' })).requests.map((r) => r.who)).toEqual(['Riley Two'])
    expect((await runTool(ctx, 'absences_waiting', { said: 'x', event: 'team meeting' })).requests.map((r) => r.who)).toEqual(['Sam One'])
    expect((await runTool(ctx, 'absences_waiting', { said: 'x', member: 'Zed' })).status).toBe('not_found')
  })
})

describe('decide_absences', () => {
  it('approves two in ONE question: a preview listing both, nothing written, then one confirm decides each as him', async () => {
    const ask = { said: 'approve the absences and tell them feel better', requests: [A1, A2], approve: true, note: 'Feel better' }
    const p = await runTool(ctx, 'decide_absences', ask)
    expect(p.status).toBe('preview')
    expect(p.decision).toBe('approve')
    expect(p.requests.map((r) => `${r.who}: ${r.event}`)).toEqual(['Riley Two: Saturday build', 'Sam One: Team meeting'])
    expect(p.confirm_token.split('.')).toHaveLength(2)
    expect(decisions()).toHaveLength(0)
    const done = await runTool(ctx, 'decide_absences', { ...ask, confirm_token: p.confirm_token })
    expect(done).toMatchObject({ status: 'done', done: 2 })
    expect(decisions().map((c) => c.args)).toEqual([
      { p_request: A1, p_approve: true, p_note: 'Feel better' }, { p_request: A2, p_approve: true, p_note: 'Feel better' },
    ])
    expect(decisions().every((c) => c.uid === 'u-admin')).toBe(true)
  })
  it('NEGATIVE: an unknown id, a non-id, or an already decided request writes nothing for anyone', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999'
    expect((await runTool(ctx, 'decide_absences', { said: 'x', requests: [A1, unknown], approve: true })).status).toBe('not_found')
    expect((await runTool(ctx, 'decide_absences', { said: 'x', requests: ['Riley'], approve: true })).status).toBe('not_found')
    expect((await runTool(ctx, 'decide_absences', { said: 'x', requests: [A1, A3], approve: true })).status).toBe('already')
    expect((await runTool(ctx, 'decide_absences', { said: 'x', requests: [], approve: true })).status).toBe('invalid')
    expect(decisions()).toHaveLength(0)
    expect(backend.state.confirmations.size).toBe(0)
  })
  it('a deny the database refuses (unanswered when the event started) offers nothing and names the request', async () => {
    refuse = (args) => (args.p_function === 'decide_absence' && args.p_args.p_request === A2 && !args.p_args.p_approve
      ? { code: '22023', message: 'This request was still unanswered when the event started, so it is approved (handbook Section 6)' } : null)
    const p = await runTool(ctx, 'decide_absences', { said: 'deny both', requests: [A1, A2], approve: false })
    expect(p.status).toBe('refused')
    expect(p.message).toMatch(/still unanswered.*\(change 2 of 2; nothing was changed for any of them\)/)
    expect(p.confirm_token).toBeUndefined()
    expect(decisions()).toHaveLength(0)
  })
})
