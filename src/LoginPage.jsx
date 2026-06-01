import { useState } from 'react'
import { supabase } from './supabase'
import './LoginPage.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // 'email' | 'code'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
          <img src="/assets/logos/Mark-Black.svg" className="login-mark" alt="Techmen" />
          <h1>Enter your code</h1>
          <p className="login-hint">
            We sent a 6-digit code to <strong>{email}</strong>.
          </p>
          <form onSubmit={handleVerify}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
              className="code-input"
            />
            <button type="submit" disabled={loading || code.length !== 6}>
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
        <img src="/assets/logos/Mark-Black.svg" className="login-mark" alt="Techmen" />
        <h1>Techmen</h1>
        <p className="subtitle">FRC Team 5669</p>
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
