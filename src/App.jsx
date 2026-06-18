import { useState, useEffect, useRef, lazy, Suspense } from 'react'
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
const MemberSkillsHome = lazy(() => import('./MemberSkillsHome'))
const MemberPage     = lazy(() => import('./MemberPage'))
const CheckinPage    = lazy(() => import('./CheckinPage'))
const CertifyPage      = lazy(() => import('./CertifyPage'))
const CoverageMatrix   = lazy(() => import('./CoverageMatrix'))
const LogHoursPage     = lazy(() => import('./LogHoursPage'))
const VerifyHoursPage  = lazy(() => import('./VerifyHoursPage'))
const ActivityPage     = lazy(() => import('./ActivityPage'))
const AccessGate       = lazy(() => import('./AccessGate'))
const JobsPage         = lazy(() => import('./JobsPage'))
const ReadinessPage    = lazy(() => import('./ReadinessPage'))
const StudyPage        = lazy(() => import('./StudyPage'))
const SquadPage        = lazy(() => import('./SquadPage'))
const PresenceBoard    = lazy(() => import('./PresenceBoard'))
// Kiosk deactivated (hidden from the UI). Restore with the /kiosk route + nav entry.
// const KioskPage        = lazy(() => import('./KioskPage'))
const AccessRequestsPage = lazy(() => import('./AccessRequestsPage'))
const ParentHomePage   = lazy(() => import('./ParentHomePage'))
const SchedulePage     = lazy(() => import('./SchedulePage'))

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
  const [onboardedAt, setOnboardedAt] = useState(undefined)
  const navigate = useNavigate()
  const location = useLocation()
  const tourStarted = useRef(false)

  useEffect(() => {
    // Domain gate: claim_profile() approves allowed-domain members and grants
    // the default student role, then we load roles, approval, and onboarding state.
    async function claimAndLoad(userId) {
      const { data: claimed } = await supabase.rpc('claim_profile')
      setApproved(claimed === true)
      const { data } = await supabase
        .from('member_roles')
        .select('role')
        .eq('member_id', userId)
      setRoles(data?.map(r => r.role) ?? [])
      const { data: prof } = await supabase
        .from('profiles')
        .select('onboarded_at')
        .eq('id', userId)
        .single()
      setOnboardedAt(prof?.onboarded_at ?? null)
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
        setOnboardedAt(undefined)
        tourStarted.current = false
      }
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-run the onboarding tour once, on the dashboard, after roles load so the
  // right track is chosen. Marks onboarded_at on finish/skip so it never repeats.
  useEffect(() => {
    if (tourStarted.current) return
    if (!session || approved !== true) return
    if (onboardedAt === undefined || onboardedAt) return  // not loaded, or already done
    if (location.pathname !== '/dashboard') return
    if (roles.length === 0) return                         // wait for roles to resolve
    tourStarted.current = true

    const isStaff = roles.some(r => ['mentor', 'lead', 'admin'].includes(r))
    const isParentTrack = roles.includes('parent') && !isStaff
    let tries = 0
    let timer
    const run = async () => {
      // Wait for the lazy dashboard to mount before spotlighting its elements
      if (!document.querySelector('[data-tour="status-card"]') && tries < 20) {
        tries++
        timer = setTimeout(run, 150)
        return
      }
      const { startTour } = await import('./tour')
      startTour(isStaff, async () => {
        const now = new Date().toISOString()
        await supabase.from('profiles').update({ onboarded_at: now }).eq('id', session.user.id)
        setOnboardedAt(now)
      }, isParentTrack)
    }
    run()
    return () => clearTimeout(timer)
  }, [session, approved, onboardedAt, roles, location.pathname])

  if (session === undefined) return <Splash />

  const hasRole = (r) => roles.includes(r)
  const isStaffUser = ['mentor', 'lead', 'admin'].some(hasRole)
  // Parent view renders only for a parent who is NOT staff (established rule).
  const parentView = hasRole('parent') && !isStaffUser

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
          <Route path="/dashboard" element={parentView ? <ParentHomePage session={session} /> : <HomePage session={session} hasRole={hasRole} />} />
          <Route path="/schedule"  element={<SchedulePage session={session} hasRole={hasRole} />} />
          <Route path="/my-hours"  element={<MyHoursPage session={session} />} />
          <Route path="/log-hours" element={<LogHoursPage session={session} />} />
          <Route path="/hours"     element={<HoursBoard hasRole={hasRole} />} />
          <Route path="/roster"    element={<RosterPage />} />
          <Route path="/skills"      element={isStaffUser ? <SkillsCatalog hasRole={hasRole} /> : <MemberSkillsHome session={session} hasRole={hasRole} />} />
          <Route path="/jobs"        element={<JobsPage session={session} hasRole={hasRole} />} />
          <Route path="/study"       element={<StudyPage session={session} hasRole={hasRole} />} />
          <Route path="/members/:id" element={<MemberPage session={session} hasRole={hasRole} />} />
          <Route path="/profile"     element={<ProfilePage session={session} />} />
          <Route path="/certify"     element={<CertifyPage session={session} hasRole={hasRole} />} />
          <Route path="/coverage"    element={<CoverageMatrix hasRole={hasRole} />} />
          <Route path="/verify-hours" element={<VerifyHoursPage session={session} hasRole={hasRole} />} />
          <Route path="/activity"    element={<ActivityPage hasRole={hasRole} />} />
          <Route path="/readiness"   element={<ReadinessPage hasRole={hasRole} />} />
          <Route path="/squad"       element={<SquadPage session={session} hasRole={hasRole} />} />
          <Route path="/access-requests" element={<AccessRequestsPage hasRole={hasRole} />} />
          {/* Display lives inside the layout so the nav + profile stay visible. */}
          <Route path="/display" element={<PresenceBoard />} />
        </Route>

        {/* ── Minimal: no NavBar, bundle stays small ── */}
        <Route
          path="/checkin"
          element={session ? <CheckinPage session={session} /> : <CheckinRedirect />}
        />

        {/* Kiosk deactivated — route disabled so it can't be reached. Restore by
            un-commenting this and the Kiosk nav entry in NavBar.jsx.
        <Route
          path="/kiosk"
          element={session ? <KioskPage session={session} hasRole={hasRole} /> : <Navigate to="/login" replace />}
        /> */}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
