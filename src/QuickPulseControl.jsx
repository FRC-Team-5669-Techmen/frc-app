import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { approveSignout } from './signout'
import { isSchemaMissing } from './schemaMissing'

// Quick pulse (Mr. Pina, 2026-10-19): on /display a mentor taps a name and
// signs that member in or out from the same panel. Two taps, because the board
// is often a shared shop screen: the first arms the button, the second writes.
//
// Writes go through the staff RPC the Verify Hours panel already uses,
// staff_add_event (supabase/admin_hours_management.sql): staff only, a reason
// on every write, an attendance_audit row each time. When the member has a
// sign-out request waiting (0014), Sign out approves it instead, so their note
// lands on the OUT.

const REASON = 'Staff override from the presence board'

function fmtClock(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
}

export default function QuickPulseControl({ memberId, name, since, onChanged }) {
  const isIn = !!since
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [pending, setPending] = useState(null)

  useEffect(() => {
    let live = true
    setArmed(false)
    setMsg(null)
    supabase.from('signout_requests').select('id, note').eq('member_id', memberId).eq('status', 'pending').limit(1)
      .then(({ data, error }) => { if (live) setPending(error && isSchemaMissing(error) ? null : data?.[0] ?? null) })
    return () => { live = false }
  }, [memberId, since])

  // Disarm after a few seconds so a stray tap later does nothing.
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(t)
  }, [armed])

  async function act() {
    if (busy) return
    if (!armed) { setArmed(true); return }
    setBusy(true)
    setMsg(null)
    try {
      if (isIn && pending) {
        await approveSignout(supabase, pending.id)
      } else {
        const { error } = await supabase.rpc('staff_add_event', {
          p_member: memberId, p_type: isIn ? 'out' : 'in', p_event_time: new Date().toISOString(),
          p_category: 'build', p_reason: REASON,
        })
        if (error) throw error
      }
      setMsg(isIn ? `${name} signed out.` : `${name} signed in.`)
      onChanged?.()
    } catch (err) {
      setMsg(`Not done${err?.code ? ` (${err.code})` : ''}: ${err?.message ?? 'try again'}`)
    }
    setArmed(false)
    setBusy(false)
  }

  const label = busy ? '…'
    : armed ? (isIn ? `Tap again to sign ${name} out` : `Tap again to sign ${name} in`)
      : isIn ? (pending ? 'Approve sign-out' : 'Sign out now') : 'Sign in now'

  return (
    <div className="qp" data-state={isIn ? 'in' : 'out'}>
      <div className="qp-status">
        <span className={`qp-dot${isIn ? ' qp-dot-in' : ''}`} aria-hidden="true" />
        <span className="qp-text">{isIn ? `Signed in since ${fmtClock(since)}` : 'Not signed in'}</span>
      </div>
      {isIn && pending && <p className="qp-note">Waiting to sign out: “{pending.note}”</p>}
      <button type="button" className={`qp-btn${armed ? ' qp-armed' : ''}`} onClick={act} disabled={busy}>{label}</button>
      {msg && <p className="qp-msg" role="status">{msg}</p>}
    </div>
  )
}
