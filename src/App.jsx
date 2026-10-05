import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { resolveCurrentSeason } from './seasons'
import { nextApproval, nextRoles, nextOnboardedAt } from './claimApproval'
import NavBar from './NavBar'
import ErrorBoundary from './ErrorBoundary'
import './App.css'

// A tab left open across a deploy asks for a lazy chunk the new build no longer
// has (the service worker's precache cleanup removes the old build's files, and
// Vercel answers a missing /assets/*.js with index.html). Vite reports that as
// vite:preloadError. Reload ONCE so the tab picks up the new build; the path is
// remembered in sessionStorage, so a second failure on the same path is let
// through to the ErrorBoundary instead of reloading in a loop. With no storage
// (a private window that throws) nothing reloads: a loop is worse than the card.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem('techmen:chunk-reload') === window.location.pathname) return
      sessionStorage.setItem('techmen:chunk-reload', window.location.pathname)
    } catch { return }
    event.preventDefault()
    window.location.reload()
  })
}

const LandingPage = lazy(() => import('./LandingPage'))
const LoginPage   = lazy(() => import('./LoginPage'))
const HomePage    = lazy(() => import('./HomePage'))
const MyHoursPage = lazy(() => import('./MyHoursPage'))
const HoursBoard  = lazy(() => import('./HoursBoard'))
const RosterPage     = lazy(() => import('./RosterPage'))
const ProfilePage    = lazy(() => import('./ProfilePage'))
const SkillsCatalog  = lazy(() => import('./SkillsCatalog'))
const CertificationsPage = lazy(() => import('./CertificationsPage'))
const MemberSkillsHome = lazy(() => import('./MemberSkillsHome'))
const MemberPage     = lazy(() => import('./MemberPage'))
const CheckinPage    = lazy(() => import('./CheckinPage'))
const VolunteerCheckinPage = lazy(() => import('./VolunteerCheckinPage'))
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
const AccessRequestsPage = lazy(() => import('./AccessRequestsPage'))
const ParentHomePage   = lazy(() => import('./ParentHomePage'))
const SchedulePage     = lazy(() => import('./SchedulePage'))
const ReportsPage      = lazy(() => import('./ReportsPage'))
const MemberApplication  = lazy(() => import('./MemberApplication'))
const ApplicationsPage   = lazy(() => import('./ApplicationsPage'))
const ParentResponse     = lazy(() => import('./ParentResponse'))
const FeedbackPage       = lazy(() => import('./FeedbackPage'))
const AnnouncePage       = lazy(() => import('./AnnouncePage'))
const SurveyPage         = lazy(() => import('./SurveyPage'))
const SurveysAdmin       = lazy(() => import('./SurveysAdmin'))
// Event family hub (migrations 0005/0006). The family page is public, like
// ParentResponse; the trips pages are member and staff views in the shell.
const EventFamilyPage    = lazy(() => import('./EventFamilyPage'))
const EventJoinPage      = lazy(() => import('./EventJoinPage'))
const TripsPage          = lazy(() => import('./TripsPage'))
const TripsAdmin         = lazy(() => import('./TripsAdmin'))
// Mounted in ProtectedLayout, so it is on every authenticated page. Lazy with
// its OWN Suspense boundary and a null fallback: sharing the app-level
// boundary would put the whole shell back on the splash while it loads.
const FeedbackWidget     = lazy(() => import('./FeedbackWidget'))

// Design-system specimen (/_ds). Dev-guarded on Vite's DEV flag: the lazy
// import only exists in dev, so the bundle is never built into production and
// the route renders a 404 there. Touches no auth and no Supabase.
const SpecimenPage = import.meta.env.DEV ? lazy(() => import('./lib/design-system/specimen/SpecimenPage')) : null
// Fixture-mode control page (/_fixture): persona, migration switch, reset, and
// a link to every route. Same dev-only guard as /_ds, so it is absent from a
// production build and renders the same 404 there. It drives window.__fx,
// which exists only under `vite --mode fixture` (src/dev/fixture/README.md).
const FixturePage = import.meta.env.DEV ? lazy(() => import('./dev/fixture/FixturePage')) : null
const DsNotFound = () => <div style={{ padding: 32, fontFamily: 'monospace' }}>404 — not found</div>

const Splash = () => (
  <div className="splash">
    <img src="/assets/logos/Mark-Gold.svg" className="splash-mark" alt="" />
  </div>
)

