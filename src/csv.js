// CSV with decision 18's formula guard (docs/decisions/18-csv-formula-guard.md,
// option A): a text cell that starts with = + - @, a tab or a carriage return
// is written with a leading apostrophe, so a spreadsheet opens it as text and
// never as a formula. Numbers and booleans are not text and are not guarded.
//
// Used by the event family hub's staff export, which holds parent phones,
// allergies and pickup spots beside free text families typed. The five older
// escapers (decision 18 lists them) are NOT repointed here: that is the
// decision's own follow-up, and the weekly survey's verbatim rule stands.

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s
  if (typeof value === 'boolean') s = value ? 'yes' : 'no'
  else if (typeof value === 'number') s = String(value)
  else {
    s = String(value)
    if (FORMULA_START.test(s)) s = `'${s}`
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * columns: [[key, header], ...]; rows: plain objects. A UTF-8 BOM leads, so
 * Excel on Windows reads accented names (the Reports and Team Hours exports
 * do the same). `note`, when given, is one cell on its own line ABOVE the
 * header, for what a reader must know before trusting the columns.
 */
export function toCsv(columns, rows, { note } = {}) {
  const head = columns.map(([, h]) => csvCell(h)).join(',')
  const body = (rows ?? []).map((r) => columns.map(([k]) => csvCell(r[k])).join(','))
  const lead = note ? [csvCell(note)] : []
  return '﻿' + [...lead, head, ...body].join('\r\n') + '\r\n'
}
