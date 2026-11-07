// Weekly totals use the worked LA date, not approval time or device time.
import { laDateKey, sessionsFromEvents, isSessionCounted } from './hoursUtils.js'

export function weekRange(now = Date.now(), offset = 0) {
  const d = new Date(`${laDateKey(now)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7 + offset * 7)
  const from = d.toISOString().slice(0, 10)
  d.setUTCDate(d.getUTCDate() + 7)
  return { from, to: d.toISOString().slice(0, 10) }
}
export function weeklyHours({ events = [], sessions, logged = [], reviews = [], now = Date.now(), offset = 0 }) {
  const { from, to } = weekRange(now, offset)
  const excluded = new Set(reviews.filter(r => ['pending', 'voided'].includes(r.status)).map(r => r.checkout_id))
  const inside = date => date >= from && date < to
  const attendance = (sessions ?? sessionsFromEvents(events)).filter(s => inside(laDateKey(s.inTime)) && isSessionCounted(s, excluded)).reduce((n, s) => n + s.ms / 3600000, 0)
  // Callers with an already verified-only read may omit status.
  const manual = logged.filter(l => (l.status === undefined || l.status === 'verified') && inside(l.date)).reduce((n, l) => n + (Number(l.hours) || 0), 0)
  return { from, to, hours: attendance + manual, attendance, logged: manual }
}
