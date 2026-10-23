import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { batteryBoard } from './batteries'
import { normEmail, isHeld } from './ideaCerts'
import { IconBattery, IconJobs, IconStatus, IconSkills, IconAuto, IconClock, IconWheel, IconThrow } from './navIcons'
import { leaderboard } from './driverScore'
import { leaderboard as hpLeaderboard } from './humanPlayerScore'
import { resolveCurrentSeason } from './seasons'
import { routineBoard, AUTO_READY_STREAK } from './autos'
import HubTile from './HubTile'
import './Hub.css'

// Robot (ledger 0017, decision 49): one top-bar item for the robot's own
// tools. Each tile carries its live state, read the way its page reads it; a
// read that fails (a migration not pasted) shows the tile without a number,
// never a 0. Every page keeps its own address.
export default function RobotPage({ session, hasRole = () => false }) {
  const uid = session?.user?.id
  const isStaff = ['mentor', 'lead', 'admin'].some(hasRole)
  const [s, setS] = useState({})
  useEffect(() => {
    let live = true
    const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const me = normEmail(session?.user?.email)
    Promise.all([
      supabase.from('batteries').select('id, label, status, charge_state'),
      supabase.from('battery_runs').select('battery_id, ran_at, kind, voltage_before, resistance_mohm, brownout').order('ran_at', { ascending: false }).limit(2000),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      uid ? supabase.from('task_claims').select('status').eq('member_id', uid).in('status', ['claimed', 'submitted']) : Promise.resolve({ data: [] }),
      supabase.from('subteam_status_reports').select('subteam, status, week_start').gte('week_start', since),
      me ? supabase.from('idea_cert_holders').select('code, status, expires_at').eq('email', me) : Promise.resolve({ data: [] }),
      supabase.from('auto_routines').select('id, name, active'),
      supabase.from('auto_runs').select('routine_id, result, ran_at').order('ran_at', { ascending: false }).limit(1000),
      supabase.from('sim_matches').select('id, started_at').order('started_at', { ascending: false }).limit(50),
      supabase.from('drive_sessions').select('member_id, session_date, minutes, kind, sim_score, voided_at').limit(5000),
      supabase.rpc('driver_rating_scores'),
      supabase.from('seasons').select('id, name, start_date, end_date'),
      supabase.from('hp_attempts').select('member_id, attempt_date, drill, made, attempted, made_inactive, seconds, voided_at, created_at').limit(5000),
    ]).then(([b, r, open, mine, st, certs, ar, au, sm, ds, dr, se, hp]) => {
      if (!live) return
      const board = !b.error && !r.error ? batteryBoard(b.data ?? [], r.data ?? []) : null
      setS({
        batteries: board ? { ready: board.filter((x) => x.matchReady).length, check: board.filter((x) => x.check).length, total: board.filter((x) => x.status !== 'retired').length } : null,
        jobs: open.error ? null : { open: open.count ?? 0, mine: (mine.data ?? []).length },
        status: st.error ? null : { flagged: (st.data ?? []).filter((x) => x.status && x.status !== 'green').length, reported: new Set((st.data ?? []).map((x) => x.subteam)).size },
        autos: ar.error || au.error ? null : (() => { const bd = routineBoard(ar.data ?? [], au.data ?? []).filter((x) => x.active !== false); return { ready: bd.filter((x) => x.ready).length, total: bd.length } })(),
        sims: sm.error ? null : { total: (sm.data ?? []).length, last: sm.data?.[0]?.started_at ?? null },
        drivers: ds.error || dr.error ? null : (() => { const bd = leaderboard(ds.data ?? [], dr.data ?? [], resolveCurrentSeason(se.data ?? []), () => ''); const meRow = bd.find((x) => x.id === uid); return { total: bd.length, rank: meRow?.rank ?? null, top: bd[0]?.score ?? null } })(),
        humans: hp.error || se.error ? null : (() => { const bd = hpLeaderboard(hp.data ?? [], resolveCurrentSeason(se.data ?? [])); const meRow = bd.ranked.find((x) => x.id === uid); return { total: bd.ranked.length, rank: meRow?.rank ?? null, top: bd.ranked[0]?.score ?? null, trying: bd.unranked.length } })(),
        certs: certs.error ? null : new Set((certs.data ?? []).filter((h) => isHeld(h, Date.now())).map((h) => h.code)).size,
      })
    })
    return () => { live = false }
  }, [uid, session?.user?.email])

  const b = s.batteries
  return (
    <main className="hub-wrap" data-page="robot">
      <header className="hub-head">
        <span className="hub-eyebrow">Robot</span>
        <h1 className="hub-title">Robot</h1>
        <p className="hub-sub">Batteries, autos, drivers, human players, the match simulator, jobs, sub-teams and certifications.</p>
      </header>
      <div className="hub-grid hub-grid-robot">
        <HubTile to="/batteries" icon={<IconBattery />} title="Batteries" tone={b?.check ? 'alert' : null} tour="robot-batteries"
          big={b ? b.ready : null} bigLabel="match-ready"
          line={b ? (b.total ? `${b.check} to check · ${b.total} in service` : 'No batteries added yet') : 'Not set up yet'} />
        <HubTile to="/autos" icon={<IconAuto />} title="Autos" tour="robot-autos"
          big={s.autos ? s.autos.ready : null} bigLabel="competition-ready"
          line={s.autos ? (s.autos.total ? `of ${s.autos.total} routines · ready at ${AUTO_READY_STREAK} in a row` : 'No routines added yet') : 'Not set up yet'} />
        <HubTile to="/drivers" icon={<IconWheel />} title="Drivers" tour="robot-drivers"
          big={s.drivers ? (s.drivers.rank ?? s.drivers.total) : null} bigLabel={s.drivers?.rank ? 'your rank' : 'drivers ranked'}
          line={s.drivers ? (s.drivers.total ? `${s.drivers.total} ranked this season · top score ${s.drivers.top}` : 'Log the first drive session') : 'Not set up yet'} />
        <HubTile to="/human-player" icon={<IconThrow />} title="Human player" tour="robot-human-player"
          big={s.humans ? (s.humans.rank ?? s.humans.total) : null} bigLabel={s.humans?.rank ? 'your rank' : 'ranked'}
          line={s.humans ? (s.humans.total ? `${s.humans.total} ranked this season · top score ${s.humans.top}` : s.humans.trying ? `${s.humans.trying} working toward a rank` : 'Run the first drill') : 'Not set up yet'} />
        <HubTile to="/match-sim" icon={<IconClock />} title="Match simulator" tour="robot-sim"
          big={s.sims ? s.sims.total : null} bigLabel="simulated"
          line={s.sims ? (s.sims.last ? `Last ${new Date(s.sims.last).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}` : 'Run the first one') : 'Not set up yet'} />
        <HubTile to="/jobs" icon={<IconJobs />} title="Jobs" tour="robot-jobs"
          big={s.jobs ? s.jobs.mine : null} bigLabel="yours"
          line={s.jobs ? `${s.jobs.open} open to claim` : ' '} />
        <HubTile to="/status-reports" icon={<IconStatus />} title="Sub-team status" tone={s.status?.flagged ? 'alert' : null}
          big={s.status ? s.status.flagged : null} bigLabel="at risk or late"
          line={s.status ? `${s.status.reported} sub-team${s.status.reported === 1 ? '' : 's'} reported this week` : 'Not set up yet'} />
        <HubTile to="/certifications" icon={<IconSkills />} title="Certifications" tour="robot-certs"
          big={isStaff ? null : s.certs ?? null} bigLabel={isStaff ? '' : 'IDEA certs held'}
          line={isStaff ? 'Who holds what, from IDEA Classroom' : 'Earned at ideabosco.com'} />
      </div>
    </main>
  )
}
