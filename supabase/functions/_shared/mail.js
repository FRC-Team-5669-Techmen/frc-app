// One credential reader and delivery implementation for all app mail.
// Workspace setup, legacy fallback and Auth SMTP: docs/subsystems/mail.md.
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const utf8 = new TextEncoder()

function header(value) {
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/.test(value)) throw new Error('mail_invalid_header')
  return value.trim()
}

function address(value) {
  const clean = header(value)
  const match = /^(?:([^<>]+)\s+<([^<>]+)>|([^<>]+))$/.exec(clean)
  const mailbox = (match?.[2] ?? match?.[3] ?? '').trim()
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(mailbox)) throw new Error('mail_invalid_address')
  return { mailbox, label: match?.[1]?.trim() ?? '' }
}

export function readMailCredentials(get = (key) => Deno.env.get(key)) {
  const from = get('EMAIL_FROM')?.trim()
  const email = get('GOOGLE_SERVICE_ACCOUNT_EMAIL')?.trim()
  const privateKey = get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')?.trim()
  if (from && email && privateKey) {
    const { mailbox } = address(from)
    // Delegation needs a Workspace user, never a consumer Gmail identity.
    if (/@(?:gmail|googlemail)\.com$/i.test(mailbox)) throw new Error('mail_workspace_mailbox_required')
    return { mode: 'workspace', from, replyTo: mailbox, mailbox, email, privateKey }
  }

  // Staged setup must not interrupt existing notifications. Once all three
  // Workspace settings exist, failures never downgrade to the old sender.
  const user = get('GMAIL_USER')
  const password = get('GMAIL_APP_PASSWORD')
  if (!user || !password) return null
  return {
    mode: 'smtp', from: from || `Techmen 5669 <${user}>`,
    // Compatibility with ledger 0027 while the new credential is not configured.
    replyTo: get('EMAIL_REPLY_TO') || 'apina@boscotech.edu', user, password,
  }
}

function base64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
const base64url = (bytes) => base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const json64 = (value) => base64url(utf8.encode(JSON.stringify(value)))

// RFC 2047 encoded words, each below 75 characters, split at Unicode codepoints.
function encodedWords(value) {
  const chunks = []
  let chunk = ''
  for (const char of header(value)) {
    if (utf8.encode(chunk + char).length > 42) { chunks.push(chunk); chunk = '' }
    chunk += char
  }
  chunks.push(chunk)
  return chunks.map((s) => `=?UTF-8?B?${base64(utf8.encode(s))}?=`).join('\r\n ')
}

function mimeAddress(value) {
  const { mailbox, label } = address(value)
  if (!label) return mailbox
  const display = /^[A-Za-z0-9 ._-]+$/.test(label) ? label : encodedWords(label)
  return `${display} <${mailbox}>`
}

function mimeMessage(config, message) {
  const recipients = (Array.isArray(message.to) ? message.to : [message.to]).map(mimeAddress)
  if (!recipients.length) throw new Error('mail_missing_recipient')
  const headers = [
    `From: ${mimeAddress(config.from)}`, `Reply-To: ${mimeAddress(config.replyTo)}`,
    `To: ${recipients.join(',\r\n ')}`, `Subject: ${encodedWords(message.subject)}`, 'MIME-Version: 1.0',
  ]
  const part = (type, body) => [
    `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '',
    base64(utf8.encode(body ?? '')).match(/.{1,76}/g)?.join('\r\n') ?? '',
  ].join('\r\n')
  if (message.html) {
    const boundary = `techmen_${crypto.randomUUID()}`
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    return headers.join('\r\n') + '\r\n\r\n' + [
      `--${boundary}`, part('text/plain', message.content),
      `--${boundary}`, part('text/html', message.html), `--${boundary}--`, '',
    ].join('\r\n')
  }
  return headers.join('\r\n') + '\r\n' + part('text/plain', message.content)
}

export function createMailer({ SMTPClient, getEnv, fetchImpl = fetch, now = Date.now } = {}) {
  const config = readMailCredentials(getEnv)
  if (!config) return null
  if (config.mode === 'smtp') {
    let client
    return {
      async send({ to, subject, content, html }) {
        client ??= new SMTPClient({
          connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: config.user, password: config.password } },
        })
        // Neither a caller nor a queued row can override sender headers.
        await client.send({ from: header(config.from), replyTo: header(config.replyTo), to, subject: header(subject), content, ...(html ? { html } : {}) })
      },
      close: () => client?.close(),
    }
  }

  let token = null
  let pending = null
  async function accessToken() {
    if (token && token.expiresAt > now() + 60000) return token.value
    if (pending) return pending
    pending = (async () => {
      try {
        const issued = Math.floor(now() / 1000)
        const assertion = `${json64({ alg: 'RS256', typ: 'JWT' })}.${json64({
          iss: config.email, sub: config.mailbox, scope: SCOPE, aud: TOKEN_URL, iat: issued, exp: issued + 3600,
        })}`
        const pem = config.privateKey.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
        const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
        const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8.encode(assertion))
        const response = await fetchImpl(TOKEN_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${assertion}.${base64url(new Uint8Array(signature))}` }).toString(),
          signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (typeof data.access_token !== 'string' || !data.access_token) throw new Error()
        token = { value: data.access_token, expiresAt: now() + Math.min(Number(data.expires_in) || 0, 3600) * 1000 }
        return token.value
      } catch {
        // Provider errors can echo assertions or keys. Return only a fixed code.
        throw new Error('mail_workspace_auth_failed')
      }
    })()
    try { return await pending } finally { pending = null }
  }

  return {
    async send({ to, subject, content, html }) {
      const raw = base64url(utf8.encode(mimeMessage(config, { to, subject, content, html })))
      const bearer = await accessToken()
      try {
        const response = await fetchImpl(SEND_URL, {
          method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw }), signal: AbortSignal.timeout(15000),
        })
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (typeof data.id !== 'string' || !data.id) throw new Error()
      } catch {
        // No retry after an ambiguous send: a retry might deliver a duplicate.
        throw new Error('mail_workspace_send_failed')
      }
    },
    async close() {},
  }
}
