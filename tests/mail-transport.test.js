import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { createMailer, readMailCredentials } from '../supabase/functions/_shared/mail.js'

const FROM = 'Techmen 5669 <coach@school.example>'
const OLD = 'retired.sender@gmail.com' // invented address
const legacy = { GMAIL_USER: OLD, GMAIL_APP_PASSWORD: 'stand-in-password' }
let workspace, publicKey
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  publicKey = pair.publicKey
  workspace = {
    EMAIL_FROM: FROM,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'mailer@project.example.iam.gserviceaccount.com',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`,
  }
})
const get = (values) => (key) => values[key]
const message = { to: ['parent.one@example.org', 'parent.two@example.org'], subject: 'Réponse for Juniper', content: 'Your link:\nhttps://app.example/e/invented-token\n你好', html: '<p>Réponse</p>' }
const decode = (value) => Buffer.from(value, 'base64url').toString('utf8')
const unword = (value) => value.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b64) => Buffer.from(b64, 'base64').toString('utf8'))

function setup(values = workspace, responder, factory = createMailer) {
  const requests = [], sends = [], options = []
  const close = vi.fn()
  class SMTP {
    constructor(config) { options.push(config) }
    async send(msg) { sends.push(msg) }
    close = close
  }
  const fetchImpl = vi.fn(async (url, init) => {
    requests.push({ url, ...init })
    return responder ? responder(url, init) : Response.json(url.includes('/token') ? { access_token: 'test-token', expires_in: 3600 } : { id: 'm1' })
  })
  let time = 1800000000000
  const mailer = factory({ SMTPClient: SMTP, getEnv: get(values), fetchImpl, now: () => time })
  return { mailer, requests, sends, options, close, fetchImpl, advance: (ms) => { time += ms } }
}

describe('one sender and credential reader', () => {
  test('all eight setup states choose Workspace only when all three settings exist', async () => {
    const keys = Object.keys(workspace)
    for (let mask = 0; mask < 8; mask++) {
      const values = { ...legacy, ...Object.fromEntries(keys.filter((_, i) => mask & (1 << i)).map(k => [k, workspace[k]])) }
      expect(readMailCredentials(get(values)).mode).toBe(mask === 7 ? 'workspace' : 'smtp')
      const t = setup(values)
      await t.mailer.send(message)
      expect(t.requests.length).toBe(mask === 7 ? 2 : 0)
      expect(t.sends.length).toBe(mask === 7 ? 0 : 1)
      if (mask !== 7) expect(t.options[0].connection.auth.username).toBe(OLD)
      await t.mailer.close()
    }
  })

  test('no credential skips without opening a connection or claiming delivery', () => {
    expect(readMailCredentials(get({}))).toBeNull()
    expect(setup({}).mailer).toBeNull()
    expect(setup(workspace).mailer).not.toBeNull()
  })

  test('legacy From, Reply-To, password, TLS and closing still work', async () => {
    const t = setup({ ...legacy, EMAIL_FROM: 'Legacy Team <old@school.example>', EMAIL_REPLY_TO: 'reply@school.example' })
    expect(t.options).toHaveLength(0)
    await t.mailer.send({ ...message, from: OLD, replyTo: OLD, headers: { From: OLD } })
    expect(t.sends[0]).toMatchObject({ from: 'Legacy Team <old@school.example>', replyTo: 'reply@school.example' })
    expect(t.sends[0]).not.toHaveProperty('headers')
    expect(t.options[0].connection).toEqual({ hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: OLD, password: legacy.GMAIL_APP_PASSWORD } })
    await t.mailer.close()
    expect(t.close).toHaveBeenCalledOnce()
  })

  test.each(['retired.sender@gmail.com', 'Retired <retired.sender@googlemail.com>', 'bad\r\nFrom: intruder@example.org', 'not an address'])('complete Workspace setup refuses a bad sender: %s', (from) => {
    expect(() => setup({ ...legacy, ...workspace, EMAIL_FROM: from })).toThrow(/mail_/)
    expect(setup({ ...legacy, ...workspace }).mailer).not.toBeNull()
  })
})

describe('delegated Gmail API', () => {
  test('signs a real RS256 assertion with send-only scope and the same mailbox as From', async () => {
    const t = setup({ ...legacy, ...workspace, EMAIL_REPLY_TO: OLD })
    await t.mailer.send({ ...message, from: OLD, replyTo: OLD, headers: { Sender: OLD } })
    expect(t.sends).toHaveLength(0)
    expect(t.requests).toHaveLength(2)
    const auth = t.requests[0]
    expect(auth.url).toBe('https://oauth2.googleapis.com/token')
    expect(auth.method).toBe('POST')
    const params = new URLSearchParams(auth.body)
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [head, body, signature] = params.get('assertion').split('.')
    expect(JSON.parse(decode(head))).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(decode(body))).toEqual({ iss: workspace.GOOGLE_SERVICE_ACCOUNT_EMAIL, sub: 'coach@school.example', scope: 'https://www.googleapis.com/auth/gmail.send', aud: auth.url, iat: 1800000000, exp: 1800003600 })
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${head}.${body}`))).toBe(true)
    const send = t.requests[1]
    expect(send.url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect(send.headers.Authorization).toBe('Bearer test-token')
    const mime = decode(JSON.parse(send.body).raw)
    expect(mime).toContain(`From: ${FROM}\r\nReply-To: coach@school.example\r\n`)
    expect(mime).not.toContain(OLD)
    expect(mime).not.toMatch(/\r\nSender:|\r\nBcc:/)
    expect(JSON.parse(send.body).raw).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(unword(mime)).toContain(message.subject)
    expect(mime).toContain('To: parent.one@example.org,\r\n parent.two@example.org')
    expect(mime).toContain('multipart/alternative')
    for (const content of [message.content, message.html]) expect(mime).toContain(Buffer.from(content).toString('base64'))
  })

  test('plain text, bare sender, escaped PEM newlines, long Unicode subject and named recipients survive MIME encoding', async () => {
    const t = setup({ ...workspace, EMAIL_FROM: 'coach@school.example', GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: workspace.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\n/g, '\\n') })
    const subject = 'Réponse 你好 '.repeat(30)
    await t.mailer.send({ to: 'Juniper Parent <juniper@example.org>', subject, content: message.content })
    const mime = decode(JSON.parse(t.requests[1].body).raw)
    expect(mime).not.toContain('multipart/')
    const encoded = mime.split('Subject: ')[1].split('\r\nMIME-Version:')[0]
    expect(encoded.split('\r\n ').map(unword).join('')).toBe(subject.trim())
    expect(Math.max(...encoded.split('\r\n').map(s => s.length))).toBeLessThanOrEqual(75)
    expect(mime).toContain('From: coach@school.example\r\nReply-To: coach@school.example')
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')
  })

  test('reuses a token in a batch and renews before expiry', async () => {
    const t = setup()
    await Promise.all([t.mailer.send(message), t.mailer.send(message)])
    expect(t.requests.filter(r => r.url.includes('/token'))).toHaveLength(1)
    expect(t.requests.filter(r => r.url.includes('/messages/send'))).toHaveLength(2)
    t.advance(3541000)
    await t.mailer.send(message)
    expect(t.requests.filter(r => r.url.includes('/token'))).toHaveLength(2)
    expect(t.requests.filter(r => r.url.includes('/messages/send'))).toHaveLength(3)
  })

  test.each(['oauth refusal', 'bad token', 'send refusal', 'bad receipt', 'network failure'])('%s is sanitized with no SMTP fallback or duplicate send', async (failure) => {
    const t = setup({ ...legacy, ...workspace }, (url) => {
      if (failure === 'network failure') throw new Error('secret material that must not escape')
      if (url.includes('/token')) return Response.json(failure === 'bad token' ? {} : { access_token: 'private-test-token' }, { status: failure === 'oauth refusal' ? 403 : 200 })
      return Response.json(failure === 'bad receipt' ? {} : { id: 'm1', secret: 'private-test-token' }, { status: failure === 'send refusal' ? 403 : 200 })
    })
    await expect(t.mailer.send(message)).rejects.toThrow(/^mail_workspace_(auth|send)_failed$/)
    expect(t.sends).toHaveLength(0)
    expect(t.requests.filter(r => r.url.includes('/messages/send')).length).toBeLessThanOrEqual(1)
    const control = setup()
    await control.mailer.send(message)
    expect(control.requests).toHaveLength(2)
  })

  test('invalid key never reaches Google, and never falls back to SMTP', async () => {
    const t = setup({ ...legacy, ...workspace, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: 'not-a-key' })
    await expect(t.mailer.send(message)).rejects.toThrow('mail_workspace_auth_failed')
    expect(t.requests).toHaveLength(0)
    expect(t.sends).toHaveLength(0)
    const control = setup()
    await control.mailer.send(message)
    expect(control.requests).toHaveLength(2)
  })

  test.each([{ subject: 'A\r\nBcc: intruder@example.org' }, { to: 'parent@example.org\r\nFrom: intruder@example.org' }, { to: [] }])('header injection and empty recipients fail before any request', async (override) => {
    const t = setup()
    await expect(t.mailer.send({ ...message, ...override })).rejects.toThrow(/mail_/)
    expect(t.requests).toHaveLength(0)
    await t.mailer.send(message)
    expect(t.requests).toHaveLength(2)
  })
})

