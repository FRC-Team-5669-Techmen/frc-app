import { NavLink } from 'react-router-dom'
import { supabase } from './supabase'
import './NavBar.css'

export default function NavBar() {
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
          <NavLink to="/hours" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Team Hours
          </NavLink>
        </div>

        <button className="navbar-signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </nav>
  )
}
