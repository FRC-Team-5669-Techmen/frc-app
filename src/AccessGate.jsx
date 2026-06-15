import { supabase } from './supabase'
import './AccessGate.css'

// Shown to a signed-in member who is not yet approved on the roster.
// No nav bar: this replaces the whole app shell until claim_profile() approves.
export default function AccessGate({ session }) {
  const email = session?.user?.email || ''

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <img src="/assets/logos/Mark-Gold.svg" className="gate-mark" alt="Techmen" />
        <h1 className="gate-title">Pending approval</h1>
        <p className="gate-msg">
          You're signed in, but your account isn't on the team roster yet. A mentor
          needs to approve you before you can access the Techmen platform.
        </p>
        <p className="gate-email">
          Signed in as <strong>{email}</strong>
        </p>
        <button className="gate-signout" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
        <p className="gate-contact">
          Think this is a mistake? Reach out to a mentor to get added.
        </p>
      </div>
    </div>
  )
}
