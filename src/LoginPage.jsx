import { useState } from 'react'
import { supabase } from './supabase'
import './LoginPage.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleGoogleSignIn() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  async function handleSendCode(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setStep('code')
    }
  }

  async function handleVerify(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })
    setLoading(false)
    if (error) setError(error.message)
  }

  if (step === 'code') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <img src="/assets/logos/Mark-Gold.svg" className="login-mark" alt="Techmen" />
          <h1>Enter your code</h1>
          <p className="login-hint">
            We sent a code to <strong>{email}</strong>.
          </p>
          <form onSubmit={handleVerify}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter your code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoComplete="one-time-code"
              className="code-input"
            />
            <button type="submit" disabled={loading || code.length === 0}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="back-link"
            onClick={() => { setStep('email'); setCode(''); setError('') }}
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/assets/logos/Mark-Gold.svg" className="login-mark" alt="Techmen" />
        <h1>Techmen</h1>
        <p className="subtitle">FRC Team 5669</p>

        <button type="button" className="google-btn" onClick={handleGoogleSignIn} disabled={loading}>
          <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="login-divider"><span>or</span></div>

        <form onSubmit={handleSendCode}>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Sending…' : 'Send Code'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
