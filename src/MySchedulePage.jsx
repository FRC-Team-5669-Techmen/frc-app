// My schedule (ledger 0033): /my-schedule. One member's own competition day:
// where to be and when (role board stations), their ride, and the team's
// blocks, per day, with Now and Next on top. Reminders: 10 minutes before an
// assigned station and 15 before a car leaves (0043, pg_cron + send-push).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { boardView, TIME_FMT } from './roleBoard'
import { eventDayKeys } from './eventDays'
import { currentSubscription, isIos, isStandalone, pushSupported, subscribePush } from './pushSubscribe'
import { buildDays, defaultDay, nowNext, REMIND_RIDE_MIN, REMIND_STATION_MIN } from './mySchedule'
import './MySchedule.css'

const DAY = 864e5

export default function MySchedulePage({ session }) {
  const uid = session?.user?.id
  const [params, setParams] = useSearchParams()
  const [comps, setComps] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  // 'on' (this device is subscribed), 'off', 'ios' (add to Home Screen first), 'unsupported', or a message.
  const [notify, setNotify] = useState('checking')
  const [notifyMsg, setNotifyMsg] = useState('')
  useEffect(() => {
    if (isIos() && !isStandalone()) { setNotify('ios'); return }
    if (!pushSupported()) { setNotify('unsupported'); return }
    currentSubscription().then((sub) => setNotify(sub ? 'on' : 'off'))
  }, [])
  async function turnOn() {
    setNotifyMsg('')
    try { const r = await subscribePush(uid); if (r.ok) setNotify('on'); else setNotifyMsg(r.message) } catch (e) { setNotifyMsg(e?.message || 'Could not turn on reminders.') }
  }
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30e3); return () => clearInterval(t) }, [])

  // Competitions that have not ended and start within two weeks.
  useEffect(() => {
    let live = true
    const t = Date.now()
    supabase.from('events').select('id,title,kind,starts_at,ends_at,location').eq('kind', 'competition')
      .gte('ends_at', new Date(t - DAY).toISOString()).lte('starts_at', new Date(t + 14 * DAY).toISOString()).order('starts_at')
      .then(({ data: rows, error: e }) => { if (!live) return; if (e) setError(e.message); setComps(rows ?? []) })
    return () => { live = false }
  }, [])
  const comp = useMemo(() => (comps ?? []).find((c) => c.id === params.get('event')) ?? (comps ?? [])[0] ?? null, [comps, params])

  const load = useCallback(async () => {
    if (!comp) return
    const keys = eventDayKeys(comp)
    const first = keys[0], last = keys.at(-1)
    const from = new Date(Date.parse(comp.starts_at) - DAY).toISOString(), to = new Date(Date.parse(comp.ends_at ?? comp.starts_at) + DAY).toISOString()
    const [events, board, rides] = await Promise.all([
      supabase.from('events').select('id,title,kind,starts_at,ends_at,location,notes').lt('starts_at', to).gt('ends_at', from).order('starts_at'),
      supabase.rpc('role_board', { p_event: comp.id }),
      supabase.rpc('my_schedule_rides', { p_from: first, p_to: last }),
    ])
    setData({
      events: events.data ?? [],
      shifts: board.error || !board.data ? [] : boardView(board.data, uid).myShifts,
      boardOk: !board.error,
      rides: rides.error ? [] : (rides.data ?? []),
      ridesMissing: !!rides.error && isSchemaMissing(rides.error),
      loadedAt: Date.now(),
    })
  }, [comp, uid])
  useEffect(() => { load(); const t = setInterval(load, 2 * 60e3); return () => clearInterval(t) }, [load])

  const days = useMemo(() => (comp && data ? buildDays({ competition: comp, events: data.events, shifts: data.shifts, rides: data.rides }) : []), [comp, data])
  const dayKey = params.get('day') && days.some((d) => d.key === params.get('day')) ? params.get('day') : defaultDay(days, now)
  const day = days.find((d) => d.key === dayKey)
  const nn = nowNext(days, now)
  const pick = (k, v) => { const p = new URLSearchParams(params); p.set(k, v); setParams(p, { replace: true }) }
  const mineCount = days.reduce((n, d) => n + d.items.filter((it) => it.kind !== 'team').length, 0)

  if (comps === null) return <main className="ms-wrap"><p role="status">Loading your schedule…</p></main>
  if (!comp) return <main className="ms-wrap"><h1>My schedule</h1><p className="ms-help">No competition in the next two weeks. Your stations show here once a competition is on the calendar.</p></main>

  return <main className="ms-wrap" data-my-schedule>
    <header className="ms-head">
      <div><span className="ms-eyebrow">My schedule</span><h1>{comp.title}</h1><p className="ms-help">{comp.location}</p></div>
      {comps.length > 1 && <select aria-label="Competition" value={comp.id} onChange={(e) => pick('event', e.target.value)}>{comps.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}
    </header>
    {error && <p className="ms-error" role="alert">{error}</p>}

    <section className="ms-now" aria-label="Now and next" data-now-next>
      {nn.now && <div className="ms-now-card ms-now-on"><span className="ms-eyebrow">Now</span><strong>{nn.now.title}</strong><span>{nn.now.detail}{nn.now.where ? ` · ${nn.now.where}` : ''}{nn.now.end ? ` · until ${TIME_FMT(nn.now.end)}` : ''}</span></div>}
      {nn.next ? <div className="ms-now-card"><span className="ms-eyebrow">Next{nn.minutesToNext <= 120 ? ` in ${nn.minutesToNext} min` : ` · ${new Date(nn.next.start).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' })} ${TIME_FMT(nn.next.start)}`}</span><strong>{nn.next.title}</strong><span>{nn.next.detail}{nn.next.where ? ` · ${nn.next.where}` : ''}</span></div>
        : !nn.now && <div className="ms-now-card"><span className="ms-eyebrow">Next</span><strong>{mineCount ? 'Nothing else for you' : 'No stations yet'}</strong><span>{mineCount ? 'You are done. Help where a mentor asks.' : 'Ask for slots on the role board; a mentor assigns them.'}</span></div>}
    </section>

    {['off', 'ios', 'unsupported'].includes(notify) && <div className="ms-remind" data-remind-cta>
      <div><strong>Get a buzz before each station</strong><span>{REMIND_STATION_MIN} minutes before every station you are assigned, and {REMIND_RIDE_MIN} before your car leaves.{notify === 'ios' ? ' On an iPhone: Share, then Add to Home Screen, open Techmen from there, then turn this on.' : notify === 'unsupported' ? ' This browser cannot get notifications; open the app in Chrome or Safari.' : ''}</span>{notifyMsg && <span className="ms-note">{notifyMsg}</span>}</div>
      {notify === 'off' && <button className="ms-btn" onClick={turnOn}>Turn on</button>}
    </div>}
    {notify === 'on' && <p className="ms-help ms-on" data-remind-on>Reminders on for this device: {REMIND_STATION_MIN} min before each assigned station, {REMIND_RIDE_MIN} min before your car leaves. <Link to="/profile">Settings</Link></p>}

    <nav className="ms-days" aria-label="Days">{days.map((d) => <button key={d.key} aria-pressed={d.key === dayKey} onClick={() => pick('day', d.key)}>{d.label}<small>{d.items.filter((it) => it.kind !== 'team').length || ''}</small></button>)}</nav>

    {day && <ol className="ms-list" aria-label={`Schedule for ${day.label}`}>
      {day.items.map((it) => {
        const past = (it.end ? Date.parse(it.end) : Date.parse(it.start) + 30 * 60e3) < now
        const on = nn.now?.id === it.id
        return <li key={it.id} className={`ms-item ms-${it.kind}${it.status === 'backup' ? ' ms-backup' : ''}${past ? ' ms-past' : ''}${on ? ' ms-on-now' : ''}`} data-kind={it.kind}>
          <span className="ms-time">{it.start ? TIME_FMT(it.start) : '--'}{it.end ? <small>{TIME_FMT(it.end)}</small> : null}</span>
          <div className="ms-body">
            <span className="ms-tag">{it.kind === 'station' ? (it.status === 'backup' ? 'Backup' : 'You') : it.kind === 'ride' ? 'Your ride' : (it.kindLabel ?? 'Team')}</span>
            <strong>{it.title}</strong>
            {(it.detail || it.where) && <span className="ms-detail">{[it.detail, it.where].filter(Boolean).join(' · ')}</span>}
            {it.note && <span className="ms-note">{it.note}</span>}
          </div>
        </li>
      })}
      {!day.items.length && <li className="ms-empty">Nothing on this day.</li>}
    </ol>}
    {data?.ridesMissing && <p className="ms-help">Rides show here once the update reaches the server.</p>}
    <p className="ms-help ms-foot"><Link to={`/roles/${comp.id}`}>Role board</Link> · <Link to="/trips">Carpool</Link> · <Link to="/schedule">Team calendar</Link>{data?.loadedAt ? ` · updated ${TIME_FMT(new Date(data.loadedAt).toISOString())}` : ''}</p>
  </main>
}