test('mutation proof: the same sending oracle catches a leaked From, leaked Reply-To and wrong delegated user', async () => {
  const source = readFileSync(new URL('../supabase/functions/_shared/mail.js', import.meta.url), 'utf8')
  const oracle = (t) => {
    expect(t.requests).toHaveLength(2)
    const mime = decode(JSON.parse(t.requests[1].body).raw)
    const assertion = new URLSearchParams(t.requests[0].body).get('assertion')
    expect(mime).toContain(`From: ${FROM}\r\nReply-To: coach@school.example\r\n`)
    expect(mime.split('\r\n\r\n')[0]).not.toContain(OLD)
    expect(JSON.parse(decode(assertion.split('.')[1])).sub).toBe('coach@school.example')
  }
  const values = { ...legacy, ...workspace, EMAIL_REPLY_TO: OLD }
  const control = setup(values)
  await control.mailer.send(message)
  oracle(control)
  for (const [before, after] of [
    ["mode: 'workspace', from,", "mode: 'workspace', from: get('GMAIL_USER'),"],
    ['replyTo: mailbox, mailbox,', "replyTo: get('EMAIL_REPLY_TO'), mailbox,"],
    ['sub: config.mailbox,', 'sub: config.email,'],
  ]) {
    expect(source.split(before)).toHaveLength(2)
    const mutated = source.replace(before, after)
    const { createMailer: factory } = await import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}`)
    const t = setup(values, undefined, factory)
    await t.mailer.send(message)
    expect(() => oracle(t)).toThrow()
  }
})

test('every app send entrypoint imports shared mail and no route reads mail credentials independently', () => {
  const dir = new URL('../supabase/functions/', import.meta.url)
  const senders = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => [d.name, readFileSync(new URL(`${d.name}/index.ts`, dir), 'utf8')])
  const names = ['event-family', 'notice-mail', 'send-approval-email', 'send-parent-request']
  expect(senders.filter(([, src]) => /import .*SMTPClient/.test(src)).map(([name]) => name).sort()).toEqual(names)
  for (const [name, src] of senders) {
    expect(src).not.toMatch(/env\.get\(['"](?:EMAIL_FROM|EMAIL_REPLY_TO|GMAIL_|GOOGLE_SERVICE_ACCOUNT_)/)
    expect(src).not.toMatch(/new SMTPClient/)
    if (names.includes(name)) expect(src).toContain("import { createMailer } from '../_shared/mail.js'")
  }
  const walk = (url) => readdirSync(url, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(new URL(`${d.name}/`, url)) : /\.js$/.test(d.name) ? [new URL(d.name, url)] : [])
  for (const url of walk(new URL('../api/', import.meta.url))) {
    expect(readFileSync(url, 'utf8')).not.toMatch(/SMTPClient|nodemailer|denomailer|gmail\.googleapis\.com|api\.sendgrid|api\.mailgun/)
  }
})
