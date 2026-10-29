import { Fragment, useMemo, useState } from 'react'
import { TABLE_COLUMNS, nextSort, readSort, sortTeamRows, teamTableRows, writeSort } from './teamTable'

const storage = () => { try { return window.localStorage } catch { return null } }

// The Teams tab's default view: one row per team, sortable, the existing
// evidence card opening inline under its row (renderCard is the card markup
// ScoutingPage has always rendered). The sort is remembered on this device.
export default function TeamTable({ numbers, records, confirmed, nameFor, open, onToggle, renderCard }) {
  const [sort, setSort] = useState(() => readSort(storage()))
  // numbers and nameFor are rebuilt on every page render; their content is
  // what matters, and names come from the same records.
  const teamKey = numbers.join(',')
  const rows = useMemo(() => teamTableRows(numbers, records, confirmed, nameFor), [teamKey, records, confirmed])
  const sorted = useMemo(() => sortTeamRows(rows, sort), [rows, sort])
  const choose = key => { const next = nextSort(sort, key); setSort(next); writeSort(storage(), next) }
  const sortedBy = TABLE_COLUMNS.find(c => c.key === sort.key)
  return <div className="sc-team-table-wrap" data-team-table>
    <table className="sc-team-table">
      <caption className="sc-sr-only">{sorted.length} {sorted.length === 1 ? 'team' : 'teams'}, sorted by {sortedBy?.title ?? sortedBy?.label}, {sort.dir === 'asc' ? 'ascending' : 'descending'}. Select a row to open the team's evidence.</caption>
      <thead><tr>{TABLE_COLUMNS.map(c => <th key={c.key} scope="col" data-col={c.key} className={c.phone ? undefined : 'sc-col-wide'} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button type="button" title={c.title} onClick={() => choose(c.key)}>{c.label}<span aria-hidden="true" className="sc-sort-mark">{sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button>
      </th>)}</tr></thead>
      <tbody>{sorted.map(row => { const isOpen = open.has(row.team); return <Fragment key={row.team}>
        <tr className={`sc-team-row${isOpen ? ' sc-team-row-open' : ''}`} data-team={row.team} onClick={() => onToggle(row.team)}>
          {TABLE_COLUMNS.map(c => c.key === 'team'
            ? <th key={c.key} scope="row" data-col={c.key}><button type="button" aria-expanded={isOpen} aria-controls={`sc-team-detail-${row.team}`} aria-label={`Team ${row.team}${row.values.name ? ` ${row.values.name}` : ''}: ${isOpen ? 'hide' : 'show'} evidence`}>{row.cells.team}</button></th>
            : <td key={c.key} data-col={c.key} className={[c.phone ? '' : 'sc-col-wide', row.values[c.key] === null ? 'sc-cell-empty' : ''].filter(Boolean).join(' ') || undefined} title={c.key === 'name' ? row.cells.name : undefined}>{row.cells[c.key]}</td>)}
        </tr>
        {isOpen && <tr className="sc-team-detail" id={`sc-team-detail-${row.team}`}><td colSpan={TABLE_COLUMNS.length}>{renderCard(row.team)}</td></tr>}
      </Fragment> })}</tbody>
    </table>
  </div>
}
