// Fixture: My schedule (supabase/migrations/0043_my_schedule.sql, ledger
// 0033). my_schedule_rides is a port of 0043's: the caller's own seats in
// trip cars between two dates, never anyone else's. The reminder job runs on
// pg_cron only and is proven by 0043_my_schedule_rls_test.sql.
const rows = (db, name) => db[name] ?? []
const ok = (data) => ({ data, error: null })
const fail = (message, code = '22023') => ({ data: null, error: { message, code } })

export default {
  migration: '0043',
  creates: { tables: ['schedule_reminders_sent'], rpcs: ['my_schedule_rides'] },
  visible: { schedule_reminders_sent: () => false },
  rpcs: {
    my_schedule_rides: ({ args, db, user }) => {
      if (!user?.id) return fail('Sign in first.', '42501')
      const { p_from: from, p_to: to } = args
      if (!from || !to || to < from || (Date.parse(to) - Date.parse(from)) / 864e5 > 14) return fail('Choose up to 14 days.')
      const out = []
      for (const s of rows(db, 'hub_seats')) {
        const inv = rows(db, 'hub_invites').find((i) => i.id === s.invite_id)
        if (!inv || inv.student_id !== user.id) continue
        const c = rows(db, 'hub_cars').find((x) => x.id === s.car_id)
        const d = rows(db, 'hub_days').find((x) => x.id === s.day_id)
        const e = d && rows(db, 'hub_events').find((x) => x.id === d.event_id)
        if (!c || !d || !e || d.day_date < from || d.day_date > to) continue
        out.push({ trip: e.title, trip_id: e.id, date: d.day_date, run: c.run, car_id: c.id, description: c.description, driver: c.driver_label ?? 'A parent',
          leave_by: c.leave_by ?? null, left_at: c.left_at ?? null, arrived_at: c.arrived_at ?? null, meet_at: d.meet_at ?? null, meet_place: d.meet_place ?? null })
      }
      return ok(out.sort((a, b) => a.date.localeCompare(b.date) || (a.run === 'home') - (b.run === 'home')))
    },
  },
}
