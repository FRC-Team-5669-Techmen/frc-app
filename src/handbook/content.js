// The member handbook, parsed. Pure module: no React, no Supabase.
//
// handbook.md is the release text of the Claude Doc "FRC Team 5669 Member
// Handbook" (its release tab), with each diagram embed written as a
// {{diagram:<key>}} line. The doc and this file change together; the test in
// tests/handbook.test.js holds the shape (24 numbered sections, every diagram
// placed, every lesson question quoting the text it checks).
//
// The parser reads only the markdown this file uses: ## and ### headings,
// paragraphs, bullet and numbered lists (one nested level), pipe tables,
// **bold**, [links](url) and bare https URLs.

export function parseInline(text) {
  const out = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+[^\s).,;:])/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) })
    if (m[1] != null) out.push({ t: 'b', v: m[1] })
    else if (m[2] != null) out.push({ t: 'a', v: m[2], href: m[3] })
    else out.push({ t: 'a', v: m[4], href: m[4] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

// Plain words of an inline string: what a reader sees, markup removed.
export function plain(text) {
  return parseInline(text).map(x => x.v).join('')
}

function parseBlocks(lines) {
  const blocks = []
  let i = 0
  const isBullet = l => /^\s*- /.test(l)
  const isOrdered = l => /^\s*\d+\. /.test(l)
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const dia = line.match(/^\{\{diagram:([a-z]+)\}\}$/)
    if (dia) { blocks.push({ type: 'diagram', key: dia[1] }); i++; continue }
    if (line.startsWith('### ')) { blocks.push({ type: 'h3', text: line.slice(4).trim() }); i++; continue }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
        if (!cells.every(c => /^-+$/.test(c))) rows.push(cells)
        i++
      }
      blocks.push({ type: 'table', head: rows[0], rows: rows.slice(1) })
      continue
    }
    if (isBullet(line) || isOrdered(line)) {
      const ordered = isOrdered(line)
      const items = []
      while (i < lines.length && (isBullet(lines[i]) || isOrdered(lines[i]))) {
        const l = lines[i]
        const nested = /^\s{2,}/.test(l)
        const text = l.replace(/^\s*(- |\d+\. )/, '')
        if (nested && items.length) items[items.length - 1].children.push(text)
        else items.push({ text, children: [] })
        i++
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items })
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#|\||\s*- |\s*\d+\. |\{\{)/.test(lines[i])) {
      para.push(lines[i].trim())
      i++
    }
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') })
    else i++
  }
  return blocks
}

export function parseHandbook(md) {
  const lines = md.replace(/\r/g, '').split('\n')
  const title = (lines.find(l => l.startsWith('# ')) || '').slice(2).trim()
  const versionLine = lines.find(l => /^Version /.test(l)) || ''
  const version = versionLine.replace(/^Version /, '').trim()
  const sections = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const head = line.slice(3).trim()
      const m = head.match(/^(\d+)\.\s+(.*)$/)
      cur = { num: m ? Number(m[1]) : null, title: m ? m[2] : head, lines: [] }
      cur.id = cur.num ? `s${cur.num}` : 'glance'
      sections.push(cur)
    } else if (cur) {
      cur.lines.push(line)
    }
  }
  for (const s of sections) { s.blocks = parseBlocks(s.lines); delete s.lines }
  return { title, version, sections }
}

// Every word a reader can see in a section, flattened, for search and tests.
export function sectionText(section) {
  const parts = []
  for (const b of section.blocks) {
    if (b.type === 'p' || b.type === 'h3') parts.push(plain(b.text))
    if (b.type === 'ul' || b.type === 'ol') for (const it of b.items) { parts.push(plain(it.text)); it.children.forEach(c => parts.push(plain(c))) }
    if (b.type === 'table') [b.head, ...b.rows].forEach(r => r.forEach(c => parts.push(plain(c))))
  }
  return parts.join(' ').replace(/\s+/g, ' ')
}

export function glossaryOf(handbook) {
  const g = handbook.sections.find(s => s.num === 23)
  const list = g?.blocks.find(b => b.type === 'ul')
  return (list?.items ?? []).map(it => {
    const m = it.text.match(/^\*\*(.+?):\*\*\s*(.*)$/)
    return m ? { term: m[1], def: m[2] } : null
  }).filter(Boolean)
}

// The signature page's numbered agreements, by signer.
export function agreementsOf(handbook) {
  const s = handbook.sections.find(x => x.num === 24)
  const out = { student: [], parent: [] }
  if (!s) return out
  let who = null
  for (const b of s.blocks) {
    if (b.type === 'p' && /^\*\*Student\.\*\*/.test(b.text)) who = 'student'
    else if (b.type === 'p' && /^\*\*Parent or guardian\.\*\*/.test(b.text)) who = 'parent'
    else if (b.type === 'ol' && who) { out[who] = b.items.map(it => it.text); who = null }
  }
  return out
}
