import { NavLink } from 'react-router-dom'
import { supabase } from './supabase'
import './NavBar.css'

export default function NavBar({ hasRole = () => false, session = null }) {
  const isStaff    = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const avatarUrl  = session?.user?.user_metadata?.avatar_url
  const name       = session?.user?.user_metadata?.full_name || session?.user?.email || ''
  const initials   = (name[0] || '?').toUpperCase()

  return (
    <nav className="navbar">
      <div className="navbar-shell">
        <img src="/assets/logos/Mark-Gold.svg" className="navbar-mark" alt="Techmen" />

        <div className="navbar-links">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/my-hours" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            My Hours
          </NavLink>
          <NavLink to="/log-hours" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Log Hours
          </NavLink>
          <NavLink to="/hours" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Team Hours
          </NavLink>
          {isStaff && (
            <NavLink to="/skills" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Skills
            </NavLink>
          )}
          {isStaff && (
            <NavLink to="/certify" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Certify
            </NavLink>
          )}
          {isStaff && (
            <NavLink to="/coverage" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Coverage
            </NavLink>
          )}
          <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            My Profile
          </NavLink>
          {hasRole('admin') && (
            <NavLink to="/roster" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Roster
            </NavLink>
          )}
        </div>

        <div className="navbar-account">
          {avatarUrl
            ? <img src={avatarUrl} className="navbar-avatar" alt={name} />
            : <div className="navbar-avatar navbar-avatar-init">{initials}</div>
          }
          <button className="navbar-signout" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
