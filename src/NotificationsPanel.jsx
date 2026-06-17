import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import './NotificationsPanel.css'

// Notification settings. Enables/disables web push (permission + pushManager
// subscribe/unsubscribe + storage), and edits per-category opt-outs + quiet
// hours bound to profiles.notification_prefs. Feature-detected; iOS shows
// install guidance instead of a dead button.

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

// `wired` = a backend trigger already sends this. Toggles with wired:false save
// the preference but won't fire until their trigger is built (see report).
// job_assignment + announcements are HIDDEN for now (no assignment action and no
// announcements system exist yet) — their prefs keys stay in DEFAULT_PREFS so
// re-enabling is just un-commenting the rows below once those features land.
const CATEGORIES = [
  { key: 'task_signoff',    label: 'Job sign-offs',      hint: 'When a mentor approves or returns your job',   wired: true },
  { key: 'event_reminder',  label: 'Event reminders',    hint: 'Before an event or meeting you’re going to',    wired: true },
  { key: 'schedule_change', label: 'Schedule changes',   hint: 'When an event is added, edited, or canceled',   wired: true },
  { key: 'shop_status',     label: 'Shop hours',         hint: 'When the shop opens or closes',                 wired: true },
  // { key: 'job_assignment',  label: 'Job assignments',    hint: 'When you’re assigned a new job or task',        wired: false },
  { key: 'skill_signoff',   label: 'Skill sign-offs',    hint: 'When a skill is certified',                     wired: true },
  { key: 'checkin_reminder',label: 'Check-in reminders', hint: 'A nudge if you forget to check out',            wired: true },
  { key: 'parent_digest',   label: 'Daily family recap', hint: 'One evening summary of your students’ day',     wired: true },
  // { key: 'announcements',   label: 'Team announcements', hint: 'Important messages from mentors',               wired: false },
]

const DEFAULT_PREFS = {
  enabled: true,
  task_signoff: true, event_reminder: true, schedule_change: true,
  shop_status: false, job_assignment: true, skill_signoff: true,
  checkin_reminder: false, parent_digest: true, announcements: true,
  quiet_hours: { start: '21:00', end: '07:00' },
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function NotificationsPanel({ session }) {
  const uid = session.user.id
  const supported = typeof window !== 'undefined' &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const iosNeedsInstall = isIos() && !isStandalone()

  const [prefs, setPrefs]       = useState(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy]         = useState(false)
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    supabase.from('profiles').select('notification_prefs').eq('id', uid).single()
      .then(({ data }) => setPrefs({ ...DEFAULT_PREFS, ...(data?.notification_prefs ?? {}) }))
    if (supported) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setSubscribed(!!sub))
        .catch(() => {})
    }
  }, [uid, supported])

  const savePrefs = useCallback(async (next) => {
    setPrefs(next)
    const { error } = await supabase.from('profiles').update({ notification_prefs: next }).eq('id', uid)
    if (error) setMsg(error.message)
  }, [uid])

  function setCategory(key, on) { savePrefs({ ...prefs, [key]: on }) }
  function setMaster(on)        { savePrefs({ ...prefs, enabled: on }) }
  function setQuiet(which, val) { savePrefs({ ...prefs, quiet_hours: { ...prefs.quiet_hours, [which]: val } }) }

  async function enable() {
    setBusy(true); setMsg('')
    try {
      if (!VAPID_PUBLIC) { setMsg('Push is not configured on the server yet.'); return }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setMsg('Notifications permission was not granted.'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
      const json = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert({
        endpoint: json.endpoint,
        member_id: uid,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      }, { onConflict: 'endpoint' })
      if (error) { setMsg(error.message); return }
      setSubscribed(true)
      setMsg('Notifications on for this device.')
    } catch (err) {
      setMsg(err?.message || 'Could not enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true); setMsg('')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
      setMsg('Notifications off for this device.')
    } catch (err) {
      setMsg(err?.message || 'Could not disable notifications.')
    } finally {
      setBusy(false)
    }
  }

  if (!prefs) return null

  return (
    <section className="np">
      <p className="np-eyebrow">NOTIFICATIONS</p>

      {!supported ? (
        <p className="np-note">This browser doesn't support push notifications.</p>
      ) : iosNeedsInstall ? (
        <p className="np-note">
          On iPhone/iPad, add Techmen to your Home Screen first (Share → Add to Home Screen),
          then open it from there to turn on notifications. (Requires iOS 16.4+.)
        </p>
      ) : (
        <>
          <div className="np-enable-row">
            <div className="np-enable-text">
              <span className="np-enable-title">Push notifications</span>
              <span className="np-enable-sub">{subscribed ? 'On for this device' : 'Off for this device'}</span>
            </div>
            {subscribed
              ? <button className="np-btn np-btn-off" onClick={disable} disabled={busy}>{busy ? '…' : 'Turn off'}</button>
              : <button className="np-btn" onClick={enable} disabled={busy}>{busy ? '…' : 'Enable'}</button>}
          </div>

          {msg && <p className="np-msg">{msg}</p>}

          <div className={`np-prefs${prefs.enabled === false ? ' np-prefs-muted' : ''}`}>
            <label className="np-master">
              <input type="checkbox" checked={prefs.enabled !== false} onChange={e => setMaster(e.target.checked)} />
              <span>All notifications</span>
            </label>

            {CATEGORIES.map(({ key, label, hint, wired }) => (
              <label key={key} className="np-cat">
                <input
                  type="checkbox"
                  checked={prefs[key] !== false}
                  disabled={prefs.enabled === false}
                  onChange={e => setCategory(key, e.target.checked)}
                />
                <span className="np-cat-text">
                  <span className="np-cat-label">
                    {label}
                    {!wired && <span className="np-cat-soon">soon</span>}
                  </span>
                  <span className="np-cat-hint">{hint}</span>
                </span>
              </label>
            ))}

            <div className="np-quiet">
              <span className="np-quiet-label">Quiet hours</span>
              <div className="np-quiet-times">
                <input type="time" className="np-time" value={prefs.quiet_hours?.start || '21:00'}
                  disabled={prefs.enabled === false} onChange={e => setQuiet('start', e.target.value)} />
                <span className="np-quiet-to">to</span>
                <input type="time" className="np-time" value={prefs.quiet_hours?.end || '07:00'}
                  disabled={prefs.enabled === false} onChange={e => setQuiet('end', e.target.value)} />
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
