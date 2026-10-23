// The battery tools (ledger 0017, migration 0026) through the REAL tool
// runner over the in-memory backend: list_batteries reads with the app's own
// rules, log_battery_run asks first, set_battery_charge runs and can be
// undone, and a label is resolved against what his account can read (an
// unknown or ambiguous label writes nothing). The database half is proved by
// 0026_battery_log_rls_test.sql and tools/connector/harness/proof.mjs.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const BATTERIES = [
  { id: 'b-1', label: 'B01', status: 'competition', charge_state: 'charged' },
  { id: 'b-2', label: 'B02', status: 'competition', charge_state: 'charged' },
  { id: 'b-7', label: 'B07', status: 'practice', charge_state: 'needs_charge' },
  { id: 'b-x7', label: 'X07', status: 'practice', charge_state: 'needs_charge' },
]
const RUNS = [
  { id: 'r1', battery_id: 'b-2', member_id: 'm', ran_at: '2026-10-30T18:00:00Z', kind: 'match', voltage_before: 12.8, voltage_after: 11.2, resistance_mohm: 13, brownout: 'yes' },
  { id: 'r2', battery_id: 'b-1', member_id: 'm', ran_at: '2026-10-30T17:00:00Z', kind: 'match', voltage_before: 12.95, voltage_after: 12.0, resistance_mohm: 11, brownout: 'no' },
]

let backend, ctx
beforeEach(() => {
  backend = memoryBackend()
  backend.select = async (_s, spec) => ({ data: spec.table === 'batteries' ? BATTERIES : spec.table === 'battery_runs' ? RUNS : [], error: null })
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
})

describe('the battery tools', () => {
  it('are in the registry at the right levels', () => {
    expect(TOOLS.list_batteries.kind).toBe('read')
    expect(TOOLS.log_battery_run.function).toBe('battery_log_run')
    expect(TOOLS.set_battery_charge.function).toBe('battery_set_charge')
    expect(FUNCTIONS.battery_log_run.level).toBe('confirm')
    expect(FUNCTIONS.battery_set_charge.level).toBe('undo')
  })
  it('list_batteries: worst first, B02 flagged for its brownout, B01 match-ready; nothing written', async () => {
    const out = await runTool(ctx, 'list_batteries', { said: 'how are the batteries' })
    expect(out.status).toBe('ok')
    expect(out.batteries[0].label).toBe('B02')
    expect(out.batteries[0].check).toBe(true)
    expect(out.batteries.find((b) => b.label === 'B01')).toMatchObject({ check: false, match_ready: true })
    const ready = await runTool(ctx, 'list_batteries', { said: 'which are ready', show: 'match_ready' })
    expect(ready.batteries.map((b) => b.label)).toEqual(['B01'])
    expect(backend.state.audit).toHaveLength(0)
  })
  it('list_batteries before 0026 is pasted says not set up', async () => {
    backend.select = async () => ({ data: null, error: { code: 'PGRST205', message: 'no table' } })
    expect((await runTool(ctx, 'list_batteries', { said: 'x' })).status).toBe('not_set_up')
  })
  it('log_battery_run always previews first and writes nothing until confirmed', async () => {
    const out = await runTool(ctx, 'log_battery_run', { said: 'log B1 qual 12 12.9 before no brownout', battery: 'B1', kind: 'match', match: 'qm12', volts_before: 12.9, brownout: 'no' })
    expect(out.status).toBe('preview')
    expect(out.confirm_token).toBeTruthy()
    expect(backend.state.audit).toHaveLength(0)
    const done = await runTool(ctx, 'log_battery_run', { said: 'log B1 qual 12 12.9 before no brownout', battery: 'B1', kind: 'match', match: 'qm12', volts_before: 12.9, brownout: 'no', confirm_token: out.confirm_token })
    expect(done.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'battery_log_run', args: { p_battery: 'b-1', p_kind: 'match', p_match: 'qm12', p_voltage_before: 12.9, p_brownout: 'no' } })
  })
  it('set_battery_charge runs at once, as him', async () => {
    const out = await runTool(ctx, 'set_battery_charge', { said: 'B07 is charged', battery: 'b07', state: 'charged' })
    expect(out.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'battery_set_charge', uid: 'u-admin', args: { p_battery: 'b-7', p_state: 'charged' } })
  })
  it('an unknown label, or a bare number two batteries share, writes nothing and asks', async () => {
    const none = await runTool(ctx, 'set_battery_charge', { said: 'B99 charged', battery: 'B99', state: 'charged' })
    expect(none.status).toBe('not_found')
    const two = await runTool(ctx, 'set_battery_charge', { said: '7 charged', battery: '7', state: 'charged' })
    expect(two.status).toBe('ambiguous')
    expect(two.candidates.map((c) => c.label).sort()).toEqual(['B07', 'X07'])
    const one = await runTool(ctx, 'set_battery_charge', { said: '2 charged', battery: '2', state: 'charged' })
    expect(one.status).toBe('done')
    expect(backend.state.calls.filter((c) => c.fn === 'battery_set_charge')).toHaveLength(1)
  })
})
