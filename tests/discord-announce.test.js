// The announcement payload builder (src/discordAnnounce.js).
//
// What is pinned here is what goes to Discord: who gets pinged, what cannot be
// pinged, and every limit Discord documents. Each refusal is paired with the
// same fixture driven the other way, so a builder that stopped producing
// anything (or a validator that refused everything) fails here instead of
// passing as "nothing leaked".

import { describe, expect, test } from 'vitest'
import {
  ANNOUNCE_CHANNELS, ANNOUNCE_EMBED_COLOR, ANNOUNCE_LIMITS, DEFAULT_ANNOUNCE_CHANNEL,
  activeRoles, buildAnnouncePayload, classifyInvoke, composeContent, describeDiscordError,
  isEveryoneRoleId, isSnowflake, neutralizeMassMentions, normalizeDraft, orderedRoleIds,
  splitMentions, validateDraft, validateRoleRow,
} from '../src/discordAnnounce.js'

// Fictional ids, the shape of real ones. Never a real guild's.
const ROLES = [
  { id: 'r1', name: 'Programming', role_id: '100000000000000003', active: true, sort_order: 30 },
  { id: 'r2', name: 'Mechanical', role_id: '100000000000000001', active: true, sort_order: 10 },
  { id: 'r3', name: 'Electrical', role_id: '100000000000000002', active: true, sort_order: 20 },
  { id: 'r4', name: 'Student', role_id: '100000000000000009', active: false, sort_order: 90 },
]
const MECH = '100000000000000001'
const ELEC = '100000000000000002'
const PROG = '100000000000000003'
const STUDENT = '100000000000000009'

const draft = (over = {}) => normalizeDraft({ channel: 'announcements', content: 'Shop opens at 3:15.', roleIds: [], ...over })
const fields = errors => errors.map(e => e.field)
const build = d => buildAnnouncePayload(d, { roles: ROLES })

describe('allowed_mentions is exactly the selected roles, and nothing else can ping', () => {
  test('two of three active roles selected: exactly those two, in table order, parse empty', () => {
    const d = draft({ roleIds: [PROG, MECH] })
    expect(validateDraft(d, { roles: ROLES })).toEqual([])
    const p = build(d)
    expect(p.allowed_mentions).toEqual({ parse: [], roles: [MECH, PROG] })
    expect(Object.keys(p.allowed_mentions).sort()).toEqual(['parse', 'roles'])
    expect(p.content).toBe(`<@&${MECH}> <@&${PROG}>\nShop opens at 3:15.`)
  })

  test('positive control: no roles selected means an empty roles list and no ping text', () => {
    const p = build(draft())
    expect(p.allowed_mentions).toEqual({ parse: [], roles: [] })
    expect(p.content).not.toContain('<@&')
    // ...and the same draft with a role DOES carry one, so the empty case is
    // not a builder that never emits pings.
    expect(build(draft({ roleIds: [ELEC] })).content).toContain(`<@&${ELEC}>`)
  })

  test('a role mention typed by hand renders but is not in allowed_mentions', () => {
    const p = build(draft({ content: `Ask <@&${PROG}> about it.`, roleIds: [MECH] }))
    expect(p.content).toContain(`<@&${PROG}>`)
    expect(p.allowed_mentions.roles).toEqual([MECH])
  })

  test('an id that is not an active row is refused, and never reaches allowed_mentions', () => {
    const d = draft({ roleIds: [STUDENT, '199999999999999999'] })
    const errors = validateDraft(d, { roles: ROLES })
    expect(errors).toHaveLength(2)
    expect(fields(errors)).toEqual(['roles', 'roles'])
    expect(orderedRoleIds(d, ROLES)).toEqual([])
    // Control: the inactive row becomes pingable the moment it is active.
    const live = ROLES.map(r => (r.role_id === STUDENT ? { ...r, active: true } : r))
    expect(validateDraft(draft({ roleIds: [STUDENT] }), { roles: live })).toEqual([])
    expect(buildAnnouncePayload(draft({ roleIds: [STUDENT] }), { roles: live }).allowed_mentions.roles).toEqual([STUDENT])
  })

  test('a non-string role id is dropped, not rounded into somebody else\'s role', () => {
    const d = normalizeDraft({ content: 'x', roleIds: [100000000000000001, MECH, MECH, ' '] })
    expect(d.roleIds).toEqual([MECH])
  })

  test('the server\'s own id (the @everyone role) is recognised as such', () => {
    expect(isEveryoneRoleId('100000000000000777', '100000000000000777')).toBe(true)
    expect(isEveryoneRoleId(MECH, '100000000000000777')).toBe(false)
    expect(isEveryoneRoleId(MECH, '')).toBe(false)
  })
})

