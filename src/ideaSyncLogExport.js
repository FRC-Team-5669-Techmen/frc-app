// "Export sync log" on /certifications (decision 34, answered 2026-10-14).
//
// Mr. Pina: log refused syncs, do not log wrong-secret calls (migration 0001
// already does both), and give admins one button that downloads the FULL
// idea_cert_sync_log, as JSON plus CSV with a short README, so the file can be
// handed to a Claude chat. One download, so it is one zip:
//
//   README.txt       what the log is, what each column means, what it never holds
//   sync-log.json    every row, oldest first, exactly as stored
//   sync-log.csv     the same rows, one per line (decision 18 formula guard)
//
// The log holds no secret, no hash and no holder data: a refused row's error
// names problems by array index and serial or code, never a person's name or
// email (docs/IDEA_CERTIFICATIONS_SYNC.md). So nothing here is redacted.
//
// Pure module: no React, no Supabase, no DOM (tests/idea-sync-log-export.test.js).

import { toCsv } from './csv.js'
import { buildZip } from './feedbackZip.js'
import { laParts, laMinute, exportStamp } from './feedbackModel.js'

export const SYNC_LOG_COLUMNS = Object.freeze([
  ['id', 'id'],
  ['received_at', 'received_at'],
  ['ok', 'ok'],
  ['source_revision', 'source_revision'],
  ['catalog_count', 'catalog_count'],
  ['holder_count', 'holder_count'],
  ['error', 'error'],
])

function byOldest(a, b) {
  return (Date.parse(a.received_at) || 0) - (Date.parse(b.received_at) || 0)
    || Number(a.id ?? 0) - Number(b.id ?? 0)
}

export function syncLogReadme(rows, { exportedAt = new Date(), exportedBy = '' } = {}) {
  const sorted = [...rows].sort(byOldest)
  const accepted = sorted.filter(r => r.ok === true).length
  const refused = sorted.length - accepted
  const first = sorted[0]?.received_at
  const last = sorted[sorted.length - 1]?.received_at
  return [
    'IDEA certifications sync log, exported from the Techmen app (FRC Team 5669)',
    '',
    `Exported ${laMinute(exportedAt)} America/Los_Angeles${exportedBy ? ` by ${exportedBy}` : ''}.`,
    `${sorted.length} row(s): ${accepted} accepted, ${refused} refused.`,
    sorted.length ? `First ${laMinute(first)}, last ${laMinute(last)} (America/Los_Angeles).` : 'The log is empty: no signed sync has reached this app.',
    '',
    'WHAT THIS IS',
    'ideabosco.com (IDEA Classroom) sends this app a full snapshot of the IDEA',
    'certifications catalog and holders. The function idea_cert_sync() checks a',
    'shared secret, validates the whole snapshot, and either replaces the mirror',
    'with it (ok = true) or changes nothing and records why (ok = false).',
    'Contract: docs/IDEA_CERTIFICATIONS_SYNC.md in the frc-app repository.',
    '',
    'WHAT IS NOT IN IT, ON PURPOSE (decision 34)',
    'A call with a wrong or missing secret writes no row at all, so probing does',
    'not appear here. No secret, no secret hash and no holder name or email is',
    'ever stored in this log.',
    '',
    'COLUMNS (sync-log.json and sync-log.csv hold the same rows, oldest first)',
    '  id               row number, increasing',
    '  received_at      when this app received the call (UTC ISO 8601)',
    '  ok               true = applied, false = refused and nothing changed',
    '                   (yes / no in the CSV)',
    '  source_revision  the revision string IDEA Classroom sent, if any',
    '  catalog_count    certifications in the snapshot as received',
    '  holder_count     holder rows in the snapshot as received',
    '  error            on a refusal, every problem found, by array index and',
    '                   serial or code',
    '',
    'In the CSV a text cell starting with = + - or @ carries a leading',
    'apostrophe so a spreadsheet shows it as text (decision 18); the JSON is',
    'exactly as stored.',
    '',
  ].join('\n')
}

// rows: idea_cert_sync_log rows (any order). Returns { name, bytes, count }.
export function buildSyncLogExport(rows, { exportedAt = new Date(), exportedBy = '' } = {}) {
  const sorted = [...(rows ?? [])].sort(byOldest)
  const clean = sorted.map(r => Object.fromEntries(SYNC_LOG_COLUMNS.map(([k]) => [k, r[k] ?? null])))
  const stamp = exportStamp(exportedAt)
  const folder = `idea-cert-sync-log-${stamp}`
  const entries = [
    { path: `${folder}/README.txt`, data: syncLogReadme(clean, { exportedAt, exportedBy }) },
    { path: `${folder}/sync-log.json`, data: JSON.stringify(clean, null, 2) + '\n' },
    { path: `${folder}/sync-log.csv`, data: toCsv(SYNC_LOG_COLUMNS, clean) },
  ]
  return { name: `${folder}.zip`, bytes: buildZip(entries, { time: laParts(exportedAt) }), count: clean.length }
}
