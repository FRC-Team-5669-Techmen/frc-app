// Shared with Node tests. No ambient credentials, network or database writes.
// The adapter supplies authenticated clients and fetch. Never retry a POST.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DISCORD = 'https://discord.com/api/v10'
const safeText = value => String(value ?? '').replace(/@(everyone|here)/gi, '@\u200b$1')

export function scoutingDiscordPayload(record) {
  const label = record.kind === 'observation' ? 'Match review' : 'Pit conversation'
  const provenance = record.payload?.source_scope === 'external' ? ` | Prior-event footage: ${record.payload.source_event}` : ''
  const note = record.kind === 'observation' ? record.payload?.notes : record.payload?.text
  return {
    content: safeText(`${label}${record.version > 1 ? ` | Correction v${record.version}` : ''} | Team ${record.team_number}${record.match_key ? ` | ${record.match_key}` : ''}${provenance}\n${note ?? ''}`).slice(0, 1900),
    allowed_mentions: { parse: [], roles: [], users: [], replied_user: false },
  }
}

export async function dispatchScouting({ userClient, serviceClient, body, env = {}, fetchImpl = fetch }) {
  if (!UUID.test(body?.record_id ?? '') || !Number.isInteger(body?.version) || body.version < 1) {
    return { http: 400, error: 'Choose a saved note and its version.', code: 'invalid' }
  }
  const auth = await userClient.auth.getUser()
  if (auth.error || !auth.data?.user) return { http: 401, error: 'Sign in to send this note.', code: 'unauthorized' }
  const read = await userClient.from('scouting_records').select('*').eq('id', body.record_id).maybeSingle()
  if (read.error || !read.data) return { http: 403, error: 'This note is unavailable to your account.', code: 'denied' }
  const record = read.data
  if (!['message', 'observation'].includes(record.kind) || record.payload?.request_delivery !== true) {
    return { http: 400, error: 'This record has no delivery request.', code: 'invalid' }
  }
  if (record.version !== body.version) return { http: 409, error: 'Refresh this note before sending its latest version.', code: 'conflict' }
  if (record.member_id !== auth.data.user.id) {
    const manager = await userClient.rpc('scouting_can_manage', { p_event: record.event_id })
    if (manager.error || manager.data !== true) return { http: 403, error: 'Only the author or scouting lead can send this note.', code: 'denied' }
  }

  // Reserve exactly one version atomically. Service credentials never decide
  // who may request a send: both user-scoped checks above have already passed.
  const claim = await serviceClient.rpc('scouting_claim_delivery', { p_record: record.id, p_version: record.version })
  if (claim.error || !claim.data?.delivery) return { http: 503, error: 'Delivery is unavailable. Your scouting note is saved.', code: 'delivery_unavailable' }
  const { delivery } = claim.data
  if (!claim.data.claimed) return { http: 200, status: delivery.status, delivery, message: 'This delivery was already reserved. It was not sent again.' }
  const finish = async (status, message, messageId = null) => {
    const done = await serviceClient.rpc('scouting_finish_delivery', {
      p_delivery: delivery.id, p_status: status, p_message_id: messageId, p_error: message,
    })
    // A failed receipt write is ambiguous even if Discord acknowledged the
    // message. The sending reservation remains and prevents another POST.
    if (done.error) return { http: 200, status: 'uncertain', delivery: { ...delivery, status: 'sending' }, message: 'Delivery receipt could not be saved. Check Discord before taking further action.' }
    return { http: 200, status, delivery: done.data, message }
  }
  if (env.SCOUTING_DISCORD_ENABLED !== 'true') {
    return finish('not_configured', 'Scouting Discord delivery is disabled. Your scouting note is saved.')
  }
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    return finish('not_configured', 'Discord is not configured. Your scouting note is saved.')
  }
  if (!/^\d{17,20}$/.test(env.DISCORD_GUILD_ID)) return finish('not_configured', 'Discord guild configuration is invalid.')
  const headers = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }
  let channel
  try {
    const response = await fetchImpl(`${DISCORD}/guilds/${env.DISCORD_GUILD_ID}/channels`, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' })
    if (!response.ok) return finish('failed', `Discord channel lookup failed (${response.status}). No message was posted.`)
    const channels = await response.json()
    const name = record.kind === 'observation' ? 'strategy' : 'scouting'
    channel = Array.isArray(channels) && channels.find(c => c.name === name && c.type === 0 && /^\d{17,20}$/.test(c.id))
    if (!channel) return finish('not_configured', `The #${name} text channel is unavailable. No message was posted.`)
  } catch {
    return finish('failed', 'Discord channel lookup was unavailable. No message was posted.')
  }
  try {
    const response = await fetchImpl(`${DISCORD}/channels/${channel.id}/messages`, {
      method: 'POST', headers, body: JSON.stringify(scoutingDiscordPayload(claim.data.record ?? record)),
      signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (response.status >= 400 && response.status < 500) return finish('failed', `Discord refused the message (${response.status}). Retry only after resolving the refusal.`)
    if (!response.ok) return finish('uncertain', 'Discord did not confirm delivery. Check the channel; this note will not automatically resend.')
    const receipt = await response.json()
    if (!/^\d{17,20}$/.test(receipt?.id ?? '')) return finish('uncertain', 'Discord returned no valid receipt. Check the channel; this note will not automatically resend.')
    return finish('delivered', null, receipt.id)
  } catch {
    return finish('uncertain', 'The connection ended without a receipt. Check Discord; this note will not automatically resend.')
  }
}
