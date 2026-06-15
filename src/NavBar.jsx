import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import './NavBar.css'

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

function Dropdown({ label, paths = [], tourId, children }) {
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
        <span className={`nav-chevron${open ? ' nav-chevron-up' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="nav-dropdown-menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

function AvatarMenu({ avatarUrl, initials, name, isStaff }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useOutsideClick(ref, () => setOpen(false))

  async function replayTour() {
    const { startTour } = await import('./tour')
    startTour(isStaff)
  }

  return (
    <div className="nav-avatar-wrap" ref={ref}>
      <button className="nav-avatar-btn" data-tour="nav-profile" onClick={() => setOpen(o => !o)} aria-label="Account menu">
        {avatarUrl
          ? <img src={avatarUrl} className="navbar-avatar" alt={name} />
          : <div className="navbar-avatar navbar-avatar-init">{initials}</div>
        }
      </button>
      {open && (
        <div className="nav-dropdown-menu nav-avatar-menu" onClick={() => setOpen(false)}>
          <NavLink
            to="/profile"
            className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
          >
            My Profile
          </NavLink>
          <button className="nav-dropdown-item" onClick={replayTour}>
            Replay tour
          </button>
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
  const avatarUrl = session?.user?.user_metadata?.avatar_url
  const name      = session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const initials  = (name[0] || '?').toUpperCase()

  return (
    <nav className="navbar">
      <div className="navbar-shell">
        <img src="/assets/logos/Mark-Gold.svg" className="navbar-mark" alt="Techmen" />

        <div className="navbar-links">
          <NavLink to="/dashboard" data-tour="nav-dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>

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

          {isStaff && (
            <NavLink to="/activity" data-tour="nav-activity" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Activity
            </NavLink>
          )}

          {isStaff && (
            <NavLink to="/readiness" data-tour="nav-readiness" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Readiness
            </NavLink>
          )}

          {isStaff && (
            <NavLink to="/squad" data-tour="nav-squad" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Squad
            </NavLink>
          )}

          {isStaff && (
            <Dropdown label="Manage" tourId="nav-manage" paths={['/roster', '/verify-hours', '/certify', '/coverage']}>
              <NavLink to="/roster"       className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Roster</NavLink>
              <NavLink to="/verify-hours" className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Verify Hours</NavLink>
              <NavLink to="/certify"      className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Certify Skills</NavLink>
              <NavLink to="/coverage"     className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Skill Coverage</NavLink>
            </Dropdown>
          )}
        </div>

        <div className="navbar-account">
          <AvatarMenu avatarUrl={avatarUrl} initials={initials} name={name} isStaff={isStaff} />
        </div>
      </div>
    </nav>
  )
}
