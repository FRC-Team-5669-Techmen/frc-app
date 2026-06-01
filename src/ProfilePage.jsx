import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './ProfilePage.css'

export default function ProfilePage({ session }) {
  const [profile, setProfile]   = useState(null)
  const [gradYear, setGradYear] = useState('')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, grad_year')
        .eq('id', session.user.id)
        .single()
      if (data) {
        setProfile(data)
        setGradYear(data.grad_year ?? '')
      }
    }
    load()
  }, [session.user.id])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({ grad_year: gradYear === '' ? null : Number(gradYear) })
      .eq('id', session.user.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!profile) {
    return <div className="profile-loading"><div className="profile-spinner" /></div>
  }

  return (
    <div className="profile-wrap">
      <div className="profile-body">
        <div className="profile-card">
          <h1 className="profile-heading">My Profile</h1>

          <div className="profile-field">
            <span className="profile-label">Full name</span>
            <span className="profile-value">{profile.full_name || '—'}</span>
            <span className="profile-hint">Set automatically from your sign-in account</span>
          </div>

          <div className="profile-field">
            <span className="profile-label">Email</span>
            <span className="profile-value">{session.user.email}</span>
          </div>

          <form onSubmit={handleSave} className="profile-form">
            <div className="profile-field">
              <label className="profile-label" htmlFor="grad-year">Graduation year</label>
              <input
                id="grad-year"
                type="number"
                min="2020"
                max="2035"
                placeholder="e.g. 2027"
                value={gradYear}
                onChange={e => setGradYear(e.target.value)}
                className="profile-input"
              />
            </div>

            {error && <p className="profile-error">{error}</p>}

            <button type="submit" className="profile-save" disabled={saving}>
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
