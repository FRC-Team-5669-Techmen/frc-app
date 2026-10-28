// Fixture: robot telemetry on the match log and the battery board
// (supabase/migrations/0041_battery_telemetry.sql, ledger 0031). Contract:
// src/dev/fixture/README.md. Plain data, no side effects. A test-only PORT of
// the 0041 functions so /batteries and /robot/matches/:id can be driven in a
// browser; the rule is the SQL, proven by 0041_battery_telemetry_rls_test.sql.
//
// Named to sort after robotmatches.js: while 0041 is applied its
// robot_match_import answers instead of 0038's (the engine takes the last
// plugin's handler), wrapping it the way 0041 re-defines the function. The
// seeded power numbers live on the rows robotmatches.js and batteries.js seed.

import { powerColumns, matchBattery, startedAtMs } from '../../../robotMatches.js'
import matches, { writer } from './robotmatches.js'
import batteries from './batteries.js'

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const reading = (s, lo, hi) => { const n = /^[0-9]+(\.[0-9]+)?$/.test(String(s ?? '')) ? Number(s) : null; return n !== null && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null }
const POWER = ['power', 'rest_volts_before', 'robot_resistance_mohm', 'min_volts', 'amps_at_min', 'peak_amps', 'dips_below_7v', 'verdict']

export default {
  migration: '0041',
  creates: {
    columns: { robot_matches: POWER, battery_runs: ['robot_resistance_mohm', 'min_volts', 'verdict'] },
    rpcs: ['robot_match_import', 'battery_import_load_tests'],
  },
  rpcs: {
    robot_match_import: (ctx) => {
      const res = matches.rpcs.robot_match_import(ctx)
      if (res.error || res.data?.status === 'already') return res
      const { db, engine } = ctx
      const id = res.data.match.id
      engine.updateRows('robot_matches', (x) => x.id === id, powerColumns(ctx.args.p_raw))
      const m = rows(db, 'robot_matches').find((x) => x.id === id)
      const run = m.battery_run_id ? rows(db, 'battery_runs').find((x) => x.id === m.battery_run_id) : null
      if (run) {
        const ours = run.notes === `Robot match file ${ctx.args.p_file_name}`
        engine.updateRows('battery_runs', (x) => x.id === run.id, ours
          ? { voltage_before: m.rest_volts_before ?? run.voltage_before, robot_resistance_mohm: m.robot_resistance_mohm, min_volts: m.min_volts ?? m.battery_min ?? null, verdict: m.verdict }
          : { robot_resistance_mohm: run.robot_resistance_mohm ?? m.robot_resistance_mohm, min_volts: run.min_volts ?? m.min_volts ?? m.battery_min ?? null, verdict: run.verdict ?? m.verdict })
      }
      return { data: { ...res.data, match: rows(db, 'robot_matches').find((x) => x.id === id) }, error: null }
    },
    battery_import_load_tests: (ctx) => {
      const { args: a, db, engine, now } = ctx
      if (!writer(ctx)) return refuse('Only staff or a drive-team lead can import load tests.', '42501')
      if (!Array.isArray(a.p_rows)) return refuse('Rows must be a list.', '22023')
      if (a.p_rows.length > 500) return refuse('At most 500 rows at a time.', '22023')
      const imported = [], skipped = []
      let already = 0, other = 0
      for (const x of a.p_rows) {
        if (!x || x.kind !== 'load_test') { other += 1; continue }
        const t = startedAtMs(x.time)
        const r = reading(x.resistance_mohm, 0, 500)
        const skip = (reason, battery = x.battery ?? null) => skipped.push({ time: x.time, battery, reason })
        if (t === null) { skip('no readable time'); continue }
        if (!String(x.battery ?? '').replace(/[^A-Za-z0-9]/g, '')) { skip('no battery typed on the robot', null); continue }
        if (r === null) { skip('no resistance reading'); continue }
        const hit = matchBattery(x.battery, rows(db, 'batteries'))
        if (!hit.battery) { skip('not one battery in the log'); continue }
        const b = hit.battery
        if (rows(db, 'battery_runs').some((y) => y.battery_id === b.id && y.kind === 'bench_test' && Date.parse(y.ran_at) === t)) { already += 1; continue }
        if (b.status === 'retired') { skip('retired', b.label); continue }
        if (t < ms(now) - 60 * 864e5 || t > ms(now) + 600e3) { skip('more than 60 days old', b.label); continue }
        const verdict = String(x.verdict ?? '').trim() || null
        const br = batteries.rpcs.battery_log_run({ ...ctx, args: { p_battery: b.id, p_kind: 'bench_test', p_voltage_before: reading(x.rest_v, 0, 16), p_brownout: 'no',
          p_notes: `Pit load test (robot, 2 s shooter spin-up): idle V before, R includes the robot wiring.${verdict ? ` ${verdict}` : ''}`.slice(0, 2000) } })
        if (br.error) return br
        engine.updateRows('battery_runs', (y) => y.id === br.data.id, { ran_at: new Date(t).toISOString(), robot_resistance_mohm: r, min_volts: reading(x.min_v, 0, 16), verdict })
        imported.push({ id: br.data.id, battery: b.label, time: x.time, robot_resistance_mohm: r })
      }
      return { data: { imported, already, skipped, not_load_tests: other }, error: null }
    },
  },
}
