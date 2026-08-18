import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import './ParentResponse.css'

// Public parent/guardian questionnaire, reached from an emailed capability link
// (/parent/<token>, sent by the send-parent-request Edge Function).
//
// It GATES NOTHING. The student's application is already submitted and complete
// before this page exists; nothing here affects their place on the team, and a
// parent who never opens it costs their student nothing.
//
// Standalone card outside the app shell, no NavBar — same shape as AccessGate.
// There is no sign-in: the token in the URL is the only credential, so this
// component NEVER touches a Supabase table. Every read and write goes through
// the parent-response Edge Function (deployed --no-verify-jwt), which holds the
// service role and is the sole writer to parent_responses.

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parent-response`

const WEEKEND = [
  { value: 'saturdays', label: 'Saturdays' },
  { value: 'sundays',   label: 'Sundays' },
  { value: 'either',    label: 'Either day' },
  { value: 'neither',   label: 'Neither' },
]

const YES_NO_MAYBE = [
  { value: 'yes',   label: 'Yes' },
  { value: 'no',    label: 'No' },
  { value: 'maybe', label: 'Maybe' },
]

const BLANK = {
  weekend_supervision: '',
  meal_support: '',
  travel_driving: '',
  employer_name: '',
  employer_contact_consent: false,
  donation_offer: '',
}

// One radio group. Nothing is required, so "no answer" stays a real state: the
// group starts with nothing selected and a Clear control puts it back.
function ChoiceRow({ label, hint, options, value, onChange, name }) {
  return (
    <fieldset className="pr-field">
      <legend className="pr-label">{label}</legend>
      {hint && <span className="pr-hint">{hint}</span>}
      <div className="pr-choices">
        {options.map(o => (
          <label key={o.value} className={`pr-choice${value === o.value ? ' pr-choice-on' : ''}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {value && (
        <button className="pr-clear" type="button" onClick={() => onChange('')}>
          Clear this answer
        </button>
      )}
    </fieldset>
  )
}

