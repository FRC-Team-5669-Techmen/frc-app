import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { computePresence, startOfTodayISO, fmtClock } from './presence'
import './CheckinPage.css'   // reuse the HUD state visuals (idle reticle, flood, fault)
import './KioskPage.css'

// Shared-tablet kiosk check-in. Runs unattended behind a staff session. Reads
// personal member tags via Web NFC, then TOGGLES attendance for the resolved
// member through the existing staff_override_attendance RPC — it does NOT touch
// the personal deep-link flow and writes no parallel data logic.

const HOLD_MS = 1500
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// Pull a member id (UUID) off a scanned tag. Supports a URL record carrying
// ?member=<uuid> / ?m=<uuid>, or any text/url record that contains a UUID.
function extractMemberId(message) {
  for (const rec of message.records || []) {
    let text = ''
    try {
      if (rec.recordType === 'url' || rec.recordType === 'absolute-url') {
        text = new TextDecoder().decode(rec.data)
        try {
          const u = new URL(text, 'https://x.invalid')
          const p = u.searchParams.get('member') || u.searchParams.get('m')
          if (p && UUID_RE.test(p)) return p.match(UUID_RE)[0]
        } catch { /* not a URL we can parse; fall through to UUID scan */ }
      } else {
        text = new TextDecoder(rec.encoding || 'utf-8').decode(rec.data)
      }
    } catch { /* undecodable record */ }
    const m = text && text.match(UUID_RE)
    if (m) return m[0]
  }
  return null
}

