import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import MemberSkillsPanel from './MemberSkillsPanel'
import NotificationsPanel from './NotificationsPanel'
import { RoleBadge, ROLE_ORDER } from './roles'
import { displayName } from './names'
import './ProfilePage.css'

const SUBTEAMS = [
  'Mechanical', 'Electrical', 'Programming', 'CAD',
  'Fabrication', 'Media', 'Business/Outreach', 'Drive Team',
]
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

export default function ProfilePage({ session, hasRole = () => false }) {
  const [profile, setProfile] = useState(null)
  const [disciplineCatalog, setDisciplineCatalog] = useState([])
  const [form, setForm]       = useState({
    nickname: '', bio: '', shirt_size: '', subteams: [], disciplines: [], grad_year: '',
  })
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState('')
  const [loadError, setLoadError] = useState('')
  // Team (subteams + disciplines) rarely changes — collapsed by default to save space.
  const [teamOpen,  setTeamOpen]  = useState(false)
  // Calendar subscription (.ics feed)
  const [calToken,  setCalToken]  = useState(null)
  const [calScope,  setCalScope]  = useState('mine') // 'mine' | 'all'
  const [copied,    setCopied]    = useState(false)
  const [rotating,  setRotating]  = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error: qErr } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, nickname, bio, shirt_size, subteams, disciplines, grad_year')
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
        nickname:    p.nickname    ?? '',
        bio:         p.bio         ?? '',
        shirt_size:  p.shirt_size  ?? '',
        subteams:    p.subteams    ?? [],
        disciplines: p.disciplines ?? [],
        grad_year:   p.grad_year   ?? '',
      })
    }
    load()

    supabase
      .from('disciplines')
      .select('id, name, category, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data }) => setDisciplineCatalog(data ?? []))

    // Own calendar token, via SECURITY DEFINER RPC (the column is not client-readable).
    supabase.rpc('get_calendar_token').then(({ data }) => { if (data) setCalToken(data) })
  }, [session.user.id])

  // Group catalog by category, preserving sort_order (categories in seed order)
  const groupedDisciplines = useMemo(() => {
    const map = new Map()
    for (const d of disciplineCatalog) {
      if (!map.has(d.category)) map.set(d.category, [])
      map.get(d.category).push(d)
    }
    return [...map.entries()]
  }, [disciplineCatalog])

  const field = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  function toggleSubteam(st) {
    setForm(f => ({
      ...f,
      subteams: f.subteams.includes(st)
        ? f.subteams.filter(s => s !== st)
        : [...f.subteams, st],
    }))
  }

  function toggleDiscipline(name) {
    setForm(f => ({
      ...f,
      disciplines: f.disciplines.includes(name)
        ? f.disciplines.filter(d => d !== name)
        : [...f.disciplines, name],
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
        shirt_size:  form.shirt_size || null,
        subteams:    form.subteams,
        disciplines: form.disciplines,
        grad_year:   form.grad_year !== '' ? Number(form.grad_year) : null,
      })
      .eq('id', session.user.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function regenerateCalToken() {
    setRotating(true)
    const { data, error: rotErr } = await supabase.rpc('rotate_calendar_token')
    setRotating(false)
    if (!rotErr && data) { setCalToken(data); setCopied(false) }
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

  const headerName = displayName({ ...profile, email: session.user.email })
  const initials = (headerName || '?')[0].toUpperCase()

  // Calendar feed links: Supabase functions endpoint + the member's capability token.
  const feedBase  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed`
  const feedHttps = calToken ? `${feedBase}?token=${calToken}&scope=${calScope}` : ''
  // webcal:// is the one-tap scheme for Apple Calendar; Google Calendar needs its
  // own add-by-URL deep link (it never handles webcal:// on desktop).
  const feedWebcal = feedHttps.replace(/^https:\/\//, 'webcal://')
  const feedGoogle = calToken ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedWebcal)}` : ''

  return (
    <div className="profile-wrap">
      <div className="profile-body">
        <div className="profile-card">

          <div className="profile-identity">
            {profile.avatar_url
              ? <img src={profile.avatar_url} className="profile-avatar" alt={headerName} />
              : <div className="profile-avatar profile-avatar-init">{initials}</div>
            }
            <div className="profile-identity-text">
              <span className="profile-display-name">
                {headerName}
                {(() => { const r = ROLE_ORDER.find(x => hasRole(x)); return r ? <RoleBadge role={r} className="profile-role-badge" /> : null })()}
              </span>
              <span className="profile-display-email">{session.user.email}</span>
            </div>
          </div>

          <form onSubmit={handleSave} className="profile-form">

            {/* ── Basics ── */}
            <section className="profile-group">
              <h3 className="profile-group-title">Basics</h3>

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
                    min="1950"
                    max="2035"
                    placeholder="2027"
                    value={form.grad_year}
                    onChange={field('grad_year')}
                    className="profile-input"
                  />
                </div>
              </div>
            </section>

            {/* ── Team (collapsible — rarely changes) ── */}
            <section className="profile-group">
              <button
                type="button"
                className="profile-group-toggle"
                onClick={() => setTeamOpen(o => !o)}
                aria-expanded={teamOpen}
              >
                <span className={`profile-group-caret${teamOpen ? ' open' : ''}`}>▸</span>
                <h3 className="profile-group-title">Team</h3>
                {!teamOpen && (
                  <span className="profile-group-summary">
                    {form.subteams.length || 0} subteam{form.subteams.length === 1 ? '' : 's'}
                    {form.disciplines.length > 0 && ` · ${form.disciplines.length} discipline${form.disciplines.length === 1 ? '' : 's'}`}
                  </span>
                )}
              </button>

              {teamOpen && (<>
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

              {groupedDisciplines.length > 0 && (
                <div className="profile-field">
                  <label className="profile-label">Disciplines</label>
                  {groupedDisciplines.map(([cat, opts]) => (
                    <div key={cat} className="profile-disc-group">
                      <span className="profile-disc-cat">{cat}</span>
                      <div className="profile-subteam-chips">
                        {opts.map(d => (
                          <button
                            key={d.id}
                            type="button"
                            className={`profile-subteam-chip${form.disciplines.includes(d.name) ? ' chip-on' : ''}`}
                            onClick={() => toggleDiscipline(d.name)}
                          >
                            {d.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </>)}
            </section>

            {/* ── About ── */}
            <section className="profile-group">
              <h3 className="profile-group-title">About you</h3>
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
            </section>

            {error && <p className="profile-error">{error}</p>}

            <button type="submit" className="profile-save" disabled={saving}>
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </button>
          </form>

        </div>

        {calToken && (
          <>
            <p className="profile-section-heading">Calendar subscription</p>
            <div className="profile-card profile-cal-card">
              <p className="profile-cal-intro">
                Subscribe to keep the team schedule in sync. Pick your calendar below,
                or copy the link into any app. This link is private to you — don't share it.
              </p>

              <div className="profile-cal-scope">
                <button type="button"
                  className={`profile-cal-tab${calScope === 'mine' ? ' on' : ''}`}
                  onClick={() => { setCalScope('mine'); setCopied(false) }}>My events</button>
                <button type="button"
                  className={`profile-cal-tab${calScope === 'all' ? ' on' : ''}`}
                  onClick={() => { setCalScope('all'); setCopied(false) }}>Full team</button>
              </div>

              <div className="profile-cal-actions">
                <a className="profile-cal-subscribe" href={feedGoogle} target="_blank" rel="noreferrer">Add to Google Calendar</a>
                <a className="profile-cal-subscribe profile-cal-apple" href={feedWebcal}>Add to Apple Calendar</a>
              </div>
              <span className="profile-cal-hint">
                The Apple button opens a calendar app (iPhone, Mac, or Outlook). On a desktop without one, use the link below instead.
              </span>

              <label className="profile-label profile-cal-urllabel">Or add by URL (any calendar app)</label>
              <div className="profile-cal-url">
                <input className="profile-input profile-cal-input" readOnly value={feedHttps}
                  onFocus={e => e.target.select()} aria-label="Calendar feed URL" />
                <button type="button" className="profile-cal-copy"
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(feedHttps); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
                  }}>{copied ? 'Copied ✓' : 'Copy'}</button>
              </div>

              <div className="profile-cal-regen-row">
                <button type="button" className="profile-cal-regen" onClick={regenerateCalToken} disabled={rotating}>
                  {rotating ? 'Regenerating…' : 'Regenerate link'}
                </button>
                <span className="profile-cal-hint">Regenerating stops the old link from working.</span>
              </div>
            </div>
          </>
        )}

        <NotificationsPanel session={session} />

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