describe('@everyone and @here are neutralised in the text as well as in allowed_mentions', () => {
  test('both are broken with a zero-width space, any case', () => {
    const out = neutralizeMassMentions('@everyone and @HERE, listen')
    expect(out).not.toMatch(/@everyone/i)
    expect(out).not.toMatch(/@here/i)
    expect(out).toBe('@\u200beveryone and @\u200bHERE, listen')
    const p = build(draft({ content: '@everyone shop is closed' }))
    expect(p.content).toBe('@\u200beveryone shop is closed')
    expect(p.allowed_mentions.parse).toEqual([])
  })

  test('positive control: ordinary words and emails are left alone', () => {
    expect(neutralizeMassMentions('everyone here at mr.pina@example.org')).toBe('everyone here at mr.pina@example.org')
    expect(neutralizeMassMentions('@heretic')).toBe('@heretic')
  })
})

describe('limits, each checked on both sides of the line', () => {
  const L = ANNOUNCE_LIMITS

  test('content: 2000 including pings', () => {
    const pings = `<@&${MECH}>\n`
    const at = draft({ content: 'a'.repeat(L.content - pings.length), roleIds: [MECH] })
    expect(composeContent(at, ROLES).length).toBe(L.content)
    expect(validateDraft(at, { roles: ROLES })).toEqual([])
    const over = draft({ content: 'a'.repeat(L.content - pings.length + 1), roleIds: [MECH] })
    expect(fields(validateDraft(over, { roles: ROLES }))).toEqual(['content'])
  })

  test('embed title 256, description 4096', () => {
    const ok = draft({ embed: { title: 't'.repeat(L.embedTitle), description: 'd'.repeat(L.embedDescription) } })
    expect(validateDraft(ok, { roles: ROLES })).toEqual([])
    const badTitle = draft({ embed: { title: 't'.repeat(L.embedTitle + 1), description: 'x' } })
    expect(fields(validateDraft(badTitle, { roles: ROLES }))).toEqual(['embed'])
    const badDesc = draft({ embed: { title: 'x', description: 'd'.repeat(L.embedDescription + 1) } })
    expect(fields(validateDraft(badDesc, { roles: ROLES }))).toEqual(['embed'])
  })

  test('poll question 300, answer 55', () => {
    const poll = (question, answers) => draft({ content: '', poll: { question, answers, durationHours: 24 } })
    expect(validateDraft(poll('q'.repeat(L.pollQuestion), ['Yes', 'No']), { roles: ROLES })).toEqual([])
    expect(fields(validateDraft(poll('q'.repeat(L.pollQuestion + 1), ['Yes', 'No']), { roles: ROLES }))).toEqual(['poll'])
    expect(validateDraft(poll('Q?', ['a'.repeat(L.pollAnswer), 'No']), { roles: ROLES })).toEqual([])
    expect(fields(validateDraft(poll('Q?', ['a'.repeat(L.pollAnswer + 1), 'No']), { roles: ROLES }))).toEqual(['poll'])
  })

  test('poll answers: 2 to 10, no duplicates', () => {
    const answers = n => Array.from({ length: n }, (_, i) => `Option ${i + 1}`)
    const poll = a => draft({ poll: { question: 'Which day?', answers: a, durationHours: 24 } })
    expect(fields(validateDraft(poll(answers(1)), { roles: ROLES }))).toEqual(['poll'])
    expect(validateDraft(poll(answers(2)), { roles: ROLES })).toEqual([])
    expect(validateDraft(poll(answers(10)), { roles: ROLES })).toEqual([])
    expect(fields(validateDraft(poll(answers(11)), { roles: ROLES }))).toEqual(['poll'])
    expect(fields(validateDraft(poll(['Tuesday', 'tuesday']), { roles: ROLES }))).toEqual(['poll'])
  })

  test('poll duration: whole hours from 1 to 768 (32 days)', () => {
    const poll = h => draft({ poll: { question: 'Q?', answers: ['A', 'B'], durationHours: h } })
    for (const ok of [1, 24, 768, '72']) expect(validateDraft(poll(ok), { roles: ROLES })).toEqual([])
    for (const bad of [0, 769, 1.5, 'soon', true, -4]) {
      expect(fields(validateDraft(poll(bad), { roles: ROLES }))).toEqual(['poll'])
    }
    // Discord's own default when no duration is given.
    expect(normalizeDraft({ poll: { question: 'Q?', answers: ['A', 'B'] } }).poll.durationHours).toBe(24)
  })

  test('nothing to send is refused; any one of text, embed or poll is enough', () => {
    expect(fields(validateDraft(draft({ content: '   ' }), { roles: ROLES }))).toEqual(['content'])
    expect(validateDraft(draft({ content: 'hi' }), { roles: ROLES })).toEqual([])
    expect(validateDraft(draft({ content: '', embed: { title: 'T' } }), { roles: ROLES })).toEqual([])
    expect(validateDraft(draft({ content: '', poll: { question: 'Q?', answers: ['A', 'B'] } }), { roles: ROLES })).toEqual([])
  })

  test('a poll and an embed are not sent together (app rule); either alone is fine', () => {
    const both = draft({ embed: { title: 'T' }, poll: { question: 'Q?', answers: ['A', 'B'] } })
    expect(fields(validateDraft(both, { roles: ROLES }))).toEqual(['poll'])
  })
})

