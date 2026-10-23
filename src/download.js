// Hands the browser a file to save. One helper for the pages added by ledger
// 0017 (batteries, the scouting spreadsheet); older pages keep their own
// copies until they are next touched.
export function downloadText(text, name, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A file-name-safe local date stamp, Los Angeles time: 2026-10-30. */
export function laStamp(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
