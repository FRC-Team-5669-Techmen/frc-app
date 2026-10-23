// /schedule's Announce (feedback 1e00dfc5, ledger 0016): the draft an admin
// starts from. No role is ever ticked by it, and no weekday name is written.
import { describe, it, expect } from 'vitest'
import { eventAnnouncementDraft, eventWhen } from '../src/announceFromEvent.js'

const ev = { title: 'Build: intake', starts_at: '2026-10-24T16:00:00Z', ends_at: '2026-10-24T20:00:00Z', location: 'Shop', notes: 'Bring safety glasses', mandatory: false, rsvp_enabled: true }

describe('eventAnnouncementDraft', () => {
  it('writes the title, the Los Angeles time and the place, and points at the app RSVP', () => {
    const d = eventAnnouncementDraft(ev)
    expect(d.content).toBe('**Build: intake**\nOct 24, 9:00 AM to 1:00 PM at Shop\nSay if you are going in the app, under Schedule.')
    expect(d.embedTitle).toBe('Build: intake')
    expect(d.embedDesc).toContain('Bring safety glasses')
  })
  it('says mandatory only for a mandatory event', () => {
    expect(eventAnnouncementDraft({ ...ev, mandatory: true }).content).toMatch(/Mandatory/)
    expect(eventAnnouncementDraft(ev).content).not.toMatch(/Mandatory/)
  })
  it('never names a weekday, and never carries a role mention', () => {
    const d = eventAnnouncementDraft({ ...ev, mandatory: true })
    expect(`${d.content} ${d.embedDesc}`).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)
    expect(d.content).not.toMatch(/<@&|@everyone|@here/)
  })
  it('spans two days when the event does', () => {
    expect(eventWhen({ starts_at: '2026-10-24T16:00:00Z', ends_at: '2026-10-25T20:00:00Z' })).toBe('Oct 24, 9:00 AM to Oct 25, 1:00 PM')
  })
})
