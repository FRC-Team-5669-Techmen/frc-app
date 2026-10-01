import { describe, it, expect } from 'vitest'
import {
  isSchemaMissing, isMissingColumn, isMissingTable, isMissingFunction,
} from '../src/schemaMissing.js'

describe('isSchemaMissing', () => {
  it('is true for every "does not exist" code', () => {
    for (const code of ['42P01', 'PGRST205', '42883', 'PGRST202', '42703', 'PGRST204', 'PGRST200', '3F000']) {
      expect(isSchemaMissing({ code })).toBe(true)
    }
  })

  // Positive control the other way round: real failures that are NOT a missing
  // object must never be mistaken for "not set up yet", or a genuine fault
  // (permission denied, a unique violation, a network drop) would be hidden
  // behind a calm placeholder.
  it('is false for ordinary failures and for non-errors', () => {
    for (const code of ['42501', '23505', '23502', '23514', 'PGRST301', 'PGRST116', '08006', '']) {
      expect(isSchemaMissing({ code })).toBe(false)
    }
    expect(isSchemaMissing(null)).toBe(false)
    expect(isSchemaMissing(undefined)).toBe(false)
    expect(isSchemaMissing({})).toBe(false)
    expect(isSchemaMissing('42P01')).toBe(false)
  })

  it('reads the code, never the message', () => {
    expect(isSchemaMissing({ code: '42501', message: 'relation "x" does not exist' })).toBe(false)
    expect(isSchemaMissing({ code: 'PGRST205', message: 'reworded in some future version' })).toBe(true)
  })
})

describe('the narrow predicates', () => {
  it('each matches only its own family', () => {
    expect(isMissingColumn({ code: 'PGRST204' })).toBe(true)
    expect(isMissingColumn({ code: '42703' })).toBe(true)
    expect(isMissingColumn({ code: '42P01' })).toBe(false)

    expect(isMissingTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ code: 'PGRST202' })).toBe(false)

    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true)
    expect(isMissingFunction({ code: '42883' })).toBe(true)
    expect(isMissingFunction({ code: 'PGRST204' })).toBe(false)
  })
})
