// An announcement drafted from a schedule event (feedback 1e00dfc5, ledger
// 0016): /schedule's Announce, for an admin, opens /announce?event=<id> with
// the message and an embed filled from the event. Pure, so
// tests/announce-from-event.test.js drives it. It ticks no role: which roles
// to ping is always the admin's pick (decision 35; nothing guesses an id).
// Dates are written without weekday names.

const TZ = 'America/Los_Angeles'
const day = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date(iso))
const time = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export function eventWhen(ev) {
  if (!ev?.starts_at) return ''
  const sameDay = ev.ends_at && day(ev.starts_at) === day(ev.ends_at)
  if (!ev.ends_at) return `${day(ev.starts_at)}, ${time(ev.starts_at)}`
  return sameDay
    ? `${day(ev.starts_at)}, ${time(ev.starts_at)} to ${time(ev.ends_at)}`
    : `${day(ev.starts_at)}, ${time(ev.starts_at)} to ${day(ev.ends_at)}, ${time(ev.ends_at)}`
}

/** -> { content, embedTitle, embedDesc } */
export function eventAnnouncementDraft(ev) {
  const title = String(ev?.title ?? '').trim() || 'Team event'
  const when = eventWhen(ev)
  const lines = [`**${title}**`, [when, ev?.location ? `at ${String(ev.location).trim()}` : ''].filter(Boolean).join(' ')]
  if (ev?.mandatory) lines.push('Mandatory: every member comes.')
  if (ev?.rsvp_enabled) lines.push('Say if you are going in the app, under Schedule.')
  const notes = String(ev?.notes ?? '').trim()
  return {
    content: lines.filter(Boolean).join('\n'),
    embedTitle: title.slice(0, 256),
    embedDesc: [when, ev?.location ? `Where: ${String(ev.location).trim()}` : '', notes].filter(Boolean).join('\n').slice(0, 4096),
  }
}
