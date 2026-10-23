import { useState, useRef, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { RoleBadge, ROLE_ORDER } from './roles'
import { loadAdminCounts, totalWaiting } from './adminTools'
import { UPDATES, hasUnread, readSeen, UPDATES_SEEN_EVENT } from './updates'
import ThemeSwitch from './ThemeSwitch'
import './NavBar.css'

import { IconHome, IconSchedule, IconHours, IconScout, IconRobot } from './navIcons'
const ROBOT_PATHS = ['/robot', '/batteries', '/autos', '/drivers', '/human-player', '/match-sim', '/jobs', '/status-reports', '/certifications']

// Mono unit/context tag shown at the right of the header, derived from route.
const CONTEXT_TAGS = [
  ['/dashboard',   'HOME'],
  ['/manage',      'ADMIN'],
  ['/robot',       'ROBOT'],
  ['/roles/',      'ROLES'],
  ['/autos',       'AUTOS'],
  ['/drivers',     'DRIVERS'],
  ['/human-player', 'HUMAN PLAYER'],
  ['/match-sim',   'MATCH SIM'],
  ['/schedule',    'SCHEDULE'],
  ['/scouting',    'SCOUTING'],
  ['/my-hours',    'HRS//SELF'],
  ['/hours',       'HRS//TEAM'],
  ['/log-hours',   'HRS//LOG'],
  ['/jobs',        'TASKING'],
  ['/members/',    'PERSONNEL'],
  ['/profile',     'PROFILE'],
  ['/updates',     'UPDATES'],
  ['/readiness',   'READINESS'],
  ['/activity',    'ACTIVITY'],
  ['/squad',       'SQUAD'],
  ['/display',     'DISPLAY'],
  ['/batteries',   'BATTERIES'],
  ['/roster',      'ROSTER'],
  ['/access-requests', 'ACCESS'],
  ['/applications', 'APPS'],
  ['/feedback',    'FEEDBACK'],
  ['/surveys',     'SURVEYS'],
  ['/survey',      'SURVEY'],
  ['/trips',       'TRIPS'],
  ['/verify-hours','HRS//VERIFY'],
  ['/reports',     'REPORTS'],
  ['/certifications', 'CERTS'],
  ['/handbook',    'HANDBOOK'],
  ['/announce',    'ANNOUNCE'],
  ['/signouts',    'SIGN-OUTS'],
  ['/standing',    'STANDING'],
  ['/rosters',     'ROSTERS'],
  ['/leaderboard', 'LEADERBOARD'],
  ['/status-reports', 'STATUS'],
  ['/emergency-info', 'EMERGENCY'],
  ['/driver-docs', 'DRIVERS'],
  ['/no-photo',    'NO PHOTO'],
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
    <div className="nav-dropdown" ref={ref} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <button
        className={`nav-link nav-dropdown-trigger${active ? ' active' : ''}`}
        data-tour={tourId}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        {badge > 0 && <span className="nav-badge nav-badge-trigger">{badge}</span>}
        <span className={`nav-chevron${open ? ' nav-chevron-up' : ''}`} aria-hidden="true">▾</span>
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

function AvatarMenu({ avatarUrl, initials, name, role, isStaff, isAdmin = false, isParent = false, waiting = 0, signouts = null, unread = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useOutsideClick(ref, () => setOpen(false))

  async function replayTour() {
    const { startTour } = await import('./tour')
    startTour(isStaff, undefined, isParent, isAdmin)
  }

  const itemClass = ({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`

  // At most six items for anyone (decision 49, ledger 0017): every staff tool
  // lives on /manage behind ONE item carrying the total waiting; driver
  // documents, emergency information and the weekly survey moved to the
  // profile, or to Home when they need doing.
  return (
    <div className="nav-avatar-wrap" ref={ref} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      {/* The pending dot is aria-hidden, so the count is in the button's name. */}
      <button
        className="nav-avatar-btn"
        data-tour="nav-profile"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={[
          'Account menu',
          isStaff && waiting > 0 ? `${waiting} waiting in Team admin` : null,
          unread ? "new in What's new" : null,
        ].filter(Boolean).join(', ')}
      >
        {avatarUrl
          ? <img src={avatarUrl} className="navbar-avatar" alt={name} />
          : <div className="navbar-avatar navbar-avatar-init">{initials}</div>
        }
        {((isStaff && waiting > 0) || unread) && <span className="nav-avatar-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="nav-dropdown-menu nav-avatar-menu" onClick={() => setOpen(false)}>
          <div className="nav-menu-head">
            <span className="nav-menu-name">{name}</span>
            {role && <RoleBadge role={role} />}
          </div>
          {isStaff && (
            <NavLink to="/manage" className={({ isActive }) => `nav-dropdown-item nav-admin-item${isActive ? ' active' : ''}`} data-tour="nav-manage">
              Team admin
              {waiting > 0 && <span className="nav-badge">{waiting}</span>}
            </NavLink>
          )}
          {/* A student Mr. Pina named a sign-out approver (signout.approve, 0014)
              is not staff and has no Team admin: their one tool sits here. */}
          {!isStaff && signouts !== null && (
            <NavLink to="/signouts" className={itemClass}>
              Sign-outs
              {signouts > 0 && <span className="nav-badge">{signouts}</span>}
            </NavLink>
          )}
          <NavLink to="/profile" className={itemClass}>My profile</NavLink>
          {!isParent && !isStaff && <NavLink to="/standing" end className={itemClass}>My standing</NavLink>}
          {isParent && <NavLink to="/standing" end className={itemClass}>Standing</NavLink>}
          <NavLink to="/handbook" className={itemClass}>Handbook</NavLink>
          <NavLink to="/updates" className={itemClass} data-tour="nav-updates">
            What&apos;s new
            {unread && <span className="nav-new-dot" aria-label="new" />}
          </NavLink>
          <button className="nav-dropdown-item" onClick={replayTour}>Replay tour</button>
          <div className="nav-menu-theme">
            <span className="nav-menu-theme-label">Theme</span>
            <ThemeSwitch compact />
          </div>
          <div className="nav-dropdown-divider" />
          <button className="nav-dropdown-item nav-signout-item" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      )}
    </div>
  )
}

export default function NavBar({ hasRole = () => false, session = null }) {
  const isStaff   = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const isAdmin   = hasRole('admin')
  // Parent-only view: parent who is NOT staff sees a reduced, read-only nav.
  const isParent  = hasRole('parent') && !isStaff
  const avatarUrl = session?.user?.user_metadata?.avatar_url
  const name      = session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const initials  = (name[0] || '?').toUpperCase()
  const myRole    = ROLE_ORDER.find(r => hasRole(r))
  const { pathname } = useLocation()

  // The total waiting across the Team admin tools this person can open
  // (src/adminTools.js, the same counts /manage shows). Staff only.
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    if (!isStaff) return
    let active = true
    loadAdminCounts(supabase, { isAdmin }).then((c) => { if (active) setWaiting(totalWaiting(c, { isAdmin })) }).catch(() => {})
    return () => { active = false }
  }, [isStaff, isAdmin, pathname])

  // Sign-outs waiting, for a NON-staff approver only (staff see it on
  // /manage). The RPC answers false for everyone else and errors before 0014.
  const [signouts, setSignouts] = useState(null)
  useEffect(() => {
    if (isParent || isStaff) { setSignouts(null); return }
    let active = true
    supabase.rpc('can_approve_signouts').then(async ({ data, error }) => {
      if (!active || error || data !== true) { if (active) setSignouts(null); return }
      const { count } = await supabase.from('signout_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (active) setSignouts(count ?? 0)
    })
    return () => { active = false }
  }, [isParent, isStaff, pathname])

  // What's new: a dot while the newest release is newer than the last visit
  // to /updates (src/updates.js). Re-read on every navigation and when the
  // page marks it seen.
  const [unread, setUnread] = useState(() => hasUnread(UPDATES, readSeen()))
  useEffect(() => {
    const check = () => setUnread(hasUnread(UPDATES, readSeen()))
    check()
    window.addEventListener(UPDATES_SEEN_EVENT, check)
    return () => window.removeEventListener(UPDATES_SEEN_EVENT, check)
  }, [pathname])

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
            <IconHome />Home
          </NavLink>

          <NavLink to="/schedule" data-tour="nav-schedule" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <IconSchedule />Schedule
          </NavLink>

          {isParent ? (
            <NavLink to="/hours" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <IconHours />Team Hours
            </NavLink>
          ) : (<>
          <NavLink to="/scouting" data-tour="nav-scouting" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <IconScout />Scouting
          </NavLink>

          {/* Robot (ledger 0017): batteries, jobs, sub-team status and
              certifications behind one hub; their own addresses still work. */}
          <NavLink to="/robot" data-tour="nav-robot" className={() => `nav-link${ROBOT_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ? ' active' : ''}`}>
            <IconRobot />Robot
          </NavLink>

          <Dropdown label={<><IconHours />Hours</>} tourId="nav-hours" align="right" paths={['/my-hours', '/log-hours', '/hours', '/leaderboard']}>
            <NavLink to="/my-hours"  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>My hours</NavLink>
            <NavLink to="/log-hours" className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Log hours</NavLink>
            <NavLink to="/hours"     className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Team hours</NavLink>
            <NavLink to="/leaderboard" className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}>Leaderboard</NavLink>
          </Dropdown>
          </>)}
        </div>

        <div className="navbar-account">
          <AvatarMenu avatarUrl={avatarUrl} initials={initials} name={name} role={myRole} isStaff={isStaff} isAdmin={isAdmin} isParent={isParent} waiting={waiting} signouts={signouts} unread={unread} />
        </div>
      </div>
    </nav>
  )
}
