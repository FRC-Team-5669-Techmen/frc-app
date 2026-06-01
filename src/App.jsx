import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import LoginPage from './LoginPage'
import './App.css'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null

  if (!session) return <LoginPage />

  return (
    <div className="splash">
      <div className="logo">5669</div>
      <h1>FRC Team 5669</h1>
      <p>{session.user.email}</p>
    </div>
  )
}
