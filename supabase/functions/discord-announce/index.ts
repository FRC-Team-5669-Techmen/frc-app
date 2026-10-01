// @ts-nocheck -- see "WHY @ts-nocheck" below; it must be the file's first line.
//
// Supabase Edge Function: discord-announce
//
// An admin's announcement, posted to the team Discord through the same bot the
// calendar poster uses: a message, optional role pings, an optional poll or
// embed. Invoked from /announce with the admin's own JWT:
//
//   supabase.functions.invoke('discord-announce', { body: { action, draft, request_id } })
//
//   action 'status'   what is set up and what is missing (secret NAMES only)
//   action 'preview'  the dry run: validates and returns the exact payload, and
//                     checks the channel and every role against the server when
//                     the bot secrets are present. Posts nothing, logs nothing.
//   action 'send'     reserves a row in public.discord_announcements, posts,
//                     and records what Discord answered.
//
// AUTHORIZATION IS DECIDED HERE, NEVER BY THE BODY. JWT verification stays ON
// (this function is deliberately absent from supabase/config.toml, like
// invite-member), and the caller must be an admin by public.is_admin() asked
// with THEIR OWN token. The role ids that may be pinged come from the
// discord_announce_roles table read here, not from the request; the request
// only says which of those rows were ticked.
//
// THE PING GUARANTEE is allowed_mentions { parse: [], roles: [exactly the
// selected ids] }, built by buildAnnouncePayload below. @everyone, @here and
// every user mention are unresolvable whatever the text says.
//
// NO DOUBLE POST. The page mints request_id when the admin reaches the confirm
// step. The log row is inserted with it BEFORE Discord is called, and
// request_id is UNIQUE, so a double click, a retry after a dropped connection,
// or two tabs all collide on the constraint and only one of them posts. A
// definitive refusal from Discord marks the row 'failed'; no answer at all
// marks it 'unknown' (it MAY have posted) and nothing retries it.
//
// SECRETS (function secrets; the first two are the calendar poster's, by the
// same names): DISCORD_BOT_TOKEN, DISCORD_GUILD_ID. SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// None of them is ever returned or logged: anything leaving this function goes
// through scrub() first.
//
// DEPLOY (JWT verification ON, so no --no-verify-jwt):
//   npx supabase functions deploy discord-announce
// or paste this one file into Dashboard > Edge Functions > discord-announce.
// It is single-file on purpose so the Dashboard path works.
//
// WHY @ts-nocheck: the region between the SHARED markers is a byte-for-byte
// copy of src/discordAnnounce.js, which is plain JavaScript, and
// tests/discord-announce-drift.test.js fails if the two differ. Plain JS
// parameters are implicit-any under Deno's strict checker, so type checking is
// switched off for this file rather than letting the copy diverge.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
// Everything below is this function's own and is not copied anywhere.
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://discord.com/api/v10'
const UA = 'DiscordBot (https://github.com/FRC-Team-5669-Techmen/frc-app, 1.0) TechmenAnnounce'
const MIGRATION = 'migration 0003_discord_announcements.sql'

// The PostgREST / Postgres codes for "this table does not exist", i.e. the
// migration has not been applied. Same list as MISSING_TABLE_CODES in
// src/schemaMissing.js; the drift test compares them.
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Strip any secret value out of a string before it is returned or logged.
// Nothing here deliberately interpolates one; this makes an accident unseeable.
function scrub(value) {
  let out = typeof value === 'string' ? value : String(value ?? '')
  for (const name of ['DISCORD_BOT_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']) {
    const secret = Deno.env.get(name)
    if (secret && secret.length > 3) out = out.split(secret).join(`[${name} redacted]`)
  }
  return out
}

const json = (body, status = 200) =>
  new Response(scrub(JSON.stringify(body)), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const sleep = ms => new Promise(r => setTimeout(r, ms))

// One Discord REST call. A 429 is retried (at most twice) after the
// retry_after Discord names, because Discord guarantees a 429 was NOT
// processed. Nothing else is retried: a 5xx or a dropped connection on a POST
// may already have posted, and a second attempt is how sixty people get the
// same ping twice.
async function discordCall(token, method, path, body) {
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': UA,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (err) {
      return { ok: false, network: true, message: scrub(err?.message ?? err) }
    }
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = { message: text.slice(0, 300) } }
    if (res.status === 429 && attempt < 2) {
      const seconds = typeof data?.retry_after === 'number' ? data.retry_after : Number(res.headers.get('retry-after')) || 1
      await sleep(Math.min(Math.max(seconds, 0), 10) * 1000)
      continue
    }
    if (res.ok) return { ok: true, status: res.status, data }
    return { ok: false, status: res.status, code: data?.code, message: scrub(data?.message ?? res.statusText) }
  }
}

