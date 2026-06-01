import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import LoginPage from './LoginPage'
import HomePage from './HomePage'
import CheckinPage from './CheckinPage'
import './App.css'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => setSession(session))
      .catch(() => setSession(null))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="splash">
        <div className="logo">5669</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <HomePage session={session} /> : <LoginPage />}
      />
      <Route
        path="/checkin"
        element={session ? <CheckinPage session={session} /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
