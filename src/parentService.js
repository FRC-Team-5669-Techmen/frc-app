// Actual named-parent intervals. RSVP adult counts never create hours.
import { toCsv } from './csv'
export const PARENT_SERVICE_COLUMNS = [
  ['event', 'Event'], ['parent', 'Parent name'], ['student', 'Student name'], ['school_id', 'Student school ID'],
  ['date', 'Date'], ['start', 'Start time'], ['end_date', 'End date'], ['end', 'End time'], ['hours', 'Hours'], ['total', 'Parent event total hours'],
]
const fixed = n => (Math.round(n * 100) / 100).toFixed(2)
export function parentServiceRows(parents, event) {
  const zone = event.timezone || 'America/Los_Angeles'
  const day = iso => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const clock = iso => new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  return parents.flatMap(p => {
    const sessions = [...p.sessions].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    const total = fixed(sessions.reduce((n, s) => n + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3600e3, 0))
    return sessions.map(s => ({ event: event.title, parent: p.name, student: p.student, school_id: p.school_id,
      date: day(s.starts_at), start: clock(s.starts_at), end_date: day(s.ends_at), end: clock(s.ends_at), hours: fixed((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3600e3), total }))
  })
}
export const parentServiceCsv = (parents, event) => toCsv(PARENT_SERVICE_COLUMNS, parentServiceRows(parents, event))
