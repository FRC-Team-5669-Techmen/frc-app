import { describe, it, expect } from 'vitest'
import { approveSignout } from '../src/signout.js'
const client = result => ({ rpc: async (name, args) => {
  expect(name).toBe('approve_signout')
  expect(args).toEqual({ p_request: 'fictional-request' })
  return result
} })
describe('approval reports the exact session outcome', () => {
  it('returns a successful approval, including the work note', async () => {
    const row = { status: 'approved', note: 'Tested the gearbox', out_event_id: 'fictional-out' }
    await expect(approveSignout(client({ data: row }), 'fictional-request')).resolves.toEqual(row)
    await expect(approveSignout(client({ data: [row] }), 'fictional-request')).resolves.toEqual(row)
  })
  it('does not report an obsolete request as a successful sign-out', async () => {
    await expect(approveSignout(client({ data: { status: 'withdrawn' } }), 'fictional-request'))
      .rejects.toMatchObject({ code: 'P0002', message: expect.stringContaining('already ended') })
  })
  it('keeps database refusals visible', async () => {
    const error = { code: '42501', message: 'Only approvers can approve' }
    await expect(approveSignout(client({ error }), 'fictional-request')).rejects.toEqual(error)
  })
})
