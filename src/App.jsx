import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import LoginPage from './LoginPage'
import HomePage from './HomePage'
import CheckinPage from './CheckinPage'
import './App.css'

const HoursBoard = lazy(() => import('./HoursBoard'))

export default function App() {
  const [session, setSession] = useState(undefined)
  const [roles, setRoles] = useState([])

  useEffect(() => {
    async function loadRoles(userId) {
      const { data } = await supabase
        .from('member_roles')
        .select('role')
        .eq('member_id', userId)
      setRoles(data?.map(r => r.role) ?? [])
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        if (session) loadRoles(session.user.id)
      })
      .catch(() => setSession(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) loadRoles(session.user.id)
      else setRoles([])
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="splash">
        <div className="logo">5669</div>
      </div>
    )
  }

  const hasRole = (r) => roles.includes(r)

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <HomePage session={session} hasRole={hasRole} /> : <LoginPage />}
      />
      <Route
        path="/checkin"
        element={session ? <CheckinPage session={session} /> : <Navigate to="/" replace />}
      />
      <Route
        path="/hours"
        element={session ? (
          <Suspense fallback={<div className="splash"><div className="logo">5669</div></div>}>
            <HoursBoard />
          </Suspense>
        ) : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
