import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import './NavBar.css'

// Mono unit/context tag shown at the right of the header, derived from route.
const CONTEXT_TAGS = [
  ['/dashboard',   'CMD'],
  ['/schedule',    'SCHEDULE'],
  ['/my-hours',    'HRS//SELF'],
  ['/hours',       'HRS//TEAM'],
  ['/log-hours',   'HRS//LOG'],
  ['/skills',      'SKILLS'],
  ['/jobs',        'TASKING'],
  ['/study',       'TRAINING'],
  ['/members/',    'PERSONNEL'],
  ['/profile',     'PROFILE'],
  ['/readiness',   'READINESS'],
  ['/activity',    'ACTIVITY'],
  ['/squad',       'SQUAD'],
  ['/display',     'DISPLAY'],
  ['/kiosk',       'KIOSK'],
  ['/roster',      'ROSTER'],
  ['/access-requests', 'ACCESS'],
  ['/verify-hours','HRS//VERIFY'],
  ['/certify',     'CERTIFY'],
  ['/coverage',    'COVERAGE'],
]
function contextTag(pathname) {
  const hit = CONTEXT_TAGS.find(([p]) => pathname === p || pathname.startsWith(p))
  return hit ? hit[1] : 'TECHMEN'
}

function useOutsideClick(ref, onClose) {
  useEffect(() => {
    if (!ref) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}

function Dropdown({ label, paths = [], tourId, align = 'left', badge = 0, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()
  const active = paths.some(p => pathname === p || pathname.startsWith(p + '/'))

  useOutsideClick(ref, () => setOpen(false))

  return (
    <div className="nav-dropdown" ref={ref}>
      <button
        className={`nav-link nav-dropdown-trigger${active ? ' active' : ''}`}
        data-tour={tourId}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        {badge > 0 && <span className="nav-badge nav-badge-trigger">{badge}</span>}
        <span className={`nav-chevron${open ? ' nav-chevron-up' : ''}`}>▾</span>
      </button>
      {open && (
        <div
          className={`nav-dropdown-menu${align === 'right' ? ' nav-dropdown-menu-right' : ''}`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

// Staff links now live here (moved out of the top-row Staff dropdown).
const STAFF_LINKS = [
  ['/readiness',      'Readiness'],
  ['/activity',       'Activity'],
  ['/squad',          'Squad'],
  ['/display',        'Display'],
  ['/kiosk',          'Kiosk'],
  ['/roster',         'Roster'],
  ['/access-requests','Access Requests'],
  ['/verify-hours',   'Verify Hours'],
  ['/certify',        'Certify Skills'],
  ['/coverage',       'Skill Coverage'],
]

function AvatarMenu({ avatarUrl, initials, name, isStaff, pendingAccess = 0 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useOutsideClick(ref, () => setOpen(false))

  async function replayTour() {
    const { startTour } = await import('./tour')
    startTour(isStaff)
  }

  const itemClass = ({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`

  return (
    <div className="nav-avatar-wrap" ref={ref}>
      <button className="nav-avatar-btn" data-tour="nav-profile" onClick={() => setOpen(o => !o)} aria-label="Account menu">
        {avatarUrl
          ? <img src={avatarUrl} className="navbar-avatar" alt={name} />
          : <div className="navbar-avatar navbar-avatar-init">{initials}</div>
        }
        {isStaff && pendingAccess > 0 && <span className="nav-avatar-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="nav-dropdown-menu nav-avatar-menu" onClick={() => setOpen(false)}>
          <NavLink to="/profile" className={itemClass}>My Profile</NavLink>
          <button className="nav-dropdown-item" onClick={replayTour}>Replay tour</button>

          {isStaff && (
            <>
              <div className="nav-dropdown-divider" />
              <span className="nav-dropdown-section">Staff</span>
              {STAFF_LINKS.map(([to, label]) => (
                <NavLink key={to} to={to} className={itemClass}>
                  {label}
                  {to === '/access-requests' && pendingAccess > 0 && <span className="nav-badge">{pendingAccess}</span>}
                </NavLink>
              ))}
            </>
          )}

          <div className="nav-dropdown-divider" />
          <button
            className="nav-dropdown-item nav-signout-item"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function NavBar({ hasRole = () => false, session = null }) {
  const isStaff   = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  // Parent-only view: parent who is NOT staff sees a reduced, read-only nav.
  const isParent  = hasRole('parent') && !isStaff
  const avatarUrl = session?.user?.user_metadata?.avatar_url
  const name      = session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const initials  = (name[0] || '?').toUpperCase()
  const { pathname } = useLocation()

  // Pending access-request count for the staff menu badge (staff-only; RLS
  // returns 0 for non-staff). Refreshes when navigating to/from the page.
  const [pendingAccess, setPendingAccess] = useState(0)
  useEffect(() => {
    if (!isStaff) return
    let active = true
    supabase
      .from('access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => { if (active) setPendingAccess(count ?? 0) })
    return () => { active = false }
  }, [isStaff, pathname])

  return (
    <nav className="navbar">
      <div className="navbar-shell">
        <div className="navbar-brand">
          <img src="/assets/logos/Mark-Gold.svg" className="navbar-mark" alt="Techmen" />
          <span className="navbar-wordmark">TECHMEN<span className="navbar-wordmark-dot">·</span>5669</span>
        </div>
        <span className="navbar-context">{contextTag(pathname)}</span>

        <div className="navbar-links">
          <NavLink to="/dashboard" data-tour="nav-dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>

          <NavLink to="/schedule" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Schedule
          </NavLink>

          {isParent ? (
            <NavLink to="/hours" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Team Hours
            </NavLink>
          ) : (<>
          <Dropdown label="Hours" tourId="nav-hours" paths={['/my-hours', '/hours', '/log-hours']}>
            <NavLink to="/my-hours"  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>My Hours</NavLink>
            <NavLink to="/hours"     className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Team Hours</NavLink>
            <NavLink to="/log-hours" className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Log Hours</NavLink>
          </Dropdown>

          <NavLink to="/skills" data-tour="nav-skills" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Skills
          </NavLink>

          <NavLink to="/jobs" data-tour="nav-jobs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Jobs
          </NavLink>

          <NavLink to="/study" data-tour="nav-study" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Study
          </NavLink>
          </>)}
        </div>

        <div className="navbar-account">
          <AvatarMenu avatarUrl={avatarUrl} initials={initials} name={name} isStaff={isStaff} pendingAccess={pendingAccess} />
        </div>
      </div>
    </nav>
  )
}
