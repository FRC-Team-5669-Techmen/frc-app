// NAMES ARE RESOLVED AGAINST WHAT HIS OWN ACCOUNT CAN READ, NEVER GUESSED.
// An ambiguous or unknown name writes nothing and says so, naming the
// candidates so Claude can ask him the one question.
import { laDateKey, laMidnightMs, addDays } from './dates.js'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@. ]/g, ' ').replace(/\s+/g, ' ').trim()
export const displayName = (p) => (p?.nickname?.trim() || p?.full_name?.trim() || (p?.email ? p.email.split('@')[0] : 'Member'))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every member, as admin_get_members answers it to him (admin only, so this is also his gate). */
export async function roster(ctx) {
  if (ctx.cache.has('roster')) return ctx.cache.get('roster')
  const r = await ctx.backend.rpc(ctx.session, 'admin_get_members', {})
  if (r.error) return { error: r.error }
  const out = { members: (r.data ?? []).map((m) => ({ ...m, name: displayName(m) })) }
  ctx.cache.set('roster', out)
  return out
}

/** Score how well `q` names a member; 0 is no match. */
export function matchScore(q, m) {
  const query = norm(q)
  if (!query) return 0
  const full = norm(m.full_name)
  const nick = norm(m.nickname)
  const email = norm(m.email)
  if (email && query === email) return 100
  if (query === nick || query === full) return 90
  const parts = full.split(' ').filter(Boolean)
  // A nickname like "Mr. Pina" or "Big Brandon Carrillo" is matched word by word too.
  const nickParts = nick.split(' ').filter((w) => w.length >= 2)
  // School addresses are first initial + last name ("mposada.2027@..."), so the local
  // part, its dotted pieces, and the local part minus its first letter name the member.
  const local = email.split('@')[0] ?? ''
  const localParts = local.split(/[.\-_]/).filter((w) => w && !/^\d+$/.test(w))
  const tokens = query.split(' ').filter(Boolean)
  if (tokens.length === 1) {
    const t = tokens[0]
    if (t === nick || parts[0] === t) return 70
    if (parts.includes(t) || nickParts.includes(t)) return 60
    if (localParts.includes(t) || local === t) return 50
    if (t.length >= 4 && localParts.some((w) => w.length > t.length && w.slice(1) === t)) return 45
    if (nick.startsWith(t) || parts.some((p) => p.startsWith(t)) || nickParts.some((p) => p.startsWith(t))) return t.length >= 3 ? 30 : 0
    return 0
  }
  // "Daniel R": every token starts some part of the name, in order of first and last.
  const first = tokens[0]
  const rest = tokens.slice(1)
  const firstOk = parts[0]?.startsWith(first) || nick.startsWith(first)
  const restOk = rest.every((t) => parts.slice(1).some((p) => p.startsWith(t)))
  return firstOk && restOk ? 80 : 0
}

/**
 * One member from a name. Answers {member} or {status: not_found | ambiguous, message, candidates}.
 * Only members whose status is not inactive/alumni are matched unless nothing else matches.
 */
export async function resolveMember(ctx, q) {
  const list = await roster(ctx)
  if (list.error) return { status: 'refused', message: list.error.message }
  if (UUID.test(String(q ?? '').trim())) {
    const hit = list.members.find((m) => m.id === String(q).trim())
    return hit ? { member: hit } : { status: 'not_found', message: 'No member has that id.' }
  }
  const scored = list.members.map((m) => ({ m, s: matchScore(q, m) })).filter((x) => x.s > 0)
  if (!scored.length) return { status: 'not_found', message: `Nobody on the team matches "${q}". Ask him for the full name or the email.` }
  const best = Math.max(...scored.map((x) => x.s))
  let top = scored.filter((x) => x.s === best).map((x) => x.m)
  const active = top.filter((m) => (m.status ?? 'active') === 'active')
  if (active.length) top = active
  if (top.length === 1) return { member: top[0] }
  return {
    status: 'ambiguous',
    message: `${top.length} members match "${q}": ${top.map((m) => `${m.name} (${m.email ?? 'no email'})`).join(', ')}. Ask him which.`,
    candidates: top.map((m) => ({ id: m.id, name: m.name, email: m.email, roles: m.roles })),
  }
}

