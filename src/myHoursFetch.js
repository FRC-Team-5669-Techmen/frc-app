// Read every row of a PostgREST query, past the project's max-rows cap.
//
// An unranged select silently stops at the API's max rows (1000 on a default
// Supabase project) and says nothing: no error, just a short array. My Hours
// orders a member's attendance_events oldest-first, so a truncated read would
// drop their NEWEST check-ins from the session list and from every total at
// once. Two events per session puts that at about 500 sessions -- years for a
// student, not never.
//
// Pure: it takes a function that builds a fresh query and never imports
// Supabase. Pages are requested until one comes back EMPTY rather than short,
// so a project whose max-rows is lower than `pageSize` is still read in full
// (each page advances by what actually arrived). Rows are de-duplicated by
// `id`, and a builder that ignores `.range()` -- or has none -- is read once.

/**
 * @param {() => object} makeQuery - returns a NEW, fully ordered query builder
 *        each call (order by a unique key last, so pages cannot overlap or skip)
 * @param {{ pageSize?: number, maxPages?: number }} [opts]
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export async function fetchAllRows(makeQuery, { pageSize = 1000, maxPages = 200 } = {}) {
  const rows = []
  const seen = new Set()
  let from = 0
  for (let page = 0; page < maxPages; page++) {
    const query = makeQuery()
    if (typeof query.range !== 'function') {
      const { data, error } = await query
      return error ? { data: null, error } : { data: data ?? [], error: null }
    }
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    if (!data?.length) break
    let added = 0
    for (const row of data) {
      if (row.id != null) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
      }
      rows.push(row)
      added++
    }
    if (added === 0) break          // the range was ignored: the same rows again
    from += data.length
  }
  return { data: rows, error: null }
}
