import { CAPABILITIES, reliability } from './model.js'
import { isExternalEvidence, matchIdentity } from './provenance.js'

// Coverage describes collected evidence, not robot strength. Repeated scouts in
// one match do not increase match coverage. Pending work never counts as synced.
export function eventCoverage(records, confirmedRecords = records.filter(r => !r.localStatus)) {
  const teams = [...new Set(records.map(r => r.team_number).filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b)
  return teams.map(team => {
    const rows = records.filter(r => r.team_number === team)
    const synced = confirmedRecords.filter(r => r.team_number === team)
    const observations = synced.filter(r => r.kind === 'observation')
    const current = observations.filter(r => !isExternalEvidence(r))
    const trials = CAPABILITIES.map(c => ({ ...c, ...reliability(synced, team, c.key) }))
    const outstanding = rows.filter(r => r.kind === 'assignment' && r.payload.status === 'assigned' && !synced.some(o => o.kind === 'observation' && o.member_id === r.payload.assignee && (o.payload.assignment_id === r.id || matchIdentity(o) === matchIdentity(r))))
    return { team, pit: synced.some(r => r.kind === 'pit'),
      currentMatches: new Set(current.map(r => `${r.event_id}:${matchIdentity(r)}`)).size,
      priorMatches: new Set(observations.filter(isExternalEvidence).map(r => `${r.payload.source_event}:${r.match_key}`)).size,
      localObservations: rows.filter(r => r.kind === 'observation' && r.localStatus).length,
      outstanding: outstanding.length, trials,
      thin: trials.some(r => !r.sufficient), disputed: trials.some(r => r.disputed > 0),
    }
  })
}
export function filterCoverage(rows, filter) {
  return rows.filter(row => filter === 'pit' ? !row.pit : filter === 'thin' ? row.thin : filter === 'disputed' ? row.disputed : filter === 'prior' ? row.priorMatches > 0 : true)
}
