// Fixture: ledger 0017 part D (supabase/migrations/0028_role_interest_board.sql):
// the role board, auto routines and simulated matches, and season
// applications. Contract: src/dev/fixture/README.md. A test-only PORT so the
// pages can be driven in a browser; the rules are the SQL, proven by
// 0028_role_interest_board_rls_test.sql and tools/sql-harness/mutants-0028.mjs.

const EV = '16000000-0000-4000-8000-000000000001' // Fixture Regional (features/eventrosters.js)
const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const iso = (t) => new Date(t).toISOString()
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const ok = (data) => ({ data, error: null })
const SID = (n) => `28000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const AID = (n) => `28100000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ROLES = ['driver', 'operator', 'human_player', 'drive_coach', 'pit_crew', 'impact_presenter', 'pit_speaker', 'scouting_lead', 'scout', 'media', 'safety_captain', 'battery_captain']
const eligible = ({ user, persona, db }) => !!user?.id && !persona?.isParent
  && rows(db, 'profiles').some((p) => p.id === user.id && p.approved && (p.status ?? 'active') === 'active')
  && (persona?.isStaff || (persona?.roles ?? []).includes('student'))
const nameOf = (db, id) => { const p = rows(db, 'profiles').find((x) => x.id === id); return (p?.nickname || '').trim() || (p?.full_name || '').trim() || 'Member' }
const laDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const MATCH = { scout: 6, scouting_lead: 1, driver: 1, operator: 1, human_player: 1, drive_coach: 1, pit_crew: 3, battery_captain: 1 }

