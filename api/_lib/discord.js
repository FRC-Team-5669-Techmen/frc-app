// Minimal Discord REST client for the calendar cron.
//
// Deliberately plain `fetch` rather than @discordjs/rest: that package is a
// devDependency used by the ops script (scripts/discord/provision.js) and this
// function needs exactly four calls. Node 18+ has global fetch, so this adds no
// runtime dependency to the deployed bundle.
//
// The bot token is read from process.env by the CALLER and passed in — it is
// never imported here from anywhere Vite can see. Nothing in api/ is part of
// the client bundle, and the var is not VITE_-prefixed, so it cannot be inlined
// into dist/ by import.meta.env.

const API = 'https://discord.com/api/v10'
const UA = 'DiscordBot (https://github.com/techmen5669/frc-app, 1.0) TechmenCalendarCron'

export class DiscordError extends Error {
  constructor(message, { status, code, body, path } = {}) {
    super(message)
    this.name = 'DiscordError'
    this.status = status
    this.code = code
    this.body = body
    this.path = path
  }
}

const wait = ms => new Promise(r => setTimeout(r, ms))

/**
 * @param {object} opts
 * @param {string} opts.token        bot token (server-side only)
 * @param {function} [opts.onEvent]  (action, detail) => void — for the log table
 * @param {function} [opts.sleep]    injectable for tests
 * @param {function} [opts.fetchImpl]
 */
export function createDiscord({ token, onEvent = () => {}, sleep = wait, fetchImpl = fetch }) {
  if (!token) throw new Error('createDiscord: missing bot token')

  // The sync engine swaps in its own sink once it has a run_id, so every 429 we
  // honour lands in discord_calendar_log alongside the posts.
  let sink = onEvent
  const emit = (action, detail) => { try { sink(action, detail) } catch { /* logging must never break a request */ } }

  // Politeness gate: when a bucket reports zero remaining we park until it
  // resets rather than racing into a 429 we would then have to honour anyway.
  let parkedUntil = 0

  async function request(method, path, { body, reason, retries = 5 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const now = Date.now()
      if (parkedUntil > now) await sleep(parkedUntil - now)

      const headers = {
        Authorization: `Bot ${token}`,
        'User-Agent': UA,
      }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      if (reason) headers['X-Audit-Log-Reason'] = reason

      let res
      try {
        res = await fetchImpl(`${API}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (netErr) {
        // Transport failure (DNS, socket). Retry with backoff, then give up.
        if (attempt >= retries) throw new DiscordError(`network error on ${method} ${path}: ${netErr.message}`, { path })
        await sleep(Math.min(2 ** attempt * 500, 8000))
        continue
      }

      // ── 429: honour retry_after, NEVER a fixed delay ──────────────────────
      if (res.status === 429) {
        const parsed = await safeJson(res)
        // Body carries seconds as a float; the Retry-After header is the
        // fallback when the body is not JSON (e.g. a Cloudflare-level ban).
        const bodySeconds = typeof parsed?.retry_after === 'number' ? parsed.retry_after : null
        const headerSeconds = Number(res.headers.get('retry-after'))
        const seconds = bodySeconds ?? (Number.isFinite(headerSeconds) ? headerSeconds : 1)
        const ms = Math.ceil(seconds * 1000)
        const scope = parsed?.global ? 'global' : (res.headers.get('x-ratelimit-scope') || 'bucket')
        emit('rate_limited', { path, method, retry_after_ms: ms, scope, attempt })
        if (attempt >= retries) {
          throw new DiscordError(`rate limited ${retries + 1}x on ${method} ${path}`, { status: 429, path, body: parsed })
        }
        parkedUntil = Date.now() + ms
        await sleep(ms)
        continue
      }

      // Park proactively when the bucket is exhausted.
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        const resetAfter = Number(res.headers.get('x-ratelimit-reset-after'))
        if (Number.isFinite(resetAfter) && resetAfter > 0) {
          parkedUntil = Math.max(parkedUntil, Date.now() + Math.ceil(resetAfter * 1000))
        }
      }

      if (res.status >= 500 && attempt < retries) {
        await sleep(Math.min(2 ** attempt * 500, 8000))
        continue
      }

      if (!res.ok) {
        const parsed = await safeJson(res)
        throw new DiscordError(
          `${method} ${path} → ${res.status} ${parsed?.message || res.statusText}`,
          { status: res.status, code: parsed?.code, body: parsed, path },
        )
      }

      if (res.status === 204) return null
      return await safeJson(res)
    }
  }

  async function safeJson(res) {
    const text = await res.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return { raw: text.slice(0, 500) } }
  }

  return {
    /** Redirect internal events (429s) to the caller's logger. */
    onEventSink(fn) { sink = fn },

    request,

    /**
     * Resolve every channel and role in the guild to its snowflake, BY NAME.
     * No snowflake is ever hardcoded in this repo: the guild is the source of
     * truth, so a channel renamed or recreated in Discord is picked up on the
     * next run instead of silently posting into a dead ID.
     *
     * Discord channel names are stored lowercase; role names are not, so both
     * maps are keyed on a normalised (lowercased, trimmed) name.
     */
    async resolveGuild(guildId) {
      const [channels, roles] = await Promise.all([
        request('GET', `/guilds/${guildId}/channels`),
        request('GET', `/guilds/${guildId}/roles`),
      ])
      const channelsByName = new Map()
      for (const c of channels || []) {
        // 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT. Both accept messages.
        if (c.type !== 0 && c.type !== 5) continue
        channelsByName.set(norm(c.name), c)
      }
      const rolesByName = new Map()
      for (const r of roles || []) rolesByName.set(norm(r.name), r)
      return { channelsByName, rolesByName }
    },

    createMessage(channelId, payload) {
      return request('POST', `/channels/${channelId}/messages`, { body: payload })
    },

    editMessage(channelId, messageId, payload) {
      return request('PATCH', `/channels/${channelId}/messages/${messageId}`, { body: payload })
    },
  }
}

export const norm = s => String(s || '').trim().toLowerCase().replace(/^#/, '')
