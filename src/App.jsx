import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { supabase } from './supabase'
import NavBar from './NavBar'
import './App.css'

const LandingPage = lazy(() => import('./LandingPage'))
const LoginPage   = lazy(() => import('./LoginPage'))
const HomePage    = lazy(() => import('./HomePage'))
const MyHoursPage = lazy(() => import('./MyHoursPage'))
const HoursBoard  = lazy(() => import('./HoursBoard'))
const RosterPage  = lazy(() => import('./RosterPage'))
const CheckinPage = lazy(() => import('./CheckinPage'))

const Splash = () => (
  <div className="splash">
    <img src="/assets/logos/Mark-Gold.svg" className="splash-mark" alt="" />
  </div>
)

function ProtectedLayout({ hasRole }) {
  return (
    <div className="app-layout">
      <NavBar hasRole={hasRole} />
      <Outlet />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [roles, setRoles]     = useState([])

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

  if (session === undefined) return <Splash />

  const hasRole = (r) => roles.includes(r)

  return (
    <Suspense fallback={<Splash />}>
      <Routes>
        {/* ── Public ── */}
        <Route path="/"      element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

        {/* ── Protected: shared NavBar via ProtectedLayout ── */}
        <Route element={session ? <ProtectedLayout hasRole={hasRole} /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<HomePage    session={session} hasRole={hasRole} />} />
          <Route path="/my-hours"  element={<MyHoursPage session={session} />} />
          <Route path="/hours"     element={<HoursBoard />} />
          <Route path="/roster"    element={<RosterPage />} />
        </Route>

        {/* ── Minimal: no NavBar, bundle stays small ── */}
        <Route
          path="/checkin"
          element={session ? <CheckinPage session={session} /> : <Navigate to="/" replace />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