export default function KioskPage({ session, hasRole }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const nfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window

  // mode: 'unsupported' | 'denied' | 'arm' | 'idle' | 'success' | 'checkout' | 'fault'
  const [mode, setMode] = useState(nfcSupported ? (isStaff ? 'arm' : 'nostaff') : 'unsupported')
  const [result, setResult] = useState(null) // { name, time, faultMsg }
  const [presentCount, setPresentCount] = useState(null)
  const busy = useRef(false)
  const holdTimer = useRef(null)

  const refreshCount = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_events')
      .select('user_id, type, event_time')
      .gte('event_time', startOfTodayISO())
    setPresentCount(computePresence(data ?? []).size)
  }, [])

  useEffect(() => { if (isStaff && nfcSupported) refreshCount() }, [isStaff, nfcSupported, refreshCount])
  useEffect(() => () => clearTimeout(holdTimer.current), [])

  const returnToIdle = useCallback(() => {
    holdTimer.current = setTimeout(() => {
      setResult(null)
      setMode('idle')
      busy.current = false
    }, HOLD_MS)
  }, [])

  const handleTag = useCallback(async (message) => {
    if (busy.current) return
    busy.current = true
    try {
      const memberId = extractMemberId(message)
      if (!memberId) {
        setResult({ faultMsg: 'Tag not recognized — not a member tag' })
        setMode('fault'); return returnToIdle()
      }
      // Resolve the member against the existing profiles table.
      const { data: prof } = await supabase
        .from('profiles').select('id, full_name').eq('id', memberId).maybeSingle()
      if (!prof) {
        setResult({ faultMsg: 'Unknown member tag' })
        setMode('fault'); return returnToIdle()
      }
      // Current open-check-in state for this member, then toggle.
      const { data: ev } = await supabase
        .from('attendance_events').select('user_id, type, event_time')
        .eq('user_id', memberId).gte('event_time', startOfTodayISO())
      const isPresent = computePresence(ev ?? []).has(memberId)
      const newType = isPresent ? 'out' : 'in'

      const { error } = await supabase.rpc('staff_override_attendance', {
        target_member: memberId, new_type: newType,
      })
      if (error) {
        setResult({ faultMsg: error.message || 'Could not record attendance' })
        setMode('fault'); return returnToIdle()
      }

      if (navigator.vibrate) navigator.vibrate(40)
      const time = fmtClock(new Date().toISOString())
      setResult({ name: prof.full_name || 'Member', time })
      setMode(newType === 'in' ? 'success' : 'checkout')
      setPresentCount(c => (c == null ? c : c + (newType === 'in' ? 1 : -1)))
      returnToIdle()
    } catch (err) {
      setResult({ faultMsg: 'System fault — try again' })
      setMode('fault'); returnToIdle()
    }
  }, [returnToIdle])

  // Arm the scanner on a user gesture (Web NFC scan() needs activation).
  async function arm() {
    try {
      const reader = new window.NDEFReader()
      await reader.scan()
      reader.onreading = (e) => handleTag(e.message)
      reader.onreadingerror = () => {
        if (busy.current) return
        busy.current = true
        setResult({ faultMsg: 'Could not read tag — tap again' })
        setMode('fault'); returnToIdle()
      }
      setMode('idle')
      refreshCount()
    } catch (err) {
      setMode('denied')
    }
  }

  const CountChip = () => (
    presentCount == null ? null : (
      <span className="kiosk-count hud-tnum">
        <span className="kiosk-count-label">PRESENT</span>
        <span className="kiosk-count-num">{presentCount}</span>
      </span>
    )
  )

  function Header({ tag = 'KIOSK', dark = false }) {
    return (
      <header className={`checkin-header${dark ? ' checkin-header-dark' : ''}`}>
        <span className="checkin-header-mark">TECHMEN<span className="checkin-header-dot">·</span>5669</span>
        <span className="checkin-header-tag">{tag}</span>
      </header>
    )
  }

  // ── Non-scanning states ──
  if (mode === 'unsupported' || mode === 'denied' || mode === 'nostaff') {
    const copy = {
      unsupported: {
        tag: 'KIOSK', h: 'Kiosk needs Web NFC',
        d: 'This device or browser cannot read NFC tags. Open kiosk mode in Chrome on Android, which supports the Web NFC API.',
      },
      denied: {
        tag: 'KIOSK', h: 'NFC permission needed',
        d: 'Allow NFC access for this site, then arm the scanner again.',
      },
      nostaff: {
        tag: 'KIOSK', h: 'Staff sign-in required',
        d: 'Kiosk mode checks members in and out and must run under a mentor, lead, or admin account.',
      },
    }[mode]
    return (
      <div className="checkin-wrap checkin-fault kiosk-wrap">
        <Header tag={copy.tag} />
        <div className="checkin-mark checkin-mark-fault">!</div>
        <h1>{copy.h}</h1>
        <p className="checkin-status kiosk-msg">{copy.d}</p>
        {mode === 'denied' && (
          <button className="kiosk-arm-btn" onClick={arm}>ARM SCANNER</button>
        )}
        <footer className="checkin-footer checkin-footer-fault">STATUS // {mode === 'nostaff' ? 'NO STAFF' : 'NFC UNAVAILABLE'}</footer>
      </div>
    )
  }

  if (mode === 'arm') {
    return (
      <div className="checkin-wrap checkin-idle kiosk-wrap">
        <Header />
        <div className="checkin-target hud-brackets">
          <span className="hud-bracket-b" />
          <div className="checkin-target-label">NFC</div>
        </div>
        <h1 className="kiosk-arm-h">Kiosk ready</h1>
        <p className="checkin-loading-msg">Tap to start the scan loop</p>
        <button className="kiosk-arm-btn" onClick={arm}>ARM SCANNER</button>
        <footer className="checkin-footer">STATUS // STANDBY</footer>
      </div>
    )
  }

  if (mode === 'fault') {
    return (
      <div className="checkin-wrap checkin-fault kiosk-wrap">
        <Header tag="FAULT" />
        <div className="checkin-mark checkin-mark-fault">✗</div>
        <h1>Fault</h1>
        <p className="checkin-status kiosk-msg">{result?.faultMsg}</p>
        <footer className="checkin-footer checkin-footer-fault">STATUS // FAULT</footer>
      </div>
    )
  }

  if (mode === 'success' || mode === 'checkout') {
    const isIn = mode === 'success'
    return (
      <div className={`checkin-wrap ${isIn ? 'checkin-success' : 'checkin-checkout'} kiosk-wrap`}>
        <Header tag={isIn ? 'ON DECK' : 'CHECK-OUT'} dark={isIn} />
        <div className="checkin-mark">✓</div>
        <h1 className="checkin-name">{result?.name}</h1>
        <p className="checkin-status">CHECKED {isIn ? 'IN' : 'OUT'} · {result?.time}</p>
        <footer className="checkin-footer">STATUS // {isIn ? 'ON DECK' : 'CLEAR'}</footer>
      </div>
    )
  }

  // ── Idle scan loop ──
  return (
    <div className="checkin-wrap checkin-idle kiosk-wrap">
      <Header />
      <CountChip />
      <div className="checkin-target hud-brackets">
        <span className="hud-bracket-b" />
        <div className="checkin-ring" />
        <div className="checkin-target-label">SCAN NFC</div>
      </div>
      <p className="checkin-loading-msg">Tap your member tag</p>
      <footer className="checkin-footer">STATUS // AWAITING TAG</footer>
    </div>
  )
}
