// "Has this migration been applied yet?", answered from a Supabase error.
//
// Every SQL file in this repo is pasted into the Supabase SQL editor BY HAND,
// and nothing records which ones have run (supabase/migrations/README.md). A
// push to `main` deploys the client immediately, so a feature whose migration
// is still waiting must detect its objects missing and show a plain "not set
// up yet" state -- never a crash, never a red fault, never a broken page.
//
// MATCHED ON THE CODE, NEVER THE MESSAGE. PostgREST and Postgres both reword
// their messages between versions; the codes are the contract.
//
//   42P01      undefined_table          (Postgres; also older PostgREST)
//   PGRST205   table not in the schema cache          (PostgREST 12.2+)
//   42883      undefined_function       (Postgres)
//   PGRST202   function not in the schema cache       (PostgREST)
//   42703      undefined_column         (Postgres, e.g. a select naming it)
//   PGRST204   column not in the schema cache, on an insert/update payload
//   PGRST200   relationship not in the schema cache  (an embed whose FK is new)
//   3F000      invalid_schema_name
//
// Pure module: no React, no Supabase import, so it is unit-tested directly
// (tests/schema-missing.test.js) and safe to import from the check-in path.

export const MISSING_TABLE_CODES = Object.freeze(['42P01', 'PGRST205'])
export const MISSING_FUNCTION_CODES = Object.freeze(['42883', 'PGRST202'])
export const MISSING_COLUMN_CODES = Object.freeze(['42703', 'PGRST204'])
export const MISSING_RELATION_CODES = Object.freeze(['PGRST200'])
export const MISSING_SCHEMA_CODES = Object.freeze(['3F000'])

const ALL = new Set([
  ...MISSING_TABLE_CODES,
  ...MISSING_FUNCTION_CODES,
  ...MISSING_COLUMN_CODES,
  ...MISSING_RELATION_CODES,
  ...MISSING_SCHEMA_CODES,
])

function codeOf(error) {
  if (!error || typeof error !== 'object') return null
  const c = error.code
  return typeof c === 'string' ? c : null
}

// True when the error says a table, function, column, relationship or schema
// does not exist -- i.e. the migration that creates it has not been applied.
export function isSchemaMissing(error) {
  const c = codeOf(error)
  return c != null && ALL.has(c)
}

// Narrower: only a missing COLUMN. Use this to retry an insert without the
// columns an additive migration introduces, so the old shape keeps working.
export function isMissingColumn(error) {
  const c = codeOf(error)
  return c != null && MISSING_COLUMN_CODES.includes(c)
}

// Narrower: only a missing table.
export function isMissingTable(error) {
  const c = codeOf(error)
  return c != null && MISSING_TABLE_CODES.includes(c)
}

// Narrower: only a missing RPC.
export function isMissingFunction(error) {
  const c = codeOf(error)
  return c != null && MISSING_FUNCTION_CODES.includes(c)
}