describe('the channel allow-list', () => {
  test('only the four listed channels; #announcements by default', () => {
    expect(ANNOUNCE_CHANNELS).toEqual(['announcements', 'general', 'event-logistics', 'parents'])
    expect(normalizeDraft({ content: 'x' }).channel).toBe(DEFAULT_ANNOUNCE_CHANNEL)
    expect(normalizeDraft({ content: 'x', channel: '#General' }).channel).toBe('general')
    expect(fields(validateDraft(draft({ channel: 'mentor-chat' }), { roles: ROLES }))).toEqual(['channel'])
    for (const c of ANNOUNCE_CHANNELS) expect(validateDraft(draft({ channel: c }), { roles: ROLES })).toEqual([])
  })
})

describe('payload shape', () => {
  test('poll: question, answers as poll_media, duration, multiselect, layout 1; no answer_id', () => {
    const p = build(draft({ content: 'Vote by Friday.', poll: { question: 'Which Saturday?', answers: ['Oct 10', 'Oct 17'], durationHours: 72, allowMultiselect: true } }))
    expect(p.poll).toEqual({
      question: { text: 'Which Saturday?' },
      answers: [{ poll_media: { text: 'Oct 10' } }, { poll_media: { text: 'Oct 17' } }],
      duration: 72,
      allow_multiselect: true,
      layout_type: 1,
    })
    expect(JSON.stringify(p.poll)).not.toContain('answer_id')
    expect(p.embeds).toBeUndefined()
    expect(p.content).toBe('Vote by Friday.')
  })

  test('multiselect is off unless it is literally true', () => {
    const p = build(draft({ poll: { question: 'Q?', answers: ['A', 'B'], allowMultiselect: 'yes' } }))
    expect(p.poll.allow_multiselect).toBe(false)
  })

  test('embed: one embed, Techmen Gold, empty keys left out', () => {
    const p = build(draft({ embed: { title: 'Build season', description: '' } }))
    expect(p.embeds).toEqual([{ title: 'Build season', color: ANNOUNCE_EMBED_COLOR }])
    expect(ANNOUNCE_EMBED_COLOR).toBe(0xffe629)
    expect(p.poll).toBeUndefined()
    // An embed toggled on and left blank is no embed at all.
    expect(normalizeDraft({ content: 'x', embed: { title: ' ', description: '' } }).embed).toBeNull()
  })

  test('poll-only message carries no content key; key order is stable', () => {
    const p = build(draft({ content: '', poll: { question: 'Q?', answers: ['A', 'B'] } }))
    expect('content' in p).toBe(false)
    expect(Object.keys(p)).toEqual(['poll', 'allowed_mentions'])
    expect(Object.keys(build(draft({ roleIds: [MECH], embed: { title: 'T' } })))).toEqual(['content', 'embeds', 'allowed_mentions'])
  })

  test('the payload is deterministic: the same draft builds byte-identical JSON', () => {
    const d = draft({ roleIds: [PROG, ELEC], embed: { title: 'T', description: 'D' } })
    expect(JSON.stringify(build(d))).toBe(JSON.stringify(build(normalizeDraft(JSON.parse(JSON.stringify(d))))))
  })
})

