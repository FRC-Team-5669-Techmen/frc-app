// Read The Blue Alliance's PUBLIC event pages (no API key): every match with
// its six teams in robot order and both scores, the final alliances, and the
// event dates. Used by season-prior.mjs (each team's 2026 prior) and
// replay.mjs (does our ranking agree with what captains really picked).
//
//   import { fetchEvent } from './tba-pages.mjs'
//   const ev = await fetchEvent('2026catt', { cacheDir: '/tmp/tba' })
//
// Team ids are strings so offseason B robots ("4414B") stay separate.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEvent, parseTeamEvents, parseMatchBreakdown, toImportShape } from '../../src/scouting/tbaPages.js'

// The parsers live in src/scouting/tbaPages.js so api/tba.js reads pages the same way.
export { parseEvent, parseTeamEvents, parseMatchBreakdown, toImportShape }

export async function fetchPage(url, { cacheDir } = {}) {
  const file = cacheDir ? join(cacheDir, url.replace(/[^a-z0-9]+/gi, '_') + '.html') : null
  if (file) { try { return await readFile(file, 'utf8') } catch { /* fetch below */ } }
  const res = await fetch(url, { headers: { 'user-agent': 'techmen-5669-scouting-tools' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const html = await res.text()
  if (file) { await mkdir(cacheDir, { recursive: true }); await writeFile(file, html) }
  return html
}

export async function fetchEvent(key, opts = {}) {
  return parseEvent(await fetchPage(`https://www.thebluealliance.com/event/${key}`, opts), key)
}
