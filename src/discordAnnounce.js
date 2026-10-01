// Discord announcements: the payload builder, its limits, and the rules that
// decide what an admin is allowed to post.
//
// ONE AUTHORITY, TWO COPIES, AND A TEST THAT HOLDS THEM TOGETHER.
// The region between the two SHARED markers below is copied BYTE FOR BYTE into
// supabase/functions/discord-announce/index.ts. The Edge Function cannot import
// from src/ (it is pasted into the Dashboard editor as one file, and nothing
// under supabase/functions/ may be part of the Vite build or the other way
// round), so the copy is unavoidable. tests/discord-announce-drift.test.js
// fails the moment the two regions differ by one byte, and also RUNS the
// function's copy against the same fixtures as this one. Edit this file first,
// then paste the region over the function's copy.
//
// What lives in the region is everything the server must decide for itself:
// the limits, the channel allow-list, validation, and the exact payload. The
// page renders its preview from the same builder, so what the admin approves is
// what the function sends -- and the dry run compares the two.
//
// Pure module: no React, no Supabase, no network, no environment. The region is
// plain JavaScript with no TypeScript syntax so the same bytes run in Node,
// the browser and Deno.
//
// Sources for every Discord number below (fetched 2026-10-01):
//   docs.discord.com/developers/resources/message  content, embeds, allowed_mentions
//   docs.discord.com/developers/resources/poll     poll create request, limits
//   docs.discord.com/developers/topics/permissions SEND_POLLS, MENTION_EVERYONE

// >>> SHARED discordAnnounce >>>
// Discord's documented limits, plus the few that are this app's own (marked).
export const ANNOUNCE_LIMITS = Object.freeze({
  content: 2000,           // message content, role pings included
  embedTitle: 256,
  embedDescription: 4096,
  embedTotal: 6000,        // every embed's text in one message, combined
  roleMentions: 100,       // allowed_mentions.roles
  roleName: 100,           // a Discord role name
  pollQuestion: 300,
  pollAnswer: 55,
  pollAnswersMax: 10,
  pollAnswersMin: 2,       // APP RULE: Discord documents no minimum
  pollHoursMin: 1,         // APP RULE: Discord documents no minimum; hours are whole
  pollHoursMax: 768,       // 32 days
})

// Where an announcement may go. Channel NAMES, resolved to ids in the guild on
// every send, exactly as the calendar poster resolves #calendar: no channel
// snowflake is stored anywhere. #announcements is the default and the one
// SERVER_SPEC section 11 names; the other three are the channels each audience
// can actually read (section 4). The bot needs its permissions in each.
export const ANNOUNCE_CHANNELS = Object.freeze(['announcements', 'general', 'event-logistics', 'parents'])
export const DEFAULT_ANNOUNCE_CHANNEL = 'announcements'

// The published Techmen Gold, as a Discord embed colour (an integer, not CSS).
export const ANNOUNCE_EMBED_COLOR = 0xffe629

// Discord's only poll layout today (DEFAULT = 1).
export const POLL_LAYOUT_DEFAULT = 1

// A Discord id: an unsigned 64-bit integer written in decimal. 17 digits is
// the shortest any real role id has, 20 is the most a uint64 can be. The SQL
// CHECK on discord_announce_roles.role_id is this same pattern; the drift test
// compares them.
export const SNOWFLAKE_RE = /^[0-9]{17,20}$/

// discord_announcements.status, in the order a row moves through them:
//   pending  reserved before the Discord call, so a retried request finds it
//   sent     Discord confirmed; discord_message_id is set
//   failed   Discord refused; nothing was posted
//   unknown  the call left and no answer came back. It MAY have posted.
export const ANNOUNCE_STATUSES = Object.freeze(['pending', 'sent', 'failed', 'unknown'])

const ZWSP = '​'
const asText = v => (typeof v === 'string' ? v : '')
const unixNewlines = s => s.replace(/\r\n?/g, '\n')

export function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE_RE.test(value)
}

// In Discord the @everyone role's id IS the guild id, so a row carrying the
// guild id is a server-wide ping wearing a role's name. Refused outright.
export function isEveryoneRoleId(roleId, guildId) {
  return !!roleId && !!guildId && String(roleId) === String(guildId)
}

// allowed_mentions { parse: [] } is the guarantee that @everyone and @here
// cannot fire. This is the second layer: a zero-width space after the @, so the
// text does not even LOOK like a mass ping in the channel.
export function neutralizeMassMentions(text) {
  return asText(text).replace(/@(everyone|here)\b/gi, `@${ZWSP}$1`)
}

