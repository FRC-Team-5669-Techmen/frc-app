import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import MemberSkillsPanel from './MemberSkillsPanel'
import './ProfilePage.css'

const SUBTEAMS = [
  'Mechanical', 'Electrical', 'Programming', 'CAD',
  'Fabrication', 'Media', 'Business/Outreach', 'Drive Team',
]
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

export default function ProfilePage({ session }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm]       = useState({
    nickname: '', bio: '', shirt_size: '', subteams: [], grad_year: '',
  })
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error: qErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, nickname, bio, shirt_size, subteams, grad_year')
        .eq('id', session.user.id)
        .single()
      if (qErr) { setLoadError(qErr.message); return }
      if (!data) { setLoadError('Profile row not found.'); return }

      let { avatar_url } = data
      const metaAvatar = session.user.user_metadata?.avatar_url
      if (!avatar_url && metaAvatar) {
        avatar_url = metaAvatar
        await supabase.from('profiles').update({ avatar_url }).eq('id', session.user.id)
      }

      const p = { ...data, avatar_url }
      setProfile(p)
      setForm({
        nickname:   p.nickname   ?? '',
        bio:        p.bio        ?? '',
        shirt_size: p.shirt_size ?? '',
        subteams:   p.subteams   ?? [],
        grad_year:  p.grad_year  ?? '',
      })
    }
    load()
  }, [session.user.id])

  const field = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  function toggleSubteam(st) {
    setForm(f => ({
      ...f,
      subteams: f.subteams.includes(st)
        ? f.subteams.filter(s => s !== st)
        : [...f.subteams, st],
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    const { error } = await supabase
      .from('profiles')
      .update({
        nickname:   form.nickname   || null,
        bio:        form.bio        || null,
        shirt_size: form.shirt_size || null,
        subteams:   form.subteams,
        grad_year:  form.grad_year !== '' ? Number(form.grad_year) : null,
      })
      .eq('id', session.user.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loadError) {
    return (
      <div className="profile-wrap">
        <div className="profile-body">
          <p className="profile-error" style={{ marginTop: '1.5rem' }}>{loadError}</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return <div className="profile-loading"><div className="profile-spinner" /></div>
  }

  const initials = (profile.full_name || session.user.email || '?')[0].toUpperCase()

  return (
    <div className="profile-wrap">
      <div className="profile-body">
        <div className="profile-card">

          <div className="profile-identity">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="profile-avatar" alt={profile.full_name} />
              : <div className="profile-avatar profile-avatar-init">{initials}</div>
            }
            <div className="profile-identity-text">
              <span className="profile-display-name">{profile.full_name || '—'}</span>
              <span className="profile-display-email">{session.user.email}</span>
            </div>
          </div>

          <form onSubmit={handleSave} className="profile-form">

            <div className="profile-field">
              <label className="profile-label" htmlFor="nickname">Nickname</label>
              <input
                id="nickname"
                type="text"
                placeholder="What the team calls you"
                maxLength={60}
                value={form.nickname}
                onChange={field('nickname')}
                className="profile-input"
              />
            </div>

            <div className="profile-field">
              <label className="profile-label">Subteams</label>
              <div className="profile-subteam-chips">
                {SUBTEAMS.map(st => (
                  <button
                    key={st}
                    type="button"
                    className={`profile-subteam-chip${form.subteams.includes(st) ? ' chip-on' : ''}`}
                    onClick={() => toggleSubteam(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-form-row">
              <div className="profile-field">
                <label className="profile-label" htmlFor="shirt-size">Shirt size</label>
                <select
                  id="shirt-size"
                  value={form.shirt_size}
                  onChange={field('shirt_size')}
                  className="profile-select"
                >
                  <option value="">— Select —</option>
                  {SHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="profile-field">
                <label className="profile-label" htmlFor="grad-year">Grad year</label>
                <input
                  id="grad-year"
                  type="number"
                  min="2020"
                  max="2035"
                  placeholder="2027"
                  value={form.grad_year}
                  onChange={field('grad_year')}
                  className="profile-input"
                />
              </div>
            </div>

            <div className="profile-field">
              <label className="profile-label" htmlFor="bio">Bio</label>
              <textarea
                id="bio"
                placeholder="A few words about yourself"
                maxLength={500}
                rows={4}
                value={form.bio}
                onChange={field('bio')}
                className="profile-input profile-textarea"
              />
            </div>

            {error && <p className="profile-error">{error}</p>}

            <button type="submit" className="profile-save" disabled={saving}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </button>
          </form>

        </div>

        <p className="profile-section-heading">Skills</p>
        <MemberSkillsPanel
          memberId={session.user.id}
          currentUserId={session.user.id}
          canEdit={true}
          canCertify={false}
        />

      </div>
    </div>
  )
}
