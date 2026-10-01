// THE DISCORD-ANNOUNCE DRIFT GUARD.
//
// src/discordAnnounce.js is the one authority for what an announcement looks
// like. The Edge Function cannot import it (it is pasted into the Dashboard
// editor as one file), so it carries a byte-for-byte copy of the region between
// the SHARED markers. This file fails when the copy drifts, and does not stop
// at comparing text: it RUNS the function's copy against the same drafts as the
// authority, so "identical" means identical behaviour, not just a matching
// diff.
//
// It also holds three smaller duplicates in step: the snowflake pattern and the
// status vocabulary between the module and migration 0003, the missing-table
// codes between the function and src/schemaMissing.js, and the rule that this
// function keeps JWT verification ON (it is absent from supabase/config.toml).

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import * as authority from '../src/discordAnnounce.js'
import { MISSING_TABLE_CODES } from '../src/schemaMissing.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = p => readFileSync(join(root, p), 'utf8')

const OPEN = '// >>> SHARED discordAnnounce >>>'
const CLOSE = '// <<< SHARED discordAnnounce <<<'

function region(source) {
  const a = source.indexOf(OPEN)
  const b = source.indexOf(CLOSE)
  if (a < 0 || b < 0 || b < a) return null
  if (source.indexOf(OPEN, a + 1) >= 0 || source.indexOf(CLOSE, b + 1) >= 0) return null
  return source.slice(a, b + CLOSE.length)
}

// The first line where two regions part company, or null when they agree.
function firstDifference(a, b) {
  const x = a.split('\n')
  const y = b.split('\n')
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return { line: i + 1, authority: x[i], copy: y[i] }
  }
  return null
}

const SRC = read('src/discordAnnounce.js')
const FN = read('supabase/functions/discord-announce/index.ts')
const SQL = read('supabase/migrations/0003_discord_announcements.sql')

describe('the function carries the authority\'s region, byte for byte', () => {
  const mine = region(SRC)
  const theirs = region(FN)

  test('both files have exactly one region, and it is the real thing', () => {
    expect(mine).not.toBeNull()
    expect(theirs).not.toBeNull()
    expect(mine).toContain('export function buildAnnouncePayload')
    expect(mine).toContain('payload.allowed_mentions = { parse: [], roles: orderedRoleIds(draft, roles) }')
    expect(mine.split('\n').length).toBeGreaterThan(200)
  })

  test('identical', () => {
    expect(firstDifference(mine, theirs)).toBeNull()
  })

  test('positive control: a one-character change in the copy is caught, with its line', () => {
    const mutated = theirs.replace('parse: [], roles:', 'parse: [\'everyone\'], roles:')
    expect(mutated).not.toBe(theirs)
    const diff = firstDifference(mine, mutated)
    expect(diff).not.toBeNull()
    expect(diff.copy).toContain('everyone')
  })

  test('the function\'s copy RUNS and builds the same payload as the authority', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'announce-drift-'))
    const file = join(dir, 'copy.mjs')
    writeFileSync(file, theirs)
    const copy = await import(pathToFileURL(file).href)

    const roles = [
      { name: 'Mechanical', role_id: '100000000000000001', active: true, sort_order: 1 },
      { name: 'Programming', role_id: '100000000000000003', active: true, sort_order: 3 },
      { name: 'Retired', role_id: '100000000000000004', active: false, sort_order: 4 },
    ]
    const drafts = [
      { content: '@everyone shop is open', roleIds: ['100000000000000003', '100000000000000001'] },
      { channel: '#Parents', content: '', poll: { question: 'Drive Saturday?', answers: ['Yes', 'No', 'Maybe'], durationHours: '48', allowMultiselect: true } },
      { content: 'Build kickoff', embed: { title: 'Kickoff', description: 'Line one\r\nLine two' }, roleIds: ['100000000000000004'] },
      { content: '', roleIds: [], poll: { question: 'Bad', answers: ['Only'], durationHours: 0 } },
      { channel: 'mentor-chat', content: 'x'.repeat(2100) },
    ]
    for (const raw of drafts) {
      const a = authority.normalizeDraft(raw)
      const b = copy.normalizeDraft(raw)
      expect(b).toEqual(a)
      expect(copy.validateDraft(b, { roles })).toEqual(authority.validateDraft(a, { roles }))
      expect(JSON.stringify(copy.buildAnnouncePayload(b, { roles })))
        .toBe(JSON.stringify(authority.buildAnnouncePayload(a, { roles })))
    }
    expect(copy.ANNOUNCE_LIMITS).toEqual(authority.ANNOUNCE_LIMITS)
    expect(copy.ANNOUNCE_CHANNELS).toEqual(authority.ANNOUNCE_CHANNELS)
  })
})

describe('migration 0003 agrees with the module', () => {
  test('the role_id CHECK is SNOWFLAKE_RE', () => {
    const m = SQL.match(/discord_announce_roles_role_id_snowflake_chk check \(role_id ~ '([^']+)'\)/)
    expect(m).not.toBeNull()
    expect(m[1]).toBe(authority.SNOWFLAKE_RE.source)
    // And the log's role_ids CHECK repeats the same digit count.
    expect(SQL).toContain(`'^([0-9]{17,20}(,[0-9]{17,20})*)?$'`)
  })

  test('the status CHECK is ANNOUNCE_STATUSES, in order', () => {
    const m = SQL.match(/discord_announcements_status_chk check \(status in \(([^)]+)\)\)/)
    expect(m).not.toBeNull()
    const values = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
    expect(values).toEqual([...authority.ANNOUNCE_STATUSES])
    // Control: the parser reads a real list, not an empty one.
    expect(values).toHaveLength(4)
  })

  test('the role-name CHECK length is ANNOUNCE_LIMITS.roleName', () => {
    expect(SQL).toContain(`length(btrim(name)) between 1 and ${authority.ANNOUNCE_LIMITS.roleName}`)
  })
})

describe('the function\'s own small duplicates', () => {
  test('missing-table codes match src/schemaMissing.js', () => {
    const m = FN.match(/const MISSING_TABLE_CODES = \[([^\]]+)\]/)
    expect(m).not.toBeNull()
    expect([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])).toEqual([...MISSING_TABLE_CODES])
  })

  test('JWT verification stays ON: not in config.toml, while the cron functions are', () => {
    const toml = read('supabase/config.toml')
    expect(toml).not.toMatch(/\[functions\.discord-announce\]/)
    // Control: the file is the real config, with the entries it is known to have.
    expect(toml).toMatch(/\[functions\.discord-calendar\]/)
    expect(toml).toMatch(/\[functions\.calendar-feed\]/)
  })

  test('the function authorises with is_admin() on the caller\'s client, before any service-role read', () => {
    const rpc = FN.indexOf("userClient.rpc('is_admin')")
    const service = FN.indexOf('createClient(SUPABASE_URL, SERVICE_KEY')
    expect(rpc).toBeGreaterThan(0)
    expect(service).toBeGreaterThan(rpc)
  })
})
