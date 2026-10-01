// No INVISIBLE characters in the announcement sources.
//
// The mass-mention guard works by putting a zero-width space between '@' and
// 'everyone'. It used to be written as the literal character, which no editor,
// diff or review shows: a line reading `const ZWSP = ''` that is not empty, and
// that one careless "trailing junk" cleanup turns into an empty string -- at
// which point @everyone pings the whole server again and every test that
// compares against the same invisible literal still passes. It is now the
// escape '\u200b', and this file keeps it that way in the authority, its
// byte-for-byte copy in the Edge Function, and the tests that pin them.
//
// Positive controls: the detector does flag a source holding the literal, and
// the escape really produces U+200B at runtime.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { buildAnnouncePayload, neutralizeMassMentions } from '../src/discordAnnounce.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = p => readFileSync(join(root, p), 'utf8')

const FILES = [
  'src/discordAnnounce.js',
  'supabase/functions/discord-announce/index.ts',
  'tests/discord-announce.test.js',
  'tests/discord-announce-drift.test.js',
  'tests/discord-announce-function.test.js',
  'tests/discord-announce-source.test.js',
]

// Zero-width and other format characters that render as nothing: U+200B-U+200F,
// the line/paragraph separators, U+2060-U+2064 and the BOM used mid-file. Built
// from escapes so this file does not contain what it looks for.
const INVISIBLE = new RegExp('[\\u200b-\\u200f\\u2028\\u2029\\u2060-\\u2064\\ufeff]', 'g')

function invisibles(source) {
  const out = []
  source.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(INVISIBLE)) {
      out.push(`line ${i + 1}: U+${m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    }
  })
  return out
}

describe('the announcement sources hold no invisible characters', () => {
  for (const f of FILES) {
    test(f, () => {
      expect(invisibles(read(f))).toEqual([])
    })
  }

  test('positive control: the detector flags the literal it guards against', () => {
    expect(invisibles(`const ZWSP = '${String.fromCodePoint(0x200b)}'`)).toEqual(['line 1: U+200B'])
    expect(invisibles('const ZWSP = \'\\u200b\'')).toEqual([])
  })

  test('both copies spell the separator as the escape', () => {
    for (const f of FILES.slice(0, 2)) expect(read(f)).toContain("const ZWSP = '\\u200b'")
  })
})

describe('the escape is still a real zero-width space at runtime', () => {
  test('neutralised text carries U+200B between @ and the word', () => {
    const out = neutralizeMassMentions('@everyone')
    expect([...out].map(c => c.codePointAt(0))).toEqual([0x40, 0x200b, ...[...'everyone'].map(c => c.codePointAt(0))])
    expect(out).not.toBe('@everyone')
  })

  test('the built payload carries it too, and still parses no mention', () => {
    const p = buildAnnouncePayload({ channel: 'announcements', content: 'Shop opens at 4. @here', roleIds: [] }, { roles: [] })
    expect(p.content).toContain('@\u200bhere')
    expect(p.content).not.toMatch(/@here/)
    expect(p.allowed_mentions.parse).toEqual([])
  })
})
