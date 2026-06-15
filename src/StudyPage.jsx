import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './StudyPage.css'

const STATUS_CLASS = {
  met:     'study-cell-met',
  partial: 'study-cell-partial',
  none:    'study-cell-none',
}

function Strip({ strip = [] }) {
  return (
    <div className="study-strip">
      {strip.map(d => (
        <span
          key={d.date}
          className={`study-cell ${STATUS_CLASS[d.status] || 'study-cell-none'}`}
          title={`${d.date}: ${d.minutes} min`}
        />
      ))}
    </div>
  )
}

export default function StudyPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const isAdmin = hasRole('admin')
  const uid = session.user.id
  const today = new Date().toISOString().slice(0, 10)

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [minutes, setMinutes] = useState('')
  const [note, setNote]       = useState('')
  const [date, setDate]       = useState(today)
  const [saving, setSaving]   = useState(false)

  const [goalInput, setGoalInput]   = useState('')
  const [savingGoal, setSavingGoal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('study_summary')
    setLoading(false)
    if (error) { setError(error.message); return }
    setError('')
    setData(data)
    setGoalInput(String(data.goal_minutes))
  }, [])

  useEffect(() => { load() }, [load])

  async function logMinutes(e) {
    e.preventDefault()
    const m = parseInt(minutes, 10)
    if (!m || m <= 0) return
    setSaving(true)
    const { error } = await supabase.from('study_sessions').insert({
      member_id: uid, date, minutes: m, note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setMinutes(''); setNote(''); setDate(today)
    load()
  }

  async function saveGoal(e) {
    e.preventDefault()
    const g = parseInt(goalInput, 10)
    if (!g || g <= 0) return
    setSavingGoal(true)
    const { error } = await supabase.from('app_settings')
      .update({ value: String(g) }).eq('key', 'study_daily_goal_minutes')
    setSavingGoal(false)
    if (error) { setError(error.message); return }
    load()
  }

  if (loading && !data) {
    return <div className="study-loading"><div className="study-spinner" /></div>
  }

  const goal      = data?.goal_minutes ?? 60
  const todayMin  = data?.today_minutes ?? 0
  const pct       = Math.min(100, Math.round((todayMin / goal) * 100))
  const roster    = data?.roster ?? []

  return (
    <div className="study-wrap">
      <div className="study-body">

        <h1 className="study-title">Self-Study</h1>

        {error && <p className="study-error" onClick={() => setError('')}>{error}</p>}

        {/* ── Student section ── */}
        <div className="study-card">
          <div className="study-stats">
            <div className="study-stat">
              <span className="study-stat-num">{data?.streak ?? 0}</span>
              <span className="study-stat-label">day streak</span>
            </div>
            <div className="study-stat">
              <span className="study-stat-num">{todayMin}<span className="study-stat-unit"> / {goal}m</span></span>
              <span className="study-stat-label">today</span>
            </div>
          </div>

          <div className="study-progress">
            <div className={`study-progress-bar${todayMin >= goal ? ' study-progress-met' : ''}`} style={{ width: `${pct}%` }} />
          </div>

          <div className="study-strip-block">
            <span className="study-strip-label">Last 14 days</span>
            <Strip strip={data?.strip} />
          </div>

          <form className="study-log" onSubmit={logMinutes}>
            <div className="study-log-fields">
              <input
                className="study-input study-input-min" type="number" min="1" max="1440"
                placeholder="Minutes" value={minutes}
                onChange={e => setMinutes(e.target.value)} required
              />
              <input
                className="study-input study-input-date" type="date" max={today}
                value={date} onChange={e => setDate(e.target.value)}
              />
              <input
                className="study-input study-input-note" type="text" maxLength={200}
                placeholder="Note (optional)" value={note}
                onChange={e => setNote(e.target.value)}
              />
              <button className="study-log-btn" type="submit" disabled={saving}>
                {saving ? 'Logging…' : 'Log'}
              </button>
            </div>
          </form>
        </div>

        {/* ── Admin: edit daily goal ── */}
        {isAdmin && (
          <form className="study-goal" onSubmit={saveGoal}>
            <label className="study-goal-label" htmlFor="study-goal-input">Daily goal (minutes)</label>
            <input
              id="study-goal-input" className="study-input study-goal-input" type="number" min="1" max="1440"
              value={goalInput} onChange={e => setGoalInput(e.target.value)}
            />
            <button className="study-goal-btn" type="submit" disabled={savingGoal}>
              {savingGoal ? 'Saving…' : 'Save goal'}
            </button>
          </form>
        )}

        {/* ── Staff: roster summary ── */}
        {isStaff && (
          <div className="study-roster">
            <h2 className="study-roster-title">Team study (active members)</h2>
            {roster.length === 0
              ? <p className="study-muted">No active members.</p>
              : <div className="study-table-wrap">
                  <table className="study-table">
                    <thead>
                      <tr>
                        <th className="study-th">Member</th>
                        <th className="study-th">Streak</th>
                        <th className="study-th">Missed (14d)</th>
                        <th className="study-th">Last 14 days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map(m => (
                        <tr key={m.member_id} className="study-row">
                          <td className="study-td study-name">{m.name || '—'}</td>
                          <td className="study-td">{m.streak}</td>
                          <td className={`study-td${m.days_missed_14 >= 7 ? ' study-missed-high' : ''}`}>{m.days_missed_14}</td>
                          <td className="study-td"><Strip strip={m.strip} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </div>
        )}

      </div>
    </div>
  )
}
