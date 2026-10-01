// What leaves the feedback console when someone exports what is on screen.
//
// Two exports, one implementation of what a report reads like:
//
//   "Markdown for chat"     the shown reports as markdown sized to paste into a
//                           chat. Over the cap it SPLITS into numbered parts,
//                           each with its own header; it never truncates, and a
//                           report is never cut across two parts.
//   "Zip with screenshots"  the same reports with their screenshots beside
//                           them, plus reports.json, a role-only digest.txt for
//                           a feedback round, and MARK_SEEN.sql.
//
// FILTER FIRST, EXPORT SECOND. Both act on exactly the rows the console is
// showing, and both say in their own header which filter produced them, so a
// pasted bundle says what it is a bundle OF.
//
// THESE ARE STUDENT RECORDS AND THE REPOSITORY IS PUBLIC. The archive's README
// says so, digest.txt names every reporter by role and never by name, and
// .claude/skills/feedback-round/SKILL.md forbids committing the archive or any
// text copied out of reports.md.
//
// Pure module: no React, no Supabase. Screenshot bytes come from an injected
// `fetchImage(path)` the console wires to the admin's own storage client, so
// the bucket's admin-only read policy stays the boundary. Unit-tested in
// tests/feedback-export.test.js.

import { buildZip } from './feedbackZip.js'
import {
  STATUS_LABEL, TYPE_LABEL, exportStamp, fmtLA, imagePathsOf,
  laMinute, laParts, normStatus, redactRoute, reporterName, summarizeUserAgent,
  typeOf, uuidsIn,
} from './feedbackModel.js'

// ── Sizes ────────────────────────────────────────────────────────────────────
// 50,000 characters per part: roughly 12k tokens, comfortably inside what a
// chat composer takes in one paste, and small enough that three parts still
// leave the conversation room to work. A narrowed export (one route, one week)
// is almost always one part; the cap exists so an unfiltered "All" export is
// still pasteable, in pieces, rather than unusable.
export const PART_CHARS = 50_000

// Room held back in every part for its own header, so the header can never be
// what pushes a part over the cap.
const HEADER_RESERVE = 1_200

// How many bytes of image one archive carries before it stops adding them. The
// zip is built in memory in a browser tab (input plus output resident at once),
// and screenshots are already compressed, so this is about the tab, not the
// disk. Past it, images are LEFT OUT AND NAMED, never silently dropped.
export const IMAGE_BUDGET = 64 * 1024 * 1024

// ── Numbering ────────────────────────────────────────────────────────────────
// R01 is the OLDEST report in the export. The chat bundle, the zip, the
// digest and MARK_SEEN.sql all number the same way, so "R07" means one report
// wherever it is read.
export function numberReports(rows) {
  const sorted = [...(rows ?? [])].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
  const width = Math.max(2, String(sorted.length).length)
  return sorted.map((row, i) => ({ row, rid: `R${String(i + 1).padStart(width, '0')}` }))
}

// A report's folder in the archive: its number and the start of its id, and
// nothing else can get in. The id is a uuid column, so this is not defending
// against a value the database holds; it keeps a path assembled from a row
// from ever being able to climb out of the folder it is unpacked into.
export function reportFolder(rid, id) {
  const safe = String(id ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 8)
  return `reports/${rid}${safe ? `-${safe}` : ''}`
}

