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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export async function fetchPage(url, { cacheDir } = {}) {
  const file = cacheDir ? join(cacheDir, url.replace(/[^a-z0-9]+/gi, '_') + '.html') : null
  if (file) { try { return await readFile(file, 'utf8') } catch { /* fetch below */ } }
  const res = await fetch(url, { headers: { 'user-agent': 'techmen-5669-scouting-tools' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const html = await res.text()
  if (file) { await mkdir(cacheDir, { recursive: true }); await writeFile(file, html) }
  return html
}

export function parseEvent(html, key) {
  const matches = []
  const seen = new Set()
  const rowRe = /<tr class="visible-lg">([\s\S]*?)<\/tr>/g
  let m
  while ((m = rowRe.exec(html))) {
    const row = m[1]
    const km = /href="\/match\/([a-z0-9_]+)"/i.exec(row)
    if (!km || seen.has(km[1])) continue
    const cells = [...row.matchAll(/<td[^>]*class="(red|blue)[^"]*"[^>]*>[\s\S]*?<a href="\/team\/\d+\/\d+">([0-9]+[A-Z]?)<\/a>/g)]
    const red = cells.filter(c => c[1] === 'red').map(c => c[2])
    const blue = cells.filter(c => c[1] === 'blue').map(c => c[2])
    const score = color => { const s = new RegExp(`<td[^>]*class="${color}Score[^"]*"[^>]*>[\\s\\S]*?<span[^>]*>(-?\\d+)<\\/span>`).exec(row); return s ? Number(s[1]) : null }
    if (!red.length || !blue.length) continue
    seen.add(km[1])
    const k = km[1]
    const level = /_qm\d+$/.test(k) ? 'qm' : /_(sf|f|qf|ef)\d+m\d+$/.test(k) ? 'po' : 'other'
    matches.push({ key: k, level, red: { teams: red, score: score('red') }, blue: { teams: blue, score: score('blue') } })
  }
  const alliances = []
  const table = /<table[^>]*id="event-alliances"[^>]*>([\s\S]*?)<\/table>/.exec(html)
  if (table) {
    for (const r of table[1].matchAll(/<tr>\s*<td>Alliance (\d+)<\/td>([\s\S]*?)<\/tr>/g)) {
      alliances[Number(r[1]) - 1] = [...r[2].matchAll(/<a href="\/team\/\d+\/\d+">([0-9]+[A-Z]?)<\/a>/g)].map(x => x[1])
    }
  }
  const dm = new RegExp(`(${MONTHS.join('|')}) (\\d+)(?:[^<]{0,30}?(${MONTHS.join('|')})? ?(\\d+))?, (20\\d\\d)`).exec(html)
  const start = dm ? `${dm[5]}-${String(MONTHS.indexOf(dm[1]) + 1).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}` : null
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.replace(/\s*-\s*The Blue Alliance\s*$/, '').trim() ?? key
  return { key, title, start, matches, alliances: alliances.filter(Boolean) }
}

export async function fetchEvent(key, opts = {}) {
  return parseEvent(await fetchPage(`https://www.thebluealliance.com/event/${key}`, opts), key)
}

/** The event keys a team page lists for one season. */
export function parseTeamEvents(html, year = 2026) {
  return [...new Set([...html.matchAll(new RegExp(`/event/(${year}[a-z0-9]+)`, 'g'))].map(x => x[1]))]
}
