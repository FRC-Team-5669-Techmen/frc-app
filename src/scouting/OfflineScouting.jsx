import { useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import ScoutingPage from '../ScoutingPage'
import { supabase } from '../supabase'
import { readOfflineScoutingAccount, clearOfflineScoutingAccountUnless } from './offlineIdentity'

// Deliberately outside the online approval gate, for a previously prepared
// account's local cache and queue only. This grants no access to remote data.
export default function OfflineScouting() {
  const [account, setAccount] = useState(readOfflineScoutingAccount)
  function leave() {
    clearOfflineScoutingAccountUnless(); setAccount(null)
    // Local sign-out may finish after the network returns if Auth is refreshing.
    // Clearing the device hint immediately closes this offline surface.
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  }
  if (!account) return <main className="sc-wrap"><h1>Prepare scouting while connected</h1><p>This device has no prepared scouting account. Reconnect, sign in and open your event once before scouting offline.</p><p>Existing saved work stays on this device. Sign in with its original account to recover it.</p></main>
  return <>
    <aside className="sc-wrap sc-offline-banner" role="status"><strong>Offline scouting · this device only</strong><p>Using the account prepared {new Date(account.preparedAt).toLocaleString()}. Capture stays local until you reconnect and your current access is checked. Live team tools and Discord are unavailable here.</p><div className="sc-actions">{account.eventId && <Link className="sc-link" to={`/scouting/${account.eventId}`}>Open last prepared event</Link>}<button onClick={leave}>Exit offline scouting</button></div></aside>
    <Routes><Route path="/" element={<Navigate replace to={account.eventId ? `/scouting/${account.eventId}` : '/scouting'} />} /><Route path="/scouting/:eventId?" element={<ScoutingPage session={{ user: { id: account.memberId } }} offlineMemberId={account.memberId} />} /></Routes>
  </>
}
