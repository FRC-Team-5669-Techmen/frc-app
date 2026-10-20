// The two failures every connector layer understands.
import { isSchemaMissing } from '../../../src/schemaMissing.js'

/** The connector store or Supabase could not be reached, or is not configured. */
export class ConnectorUnavailable extends Error {
  constructor(message, { notSetUp = false } = {}) {
    super(message)
    this.notSetUp = notSetUp
  }
}

/** A database error that means 0018 (or what a tool reads) has not been pasted yet. */
export function notSetUp(error) {
  return isSchemaMissing(error)
}

export { isSchemaMissing }
