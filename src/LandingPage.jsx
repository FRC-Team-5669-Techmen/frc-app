import { Link } from 'react-router-dom'
import './LandingPage.css'

const features = [
  {
    title: 'Attendance',
    desc: 'Check in and out at practice with a tap. Hours are tracked automatically throughout the season.',
  },
  {
    title: 'Team Hours',
    desc: 'See season totals for every member and who is currently at practice, updated in real time.',
  },
  {
    title: 'More coming',
    desc: 'Scouting data, task tracking, and a learning environment are being built on the same platform.',
  },
]

export default function LandingPage() {
  return (
    <div className="landing-wrap">
      <nav className="landing-nav">
        <div className="landing-inner">
          <img src="/assets/logos/Mark-Gold.svg" className="landing-mark" alt="Techmen" />
          <Link className="landing-nav-link" to="/login">Sign in</Link>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-inner">
          <p className="landing-eyebrow">FRC Team 5669 · Techmen</p>
          <h1 className="landing-heading">The member platform<br />for Techmen.</h1>
          <p className="landing-desc">Attendance, hours tracking, and team tools — all in one place.</p>
          <Link className="landing-cta" to="/login">Sign in with email</Link>
        </div>
      </section>

      <section className="landing-features">
        <div className="landing-inner">
          <p className="landing-section-label">What's inside</p>
          <div className="landing-cards">
            {features.map(f => (
              <div key={f.title} className="landing-card">
                <h3 className="landing-card-title">{f.title}</h3>
                <p className="landing-card-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-inner">
          <span className="landing-footer-text">FRC Team 5669 Techmen</span>
        </div>
      </footer>
    </div>
  )
}
