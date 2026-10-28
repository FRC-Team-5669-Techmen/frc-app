// Fixture: the battery log (supabase/migrations/0026_battery_log.sql, ledger
// 0017). Contract: src/dev/fixture/README.md. Plain data, no side effects. A
// test-only PORT of the five battery functions so /batteries can be driven in
// a browser; the rule is the SQL, proven by 0026_battery_log_rls_test.sql and
// tools/sql-harness/mutants-0026.mjs.

const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const iso = (now) => (now instanceof Date ? now : new Date(typeof now === 'number' ? now : Date.now())).toISOString()
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const BID = (n) => `26000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const RID = (n) => `26100000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent
  && rows(db, 'profiles').some((p) => p.id === user.id && p.approved && (p.status ?? 'active') === 'active')
  && (persona?.isStaff || (persona?.roles ?? []).includes('student'))
const staff = (ctx) => eligible(ctx) && !!ctx.persona?.isStaff
const KINDS = ['match', 'practice_match', 'drive_practice', 'bench_test']
const CHARGES = ['charged', 'charging', 'needs_charge', 'in_robot']
const between = (v, lo, hi) => v === null || v === undefined || (Number(v) >= lo && Number(v) <= hi)

function checkRun(a) {
  if (!KINDS.includes(a.p_kind)) return 'Kind is match, practice_match, drive_practice or bench_test.'
  if (!['yes', 'no', 'unknown'].includes(a.p_brownout ?? 'unknown')) return 'Brownout is yes, no or unknown.'
  if (!between(a.p_voltage_before, 0, 16) || !between(a.p_voltage_after, 0, 16)) return 'Voltages are between 0 and 16 volts.'
  if (!between(a.p_resistance, 0, 500)) return 'Resistance is between 0 and 500 milliohms.'
  if (!between(a.p_minutes, 0, 600)) return 'Minutes are between 0 and 600.'
  if (!between(a.p_performance, 1, 5)) return 'Performance is 1 to 5.'
  return null
}