// Channels by NAME and roles by ID, read from the server on every call. No
// channel id is stored anywhere, exactly as the calendar poster works.
async function readGuild(token, guildId) {
  const [channels, roles] = await Promise.all([
    discordCall(token, 'GET', `/guilds/${guildId}/channels`),
    discordCall(token, 'GET', `/guilds/${guildId}/roles`),
  ])
  if (!channels.ok) return { error: channels }
  if (!roles.ok) return { error: roles }
  const channelsByName = new Map()
  for (const c of channels.data || []) {
    // 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT. Both accept messages.
    if (c.type === 0 || c.type === 5) channelsByName.set(String(c.name).toLowerCase(), c)
  }
  const rolesById = new Map()
  for (const r of roles.data || []) rolesById.set(String(r.id), r)
  return { channelsByName, rolesById }
}

// What the server says about this draft. `problems` refuse a send; `warnings`
// are shown and allowed.
function checkAgainstGuild(draft, roleRows, guild) {
  const channel = guild.channelsByName.get(draft.channel) || null
  const problems = []
  const warnings = []
  if (!channel) problems.push(`#${draft.channel} is not a text channel in the server.`)
  const roles = orderedRoleIds(draft, roleRows).map(id => {
    const row = roleRows.find(r => r.role_id === id)
    const live = guild.rolesById.get(id) || null
    if (!live) {
      problems.push(`"${row.name}" (${id}) is not a role in the server. Check that row's id in the role table.`)
    } else {
      if (!live.mentionable) {
        warnings.push(`@${live.name} is not mentionable in Discord, so the ping will show but notify nobody unless the bot has the Mention @everyone, @here, and All Roles permission.`)
      }
      if (live.name !== row.name) warnings.push(`The role table calls ${id} "${row.name}"; Discord calls it "${live.name}".`)
    }
    return { role_id: id, name: row.name, found: !!live, discord_name: live?.name ?? null, mentionable: live ? !!live.mentionable : null }
  })
  return { channel: { name: draft.channel, found: !!channel, id: channel?.id ?? null }, roles, problems, warnings }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, code: 'invalid', errors: [{ field: 'method', message: 'POST only.' }] }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const action = ['status', 'preview', 'send'].includes(body?.action) ? body.action : null
    if (!action) {
      return json({ ok: false, code: 'invalid', errors: [{ field: 'action', message: 'action must be status, preview or send.' }] }, 422)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // ── Who is asking. is_admin() keys off the caller's own JWT. ──
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ ok: false, code: 'signed_out', error: 'Not signed in.' }, 401)
    const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin')
    if (adminErr || isAdmin !== true) return json({ ok: false, code: 'forbidden', error: 'Admin role required.' }, 403)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

    // ── What is set up. Secret NAMES only, never a value. ──
    const token = Deno.env.get('DISCORD_BOT_TOKEN')
    const guildId = Deno.env.get('DISCORD_GUILD_ID')
    const missing = [
      !token && 'DISCORD_BOT_TOKEN',
      !guildId && 'DISCORD_GUILD_ID',
      guildId && !isSnowflake(guildId) && 'DISCORD_GUILD_ID (not a server id)',
    ].filter(Boolean)

    const { data: roleRows, error: rolesErr } = await admin
      .from('discord_announce_roles')
      .select('id, name, role_id, active, sort_order')
    const migrationMissing = !!rolesErr && MISSING_TABLE_CODES.includes(rolesErr.code)
    if (rolesErr && !migrationMissing) {
      return json({ ok: false, code: 'error', error: `Reading the role table failed: ${rolesErr.message}` }, 500)
    }

    if (action === 'status') {
      const all = [...missing, ...(migrationMissing ? [MIGRATION] : [])]
      return json({ ok: true, action, ready: all.length === 0, missing: all, channels: ANNOUNCE_CHANNELS })
    }
    if (migrationMissing) return json({ ok: false, code: 'needs_setup', missing: [MIGRATION] }, 503)

    // ── The draft, rebuilt from what arrived, checked against the table. ──
    const roles = roleRows ?? []
    const draft = normalizeDraft(body.draft)
    const errors = validateDraft(draft, { roles })
    for (const id of orderedRoleIds(draft, roles)) {
      if (isEveryoneRoleId(id, guildId)) {
        errors.push({ field: 'roles', message: `Role ${id} is the server's own id, which is the @everyone role. Fix that row in the role table.` })
      }
    }
    if (errors.length) return json({ ok: false, code: 'invalid', errors }, 422)
    const payload = buildAnnouncePayload(draft, { roles })

    if (action === 'preview') {
      if (missing.length) {
        return json({ ok: true, action, payload, guild_checked: false, missing, problems: [], warnings: [] })
      }
      const guild = await readGuild(token, guildId)
      if (guild.error) {
        return json({ ok: true, action, payload, guild_checked: false, missing: [], problems: [describeDiscordError(guild.error)], warnings: [] })
      }
      const checked = checkAgainstGuild(draft, roles, guild)
      return json({ ok: true, action, payload, guild_checked: true, missing: [], ...checked })
    }

    // ── send ──
    if (missing.length) return json({ ok: false, code: 'needs_setup', missing }, 503)
    const requestId = typeof body.request_id === 'string' && UUID_RE.test(body.request_id) ? body.request_id : null
    if (!requestId) {
      return json({ ok: false, code: 'invalid', errors: [{ field: 'request_id', message: 'Reload the page and confirm again.' }] }, 422)
    }

    const guild = await readGuild(token, guildId)
    if (guild.error) {
      return json({ ok: false, code: 'discord_error', status: 'failed', error: describeDiscordError(guild.error, draft.channel) }, 502)
    }
    const checked = checkAgainstGuild(draft, roles, guild)
    if (checked.problems.length) {
      return json({ ok: false, code: 'invalid', errors: checked.problems.map(message => ({ field: 'discord', message })) }, 422)
    }

    const { data: profile } = await admin.from('profiles').select('full_name, nickname').eq('id', user.id).maybeSingle()
    const roleIds = payload.allowed_mentions.roles
    const { data: logRow, error: logErr } = await admin
      .from('discord_announcements')
      .insert({
        request_id: requestId,
        sent_by: user.id,
        sender_name: profile?.nickname || profile?.full_name || null,
        channel_name: draft.channel,
        channel_id: checked.channel.id,
        content: payload.content ?? '',
        role_ids: roleIds,
        role_names: roleIds.map(id => roles.find(r => r.role_id === id)?.name ?? id),
        embed: payload.embeds ? payload.embeds[0] : null,
        poll: payload.poll ?? null,
        payload,
        status: 'pending',
      })
      .select('id')
      .single()

    if (logErr) {
      if (logErr.code === '23505') {
        // This request_id already reserved a row: a double click or a retry.
        // Report what that first attempt did; post nothing.
        const { data: prior } = await admin
          .from('discord_announcements')
          .select('id, status, discord_message_id')
          .eq('request_id', requestId)
          .maybeSingle()
        return json({ ok: false, code: 'already_sent', status: prior?.status ?? null, message_id: prior?.discord_message_id ?? null, log_id: prior?.id ?? null }, 409)
      }
      if (MISSING_TABLE_CODES.includes(logErr.code)) return json({ ok: false, code: 'needs_setup', missing: [MIGRATION] }, 503)
      return json({ ok: false, code: 'error', error: `Writing the log failed, so nothing was posted: ${logErr.message}` }, 500)
    }

    const posted = await discordCall(token, 'POST', `/channels/${checked.channel.id}/messages`, payload)
    if (posted.ok) {
      const messageId = String(posted.data?.id ?? '')
      const { error: upErr } = await admin
        .from('discord_announcements')
        .update({ status: 'sent', discord_message_id: messageId, sent_at: new Date().toISOString(), error: null })
        .eq('id', logRow.id)
      // The message is live whether or not that update landed; say both.
      return json({ ok: true, action, status: 'sent', message_id: messageId, channel: draft.channel, log_id: logRow.id, warnings: checked.warnings, log_error: upErr ? upErr.message : null })
    }

    const ambiguous = !!posted.network || posted.status >= 500
    const errorText = posted.network ? `No answer from Discord (${posted.message}).` : describeDiscordError(posted, draft.channel)
    await admin
      .from('discord_announcements')
      .update({ status: ambiguous ? 'unknown' : 'failed', error: errorText })
      .eq('id', logRow.id)
    return json({ ok: false, code: 'discord_error', status: ambiguous ? 'unknown' : 'failed', error: errorText, log_id: logRow.id }, 502)
  } catch (err) {
    console.error('[discord-announce] error', scrub(err?.stack ?? err))
    return json({ ok: false, code: 'error', error: scrub(err?.message ?? err) }, 500)
  }
})
