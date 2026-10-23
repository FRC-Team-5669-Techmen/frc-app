import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { batteryBoard } from './batteries'
import { normEmail, isHeld } from './ideaCerts'
import { IconBattery, IconJobs, IconStatus, IconSkills } from './navIcons'
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
    ]).then(([b, r, open, mine, st, certs]) => {
      if (!live) return
      const board = !b.error && !r.error ? batteryBoard(b.data ?? [], r.data ?? []) : null
      setS({
        batteries: board ? { ready: board.filter((x) => x.matchReady).length, check: board.filter((x) => x.check).length, total: board.filter((x) => x.status !== 'retired').length } : null,
        jobs: open.error ? null : { open: open.count ?? 0, mine: (mine.data ?? []).length },
        status: st.error ? null : { flagged: (st.data ?? []).filter((x) => x.status && x.status !== 'green').length, reported: new Set((st.data ?? []).map((x) => x.subteam)).size },
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
        <p className="hub-sub">Batteries, jobs, sub-teams and certifications in one place.</p>
      </header>
      <div className="hub-grid hub-grid-robot">
        <HubTile to="/batteries" icon={<IconBattery />} title="Batteries" tone={b?.check ? 'alert' : null} tour="robot-batteries"
          big={b ? b.ready : null} bigLabel="match-ready"
          line={b ? (b.total ? `${b.check} to check · ${b.total} in service` : 'No batteries added yet') : 'Not set up yet'} />
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