export default {
  migration: '0026',
  creates: {
    tables: ['batteries', 'battery_runs'],
    rpcs: ['battery_add_set', 'battery_save', 'battery_set_charge', 'battery_log_run', 'battery_edit_run'],
  },
  // Seven batteries in the states the board must tell apart: match-ready,
  // flagged by a brownout, by a low resting voltage and by resistance, one
  // charging, one practice, one retired. The robot telemetry columns (0041,
  // features/robotmatchpower.js) ride on the same runs: B01 healthy (robot
  // 16 to 17 mOhm), B02 browned out with normal R (the robot drew too much),
  // B03 normal, and B07 high on two pit load tests (31.5) while the rest read
  // normal: the fleet line names B07, not the robot.
  seed: ({ ids, now }) => {
    const t = (h) => new Date(now - h * 3600_000).toISOString()
    const b = (n, label, status, charge, extra = {}) => ({ id: BID(n), label, brand_model: 'MK ES17-12', year_acquired: 2024, status, charge_state: charge, notes: null, created_by: ids.mentor, updated_by: ids.mentor, created_at: t(900), updated_at: t(2), charge_set_at: t(2), charge_set_by: ids.mentor, ...extra })
    const r = (n, bat, h, kind, vb, va, res, brownout, member = ids.student2, extra = {}) => ({ id: RID(n), battery_id: BID(bat), member_id: member, ran_at: t(h), kind, event_id: null, match_label: kind === 'match' ? `qm${n}` : null, voltage_before: vb, voltage_after: va, resistance_mohm: res, minutes: kind === 'match' ? 3 : 20, brownout, performance: null, notes: null, updated_by: member, created_at: t(h), updated_at: t(h), ...extra })
    return {
      batteries: [
        b(1, 'B01', 'competition', 'charged'),
        b(2, 'B02', 'competition', 'charged'),
        b(3, 'B03', 'competition', 'needs_charge'),
        b(4, 'B04', 'competition', 'charging'),
        b(5, 'B05', 'practice', 'charged'),
        b(6, 'B06', 'retired', 'needs_charge', { notes: 'Swollen case. Do not use.' }),
        b(7, 'B07', 'competition', 'in_robot'),
      ],
      battery_runs: [
        r(1, 1, 30, 'match', 12.95, 12.1, 11.5, 'no', ids.student2, { robot_resistance_mohm: 16.8, min_volts: 10.9, verdict: 'OK' }),
        r(2, 1, 50, 'bench_test', 13.05, null, 11.2, 'no', ids.student2, { robot_resistance_mohm: 16.1, min_volts: 11.8, verdict: 'B01 R = 16.1 mOhm (battery + wiring) | 13.05 V idle -> 11.80 V at 118 A | normal' }),
        r(3, 2, 26, 'match', 12.8, 11.4, 14.0, 'no', ids.student2, { robot_resistance_mohm: 18.2, min_volts: 10.2, verdict: 'OK' }),
        r(4, 2, 28, 'match', 12.7, 10.9, 15.2, 'yes', ids.student2, { robot_resistance_mohm: 17.6, min_volts: 6.71,
          verdict: 'ROBOT DRAW: 251 A at the dip with normal resistance: too much current at once (drive pushing, shooter spin-up, a stall)' }),
        r(5, 3, 27, 'match', 12.31, 11.0, 16.0, 'no', ids.student2, { robot_resistance_mohm: 19.5, min_volts: 10.4,
          verdict: 'CHARGE: started at 12.31 V (fresh is 12.7+, 12.4 minimum)' }),
        r(6, 4, 40, 'bench_test', 12.9, null, 24.5, 'unknown'),
        r(7, 5, 70, 'drive_practice', null, null, null, 'unknown'),
        r(8, 7, 1, 'bench_test', 13.0, null, 17.9, 'no', ids.student),
        r(9, 7, 3, 'bench_test', 12.95, null, null, 'no', ids.mentor, { robot_resistance_mohm: 29.8, min_volts: 11.1,
          verdict: 'B07 R = 29.8 mOhm (battery + wiring) | 12.95 V idle -> 11.10 V at 121 A | HIGH: compare with another battery', notes: 'Pit load test (robot, 2 s shooter spin-up): idle V before, R includes the robot wiring.' }),
        r(10, 7, 2, 'bench_test', 12.92, null, null, 'no', ids.mentor, { robot_resistance_mohm: 31.5, min_volts: 10.9,
          verdict: 'B07 R = 31.5 mOhm (battery + wiring) | 12.92 V idle -> 10.90 V at 120 A | HIGH: compare with another battery', notes: 'Pit load test (robot, 2 s shooter spin-up): idle V before, R includes the robot wiring.' }),
      ],
    }
  },
  visible: { batteries: eligible, battery_runs: eligible },
  rpcs: {
    battery_set_charge: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The battery log is for approved students and staff.', '42501')
      if (!CHARGES.includes(a.p_state)) return refuse('Charge state is charged, charging, needs_charge or in_robot.', '22023')
      const b = rows(db, 'batteries').find((x) => x.id === a.p_battery)
      if (!b) return refuse('No such battery.', 'P0002')
      const previous = b.charge_state
      engine.updateRows('batteries', (x) => x.id === b.id, { charge_state: a.p_state, charge_set_at: iso(now), charge_set_by: user.id, updated_at: iso(now) })
      return { data: { id: b.id, label: b.label, charge_state: a.p_state, previous, charge_set_at: iso(now) }, error: null }
    },
    battery_log_run: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The battery log is for approved students and staff.', '42501')
      const b = rows(db, 'batteries').find((x) => x.id === a.p_battery)
      if (!b) return refuse('No such battery.', 'P0002')
      if (b.status === 'retired') return refuse(`Battery ${b.label} is retired. A staff member can bring it back first.`, '22023')
      const problem = checkRun(a)
      if (problem) return refuse(problem, '22023')
      const run = engine.insertRow('battery_runs', {
        battery_id: b.id, member_id: user.id, ran_at: iso(now), kind: a.p_kind, event_id: a.p_event ?? null, match_label: a.p_match?.trim() || null,
        voltage_before: a.p_voltage_before ?? null, voltage_after: a.p_voltage_after ?? null, resistance_mohm: a.p_resistance ?? null, minutes: a.p_minutes ?? null,
        brownout: a.p_brownout ?? 'unknown', performance: a.p_performance ?? null, notes: a.p_notes?.trim() || null, updated_by: user.id, created_at: iso(now), updated_at: iso(now),
      })
      let charge = b.charge_state
      if (a.p_kind !== 'bench_test' && ['charged', 'in_robot'].includes(b.charge_state)) {
        engine.updateRows('batteries', (x) => x.id === b.id, { charge_state: 'needs_charge', charge_set_at: iso(now), charge_set_by: user.id })
        charge = 'needs_charge'
      }
      return { data: { ...run, battery_label: b.label, charge_state: charge, previous_charge_state: b.charge_state }, error: null }
    },
    battery_edit_run: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The battery log is for approved students and staff.', '42501')
      const r = rows(db, 'battery_runs').find((x) => x.id === a.p_run)
      if (!r) return refuse('No such run.', 'P0002')
      if (!staff(ctx) && (r.member_id !== user.id || Date.parse(r.created_at) < now - 24 * 3600_000)) return refuse('You can correct your own run for 24 hours after logging it. Ask a mentor after that.', '42501')
      const problem = checkRun(a)
      if (problem) return refuse(problem, '22023')
      const patch = { kind: a.p_kind, event_id: a.p_event ?? null, match_label: a.p_match?.trim() || null, voltage_before: a.p_voltage_before ?? null, voltage_after: a.p_voltage_after ?? null,
        resistance_mohm: a.p_resistance ?? null, minutes: a.p_minutes ?? null, brownout: a.p_brownout ?? 'unknown', performance: a.p_performance ?? null, notes: a.p_notes?.trim() || null, updated_by: user.id, updated_at: iso(now) }
      engine.updateRows('battery_runs', (x) => x.id === r.id, patch)
      return { data: { ...r, ...patch }, error: null }
    },
    battery_save: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!staff(ctx)) return refuse('Only staff can add or change batteries.', '42501')
      const label = String(a.p_label ?? '').trim()
      if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/.test(label)) return refuse('A label is 1 to 20 letters or numbers, such as B07.', '22023')
      if (rows(db, 'batteries').some((x) => x.label.toUpperCase() === label.toUpperCase() && x.id !== a.p_id)) return refuse(`Another battery is already labeled ${label}.`, '23505')
      const values = { label, brand_model: a.p_brand_model?.trim() || null, year_acquired: a.p_year ?? null, notes: a.p_notes?.trim() || null, updated_by: user.id, updated_at: iso(now) }
      if (!a.p_id) return { data: engine.insertRow('batteries', { ...values, status: a.p_status ?? 'practice', charge_state: 'needs_charge', created_by: user.id, created_at: iso(now) }), error: null }
      const b = rows(db, 'batteries').find((x) => x.id === a.p_id)
      if (!b) return refuse('No such battery.', 'P0002')
      engine.updateRows('batteries', (x) => x.id === b.id, { ...values, status: a.p_status ?? b.status })
      return { data: { ...b, ...values, status: a.p_status ?? b.status }, error: null }
    },
    battery_add_set: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!staff(ctx)) return refuse('Only staff can add batteries.', '42501')
      const prefix = String(a.p_prefix ?? 'B').trim().toUpperCase()
      if (!/^[A-Z]{1,6}$/.test(prefix)) return refuse('Use one to six letters before the number, such as B.', '22023')
      if (!Number.isInteger(a.p_from) || !Number.isInteger(a.p_to) || a.p_from < 0 || a.p_to < a.p_from || a.p_to > 999 || a.p_to - a.p_from >= 60) return refuse('Choose a range of at most 60 numbers, such as 1 to 12.', '22023')
      const created = [], skipped = []
      for (let n = a.p_from; n <= a.p_to; n += 1) {
        const label = prefix + String(n).padStart(2, '0')
        if (rows(db, 'batteries').some((x) => x.label.toUpperCase() === label)) { skipped.push(label); continue }
        engine.insertRow('batteries', { label, brand_model: a.p_brand_model?.trim() || null, year_acquired: a.p_year ?? null, status: a.p_status ?? 'practice', charge_state: 'needs_charge', created_by: user.id, updated_by: user.id, created_at: iso(now), updated_at: iso(now) })
        created.push(label)
      }
      return { data: { created, skipped }, error: null }
    },
  },
}
