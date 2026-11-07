import { isMissingColumn } from './schemaMissing.js'

// Keep attendance projections narrow. Before the pause column lands, retry
// the same bounded/paged read without that column; other errors stay errors.
export async function withSessionPauses(read) {
  const result = await read(',pauses')
  return result.error && isMissingColumn(result.error) ? read('') : result
}
