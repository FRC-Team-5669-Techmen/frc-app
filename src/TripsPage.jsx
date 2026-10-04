import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { fmtDate, fmtDay } from './eventHub'
import { CarpoolBoard, EventInfo, FoodBoard, Seg } from './EventHubBoards'
import './EventHub.css'

// /trips and /trips/<id>: the event family hub for SIGNED-IN members. A
// student sees the same sanitized boards a family sees through its link --
// cars, seat counts, who rides with whom, the food board -- read through
// public.hub_member_board(), which strips phones, pickup spots and allergy
// names before they leave the database. Students never write here; their
// family's link is where plans are made. Staff see the staff board and a way
// to the mentor page (/trips/<id>/manage). A parent-only account is refused
// by the database (it uses its link), and the nav does not offer it.

function useTripList() {
  const [state, setState] = useState({ status: 'loading', events: [] })
  useEffect(() => {
    let live = true
    supabase.rpc('hub_member_events').then(({ data, error }) => {
      if (!live) return
      if (error) setState({ status: isSchemaMissing(error) ? 'missing' : 'error', events: [] })
      else setState({ status: 'ready', events: data ?? [] })
    })
    return () => { live = false }
  }, [])
  return state
}

function NewTrip() {
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const navigate = useNavigate()
  async function create(e) {
    e.preventDefault()
    setErr('')
    const { data, error } = await supabase.from('hub_events').insert({ title: title.trim() }).select('id').single()
    if (error) { setErr(error.message); return }
    navigate(`/trips/${data.id}/manage`)
  }
  return (
    <form className="eh-card eh-inline" onSubmit={create}>
      <input className="eh-input" placeholder="New trip, e.g. SoCal Showdown 2026" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <button type="submit" className="eh-btn eh-btn-primary" disabled={!title.trim()}>Create</button>
      {err && <p className="eh-note eh-note-bad">{err}</p>}
    </form>
  )
}

function TripList({ isStaff }) {
  const { status, events } = useTripList()
  return (
    <div className="ehm ehm-page">
      <h1 className="ehm-title">Trips</h1>
      <p className="eh-hint">Offsite events: who is coming, the carpool board and the food board.{isStaff ? ' Families plan through their emailed link.' : ''}</p>
      {status === 'loading' && <p className="eh-empty">Loading.</p>}
      {status === 'missing' && <p className="eh-empty" data-testid="trips-missing">Trips are not set up yet.</p>}
      {status === 'error' && <p className="eh-note eh-note-bad">Could not load trips.</p>}
      {status === 'ready' && events.length === 0 && <p className="eh-empty">No trips coming up.</p>}
      <ul className="ehm-list">
        {events.map((e) => (
          <li key={e.id} className="eh-card ehm-trip" data-testid="trip-row">
            <Link className="ehm-trip-link" to={`/trips/${e.id}`}>
              <strong>{e.title}</strong>
              <span className="eh-mono">{e.starts_on ? `${fmtDate(e.starts_on, 'medium')} to ${fmtDay(e.ends_at)}` : 'Dates not set'}{e.venue_name ? ` · ${e.venue_name}` : ''}{e.over ? ' · over' : ''}</span>
            </Link>
            {isStaff && <Link className="eh-btn" to={`/trips/${e.id}/manage`}>Mentor page</Link>}
          </li>
        ))}
      </ul>
      {isStaff && status === 'ready' && <NewTrip />}
    </div>
  )
}

function TripBoard({ id, isStaff }) {
  const [state, setState] = useState({ status: 'loading' })
  const [tab, setTab] = useState('carpool')
  useEffect(() => {
    let live = true
    supabase.rpc('hub_member_board', { p_event: id }).then(({ data, error }) => {
      if (!live) return
      if (error) {
        setState({ status: isSchemaMissing(error) ? 'missing' : error.code === '42501' ? 'denied' : error.code === 'P0002' ? 'gone' : 'error' })
      } else setState({ status: 'ready', ...data })
    })
    return () => { live = false }
  }, [id])
  if (state.status === 'loading') return <div className="ehm ehm-page"><p className="eh-empty">Loading.</p></div>
  if (state.status !== 'ready') {
    const text = { missing: 'Trips are not set up yet.', denied: 'Only team members can see this board.', gone: 'That trip does not exist.' }[state.status] ?? 'Could not load this trip.'
    return <div className="ehm ehm-page"><p className="eh-empty">{text}</p><Link className="eh-link" to="/trips">All trips</Link></div>
  }
  const ev = state.event
  return (
    <div className="ehm ehm-page" data-testid="trip-board">
      <p className="eh-kicker"><Link className="eh-link" to="/trips">Trips</Link></p>
      <h1 className="ehm-title">{ev.title}</h1>
      <p className="eh-hint">{isStaff ? 'Staff view. ' : ''}Plans are made by each family through its emailed link. This board is read-only.</p>
      {isStaff && <Link className="eh-btn eh-btn-primary" to={`/trips/${id}/manage`}>Open the mentor page</Link>}
      <Seg className="eh-tabs" label="Sections" value={tab} onPick={setTab}
           items={[{ key: 'carpool', label: 'Carpool' }, { key: 'food', label: 'Food' }, { key: 'info', label: 'Event info' }]} />
      {tab === 'carpool' && <CarpoolBoard board={state.board} tz={ev.timezone} viewer={isStaff ? 'staff' : 'member'} act={null} locked />}
      {tab === 'food' && <FoodBoard board={state.board} tz={ev.timezone} viewer={isStaff ? 'staff' : 'member'} act={null} locked />}
      {tab === 'info' && <EventInfo event={ev} />}
    </div>
  )
}

export default function TripsPage({ hasRole = () => false }) {
  const { id } = useParams()
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  return id ? <TripBoard key={id} id={id} isStaff={isStaff} /> : <TripList isStaff={isStaff} />
}
