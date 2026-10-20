// The member handbook in the app (/handbook): the text, the lessons that teach
// it, and the diagrams placed in it.
//
// The handbook is the team's rulebook, so the failure this guards is quiet: a
// rule edited in handbook.md while a lesson question keeps teaching the old
// wording, a diagram that drops out of the text, or a dash that the style
// rules forbid. Every assertion that something is ABSENT is paired with a
// control that the same helper finds something PRESENT, so a parser that
// returned nothing could not pass.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parseHandbook, sectionText, glossaryOf, agreementsOf, plain } from '../src/handbook/content.js'
import { LESSONS, TERM_MATCHES, HANDBOOK_VERSION } from '../src/handbook/lessons.js'
import { DIAGRAMS } from '../src/handbook/diagrams.js'

const md = readFileSync(fileURLToPath(new URL('../src/handbook/handbook.md', import.meta.url)), 'utf8')
const hb = parseHandbook(md)
const textOf = nums => nums.map(n => sectionText(hb.sections.find(s => s.num === n))).join(' ')

describe('the handbook text', () => {
  test('has the at-a-glance section and 24 numbered sections, in order', () => {
    expect(hb.sections[0].id).toBe('glance')
    const nums = hb.sections.filter(s => s.num).map(s => s.num)
    expect(nums).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
  })

  test('carries the version members sign', () => {
    expect(hb.version).toBe('October 20, 2026')
    const [y, m, d] = HANDBOOK_VERSION.split('-').map(Number)
    expect(new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })).toBe(hb.version)
  })

  test('has no em or en dash, no review tag and no draft note', () => {
    expect(md.match(/[\u2013\u2014]/g)).toBeNull()
    expect(md.match(/\((decided|proposed)/g)).toBeNull()
    expect(md.includes('Review notes')).toBe(false)
    // control: the same reads find what is there
    expect(md.match(/Rule of Three/g)?.length).toBeGreaterThan(0)
  })

  test('places all seven diagrams exactly once, and every one exists', () => {
    const placed = hb.sections.flatMap(s => s.blocks.filter(b => b.type === 'diagram').map(b => b.key))
    expect(placed.sort()).toEqual(Object.keys(DIAGRAMS).sort())
    expect(placed).toHaveLength(7)
    for (const svg of Object.values(DIAGRAMS)) {
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).not.toMatch(/--cds-/)
      expect(svg).toMatch(/var\(--hb-ink\)/)
    }
  })

  test('the parser reads tables, nested lists and inline links', () => {
    const who = hb.sections.find(s => s.num === 2).blocks.find(b => b.type === 'table')
    expect(who.head).toEqual(['Question', 'Ask', 'How'])
    expect(who.rows).toHaveLength(6)
    const reporting = sectionText(hb.sections.find(s => s.num === 14))
    expect(reporting).toContain('wants to meet outside robotics')
    expect(plain('see [FIRST](https://www.firstinspires.org) now')).toBe('see FIRST now')
    // A link inside bold reads as its words, and no section leaks raw link
    // markup (the FIRST Code of Conduct line did, and overflowed the phone).
    expect(plain('**The [FIRST Code](https://x.org), in short:** go')).toBe('The FIRST Code, in short: go')
    const leaks = hb.sections.filter(s => s.num).filter(s => s.blocks.some(b =>
      [b.text, ...(b.items ?? []).flatMap(it => [it.text, ...it.children]), ...(b.rows ?? []).flat()]
        .filter(Boolean).some(t => plain(t).includes(']('))))
    expect(leaks.map(s => s.num)).toEqual([])
  })

  test('the glossary and the signature agreements are read in full', () => {
    const g = glossaryOf(hb)
    expect(g.length).toBe(38)
    expect(g.find(x => x.term === 'SAFE-1')?.def).toMatch(/shop safety/)
    const ag = agreementsOf(hb)
    expect(ag.student).toHaveLength(8)
    expect(ag.parent).toHaveLength(5)
  })
})

describe('the lessons', () => {
  test('18 lessons cover sections 1 to 22 once each, two questions apiece', () => {
    expect(LESSONS).toHaveLength(18)
    const covered = LESSONS.flatMap(l => l.sections).sort((a, b) => a - b)
    expect(covered).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    for (const l of LESSONS) expect(l.questions).toHaveLength(2)
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(18)
  })

  test('every question quotes the rule from its own lesson sections', () => {
    const missing = []
    for (const l of LESSONS) {
      const text = textOf(l.sections)
      for (const q of l.questions) if (!text.includes(q.quote)) missing.push(`${l.id}: ${q.quote}`)
    }
    expect(missing).toEqual([])
    // control: the same check does catch a quote that is not there
    expect(textOf([7]).includes('Leave early whenever you like.')).toBe(false)
  })

  test('every answer index points at one of three options', () => {
    for (const l of LESSONS) for (const q of l.questions) {
      expect(q.o).toHaveLength(3)
      expect(q.a).toBeGreaterThanOrEqual(0)
      expect(q.a).toBeLessThan(3)
    }
  })

  test('every lesson line and question is free of dashes and weekday names', () => {
    const words = LESSONS.flatMap(l => [l.title, l.rule, ...l.questions.flatMap(q => [q.q, ...q.o])]).join(' ')
    expect(words.match(/[\u2013\u2014]/g)).toBeNull()
    expect(words.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g)).toBeNull()
    expect(words).toMatch(/Kickoff/)
  })

  test('every underlined term has a glossary entry, and is used in the text', () => {
    const terms = new Set(glossaryOf(hb).map(g => g.term))
    const all = hb.sections.map(sectionText).join(' ').toLowerCase()
    for (const [term, spellings] of TERM_MATCHES) {
      expect(terms.has(term), term).toBe(true)
      expect(spellings.some(s => all.includes(s.toLowerCase())), term).toBe(true)
    }
  })
})