// Role rows in a fixed order (sort_order, then name, then id) so the pings, the
// preview and the server payload come out identical everywhere. Plain string
// comparison, not localeCompare, so Node, Deno and every browser agree.
export function sortRoles(roles) {
  const key = s => asText(s).toLowerCase()
  return (Array.isArray(roles) ? roles : []).slice().sort((a, b) =>
    (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0)
    || (key(a?.name) < key(b?.name) ? -1 : key(a?.name) > key(b?.name) ? 1 : 0)
    || (asText(a?.role_id) < asText(b?.role_id) ? -1 : asText(a?.role_id) > asText(b?.role_id) ? 1 : 0))
}

export function activeRoles(roles) {
  return sortRoles(roles).filter(r => r && r.active !== false && isSnowflake(r.role_id))
}

/**
 * Coerce whatever arrived (a form, a request body) into the one draft shape the
 * rest of this module reads. Never trusts a type: a non-string role id is
 * dropped rather than stringified, because a JavaScript number cannot hold a
 * snowflake exactly and a rounded id would be someone else's role.
 */
export function normalizeDraft(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const channel = asText(d.channel).trim().toLowerCase().replace(/^#/, '') || DEFAULT_ANNOUNCE_CHANNEL
  const content = unixNewlines(asText(d.content)).trim()

  const roleIds = []
  for (const id of Array.isArray(d.roleIds) ? d.roleIds : []) {
    if (typeof id !== 'string') continue
    const s = id.trim()
    if (s && !roleIds.includes(s)) roleIds.push(s)
  }

  let embed = null
  if (d.embed && typeof d.embed === 'object') {
    const title = asText(d.embed.title).trim()
    const description = unixNewlines(asText(d.embed.description)).trim()
    if (title || description) embed = { title, description }
  }

  let poll = null
  if (d.poll && typeof d.poll === 'object') {
    // Discord's own default is 24 hours. Only a number or a numeric string is
    // read as a duration; anything else becomes NaN and fails validation.
    const hours = d.poll.durationHours
    const durationHours = hours === undefined || hours === null ? 24
      : typeof hours === 'number' ? hours
      : typeof hours === 'string' && hours.trim() !== '' ? Number(hours)
      : NaN
    poll = {
      question: asText(d.poll.question).trim(),
      answers: (Array.isArray(d.poll.answers) ? d.poll.answers : [])
        .map(a => asText(a).trim())
        .filter(Boolean),
      durationHours,
      allowMultiselect: d.poll.allowMultiselect === true,
    }
  }

  return { channel, content, roleIds, embed, poll }
}

// The selected role ids that are ACTIVE rows in the role table, in table order.
// Anything else is dropped here and reported by validateDraft.
export function orderedRoleIds(draft, roles) {
  const wanted = new Set(draft?.roleIds || [])
  return activeRoles(roles).filter(r => wanted.has(r.role_id)).map(r => r.role_id)
}

// Pings on their own first line, then the message. This is the whole content
// Discord receives, so its length is the one checked against the limit.
export function composeContent(draft, roles) {
  const pings = orderedRoleIds(draft, roles).map(id => `<@&${id}>`).join(' ')
  const body = neutralizeMassMentions(draft?.content)
  return [pings, body].filter(Boolean).join('\n')
}

/**
 * Every reason this draft cannot be sent, as { field, message }. Empty means it
 * may go. The function runs this on what it RECEIVED, against the role table it
 * read itself, so nothing the browser says is taken on trust.
 */
export function validateDraft(draft, { roles = [] } = {}) {
  const L = ANNOUNCE_LIMITS
  const errors = []
  const add = (field, message) => errors.push({ field, message })

  if (!ANNOUNCE_CHANNELS.includes(draft.channel)) {
    add('channel', `#${draft.channel} is not on the announce list (${ANNOUNCE_CHANNELS.map(c => `#${c}`).join(', ')}).`)
  }

  const known = new Set(activeRoles(roles).map(r => r.role_id))
  for (const id of draft.roleIds) {
    if (!isSnowflake(id)) add('roles', `"${id}" is not a Discord role id.`)
    else if (!known.has(id)) add('roles', `Role ${id} is not an active row in the role table.`)
  }
  if (draft.roleIds.length > L.roleMentions) {
    add('roles', `Discord allows at most ${L.roleMentions} role pings in one message.`)
  }

  if (!draft.content && !draft.embed && !draft.poll) {
    add('content', 'Write a message, add an embed, or add a poll.')
  }

  const content = composeContent(draft, roles)
  if (content.length > L.content) {
    add('content', `The message is ${content.length} characters including role pings; Discord's limit is ${L.content}.`)
  }

  if (draft.embed) {
    const { title, description } = draft.embed
    if (title.length > L.embedTitle) add('embed', `The embed title is ${title.length} characters; the limit is ${L.embedTitle}.`)
    if (description.length > L.embedDescription) {
      add('embed', `The embed text is ${description.length} characters; the limit is ${L.embedDescription}.`)
    }
    if (title.length + description.length > L.embedTotal) {
      add('embed', `The embed is ${title.length + description.length} characters in all; the limit is ${L.embedTotal}.`)
    }
  }

  if (draft.poll) {
    const { question, answers, durationHours } = draft.poll
    if (!question) add('poll', 'The poll needs a question.')
    else if (question.length > L.pollQuestion) {
      add('poll', `The poll question is ${question.length} characters; the limit is ${L.pollQuestion}.`)
    }
    if (answers.length < L.pollAnswersMin) add('poll', `A poll needs at least ${L.pollAnswersMin} answers.`)
    if (answers.length > L.pollAnswersMax) add('poll', `Discord allows at most ${L.pollAnswersMax} answers.`)
    answers.forEach((a, i) => {
      if (a.length > L.pollAnswer) add('poll', `Answer ${i + 1} is ${a.length} characters; the limit is ${L.pollAnswer}.`)
    })
    const seen = new Set()
    for (const a of answers) {
      const k = a.toLowerCase()
      if (seen.has(k)) { add('poll', `"${a}" is listed twice.`); break }
      seen.add(k)
    }
    if (!Number.isInteger(durationHours) || durationHours < L.pollHoursMin || durationHours > L.pollHoursMax) {
      add('poll', `A poll runs for a whole number of hours from ${L.pollHoursMin} to ${L.pollHoursMax} (32 days).`)
    }
  }

  // APP RULE. Discord's docs do not say a poll and an embed may share a
  // message, and a poll cannot be edited once posted, so a combination that is
  // refused at send time cannot be fixed afterwards. Keep them apart.
  if (draft.embed && draft.poll) {
    add('poll', 'A poll is sent without an embed. Put the detail in the message text instead.')
  }

  return errors
}

/**
 * The exact JSON body for POST /channels/{id}/messages. Call validateDraft
 * first; this assumes a valid draft.
 *
 * allowed_mentions is ALWAYS { parse: [], roles: [exactly the selected ids] }.
 * parse: [] means Discord resolves no @everyone, no @here and no user mention
 * out of the text, whatever the text says; roles lists the only roles that
 * notify. A role mention typed by hand into the message renders but does not
 * ping unless that role was also selected.
 */
export function buildAnnouncePayload(draft, { roles = [] } = {}) {
  const payload = {}
  const content = composeContent(draft, roles)
  if (content) payload.content = content

  if (draft.embed) {
    const embed = {}
    if (draft.embed.title) embed.title = draft.embed.title
    if (draft.embed.description) embed.description = draft.embed.description
    embed.color = ANNOUNCE_EMBED_COLOR
    payload.embeds = [embed]
  }

  if (draft.poll) {
    payload.poll = {
      question: { text: draft.poll.question },
      answers: draft.poll.answers.map(text => ({ poll_media: { text } })),
      duration: draft.poll.durationHours,
      allow_multiselect: draft.poll.allowMultiselect,
      layout_type: POLL_LAYOUT_DEFAULT,
    }
  }

  payload.allowed_mentions = { parse: [], roles: orderedRoleIds(draft, roles) }
  return payload
}

/** A Discord error, said in a sentence an admin can act on. Names no secret. */
export function describeDiscordError({ status, code, message } = {}, channel = '') {
  const where = channel ? `#${channel}` : 'that channel'
  if (status === 401) return 'Discord rejected the bot token. Check the DISCORD_BOT_TOKEN function secret.'
  if (code === 50001) return `The bot cannot see ${where}. Give it View Channel there.`
  if (code === 50013) {
    return `The bot is missing a permission in ${where}. It needs View Channel and Send Messages, plus Embed Links for an embed and Send Polls for a poll.`
  }
  if (code === 10003) return `${where} no longer exists in the server.`
  if (code === 10004) return 'The bot is not in the server named by DISCORD_GUILD_ID.'
  if (code === 50035) return `Discord rejected the message as invalid: ${message || 'no detail'}`
  return `Discord answered ${status || 'with an error'}${code ? ` (code ${code})` : ''}: ${message || 'no detail'}`
}
// <<< SHARED discordAnnounce <<<

// ─────────────────────────────────────────────────────────────────────────────
// Client-only helpers. Below the region on purpose: the function never needs
// them, so they are not copied and not drift-tested.
// ─────────────────────────────────────────────────────────────────────────────

// Duration choices the composer offers. The server accepts any whole hour from
// 1 to 768; these are just the common ones.
export const POLL_DURATION_PRESETS = Object.freeze([
  { hours: 1, label: '1 hour' },
  { hours: 4, label: '4 hours' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
  { hours: 336, label: '2 weeks' },
])

/**
 * The content string split into text and role-mention pieces, for the preview.
 * A role id with no row in the table still renders, as its raw id, so a typed
 * mention never disappears from what the admin is approving.
 */
export function splitMentions(content, roles) {
  const byId = new Map(sortRoles(roles).map(r => [r.role_id, r]))
  const out = []
  const re = /<@&([0-9]+)>/g
  let last = 0
  let m
  const text = asText(content)
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) })
    const row = byId.get(m[1])
    out.push({ type: 'role', id: m[1], name: row ? row.name : m[1], known: !!row })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}