export default {
  migration: '0028',
  creates: {
    tables: ['role_slots', 'role_requests', 'auto_routines', 'auto_runs', 'sim_matches'],
    rpcs: ['role_board', 'role_board_open_events', 'role_request', 'role_withdraw', 'staff_save_slot', 'staff_delete_slot', 'staff_assign_from_request',
      'staff_apply_slot_template', 'auto_save_routine', 'auto_log_run', 'auto_edit_run', 'sim_save_match', 'season_applications'],
  },
  seed: ({ ids, now }) => {
    const t = ms(now)
    // Fixture Regional starts 12 days out (eventrosters.js). Two slots on day 1.
    const d1 = t + 12 * 864e5
    const slot = (n, label, h, needs) => ({ id: SID(n), event_id: EV, day: laDay(d1), label, starts_at: iso(d1 + h * 3600e3), ends_at: iso(d1 + (h + 1) * 3600e3), needs, position: n, created_by: ids.mentor, created_at: iso(t), updated_at: iso(t) })
    const run = (i, routine, result, h, member = ids.student2) => ({ id: `28200000-0000-4000-8000-${String(i).padStart(12, '0')}`, routine_id: AID(routine), member_id: member, ran_at: iso(t - h * 3600e3), result, problem: result === 'success' ? null : 'Missed the second piece', battery_id: null, location: 'Shop field', sim_match_id: null, updated_by: member, created_at: iso(t - h * 3600e3), updated_at: iso(t - h * 3600e3) })
    return {
      role_slots: [slot(1, 'Qualifications 1', 0, { ...MATCH }), slot(2, 'Qualifications 2', 1.5, { ...MATCH })],
      role_requests: [
        { id: '28300000-0000-4000-8000-000000000001', slot_id: SID(1), member_id: ids.student2, role: 'scout', created_at: iso(t) },
        { id: '28300000-0000-4000-8000-000000000002', slot_id: SID(1), member_id: ids.exempt, role: 'driver', created_at: iso(t) },
        { id: '28300000-0000-4000-8000-000000000003', slot_id: SID(1), member_id: ids.student2, role: 'driver', created_at: iso(t) },
      ],
      auto_routines: [
        { id: AID(1), name: 'Two-piece left', start_position: 'Left of the HUB', description: 'Shoots the preload, intakes two, shoots', active: true, created_by: ids.mentor, updated_by: ids.mentor, created_at: iso(t), updated_at: iso(t) },
        { id: AID(2), name: 'Center climb', start_position: 'Center', description: 'Shoots the preload and climbs LEVEL 1', active: true, created_by: ids.mentor, updated_by: ids.mentor, created_at: iso(t), updated_at: iso(t) },
      ],
      // Two-piece left: 5 successes in a row (ready). Center climb: S S F S S (streak 2).
      auto_runs: [1, 2, 3, 4, 5].map((i) => run(i, 1, 'success', i)).concat([run(6, 2, 'success', 1), run(7, 2, 'success', 2), run(8, 2, 'fail', 3), run(9, 2, 'success', 4), run(10, 2, 'success', 5)]),
      sim_matches: [],
    }
  },
  visible: { role_slots: eligible, role_requests: eligible, auto_routines: eligible, auto_runs: eligible, sim_matches: eligible },
  rpcs: {
    role_board: (ctx) => {
      const { args, db, user, persona } = ctx
      if (!eligible(ctx)) return refuse('The role board is for approved students and staff.', '42501')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      const slots = rows(db, 'role_slots').filter((s) => s.event_id === ev.id).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
      const assigned = rows(db, 'event_roles').filter((r) => r.event_id === ev.id)
      return ok({ event: { id: ev.id, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, kind: ev.kind }, can_manage: !!persona?.isStaff, me: user.id,
        slots: slots.map((s) => ({ ...s, requests: rows(db, 'role_requests').filter((r) => r.slot_id === s.id).map((r) => ({ id: r.id, member_id: r.member_id, name: nameOf(db, r.member_id), role: r.role, assigned: assigned.some((a) => a.member_id === r.member_id && a.role === r.role) })) })),
        assigned: assigned.map((a) => ({ member_id: a.member_id, name: nameOf(db, a.member_id), role: a.role })) })
    },
    role_board_open_events: (ctx) => {
      const { db, user, now } = ctx
      if (!eligible(ctx)) return ok([])
      const t = ms(now)
      return ok(rows(db, 'events').filter((e) => Date.parse(e.ends_at) > t && Date.parse(e.starts_at) < t + 21 * 864e5).map((e) => {
        const slots = rows(db, 'role_slots').filter((s) => s.event_id === e.id)
        const unfilled = slots.reduce((n, s) => n + Object.entries(s.needs ?? {}).filter(([role, need]) => need > rows(db, 'role_requests').filter((r) => r.slot_id === s.id && r.role === role).length).length, 0)
        const mine = rows(db, 'role_requests').filter((r) => r.member_id === user.id && slots.some((s) => s.id === r.slot_id)).length
        return slots.length && unfilled ? { event_id: e.id, title: e.title, starts_at: e.starts_at, unfilled, mine } : null
      }).filter(Boolean))
    },
    role_request: (ctx) => {
      const { args, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The role board is for approved students and staff.', '42501')
      if (!ROLES.includes(args.p_role)) return refuse('Unknown role.', '22023')
      const s = rows(db, 'role_slots').find((x) => x.id === args.p_slot)
      if (!s) return refuse('No such time slot.', 'P0002')
      if (!(args.p_role in (s.needs ?? {}))) return refuse('That role is not needed in this slot.', '22023')
      const have = rows(db, 'role_requests').find((r) => r.slot_id === s.id && r.member_id === user.id && r.role === args.p_role)
      return ok(have ?? engine.insertRow('role_requests', { slot_id: s.id, member_id: user.id, role: args.p_role, created_at: iso(ms(now)) }))
    },
    role_withdraw: (ctx) => {
      const { args, user, engine } = ctx
      if (!eligible(ctx)) return refuse('The role board is for approved students and staff.', '42501')
      return ok(engine.deleteRows('role_requests', (r) => r.slot_id === args.p_slot && r.role === args.p_role && r.member_id === user.id).length)
    },
    staff_save_slot: (ctx) => {
      const { args: a, db, user, persona, engine, now } = ctx
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      if (!a.p_label?.trim()) return refuse('Give the slot a label.', '22023')
      const row = { event_id: a.p_event, day: a.p_day, label: a.p_label.trim(), starts_at: a.p_starts_at, ends_at: a.p_ends_at ?? null, needs: a.p_needs ?? {}, position: a.p_position ?? 0, created_by: user.id, updated_at: iso(ms(now)) }
      if (!a.p_id) return ok(engine.insertRow('role_slots', { ...row, created_at: iso(ms(now)) }))
      engine.updateRows('role_slots', (s) => s.id === a.p_id, row)
      return ok({ id: a.p_id, ...row })
    },
    staff_delete_slot: ({ args, persona, engine }) => (persona?.isStaff ? ok(engine.deleteRows('role_slots', (s) => s.id === args.p_slot).length) : refuse('Staff only', '42501')),
    staff_assign_from_request: ({ args, db, user, persona, engine }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      const r = rows(db, 'role_requests').find((x) => x.id === args.p_request)
      if (!r) return refuse('No such request.', 'P0002')
      const s = rows(db, 'role_slots').find((x) => x.id === r.slot_id)
      // event_role_blocker's probation rule for the drive team (port).
      const field = ['driver', 'operator', 'human_player', 'drive_coach', 'pit_crew']
      if (field.includes(r.role) && rows(db, 'standing_records').some((x) => x.member_id === r.member_id && ['meetings', 'hours'].includes(x.kind) && ['open', 'proposed'].includes(x.status)))
        return refuse('Not eligible: On meetings or hours probation', '22023')
      engine.deleteRows('event_roles', (x) => x.event_id === s.event_id && x.member_id === r.member_id && x.role === r.role)
      return ok(engine.insertRow('event_roles', { event_id: s.event_id, member_id: r.member_id, role: r.role, reason: `Asked for it on the role board (${s.label})`, assigned_by: user.id }))
    },
    staff_apply_slot_template: ({ args, db, user, persona, engine, now }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      if (args.p_template !== 'beach_blitz_2026') return refuse('Unknown template. Known: beach_blitz_2026.', '22023')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      const d0 = Date.parse(ev.starts_at)
      const labels = [[0, 'Cars leave'], [0, 'Load-in and pit setup'], [0, 'Inspection'], [0, 'Practice matches 1'], [0, 'Practice matches 2'],
        ...[1, 2, 3, 4, 5, 6].map((n) => [1, `Qualifications ${n}`]), [2, 'Qualifications 7'], [2, 'Qualifications 8'], [2, 'Alliance selection'], [2, 'Playoffs 1'], [2, 'Playoffs 2']]
      let n = 0
      labels.forEach(([off, label], i) => {
        const day = laDay(d0 + off * 864e5)
        if (rows(db, 'role_slots').some((s) => s.event_id === ev.id && s.label === label && s.day === day)) return
        engine.insertRow('role_slots', { event_id: ev.id, day, label, starts_at: iso(d0 + off * 864e5 + i * 3600e3), ends_at: null, needs: /Qual|Practice|Playoff/.test(label) ? { ...MATCH } : { pit_crew: 3 }, position: i, created_by: user.id, created_at: iso(ms(now)), updated_at: iso(ms(now)) })
        n += 1
      })
      return ok(n)
    },
    auto_save_routine: ({ args: a, db, user, persona, engine, now }) => {
      if (!persona?.isStaff) return refuse('Only staff can add or change auto routines.', '42501')
      if (!a.p_name?.trim()) return refuse('Name the routine (up to 60 characters).', '22023')
      if (rows(db, 'auto_routines').some((r) => r.name.toLowerCase() === a.p_name.trim().toLowerCase() && r.id !== a.p_id)) return refuse(`Another routine is already named ${a.p_name.trim()}.`, '23505')
      const row = { name: a.p_name.trim(), start_position: a.p_start || null, description: a.p_description || null, active: a.p_active !== false, updated_by: user.id, updated_at: iso(ms(now)) }
      if (!a.p_id) return ok(engine.insertRow('auto_routines', { ...row, created_by: user.id, created_at: iso(ms(now)) }))
      engine.updateRows('auto_routines', (r) => r.id === a.p_id, row)
      return ok({ id: a.p_id, ...row })
    },
    auto_log_run: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The auto log is for approved students and staff.', '42501')
      const r = rows(db, 'auto_routines').find((x) => x.id === a.p_routine)
      if (!r) return refuse('No such routine.', 'P0002')
      if (!['success', 'partial', 'fail'].includes(a.p_result)) return refuse('Result is success, partial or fail.', '22023')
      return ok(engine.insertRow('auto_runs', { routine_id: r.id, member_id: user.id, ran_at: iso(ms(now)), result: a.p_result, problem: a.p_problem ?? null, battery_id: a.p_battery ?? null, location: a.p_location ?? null, sim_match_id: null, updated_by: user.id, created_at: iso(ms(now)), updated_at: iso(ms(now)) }))
    },
    auto_edit_run: (ctx) => {
      const { args: a, db, user, persona, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The auto log is for approved students and staff.', '42501')
      const r = rows(db, 'auto_runs').find((x) => x.id === a.p_run)
      if (!r) return refuse('No such run.', 'P0002')
      if (!persona?.isStaff && (r.member_id !== user.id || Date.parse(r.created_at) < ms(now) - 864e5)) return refuse('You can correct your own run for 24 hours after logging it. Ask a mentor after that.', '42501')
      engine.updateRows('auto_runs', (x) => x.id === r.id, { result: a.p_result, problem: a.p_problem ?? null, battery_id: a.p_battery ?? null, location: a.p_location ?? null, updated_by: user.id })
      return ok({ ...r, result: a.p_result })
    },
    sim_save_match: (ctx) => {
      const { args: a, db, user, engine, now } = ctx
      if (!eligible(ctx)) return refuse('The match simulator is for approved students and staff.', '42501')
      if (!['red', 'blue'].includes(a.p_alliance) || !['red', 'blue'].includes(a.p_inactive_first)) return refuse('Alliance and HUB order are red or blue.', '22023')
      if (a.p_routine && !a.p_auto_result) return refuse('Record how the auto went, or clear the routine.', '22023')
      const m = engine.insertRow('sim_matches', { member_id: user.id, started_at: a.p_started_at, ended_at: a.p_ended_at, driver_id: a.p_driver ?? null, operator_id: a.p_operator ?? null, human_player_id: a.p_human_player ?? null, drive_coach_id: a.p_drive_coach ?? null,
        battery_id: a.p_battery ?? null, routine_id: a.p_routine ?? null, alliance: a.p_alliance, inactive_first: a.p_inactive_first, auto_result: a.p_auto_result ?? null, auto_fuel: a.p_auto_fuel ?? null, teleop_fuel: a.p_teleop_fuel ?? null,
        tower: a.p_tower ?? null, voltage_before: a.p_voltage_before ?? null, voltage_after: a.p_voltage_after ?? null, brownout: a.p_brownout ?? 'unknown', human_notes: a.p_human_notes ?? null, problems: a.p_problems ?? null, created_at: iso(ms(now)) })
      let autoRun = null, batteryRun = null
      if (a.p_routine) autoRun = engine.insertRow('auto_runs', { routine_id: a.p_routine, member_id: user.id, ran_at: a.p_started_at, result: a.p_auto_result, problem: a.p_auto_result === 'success' ? null : a.p_problems ?? null, battery_id: a.p_battery ?? null, location: 'Simulated match', sim_match_id: m.id, updated_by: user.id, created_at: iso(ms(now)), updated_at: iso(ms(now)) })
      if (a.p_battery && rows(db, 'batteries').length) {
        batteryRun = engine.insertRow('battery_runs', { battery_id: a.p_battery, member_id: user.id, ran_at: a.p_started_at, kind: 'practice_match', event_id: null, match_label: 'Simulated match', voltage_before: a.p_voltage_before ?? null, voltage_after: a.p_voltage_after ?? null, resistance_mohm: null, minutes: 3, brownout: a.p_brownout ?? 'unknown', performance: null, notes: a.p_problems ?? null, updated_by: user.id, created_at: iso(ms(now)), updated_at: iso(ms(now)) })
        const b = rows(db, 'batteries').find((x) => x.id === a.p_battery)
        if (b && ['charged', 'in_robot'].includes(b.charge_state)) engine.updateRows('batteries', (x) => x.id === b.id, { charge_state: 'needs_charge' })
      }
      engine.updateRows('sim_matches', (x) => x.id === m.id, { auto_run_id: autoRun?.id ?? null, battery_run_id: batteryRun?.id ?? null })
      return ok({ ...m, auto_run_id: autoRun?.id ?? null, battery_run_id: batteryRun?.id ?? null })
    },
    season_applications: ({ db, persona }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      const today = new Date().toISOString().slice(0, 10)
      const s = rows(db, 'seasons').filter((x) => x.start_date <= today && x.end_date >= today).sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
      if (!s) return ok({ season: null, completed: [], missing: [] })
      const apps = rows(db, 'member_applications').filter((x) => x.season_id === s.id)
      return ok({ season: { id: s.id, name: s.name }, completed: [...new Set(apps.map((x) => x.member_id))].map((id) => ({ member_id: id, name: nameOf(db, id) })), missing: [] })
    },
  },
}