/** One schedule event from a title, a date (YYYY-MM-DD) or an id. */
export async function resolveEvent(ctx, q) {
  const s = String(q ?? '').trim()
  if (UUID.test(s)) {
    const r = await ctx.backend.select(ctx.session, { table: 'events', columns: ['id', 'title', 'kind', 'starts_at', 'ends_at', 'location'], eq: { id: s }, limit: 1 })
    if (r.error) return { status: 'refused', message: r.error.message }
    return r.data[0] ? { event: r.data[0] } : { status: 'not_found', message: 'No event has that id.' }
  }
  const today = laDateKey(ctx.now())
  const from = new Date(laMidnightMs(addDays(today, -30))).toISOString()
  const to = new Date(laMidnightMs(addDays(today, 90))).toISOString()
  const r = await ctx.backend.select(ctx.session, {
    table: 'events', columns: ['id', 'title', 'kind', 'starts_at', 'ends_at', 'location'],
    gte: { starts_at: from }, lte: { starts_at: to }, order: [['starts_at', 'asc']], limit: 500,
  })
  if (r.error) return { status: 'refused', message: r.error.message }
  let hits
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) hits = r.data.filter((e) => laDateKey(e.starts_at) === s)
  else {
    const want = norm(s)
    hits = r.data.filter((e) => norm(e.title) === want)
    if (!hits.length) hits = r.data.filter((e) => norm(e.title).includes(want))
  }
  if (!hits.length) return { status: 'not_found', message: `No event in the last month or the next three matches "${s}". Ask him for the date.` }
  // Prefer the next one that has not ended.
  const upcoming = hits.filter((e) => Date.parse(e.ends_at) >= ctx.now())
  const pool = upcoming.length ? upcoming : hits
  if (pool.length === 1 || new Set(pool.map((e) => e.title)).size === 1) return { event: pool[0] }
  return {
    status: 'ambiguous',
    message: `${pool.length} events match "${s}": ${pool.slice(0, 6).map((e) => `${e.title} (${laDateKey(e.starts_at)})`).join(', ')}. Ask him which.`,
    candidates: pool.slice(0, 6).map((e) => ({ id: e.id, title: e.title, starts_at: e.starts_at })),
  }
}

/** A pending sign-out from the member's name. */
export async function resolveSignout(ctx, q) {
  const m = await resolveMember(ctx, q)
  if (!m.member) return m
  const r = await ctx.backend.select(ctx.session, {
    table: 'signout_requests', columns: ['id', 'member_id', 'note', 'cleanup_confirmed', 'requested_at', 'location'],
    eq: { member_id: m.member.id, status: 'pending' }, order: [['requested_at', 'desc']], limit: 5,
  })
  if (r.error) return { status: r.error.code && ['42P01', 'PGRST205'].includes(r.error.code) ? 'not_set_up' : 'refused', message: r.error.message }
  if (!r.data.length) return { status: 'not_found', message: `${m.member.name} has no sign-out waiting.` }
  const req = r.data[0]
  return { member: { ...m.member, request_id: req.id, note: req.note, cleanup_confirmed: req.cleanup_confirmed, requested_at: req.requested_at } }
}

/** A battery from its label ("B07", "b7", "7"), against what his account can read (0026). */
export async function resolveBattery(ctx, q) {
  const r = await ctx.backend.select(ctx.session, { table: 'batteries', columns: ['id', 'label', 'status', 'charge_state'], limit: 500 })
  if (r.error) return { status: r.error.code && ['42P01', 'PGRST205'].includes(r.error.code) ? 'not_set_up' : 'refused', message: r.error.code && ['42P01', 'PGRST205'].includes(r.error.code) ? 'The battery log is not set up yet: its SQL has not been pasted into Supabase. Nothing was changed.' : r.error.message }
  const key = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(\d)/, '$1$2')
  const want = key(q)
  if (!want) return { status: 'not_found', message: 'Which battery? Ask him for its label, such as B07.' }
  let hits = r.data.filter((b) => key(b.label) === want)
  // "7" names B07 when only one battery's number is 7.
  if (!hits.length && /^\d+$/.test(want)) hits = r.data.filter((b) => key(b.label).replace(/^[A-Z]+/, '') === want)
  if (hits.length === 1) return { battery: hits[0] }
  if (!hits.length) return { status: 'not_found', message: `No battery is labeled "${q}". The labels are ${r.data.map((b) => b.label).sort().slice(0, 30).join(', ') || 'none yet'}.` }
  return { status: 'ambiguous', message: `${hits.length} batteries match "${q}": ${hits.map((b) => b.label).join(', ')}. Ask him which.`, candidates: hits.map((b) => ({ id: b.id, label: b.label })) }
}

/**
 * Several members at once, for a change made to many (set_member_status). A
 * list, or one string separated by commas or "and". Every name must resolve
 * to exactly one member; the first that does not answers for the whole call,
 * so nothing is written until every name is settled.
 */
export async function resolveMembers(ctx, q) {
  const raw = Array.isArray(q) ? q : String(q ?? '').split(/\s*(?:,|;|\n|\band\b)\s*/i)
  const names = [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))]
  if (!names.length) return { status: 'invalid', message: 'Name at least one member. Nothing was changed.' }
  if (names.length > 200) return { status: 'invalid', message: 'At most 200 members in one change. Nothing was changed.' }
  const hits = []
  for (const n of names) {
    const r = await resolveMember(ctx, n)
    if (!r.member) return { ...r, message: `${r.message} (for "${n}"; nothing was changed for anyone)`, name: n }
    if (!hits.some((h) => h.id === r.member.id)) hits.push(r.member)
  }
  return { members: { ids: hits.map((m) => m.id), names: hits.map((m) => m.name), list: hits } }
}

export const RESOLVERS = { member: resolveMember, members: resolveMembers, event: resolveEvent, signout: resolveSignout, battery: resolveBattery }