/**
 * A role-table row as the admin typed it, checked the same way the database
 * CHECKs will check it, so the form can say why before the insert does.
 */
export function validateRoleRow(row) {
  const errors = []
  const name = asText(row?.name).trim()
  const id = asText(row?.role_id).trim()
  if (!name) errors.push('Give the role a name.')
  else if (name.length > ANNOUNCE_LIMITS.roleName) errors.push(`A role name is at most ${ANNOUNCE_LIMITS.roleName} characters.`)
  if (!id) errors.push('Paste the role id from Discord.')
  else if (!SNOWFLAKE_RE.test(id)) errors.push('A role id is 17 to 20 digits and nothing else. Copy it from Discord; never type one from memory.')
  return errors
}

/**
 * What a supabase.functions.invoke('discord-announce') outcome means for the
 * page. Takes plain values so it is testable without a client:
 *   errorName  the supabase-js error class name, if invoke returned an error
 *   status     the HTTP status, when there was a response
 *   body       the parsed JSON body, when there was one
 *
 * The function never answers 404 itself, so a 404 is the gateway saying the
 * function does not exist; a fetch error is the same thing seen through CORS
 * (the gateway's 404 carries no CORS header), or no network at all.
 */
export function classifyInvoke({ errorName = null, status = null, body = null } = {}) {
  if (errorName === 'FunctionsFetchError') {
    return { kind: 'not_deployed', message: 'The announce function is not deployed yet, or could not be reached.' }
  }
  if (errorName === 'FunctionsRelayError') {
    return { kind: 'unreachable', message: 'Supabase could not reach the announce function. Try again in a minute.' }
  }
  if (status === 404) {
    return { kind: 'not_deployed', message: 'The announce function is not deployed yet.' }
  }
  const code = body && typeof body === 'object' ? body.code : null
  if (code === 'needs_setup') {
    const missing = Array.isArray(body.missing) ? body.missing : []
    return { kind: 'needs_setup', missing, message: `Needs setup: ${missing.join(', ') || 'see the setup steps'}.` }
  }
  if (status === 401) return { kind: 'signed_out', message: 'Your session has expired. Sign in again.' }
  if (status === 403 || code === 'forbidden') return { kind: 'forbidden', message: 'Only an admin can post announcements.' }
  if (code === 'invalid') {
    const errors = Array.isArray(body.errors) ? body.errors : []
    return { kind: 'invalid', errors, message: errors.map(e => e.message).join(' ') || 'The server refused this draft.' }
  }
  if (code === 'already_sent') {
    return { kind: 'already_sent', status: body.status ?? null, messageId: body.message_id ?? null,
      message: 'This exact send was already submitted. Check the log below before composing it again.' }
  }
  if (code === 'discord_error') {
    const unknown = body.status === 'unknown'
    return {
      kind: unknown ? 'unknown_outcome' : 'discord_error',
      message: unknown
        ? `Discord did not confirm the post. Check the channel before sending again: it may already be there. (${body.error || 'no answer'})`
        : body.error || 'Discord refused the message.',
    }
  }
  if (body && body.ok === true) return { kind: 'ok', body }
  return { kind: 'error', message: (body && body.error) || (status ? `The announce function answered ${status}.` : 'The announce function failed.') }
}