// ── Markdown ─────────────────────────────────────────────────────────────────
// A message is prose somebody typed, and it contains whatever they typed. A
// report that opens a line with `###`, or pastes a rule of dashes, would close
// the entry it sits in and reparent everything after it -- the next report's
// fields would read as part of this one. So every line goes inside ONE
// blockquote, a leading `#` or `>` is escaped, and a line that is nothing but
// a run of `-`, `=`, `_` or `*` is escaped too (after prose it would turn the
// line above into a heading).
const RULE = /^[-=_*]+$/
export function quoteText(text) {
  return String(text ?? '')
    .trim()
    .split(/\r?\n/)
    .map(line => {
      const bare = line.trim()
      const isRule = bare.length > 1 && RULE.test(bare.replace(/ /g, ''))
      const safe = isRule || /^\s*[#>]/.test(line) ? line.replace(/^(\s*)(.)/, '$1\\$2') : line
      return safe.trim() ? `> ${safe}` : '>'
    })
    .join('\n')
}

// "a student", "an admin": a role read as a description of somebody.
export function withArticle(role) {
  const r = role || 'member'
  return `${/^[aeiou]/i.test(r) ? 'an' : 'a'} ${r}`
}

function who(row, { names, roleOf }) {
  const role = roleOf?.(row.member_id) ?? null
  if (names) return role ? `${reporterName(row)} (${role})` : reporterName(row)
  return `${withArticle(role)} (name withheld)`
}

// The default screenshot sentence, for text that travels WITHOUT the images:
// the paths point into a private bucket and resolve to nothing outside the
// console, so the bundle names the images rather than linking them.
export function chatScreenshotNote(n) {
  return `${n} attached. They are not in this text: open /feedback to see them, or use "Zip with screenshots", which carries them.`
}

// One report. `screenshotNote(row, rid)` overrides the screenshots line (the
// archive links its images); it returns a string or null.
export function reportMarkdown({ row, rid }, opts = {}) {
  const { names = true, roleOf = null, screenshotNote = null } = opts
  const type = TYPE_LABEL[typeOf(row)]
  const status = normStatus(row.status)
  const route = names ? row.route : redactRoute(row.route)
  const lines = [`### ${rid} · ${type} · ${route || '(no route recorded)'}`, '']
  const facts = [
    `Status: ${STATUS_LABEL[status] ?? row.status}`,
    `Filed: ${fmtLA(row.created_at)} (Los Angeles)`,
    `From: ${who(row, { names, roleOf })}`,
    `Viewport: ${row.viewport || 'not recorded'}`,
    `Browser: ${summarizeUserAgent(row.user_agent) ?? 'not recorded'}`,
  ]
  if (row.user_agent) facts.push(`User agent: ${row.user_agent}`)
  facts.push(`Build: ${row.build || 'not recorded'}`)
  const shots = imagePathsOf(row).length
  if (shots) {
    const note = screenshotNote ? screenshotNote(row, rid) : chatScreenshotNote(shots)
    if (note) facts.push(`Screenshots: ${note}`)
  }
  facts.push(`Report id: ${row.id}`)
  lines.push(facts.map(f => `- ${f}`).join('\n'), '', quoteText(row.message))
  const tried = (row.tried ?? '').trim()
  if (tried) lines.push('', 'What they tried:', '', quoteText(tried))
  return lines.join('\n') + '\n'
}

function headerLines({ total, from, to, part, parts, filterText, exportedAt, build, names }) {
  const title = parts > 1 ? `# Techmen feedback, part ${part} of ${parts}` : '# Techmen feedback'
  const lines = [title, '']
  const stamp = exportedAt ? `Exported ${fmtLA(exportedAt)} (Los Angeles)` : 'Exported'
  lines.push(`${stamp}${build ? `, from build ${build}` : ''}.`)
  if (filterText) lines.push(`Filter: ${filterText}.`)
  lines.push(total === 0
    ? 'No reports matched this filter.'
    : `${total} report${total === 1 ? '' : 's'}, numbered R01 (oldest) onward.`)
  if (parts > 1) {
    lines.push(`This part: ${from} to ${to}. Paste every part; nothing was cut, and no report is split across parts.`)
  }
  lines.push(names
    ? 'Names: included.'
    : 'Names: withheld at export. Reporters are described by role only.')
  return lines.join('\n')
}

// The shown rows as one or more pasteable parts. Each part is at most
// `cap` characters, EXCEPT a part holding one report that is longer than the
// cap on its own -- that report is never cut, and its part says so.
export function markdownParts(rows, opts = {}) {
  const {
    cap = PART_CHARS, names = true, roleOf = null, filterText = '',
    exportedAt = null, build = null, screenshotNote = null,
  } = opts
  const numbered = numberReports(rows)
  const blocks = numbered.map(n => ({ rid: n.rid, text: reportMarkdown(n, { names, roleOf, screenshotNote }) }))

  const groups = []
  let cur = []
  let used = 0
  const room = Math.max(cap - HEADER_RESERVE, 1)
  for (const b of blocks) {
    const add = b.text.length + 2
    if (cur.length && used + add > room) { groups.push(cur); cur = []; used = 0 }
    cur.push(b)
    used += add
  }
  if (cur.length || !groups.length) groups.push(cur)

  const parts = groups.map((g, i) => {
    const head = headerLines({
      total: numbered.length,
      from: g[0]?.rid, to: g[g.length - 1]?.rid,
      part: i + 1, parts: groups.length,
      filterText, exportedAt, build, names,
    })
    let text = [head, ...g.map(b => b.text)].join('\n\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
    const over = text.length > cap
    if (over) {
      text += `\n_This part is longer than the ${cap.toLocaleString('en-US')}-character size the other parts keep to, because ${g[0].rid} is that long on its own. It was not cut._\n`
    }
    return { text, from: g[0]?.rid ?? null, to: g[g.length - 1]?.rid ?? null, over }
  })
  return { parts, count: numbered.length }
}

// ── MARK_SEEN.sql ────────────────────────────────────────────────────────────
// One paste that moves every report in this export that is STILL New to Seen,
// so the next export of New holds only reports nobody has looked at. It writes
// directly, because feedback_set_status needs a signed-in admin and the SQL
// editor has no session.
//
// IT NAMES NO MEMBER, and that is the point of its shape. A feedback round
// copies this file unchanged into docs/feedback/<date>/ in a PUBLIC repository
// (.claude/skills/feedback-round/SKILL.md, step 8), so it sets status and
// reviewed_at and leaves reviewed_by alone -- a report still New has no
// reviewer to keep, and the console shows a Seen report with no reviewer as a
// time alone. It used to stamp the exporting admin's member id; that put a
// member id into the repository on every round. Report ids are not identities.
//
// Before 0002 the CHECK admits only the old vocabulary, so the console writes
// 'reviewed' (which reads as Seen, and which 0002 maps to 'seen' when it is
// applied). The WHERE matches both spellings of New either way.
export function markSeenSql(numbered, { migrated = true, exportedAt = null } = {}) {
  const ids = numbered.map(n => n.row.id)
  const stillNew = numbered.filter(n => normStatus(n.row.status) === 'new').length
  const target = migrated ? 'seen' : 'reviewed'
  const lines = [
    `-- MARK_SEEN.sql, written by the /feedback console export${exportedAt ? ` of ${laMinute(exportedAt)} (Los Angeles)` : ''}.`,
    `-- Moves the reports in this export that are still New to ${migrated ? 'Seen' : "Seen (stored as 'reviewed', the pre-0002 spelling)"}, so the`,
    '-- next export filtered to New holds only new reports. A report somebody has',
    '-- already moved (seen, in progress, done, won\'t do, spam) is left alone.',
    `-- ${ids.length} report${ids.length === 1 ? '' : 's'} in the export; ${stillNew} ${stillNew === 1 ? 'was' : 'were'} New when it was taken.`,
    '--',
    '-- Paste ONCE in the Supabase SQL editor. It writes directly because the',
    '-- console\'s feedback_set_status RPC needs a signed-in admin and the editor',
    '-- has none. It sets status and reviewed_at; it names no member.',
    '--',
    '-- Undo: run the update below with the ids this statement RETURNS, setting',
    "--   status = 'new', reviewed_at = null.",
    '-- Report ids are not identities; nothing here names a reporter or an admin.',
  ]
  if (!ids.length) {
    lines.push('', '-- This export held no reports, so there is nothing to mark.', 'select 0 as reports_marked;')
    return lines.join('\n') + '\n'
  }
  lines.push(
    'update public.feedback',
    `   set status = '${target}', reviewed_at = now()`,
    " where status in ('new', 'open')",
    '   and id in (',
    ids.map(id => `     '${id}'`).join(',\n'),
    '   )',
    'returning id, status, route;',
    `-- Expect ${stillNew} row${stillNew === 1 ? '' : 's'} on a fresh export (fewer if some were triaged since).`,
  )
  return lines.join('\n') + '\n'
}

// ── digest.txt ───────────────────────────────────────────────────────────────
// The text a feedback round works from. Every reporter is named by ROLE and
// never by name, whatever the export's names setting, because this is the file
// a session quotes from while writing docs that are committed to a public
// repository. For the same reason its routes are ALWAYS redacted
// (/members/<uuid> reads /members/:id): a member id quoted out of here into
// TRIAGE.md is a member id in the public repo, and a name sweep cannot see
// one. It does NOT scrub a name somebody typed inside their message; the
// round's sweep (SKILL.md) is what catches those.
export function digestText(numbered, { roleOf = null, files = null } = {}) {
  return numbered.map(({ row, rid }) => {
    const role = roleOf?.(row.member_id) ?? null
    const head = [
      rid,
      `[${typeOf(row)}]`,
      `status=${normStatus(row.status)}`,
      `route=${redactRoute(row.route) || '-'}`,
      `by=${role ?? 'member'}`,
      `filed=${laMinute(row.created_at)} PT`,
      `viewport=${row.viewport || '-'}`,
      `build=${row.build || 'unknown'}`,
      `id=${row.id}`,
    ].join(' ')
    const out = [head]
    const f = files?.get(row.id)
    if (f?.screenshots?.length) for (const s of f.screenshots) out.push(`  screenshot: ${s}`)
    if (f?.missing?.length) out.push(`  screenshots not in this archive: ${f.missing.length} (see report.md)`)
    out.push(...String(row.message ?? '').trim().split(/\r?\n/).map(l => `  > ${l}`))
    const tried = (row.tried ?? '').trim()
    if (tried) out.push(`  tried: ${tried.replace(/\s+/g, ' ')}`)
    return out.join('\n')
  }).join('\n\n') + '\n'
}

// Every reporter name in the export, for the round's sweep of its committed
// files. Written only when names travel with the export: a withheld export
// carries no names to sweep for, and a list of them would undo the withholding.
//
// It also lists every MEMBER ID the export carries -- each reporter's, and any
// uuid inside a route (the profile that was open) -- because a names-included
// export holds them in reports.json and reports.md, and a member id quoted
// into a committed file is as identifying as a name. Report ids are not
// listed: they are not identities, and MARK_SEEN.sql is made of them.
export function identitiesText(rows) {
  const out = new Set()
  for (const r of rows ?? []) {
    for (const v of [r.author?.nickname, r.author?.full_name, reporterName(r)]) {
      const s = (v ?? '').trim()
      if (!s || s === 'Member') continue
      out.add(s)
      for (const w of s.split(/\s+/)) if (w.length >= 3) out.add(w)
    }
    // Both spellings: the sweep is case-sensitive (so a name part does not fire
    // on a lowercase word), and a route can hold a uuid typed in capitals.
    for (const id of [...uuidsIn(r.member_id), ...uuidsIn(r.route)]) {
      out.add(id)
      out.add(id.toUpperCase())
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b)).join('\n') + '\n'
}

// ── reports.json ─────────────────────────────────────────────────────────────
function jsonReport({ row, rid }, { names, roleOf, files }) {
  const f = files?.get(row.id) ?? null
  const out = {
    rid,
    id: row.id,
    type: typeOf(row),
    category: row.category ?? null,
    status: normStatus(row.status),
    status_stored: row.status,
    created_at: row.created_at,
    created_la: laMinute(row.created_at),
    // Withheld means withheld: /members/<uuid> names whose profile was open.
    route: (names ? row.route : redactRoute(row.route)) ?? null,
    viewport: row.viewport ?? null,
    user_agent: row.user_agent ?? null,
    build: row.build ?? null,
    message: row.message,
    tried: row.tried ?? null,
    // A storage path is `report/<uploader's member id>/...`, so it names the
    // reporter as surely as their name does. Withheld means withheld: the
    // count travels, the paths do not (the archive's own copies are under
    // `files`, named by report number).
    ...(names ? { image_paths: imagePathsOf(row) } : { screenshots: imagePathsOf(row).length }),
    reviewed_at: row.reviewed_at ?? null,
    reporter: names
      ? { member_id: row.member_id, name: reporterName(row), role: roleOf?.(row.member_id) ?? null }
      : { role: roleOf?.(row.member_id) ?? null },
  }
  if (f) out.files = f
  return out
}

export function reportsJson(numbered, { names = true, roleOf = null, files = null, filterText = '', exportedAt = null, build = null, migrated = true } = {}) {
  return JSON.stringify({
    exported_at: exportedAt,
    exported_from_build: build,
    filter: filterText,
    names: names ? 'included' : 'withheld',
    migration_0002_applied: migrated,
    count: numbered.length,
    reports: numbered.map(n => jsonReport(n, { names, roleOf, files })),
  }, null, 2) + '\n'
}

// ── The archive ──────────────────────────────────────────────────────────────
const EXT_BY_TYPE = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif',
  'image/bmp': 'bmp', 'image/svg+xml': 'svg',
}

// The stored type first, the path's own extension second, then a neutral
// `.bin`: a file with a wrong extension still opens, a file with none does not.
export function imageName(index, contentType, path) {
  const declared = String(contentType ?? '').split(';')[0].trim().toLowerCase()
  const byType = EXT_BY_TYPE[declared]
  const last = String(path ?? '').split('/').pop()
  const fromPath = last.includes('.') ? last.split('.').pop().toLowerCase() : ''
  const ext = byType ?? (/^[a-z0-9]{2,5}$/.test(fromPath) ? fromPath : 'bin')
  return `screenshot-${index}.${ext}`
}

export function archiveRoot(exportedAt) {
  return `techmen-feedback-${exportStamp(exportedAt ?? new Date())}`
}

export function archiveReadme({ count, images, missing, names, filterText, exportedAt, build, migrated, budget }) {
  const lines = [
    '# Techmen feedback export',
    '',
    `${count} report${count === 1 ? '' : 's'} from the Techmen team platform's feedback inbox (/feedback), with ${images} screenshot${images === 1 ? '' : 's'}.`,
    `Exported ${fmtLA(exportedAt)} (Los Angeles)${build ? ` from build ${build}` : ''}.`,
  ]
  if (filterText) lines.push(`Filter: ${filterText}.`)
  if (!migrated) {
    lines.push('', 'Migration 0002_feedback_console.sql was not applied when this was exported, so no report carries a separate "what they tried" or build field; reports filed before it carry those folded into the message.')
  }
  lines.push(
    '',
    '## What is in here',
    '',
    '- `reports.md` -- every report in one file, oldest first (R01 onward), with its screenshots linked.',
    '- `reports/<R..>-<id>/report.md` and `screenshot-N.<ext>` -- one folder per report, the image beside the report it was filed with.',
    '- `reports.json` -- every report as stored, plus where its files are in this archive.',
    '- `digest.txt` -- one entry per report, reporter named by ROLE only. The text a feedback round works from (`.claude/skills/feedback-round/SKILL.md`).',
    '- `MARK_SEEN.sql` -- one paste for the Supabase SQL editor that moves the reports in this export that are still New to Seen, so the next export of New holds only new reports. It names no member, only report ids.',
  )
  if (names) lines.push('- `identities.txt` -- every reporter name in this export, for a round to sweep its committed files against. Never commit it.')
  lines.push(
    '',
    '## Who filed these',
    '',
    names
      ? 'Names: INCLUDED. These are student records, and the frc-app repository is public: never commit this archive, identities.txt, or any text copied out of reports.md. digest.txt names reporters by role only.'
      : 'Names: WITHHELD at export. No reporter name or member id is written into this archive; reporters are described by role, and a route that held a member id reads :id in its place. Anything a reporter typed inside their own message is still there.',
  )
  if (missing.length) {
    const over = missing.filter(m => m.reason === 'over-budget').length
    const gone = missing.length - over
    lines.push('', '## Screenshots that are not here', '')
    lines.push(`${missing.length} screenshot${missing.length === 1 ? ' is' : 's are'} named by a report but not in this archive. Each report.md says which, and reports.json carries the reason.`)
    if (over) lines.push('', `${over} did not fit: this archive carries at most ${Math.round(budget / (1024 * 1024))} MiB of images so it can be built in a browser tab. Narrow the filter and export again to get them.`)
    if (gone) lines.push('', `${gone} could not be read back from storage. The reports themselves are complete.`)
  }
  return lines.join('\n') + '\n'
}

// Build the archive. FETCH FIRST, THEN WRITE: a report's own markdown has to be
// able to say whether its image made it, and the files map in reports.json has
// to agree with what was actually written. A fetch that throws is the same
// outcome as one that answers null -- one unreachable image never costs the
// other reports their archive.
export async function buildArchive(rows, fetchImage, opts = {}) {
  const {
    names = true, roleOf = null, filterText = '', exportedAt = new Date().toISOString(),
    build = null, migrated = true, budget = IMAGE_BUDGET, onProgress = null,
  } = opts
  const numbered = numberReports(rows)
  const root = archiveRoot(exportedAt)
  const files = new Map()
  const images = []
  const missing = []
  let imageBytes = 0
  const totalShots = numbered.reduce((n, { row }) => n + imagePathsOf(row).length, 0)
  let done = 0

  for (const { row, rid } of numbered) {
    const folder = reportFolder(rid, row.id)
    const entry = { report: `${folder}/report.md`, screenshots: [], missing: [] }
    files.set(row.id, entry)
    const paths = imagePathsOf(row)
    for (let i = 0; i < paths.length; i += 1) {
      let got = null
      try { got = await fetchImage(paths[i]) } catch { got = null }
      done += 1
      onProgress?.(done, totalShots)
      if (!got?.bytes?.length) {
        entry.missing.push({ screenshot: i + 1, reason: 'not-retrieved' })
        missing.push({ id: row.id, reason: 'not-retrieved' })
        continue
      }
      if (imageBytes + got.bytes.length > budget) {
        entry.missing.push({ screenshot: i + 1, reason: 'over-budget' })
        missing.push({ id: row.id, reason: 'over-budget' })
        continue
      }
      const name = imageName(i + 1, got.contentType, paths[i])
      entry.screenshots.push(`${folder}/${name}`)
      images.push({ path: `${folder}/${name}`, bytes: got.bytes })
      imageBytes += got.bytes.length
    }
  }

  const noteFor = (relative) => (row) => {
    const f = files.get(row.id)
    const bits = []
    if (f.screenshots.length) {
      bits.push(f.screenshots.map((p, i) => `[screenshot ${i + 1}](${relative(p)})`).join(', '))
    }
    if (f.missing.length) {
      const over = f.missing.some(m => m.reason === 'over-budget')
      bits.push(`${f.missing.length} more NOT in this archive (${over ? 'over the archive size cap; narrow the filter and export again' : 'could not be read back from storage'})`)
    }
    return bits.join('; ')
  }

  const text = []
  for (const n of numbered) {
    const f = files.get(n.row.id)
    const own = reportMarkdown(n, {
      names, roleOf,
      // Inside the report's own folder the image sits right beside it.
      screenshotNote: noteFor(p => `./${p.split('/').pop()}`),
    })
    text.push({ path: f.report, data: own })
  }

  const all = markdownParts(rows, {
    cap: Number.MAX_SAFE_INTEGER, names, roleOf, filterText, exportedAt, build,
    screenshotNote: noteFor(p => p),
  })

  const entries = [
    { path: `${root}/README.md`, data: archiveReadme({ count: numbered.length, images: images.length, missing, names, filterText, exportedAt, build, migrated, budget }) },
    { path: `${root}/reports.md`, data: all.parts[0].text },
    { path: `${root}/reports.json`, data: reportsJson(numbered, { names, roleOf, files, filterText, exportedAt, build, migrated }) },
    { path: `${root}/digest.txt`, data: digestText(numbered, { roleOf, files }) },
    { path: `${root}/MARK_SEEN.sql`, data: markSeenSql(numbered, { migrated, exportedAt }) },
  ]
  if (names) entries.push({ path: `${root}/identities.txt`, data: identitiesText(rows) })
  for (const t of text) entries.push({ path: `${root}/${t.path}`, data: t.data })
  for (const img of images) entries.push({ path: `${root}/${img.path}`, data: img.bytes })

  return {
    bytes: buildZip(entries, { time: laParts(exportedAt) }),
    name: `${root}.zip`,
    root,
    reports: numbered.length,
    images: images.length,
    imageBytes,
    missing,
  }
}