export default function ParentResponse() {
  const { token } = useParams()

  const [mode, setMode]   = useState('loading')  // loading | form | submitted | invalid | offline
  const [student, setStudent] = useState('')
  const [form, setForm]   = useState(BLANK)
  const [prior, setPrior] = useState(null)       // an answer already on file
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function call(payload) {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...payload }),
    })
    let data = null
    try { data = await res.json() } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data }
  }

  useEffect(() => {
    let active = true
    call({ action: 'fetch' })
      .then(({ ok, status, data }) => {
        if (!active) return
        // 404 is the one generic failure: a wrong, stale, or made-up token all
        // land here and look identical, by design.
        if (status === 404) { setMode('invalid'); return }
        if (!ok || !data) { setMode('offline'); return }
        setStudent(data.student_name || 'Your student')
        if (data.response) {
          setPrior(data.response)
          setForm({
            weekend_supervision: data.response.weekend_supervision ?? '',
            meal_support:        data.response.meal_support ?? '',
            travel_driving:      data.response.travel_driving ?? '',
            employer_name:       data.response.employer_name ?? '',
            employer_contact_consent: data.response.employer_contact_consent === true,
            donation_offer:      data.response.donation_offer ?? '',
          })
        }
        setMode('form')
      })
      .catch(() => { if (active) setMode('offline') })
    return () => { active = false }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = k => v => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { ok, status, data } = await call({ action: 'submit', ...form })
    setSaving(false)
    if (status === 404) { setMode('invalid'); return }
    if (!ok) {
      setError(data?.error === 'invalid_employer_name'
        ? 'That employer name is too long.'
        : data?.error === 'invalid_donation_offer'
          ? 'That note is too long — please shorten it.'
          : 'Something went wrong saving your answers. Please try again.')
      return
    }
    setMode('submitted')
  }

  const Shell = ({ children }) => (
    <div className="pr-wrap">
      <div className="pr-card">
        <img src="/assets/logos/Mark-Gold.svg" className="pr-mark" alt="Techmen" />
        {children}
      </div>
    </div>
  )

  if (mode === 'loading') {
    return (
      <div className="pr-wrap">
        <div className="pr-card"><div className="pr-spinner" /></div>
      </div>
    )
  }

  if (mode === 'invalid') {
    return (
      <Shell>
        <h1 className="pr-title">Link not found</h1>
        <p className="pr-msg">
          We could not find this questionnaire. The link may have been copied
          incompletely — try opening it straight from the email instead.
        </p>
        <p className="pr-msg pr-muted">
          Nothing depends on this form. Your student's application is complete
          either way.
        </p>
      </Shell>
    )
  }

  if (mode === 'offline') {
    return (
      <Shell>
        <h1 className="pr-title">Can't reach us</h1>
        <p className="pr-msg">
          Something went wrong on our end loading this page. Please try again in
          a little while — nothing depends on it.
        </p>
        <button className="pr-submit" type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </Shell>
    )
  }

  if (mode === 'submitted') {
    return (
      <Shell>
        <h1 className="pr-title">Thank you</h1>
        <p className="pr-msg">
          Your answers went to the mentors. If anything changes, open the same
          link again and update them.
        </p>
      </Shell>
    )
  }

  // mode === 'form'
  return (
    <div className="pr-wrap">
      <div className="pr-card pr-card-form">
        <img src="/assets/logos/Mark-Gold.svg" className="pr-mark" alt="Techmen" />
        <h1 className="pr-title">Supporting {student}</h1>
        <p className="pr-msg">
          {student} is on the Bosco Tech robotics team, FRC Team 5669. These five
          questions help the mentors plan the season.
        </p>
        <p className="pr-msg pr-muted">
          Nothing here is required and nothing here affects your student's place
          on the team. Answer what you can and leave the rest blank.
        </p>

        {prior && (
          <p className="pr-note">
            You already answered this. Your answers are filled in below — change
            anything you like and save again.
          </p>
        )}

        <form className="pr-form" onSubmit={submit}>
          <ChoiceRow
            name="weekend_supervision"
            label="Could you help supervise a weekend work session?"
            hint="An adult in the room during weekend build time. Not every weekend — we would ask ahead."
            options={WEEKEND}
            value={form.weekend_supervision}
            onChange={set('weekend_supervision')}
          />

          <ChoiceRow
            name="meal_support"
            label="Could you help with a meal during a long build day or competition?"
            hint="Cooking, picking up food, or contributing toward one."
            options={YES_NO_MAYBE}
            value={form.meal_support}
            onChange={set('meal_support')}
          />

          <ChoiceRow
            name="travel_driving"
            label="Could you drive students to a competition or outreach event?"
            hint="Local events, a few weekends a season."
            options={YES_NO_MAYBE}
            value={form.travel_driving}
            onChange={set('travel_driving')}
          />

          {/* Employer name and consent are two separate answers. Telling us
              where you work is not permission to contact them — that is the
              checkbox below, and it is off unless you turn it on. */}
          <div className="pr-field">
            <label className="pr-label" htmlFor="pr-employer">
              Where do you work? <span className="pr-optional">(optional)</span>
            </label>
            <span className="pr-hint">
              Many companies match donations or sponsor local STEM teams. Naming
              your employer here does not authorize us to contact anyone.
            </span>
            <input
              id="pr-employer"
              className="pr-input"
              type="text"
              value={form.employer_name}
              onChange={e => set('employer_name')(e.target.value)}
              placeholder="Company name"
              maxLength={200}
            />
            <label className="pr-check">
              <input
                type="checkbox"
                checked={form.employer_contact_consent}
                onChange={e => set('employer_contact_consent')(e.target.checked)}
              />
              <span>
                Yes — a mentor may contact this employer about sponsoring or
                matching a donation to FRC Team 5669.
              </span>
            </label>
          </div>

          <div className="pr-field">
            <label className="pr-label" htmlFor="pr-donation">
              Anything you could donate or lend? <span className="pr-optional">(optional)</span>
            </label>
            <span className="pr-hint">
              Materials, tools, shop time, a skill, a connection — anything at all.
            </span>
            <textarea
              id="pr-donation"
              className="pr-input pr-textarea"
              value={form.donation_offer}
              onChange={e => set('donation_offer')(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. I have a laser cutter at work, or I can donate safety glasses"
            />
          </div>

          {error && <p className="pr-error">{error}</p>}

          <button className="pr-submit" type="submit" disabled={saving}>
            {saving ? 'Saving…' : prior ? 'Update my answers' : 'Send my answers'}
          </button>
        </form>

        <p className="pr-foot">Techmen · FRC Team 5669 · Don Bosco Technical Institute</p>
      </div>
    </div>
  )
}