describe('the role table', () => {
  test('active rows in sort order; inactive and malformed rows are not pingable', () => {
    const rows = [...ROLES, { name: 'Broken', role_id: '12', active: true, sort_order: 0 }]
    expect(activeRoles(rows).map(r => r.name)).toEqual(['Mechanical', 'Electrical', 'Programming'])
  })

  test('a row as typed: a snowflake and a name, or the reason it is not', () => {
    expect(validateRoleRow({ name: 'Programming', role_id: PROG })).toEqual([])
    expect(validateRoleRow({ name: '', role_id: PROG })).toHaveLength(1)
    expect(validateRoleRow({ name: 'Programming', role_id: '<@&100000000000000003>' })).toHaveLength(1)
    expect(validateRoleRow({ name: 'Programming', role_id: 'Programming' })).toHaveLength(1)
    expect(validateRoleRow({ name: 'x'.repeat(101), role_id: PROG })).toHaveLength(1)
    expect(isSnowflake(PROG)).toBe(true)
    expect(isSnowflake('1234567890123456')).toBe(false)   // 16 digits
    expect(isSnowflake('123456789012345678901')).toBe(false) // 21 digits
  })
})

describe('preview helpers', () => {
  test('splitMentions names known roles and keeps unknown ids visible', () => {
    const parts = splitMentions(`<@&${MECH}> <@&${ELEC}>\nhi <@&555555555555555555>`, ROLES)
    expect(parts.filter(p => p.type === 'role').map(p => [p.name, p.known])).toEqual([
      ['Mechanical', true], ['Electrical', true], ['555555555555555555', false],
    ])
    expect(parts.map(p => (p.type === 'text' ? p.text : `@${p.name}`)).join('')).toBe('@Mechanical @Electrical\nhi @555555555555555555')
  })
})

describe('classifyInvoke: every state the page has to tell apart', () => {
  test('not deployed: a fetch error and a gateway 404 both read as such', () => {
    expect(classifyInvoke({ errorName: 'FunctionsFetchError' }).kind).toBe('not_deployed')
    expect(classifyInvoke({ errorName: 'FunctionsHttpError', status: 404, body: { code: 'NOT_FOUND' } }).kind).toBe('not_deployed')
  })

  test('needs setup names what is missing; ok passes the body through', () => {
    const c = classifyInvoke({ errorName: 'FunctionsHttpError', status: 503, body: { ok: false, code: 'needs_setup', missing: ['DISCORD_BOT_TOKEN'] } })
    expect(c).toMatchObject({ kind: 'needs_setup', missing: ['DISCORD_BOT_TOKEN'] })
    expect(c.message).toContain('DISCORD_BOT_TOKEN')
    expect(classifyInvoke({ status: 200, body: { ok: true, ready: true } })).toMatchObject({ kind: 'ok', body: { ready: true } })
  })

  test('refusals: signed out, not admin, invalid, already sent', () => {
    expect(classifyInvoke({ errorName: 'FunctionsHttpError', status: 401, body: { code: 'signed_out' } }).kind).toBe('signed_out')
    expect(classifyInvoke({ errorName: 'FunctionsHttpError', status: 403, body: { code: 'forbidden' } }).kind).toBe('forbidden')
    const inv = classifyInvoke({ status: 422, body: { code: 'invalid', errors: [{ field: 'poll', message: 'A poll needs a question.' }] } })
    expect(inv).toMatchObject({ kind: 'invalid', message: 'A poll needs a question.' })
    expect(classifyInvoke({ status: 409, body: { code: 'already_sent', status: 'sent', message_id: '1' } })).toMatchObject({ kind: 'already_sent', status: 'sent' })
  })

  test('Discord refused vs Discord never answered are different states', () => {
    expect(classifyInvoke({ status: 502, body: { code: 'discord_error', status: 'failed', error: 'no perms' } })).toMatchObject({ kind: 'discord_error', message: 'no perms' })
    const u = classifyInvoke({ status: 502, body: { code: 'discord_error', status: 'unknown', error: 'timeout' } })
    expect(u.kind).toBe('unknown_outcome')
    expect(u.message).toContain('may already be there')
  })
})

describe('describeDiscordError names the fix, never a secret', () => {
  test('the common Discord codes', () => {
    expect(describeDiscordError({ status: 403, code: 50013 }, 'announcements')).toContain('Send Polls')
    expect(describeDiscordError({ status: 403, code: 50001 }, 'parents')).toContain('#parents')
    expect(describeDiscordError({ status: 401 })).toContain('DISCORD_BOT_TOKEN')
    expect(describeDiscordError({ status: 400, code: 50035, message: 'Invalid Form Body' })).toContain('Invalid Form Body')
    expect(describeDiscordError({ status: 418, code: 1, message: 'teapot' })).toContain('418')
  })
})