function ProtectedLayout({ hasRole, session }) {
  // A page that throws is caught HERE, inside the layout, so the nav and the
  // feedback button stay up when a student most needs them. Keyed on the path
  // so navigating away (or Back) clears the error instead of keeping the card.
  const { pathname } = useLocation()
  return (
    <div className="app-layout">
      <NavBar hasRole={hasRole} session={session} />
      <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
      <Suspense fallback={null}>
        <FeedbackWidget session={session} />
      </Suspense>
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
  // The same value and the member it belongs to, readable inside claimAndLoad,
  // which runs from auth events and so cannot see a later render's state.
  const approvedRef = useRef(null) // { userId, approved } | null
  // The roles this tab holds, per member, on the same terms (claimApproval.js).
  const rolesRef = useRef(null) // { userId, roles } | null
  const [onboardedAt, setOnboardedAt] = useState(undefined)
  // Current season this member still owes an application for. undefined = not
  // resolved yet, null = nothing owed (already applied, or not a member track).
  const [appSeason, setAppSeason] = useState(undefined)
  const navigate = useNavigate()
  const location = useLocation()
  const tourStarted = useRef(false)

  useEffect(() => {
    // Domain gate: claim_profile() approves allowed-domain members and grants
    // the default student role, then we load roles, approval, and onboarding state.
    async function claimAndLoad(userId) {
      // A failed claim never revokes an approval this tab already holds: a
      // transient error on a tab resume would otherwise swap the whole tree
      // for AccessGate mid check-out (claimApproval.js).
      // Only THIS member's approval is held: a sign-in as somebody else starts
      // from nothing. Read once the answer is back, not before the call: two
      // claims run at once on every boot (getSession and INITIAL_SESSION), and
      // an error on one must keep what the other has just decided meanwhile.
      const claim = await supabase.rpc('claim_profile')
      const held = approvedRef.current?.userId === userId ? approvedRef.current.approved : null
      const isApproved = nextApproval(held, claim)
      approvedRef.current = { userId, approved: isApproved }
      setApproved(isApproved)
      // A failed roles read keeps the roles held for this member, read once the
      // answer is back for the same reason as the approval; with nothing held
      // it is UNKNOWN (null), never "no roles" (claimApproval.js nextRoles).
      const rolesRead = await supabase
        .from('member_roles')
        .select('role')
        .eq('member_id', userId)
      const heldRoles = rolesRef.current?.userId === userId ? rolesRef.current.roles : null
      const roleList = nextRoles(heldRoles, rolesRead)
      if (roleList) rolesRef.current = { userId, roles: roleList }
      setRoles(roleList ?? [])
      // Only a read that answered sets onboarded_at: a failed one keeps what is
      // held, so it never reads as "not onboarded" and starts the tour.
      const profRead = await supabase
        .from('profiles')
        .select('onboarded_at')
        .eq('id', userId)
        .single()
      setOnboardedAt(prev => nextOnboardedAt(prev, profRead))
      await loadApplicationState(userId, isApproved, roleList)
    }

    // The per-season member application gate. Only the member track is asked:
    // staff and parent-only accounts can't truthfully answer a student roster
    // form (pathway, parent contact, build-season commitment), and gating them
    // would lock mentors and parents out of the app behind it.
    async function loadApplicationState(userId, isApproved, roleList) {
      // Roles unknown (their read failed with nothing held): fail OPEN, as for
      // an application read error below, rather than read a mentor or a parent
      // as the member track and put them behind a student form.
      if (roleList === null) { setAppSeason(null); return }
      const staff  = roleList.some(r => ['mentor', 'lead', 'admin'].includes(r))
      const parent = roleList.includes('parent') && !staff
      if (!isApproved || staff || parent) { setAppSeason(null); return }

      const { data: seasonRows } = await supabase
        .from('seasons')
        .select('id, name, start_date, end_date')
        .order('start_date', { ascending: false })
      // No season spanning today means there is nothing to apply for yet.
      const season = resolveCurrentSeason(seasonRows ?? [])
      if (!season) { setAppSeason(null); return }

      const { data: existing, error: appErr } = await supabase
        .from('member_applications')
        .select('id')
        .eq('member_id', userId)
        .eq('season_id', season.id)
        .maybeSingle()
      // Fail OPEN: if the query itself errors (e.g. the migration hasn't run on
      // this environment yet), let the member into the app rather than trapping
      // them behind a form whose insert would fail.
      if (appErr) { setAppSeason(null); return }
      setAppSeason(existing ? null : season)
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
        rolesRef.current = null
        approvedRef.current = null
        setApproved(null)
        setOnboardedAt(undefined)
        setAppSeason(undefined)
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
    if (appSeason !== null) return   // application gate is up (or unresolved): no dashboard to tour
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
  }, [session, approved, onboardedAt, roles, appSeason, location.pathname])

  if (session === undefined) return <Splash />

  const hasRole = (r) => roles.includes(r)
  const isStaffUser = ['mentor', 'lead', 'admin'].some(hasRole)
  // Parent view renders only for a parent who is NOT staff (established rule).
  const parentView = hasRole('parent') && !isStaffUser

  // The parent questionnaire is a PUBLIC capability URL — the token in the path
  // is its only credential. It has to render for a signed-out parent, and it
  // must not be swallowed by either gate when whoever follows the link happens
  // to already be signed in (an unapproved guest, or a member who still owes an
  // application).
  const onParentPath = location.pathname.startsWith('/parent/')
  // The event family hub's family page (/e/<token>) is the same kind of public
  // capability URL, for parents with no account, and is let through the same
  // way. /e alone is its "lost your link" form.
  const onFamilyPath = location.pathname === '/e' || location.pathname.startsWith('/e/')
    || location.pathname === '/join' || location.pathname.startsWith('/join/')

  // The design-system specimen. It exists ONLY where SpecimenPage exists, which
  // is dev, and it touches no auth and no Supabase, so no gate has anything to
  // decide about it. Letting it through is what makes the harness reproducible
  // from a clean checkout: a harness that only runs for an approved member on
  // one machine is a personal convenience, not a verification mechanism, and
  // the first person who needs to check a component skips the check instead.
  // Scoped to this one path and to dev — nothing else is loosened.
  const onSpecimenPath = SpecimenPage != null && location.pathname === '/_ds'
  // The fixture control page is let through the same way and for the same
  // reason: it must be reachable as any persona, including signed out and
  // unapproved, or it could not switch away from them.
  const onFixturePath = FixturePage != null && location.pathname === '/_fixture'

  // Signed in but approval not yet resolved: hold on the splash.
  if (session && approved === null && !onParentPath && !onFamilyPath && !onSpecimenPath && !onFixturePath) return <Splash />
  // Signed in but not approved: show the access gate instead of the app shell.
  // Both gates sit outside the routed tree's boundary, so each carries its own:
  // a gate chunk that fails to load must show the card, not an empty page.
  // Each is keyed so it never reconciles with the routed tree's (same element
  // types at the root): a gate's caught error must not follow the member in.
  if (session && approved === false && !onParentPath && !onFamilyPath && !onSpecimenPath && !onFixturePath) {
    return (
      <ErrorBoundary key="access-gate">
        <Suspense fallback={<Splash />}>
          <AccessGate session={session} />
        </Suspense>
      </ErrorBoundary>
    )
  }

  // Approved member with no application for the current season: the application
  // takes the AccessGate slot until it's submitted. The NFC check-in fast paths
  // are deliberately let through — they're outside the app shell, and a member
  // mid-session must never be blocked from signing out by a form.
  const onCheckinPath = location.pathname.startsWith('/checkin')
  if (session && approved === true && !onCheckinPath && !onParentPath && !onFamilyPath && !onSpecimenPath && !onFixturePath) {
    if (appSeason === undefined) return <Splash />
    if (appSeason) {
      return (
        <ErrorBoundary key="member-application">
          <Suspense fallback={<Splash />}>
            <MemberApplication
              session={session}
              season={appSeason}
              onDone={() => setAppSeason(null)}
            />
          </Suspense>
        </ErrorBoundary>
      )
    }
  }

  return (
    <ErrorBoundary>
    <Suspense fallback={<Splash />}>
      <Routes>
        {/* ── Public ── */}
        <Route path="/"      element={session ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
        <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <LoginPage />} />

        {/* Parent questionnaire. Public by design: no session, no auth guard —
            the emailed token IS the credential, and the page never touches a
            Supabase table (everything goes through the parent-response
            Edge Function). Gates nothing; a parent who ignores it costs their
            student nothing. */}
        <Route path="/parent/:token" element={<ParentResponse />} />

        {/* Event family hub, the family page. Public by design, outside
            ProtectedLayout (no NavBar, no feedback widget, no notification
            code): the emailed token is the credential, and the page never
            touches a table (every call goes to the event-family Edge
            Function). /e alone is "lost your link". */}
        <Route path="/e/:token" element={<EventFamilyPage />} />
        <Route path="/e" element={<EventFamilyPage />} />
        {/* The open sign-up link (0007): like a Google Form, for parents and
            guardians. Public, outside ProtectedLayout, same as /e. */}
        <Route path="/join" element={<EventJoinPage />} />
        <Route path="/join/:eventId" element={<EventJoinPage />} />

        {/* Design-system specimen. Dev only — 404 in production. No auth, no Supabase. */}
        <Route path="/_ds" element={SpecimenPage ? <SpecimenPage /> : <DsNotFound />} />
        {/* Fixture controls. Dev only -- 404 in production, like /_ds. */}
        <Route path="/_fixture" element={FixturePage ? <FixturePage /> : <DsNotFound />} />

        {/* ── Protected: shared NavBar via ProtectedLayout ── */}
        <Route element={session ? <ProtectedLayout hasRole={hasRole} session={session} /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={parentView ? <ParentHomePage session={session} /> : <HomePage session={session} hasRole={hasRole} />} />
          <Route path="/schedule"  element={<SchedulePage session={session} hasRole={hasRole} />} />
          <Route path="/my-hours"  element={<MyHoursPage session={session} />} />
          <Route path="/log-hours" element={<LogHoursPage session={session} />} />
          <Route path="/hours"     element={<HoursBoard hasRole={hasRole} />} />
          <Route path="/roster"    element={<RosterPage />} />
          <Route path="/skills"      element={isStaffUser ? <SkillsCatalog hasRole={hasRole} /> : <MemberSkillsHome session={session} hasRole={hasRole} />} />
          {/* Read-only mirror of IDEA Classroom certifications (migration 0001). Not
              role-gated: the page picks its own staff / member / parent view and
              RLS decides the rows. */}
          <Route path="/certifications" element={<CertificationsPage session={session} hasRole={hasRole} />} />
          <Route path="/jobs"        element={<JobsPage session={session} hasRole={hasRole} />} />
          <Route path="/study"       element={<StudyPage session={session} hasRole={hasRole} />} />
          <Route path="/members/:id" element={<MemberPage session={session} hasRole={hasRole} />} />
          <Route path="/profile"     element={<ProfilePage session={session} hasRole={hasRole} />} />
          <Route path="/certify"     element={<CertifyPage session={session} hasRole={hasRole} />} />
          <Route path="/coverage"    element={<CoverageMatrix hasRole={hasRole} />} />
          <Route path="/verify-hours" element={<VerifyHoursPage session={session} hasRole={hasRole} />} />
          <Route path="/reports"     element={<ReportsPage session={session} hasRole={hasRole} />} />
          <Route path="/activity"    element={<ActivityPage hasRole={hasRole} />} />
          <Route path="/readiness"   element={<ReadinessPage hasRole={hasRole} />} />
          <Route path="/squad"       element={<SquadPage session={session} hasRole={hasRole} />} />
          <Route path="/access-requests" element={<AccessRequestsPage hasRole={hasRole} />} />
          <Route path="/applications"    element={<ApplicationsPage hasRole={hasRole} />} />
          <Route path="/feedback"        element={<FeedbackPage session={session} hasRole={hasRole} />} />
          {/* Discord announcements composer (migration 0003 + the discord-announce
              Edge Function). The page gates itself on hasRole('admin'). */}
          <Route path="/announce"        element={<AnnouncePage hasRole={hasRole} />} />
          {/* Weekly survey. The member route resolves whatever survey is open;
              the mentor route authors them and reads results. */}
          <Route path="/survey"          element={<SurveyPage session={session} />} />
          <Route path="/surveys"         element={<SurveysAdmin session={session} hasRole={hasRole} />} />
          {/* Event family hub: the read-only boards for members, and the
              mentor page (it gates itself; hub_staff_call is the boundary). */}
          <Route path="/trips"           element={<TripsPage hasRole={hasRole} />} />
          <Route path="/trips/:id"       element={<TripsPage hasRole={hasRole} />} />
          <Route path="/trips/:id/manage" element={<TripsAdmin hasRole={hasRole} />} />
          {/* Display lives inside the layout so the nav + profile stay visible. */}
          <Route path="/display" element={<PresenceBoard hasRole={hasRole} />} />
        </Route>

        {/* ── Minimal: no NavBar, bundle stays small ── */}
        <Route
          path="/checkin"
          element={session ? <CheckinPage session={session} /> : <CheckinRedirect />}
        />

        {/* Volunteer-hours fast path (summer FLL-room). Same minimal layout +
            pending-URL bounce as /checkin; sessions it opens are category='volunteer'. */}
        <Route
          path="/checkin-volunteer"
          element={session ? <VolunteerCheckinPage session={session} /> : <CheckinRedirect />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
