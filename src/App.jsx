import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import NavBar from './NavBar'
import ErrorBoundary from './ErrorBoundary'
import './App.css'

const LandingPage = lazy(() => import('./LandingPage'))
const LoginPage   = lazy(() => import('./LoginPage'))
const HomePage    = lazy(() => import('./HomePage'))
const MyHoursPage = lazy(() => import('./MyHoursPage'))
const HoursBoard  = lazy(() => import('./HoursBoard'))
const RosterPage     = lazy(() => import('./RosterPage'))
const ProfilePage    = lazy(() => import('./ProfilePage'))
const SkillsCatalog  = lazy(() => import('./SkillsCatalog'))
const MemberPage     = lazy(() => import('./MemberPage'))
const CheckinPage    = lazy(() => import('./CheckinPage'))
const CertifyPage      = lazy(() => import('./CertifyPage'))
const CoverageMatrix   = lazy(() => import('./CoverageMatrix'))
const LogHoursPage     = lazy(() => import('./LogHoursPage'))
const VerifyHoursPage  = lazy(() => import('./VerifyHoursPage'))
const ActivityPage     = lazy(() => import('./ActivityPage'))
const AccessGate       = lazy(() => import('./AccessGate'))

const Splash = () => (
  <div className="splash">
    <img src="/assets/logos/Mark-Gold.svg" className="splash-mark" alt="" />
  </div>
)

function ProtectedLayout({ hasRole, session }) {
  return (
    <div className="app-layout">
      <NavBar hasRole={hasRole} session={session} />
      <Outlet />
    </div>
  )
}

// Saves the intended NFC check-in URL then sends the user to login
function CheckinRedirect() {
  const location = useLocation()
  useEffect(() => {
    sessionStorage.setItem('pendingCheckin', location.pathname + location.search)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <Navigate to="/login" replace />
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [roles, setRoles]     = useState([])
  const [approved, setApproved] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    // Domain gate: claim_profile() approves allowed-domain members and grants
    // the default student role, then we load roles and the approved state.
    async function claimAndLoad(userId) {
      const { data: claimed } = await supabase.rpc('claim_profile')
      setApproved(claimed === true)
      const { data } = await supabase
        .from('member_roles')
        .select('role')
        .eq('member_id', userId)
      setRoles(data?.map(r => r.role) ?? [])
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        if (session) claimAndLoad(session.user.id)
      })
      .catch(() => setSession(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        claimAndLoad(session.user.id)
        // Complete any pending NFC check-in after login
        const pending = sessionStorage.getItem('pendingCheckin')
        if (pending) {
          sessionStorage.removeItem('pendingCheckin')
          navigate(pending, { replace: true })
        }
      } else {
        setRoles([])
        setApproved(null)
      }
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <Splash />

  const hasRole = (r) => roles.includes(r)

  // Signed in but approval not yet resolved: hold on the splash.
  if (session && approved === null) return <Splash />
  // Signed in but not approved: show the access gate instead of the app shell.
  if (session && approved === false) {
    return (
      <Suspense fallback={<Splash />}>
        <AccessGate session={session} />
      </Suspense>
    )
  }

  return (
    <ErrorBoundary>
    <Suspense fallback={<Splash />}>
      <Routes>
        {/* ── Public ── */}
        <Route path="/"      element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

        {/* ── Protected: shared NavBar via ProtectedLayout ── */}
        <Route element={session ? <ProtectedLayout hasRole={hasRole} session={session} /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<HomePage    session={session} hasRole={hasRole} />} />
          <Route path="/my-hours"  element={<MyHoursPage session={session} />} />
          <Route path="/log-hours" element={<LogHoursPage session={session} />} />
          <Route path="/hours"     element={<HoursBoard />} />
          <Route path="/roster"    element={<RosterPage />} />
          <Route path="/skills"      element={<SkillsCatalog hasRole={hasRole} />} />
          <Route path="/members/:id" element={<MemberPage session={session} hasRole={hasRole} />} />
          <Route path="/profile"     element={<ProfilePage session={session} />} />
          <Route path="/certify"     element={<CertifyPage session={session} hasRole={hasRole} />} />
          <Route path="/coverage"    element={<CoverageMatrix hasRole={hasRole} />} />
          <Route path="/verify-hours" element={<VerifyHoursPage session={session} hasRole={hasRole} />} />
          <Route path="/activity"    element={<ActivityPage hasRole={hasRole} />} />
        </Route>

        {/* ── Minimal: no NavBar, bundle stays small ── */}
        <Route
          path="/checkin"
          element={session ? <CheckinPage session={session} /> : <CheckinRedirect />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
