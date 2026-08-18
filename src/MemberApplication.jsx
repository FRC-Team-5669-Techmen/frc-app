import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { SUBTEAMS } from './subteams'
import './MemberApplication.css'

// ─── Schedule copy ────────────────────────────────────────────────────────────
// The schedule the commitment section asks about. build_season_acknowledged
// references this text, so it lives in ONE place and is rendered above the
// commitment questions.
// TODO: the build-season line has not been supplied yet. Fill it in before the
// build season starts — the acknowledgment is not honest without it.
export const MEETING_SCHEDULE = [
  {
    label: 'Offseason and preseason',
    detail: 'Monday lunch meeting. Tuesday and Friday after school until 5:00pm.',
  },
  {
    label: 'Build season',
    detail: 'TODO — not yet supplied.',
  },
]

// ─── Option lists ─────────────────────────────────────────────────────────────

const PATHWAYS = ['CSEE', 'MSET', 'MAT', 'IDEA', 'ACE', 'BMET', 'Freshman - in rotation']

// Subteam choices come from the shared vocabulary (src/subteams.js); the DB
// CHECK on subteam_first/second/third is pinned to the same list
// (supabase/subteams_vocabulary.sql).

const AVAILABILITY = ['Yes', 'No', 'Sometimes']
const TRANSPORT    = ['Parent pickup', 'Own transport', 'Public transit', 'Needs help arranging']

const PRIOR_ROBOTICS = ['FLL', 'FTC', 'VEX', 'FRC on this team', 'FRC on another team', 'None']
const LANGUAGES      = ['Python', 'Java', 'C++', 'JavaScript', 'Block-based', 'Other', 'None']
const CAD_TOOLS      = ['SolidWorks', 'Onshape', 'Fusion 360', 'Other', 'None']
const HANDS_ON       = ['Soldering', 'Hand tools', 'Power tools', 'Mill or lathe', '3D printing', 'None']

const CONFLICTS = [
  'Fall sport', 'Winter sport', 'Spring sport', 'Job',
  'Family obligation', 'Other activity', 'None',
]

// profiles.shirt_size is free text; these match the values ProfilePage offers so
// a size chosen here still renders there.
const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']

// Graduation year is stored as an INTEGER, never a grade label — a label is
// wrong within a year, a year stays correct for four and makes alumni queries
// trivial. The dropdown is labeled with this school year's grade.
function gradYearOptions() {
  const now = new Date()
  // The school year rolls over in July: August 2026 is the 2026–27 year.
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  return [
    { value: startYear + 4, label: `Freshman (class of ${startYear + 4})` },
    { value: startYear + 3, label: `Sophomore (class of ${startYear + 3})` },
    { value: startYear + 2, label: `Junior (class of ${startYear + 2})` },
    { value: startYear + 1, label: `Senior (class of ${startYear + 1})` },
  ]
}

// ─── Presentational rows ──────────────────────────────────────────────────────
// Defined at module scope, not inside the component: a component type recreated
// on every render remounts its input and drops focus mid-typing.

function TextRow({ label, value, onChange, optional, hint, ...rest }) {
  return (
    <label className="ma-field">
      <span className="ma-label">
        {label}{optional && <span className="ma-optional"> (optional)</span>}
      </span>
      <input className="ma-input" type="text" value={value} onChange={onChange} required={!optional} {...rest} />
      {hint && <span className="ma-hint">{hint}</span>}
    </label>
  )
}

// Digits are stripped on change, matching LoginPage's phone handling.
function PhoneRow({ label, value, onChange, optional, hint }) {
  return (
    <label className="ma-field">
      <span className="ma-label">
        {label}{optional && <span className="ma-optional"> (optional)</span>}
      </span>
      <input
        className="ma-input"
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        placeholder="5551234567"
        value={value}
        onChange={onChange}
        required={!optional}
      />
      {hint && <span className="ma-hint">{hint}</span>}
    </label>
  )
}

function SelectRow({ label, value, onChange, options, optional, hint, placeholder = 'Choose one…' }) {
  return (
    <label className="ma-field">
      <span className="ma-label">
        {label}{optional && <span className="ma-optional"> (optional)</span>}
      </span>
      <select className="ma-input" value={value} onChange={onChange} required={!optional}>
        <option value="">{placeholder}</option>
        {options.map(o => (
          typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="ma-hint">{hint}</span>}
    </label>
  )
}

function TextareaRow({ label, value, onChange, optional, hint, ...rest }) {
  return (
    <label className="ma-field">
      <span className="ma-label">
        {label}{optional && <span className="ma-optional"> (optional)</span>}
      </span>
      <textarea className="ma-input ma-textarea" value={value} onChange={onChange} required={!optional} {...rest} />
      {hint && <span className="ma-hint">{hint}</span>}
    </label>
  )
}

function ChipRow({ label, options, selected, onToggle, hint }) {
  return (
    <div className="ma-field">
      <span className="ma-label">{label}</span>
      {hint && <span className="ma-hint">{hint}</span>}
      <div className="ma-chips">
        {options.map(o => (
          <button
            key={o}
            type="button"
            className={`ma-chip${selected.includes(o) ? ' ma-chip-on' : ''}`}
            aria-pressed={selected.includes(o)}
            onClick={() => onToggle(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function CheckRow({ checked, onChange, children }) {
  return (
    <label className="ma-check">
      <input type="checkbox" checked={checked} onChange={onChange} required />
      <span>{children}</span>
    </label>
  )
}

// ─── Initial form state ───────────────────────────────────────────────────────
// Every answer is held here and written ONCE on final submit, so abandoning the
// form part-way never creates a row.
const BLANK = {
  // identity
  legal_first_name: '', legal_last_name: '', preferred_name: '', student_phone: '',
  // school (preferred_name, grad_year and shirt_size write to profiles, not here)
  pathway: '', grad_year: '', returning_member: '', seasons_on_team: '',
  // prior experience (self-reported, display-only to staff)
  prior_robotics: [], programming_languages: [], cad_tools: [],
  hands_on_experience: [], certifications_claimed: '',
  // subteam interest
  subteam_first: '', subteam_second: '', subteam_third: '', subteam_rationale: '',
  // commitment
  monday_lunch: '', tuesday_after_school: '', friday_after_school: '',
  transport_after_5pm: '', seasonal_conflicts: [], conflict_detail: '',
  build_season_acknowledged: false,
  // parent contact
  parent_name: '', parent_email: '', parent_phone: '',
  parent_two_name: '', parent_two_contact: '',
  // logistics
  shirt_size: '', dietary_restrictions: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  // discord + acknowledgment
  discord_username: '', conduct_acknowledged: false,
}

// Fields carried over from a returning member's most recent application:
// identity, school, parent contact, and Discord. Subteam interest and
// commitment are always asked fresh — those are exactly what change year over
// year — so they are deliberately absent.
const PREFILL_KEYS = [
  'legal_first_name', 'legal_last_name', 'student_phone',
  'pathway',
  'parent_name', 'parent_email', 'parent_phone', 'parent_two_name', 'parent_two_contact',
  'discord_username',
]

// Logistics is skipped for returning members, but emergency contact is NOT NULL,
// so it can only be skipped when a prior row actually supplies it.
const LOGISTICS_KEYS = ['dietary_restrictions', 'emergency_contact_name', 'emergency_contact_phone']

/**
 * Per-season member application. Renders in the AccessGate slot — full screen,
 * outside the app shell, no NavBar — until the signed-in member has a row for
 * the current season.
 *
 * @param session  the Supabase session (email + member id)
 * @param season   the current season row resolved by resolveCurrentSeason()
 * @param onDone   called after a successful submit so App can drop the gate
 */
export default function MemberApplication({ session, season, onDone }) {
  const uid   = session.user.id
  const email = (session.user.email || '').toLowerCase()

  const [form,   setForm]   = useState(BLANK)
  const [step,   setStep]   = useState(0)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [done,   setDone]   = useState(false)
  const [prior,  setPrior]  = useState(undefined)   // undefined = loading, null = none
  const [prefilled, setPrefilled] = useState(false)

  // Prefill what the platform already knows: the profile's own name/year/size,
  // plus the most recent prior application (used when they say they're
  // returning). Both are own-row reads under existing RLS.
  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('profiles')
        .select('full_name, nickname, grad_year, shirt_size')
        .eq('id', uid).single(),
      supabase.from('member_applications')
        .select('*')
        .eq('member_id', uid)
        .order('submitted_at', { ascending: false })
        .limit(1),
    ]).then(([{ data: prof }, { data: apps }]) => {
      if (!active) return
      setPrior(apps?.[0] ?? null)
      if (!prof) return
      const parts = (prof.full_name || '').trim().split(/\s+/)
      setForm(f => ({
        ...f,
        legal_first_name: f.legal_first_name || (parts[0] ?? ''),
        legal_last_name:  f.legal_last_name  || (parts.length > 1 ? parts.slice(1).join(' ') : ''),
        preferred_name:   f.preferred_name   || (prof.nickname ?? ''),
        grad_year:        f.grad_year        || (prof.grad_year ?? ''),
        shirt_size:       f.shirt_size       || (prof.shirt_size ?? ''),
      }))
    })
    return () => { active = false }
  }, [uid])

  const returning = form.returning_member === 'yes'

  // Apply the returning-member prefill once, the moment we know both that they
  // are returning and what last season's row said.
  useEffect(() => {
    if (prefilled || !returning || !prior) return
    setForm(f => {
      const next = { ...f }
      for (const k of [...PREFILL_KEYS, ...LOGISTICS_KEYS]) {
        if (prior[k] != null && prior[k] !== '') next[k] = prior[k]
      }
      return next
    })
    setPrefilled(true)
  }, [returning, prior, prefilled])

  // Returning members skip prior experience, and skip logistics too — but only
  // when a prior row actually carries the NOT NULL emergency contact.
  const priorHasLogistics = !!(prior?.emergency_contact_name && prior?.emergency_contact_phone)
  const steps = useMemo(() => {
    const all = [
      { id: 'identity',   title: 'Who you are' },
      { id: 'school',     title: 'School' },
      { id: 'experience', title: 'Prior experience' },
      { id: 'subteams',   title: 'Subteam interest' },
      { id: 'commitment', title: 'Commitment' },
      { id: 'parent',     title: 'Parent or guardian' },
      { id: 'logistics',  title: 'Logistics' },
      { id: 'discord',    title: 'Discord and acknowledgment' },
    ]
    if (!returning) return all
    return all.filter(s => s.id !== 'experience' && !(s.id === 'logistics' && priorHasLogistics))
  }, [returning, priorHasLogistics])

  // Toggling "returning" can shorten the list under a later step index.
  const safeStep = Math.min(step, steps.length - 1)
  const current  = steps[safeStep]
  const last     = safeStep >= steps.length - 1

  useEffect(() => { window.scrollTo(0, 0) }, [safeStep])

  // ── field setters (house pattern: one form object, curried setters) ─────────
  const field  = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const digits = key => e => setForm(f => ({ ...f, [key]: e.target.value.replace(/\D/g, '') }))
  const check  = key => e => setForm(f => ({ ...f, [key]: e.target.checked }))
  const toggle = key => value => setForm(f => ({
    ...f,
    [key]: f[key].includes(value) ? f[key].filter(v => v !== value) : [...f[key], value],
  }))

  // ── per-step checks the browser can't express natively ─────────────────────
  function stepProblem(id) {
    if (id === 'experience') {
      if (!form.prior_robotics.length)        return 'Pick at least one robotics answer — use "None" if it does not apply.'
      if (!form.programming_languages.length) return 'Pick at least one programming answer — use "None" if it does not apply.'
      if (!form.cad_tools.length)             return 'Pick at least one CAD answer — use "None" if it does not apply.'
      if (!form.hands_on_experience.length)   return 'Pick at least one hands-on answer — use "None" if it does not apply.'
    }
    if (id === 'subteams') {
      const picks = [form.subteam_first, form.subteam_second, form.subteam_third].filter(Boolean)
      if (new Set(picks).size !== picks.length) return 'Your subteam choices must all be different.'
    }
    return ''
  }

  async function handleNext(e) {
    e.preventDefault()   // native validation already gated the rendered fields
    const problem = stepProblem(current.id)
    if (problem) { setError(problem); return }
    setError('')
    if (!last) { setStep(safeStep + 1); return }
    await submit()
  }

  // ── submit: one row, written once ──────────────────────────────────────────
  async function submit() {
    setSaving(true)
    setError('')

    const row = {
      member_id: uid,
      season_id: season.id,
      legal_first_name: form.legal_first_name.trim(),
      legal_last_name:  form.legal_last_name.trim(),
      student_phone:    form.student_phone,
      pathway:          form.pathway,
      returning_member: returning,
      seasons_on_team:  returning && form.seasons_on_team !== '' ? Number(form.seasons_on_team) : null,
      prior_robotics:         form.prior_robotics,
      programming_languages:  form.programming_languages,
      cad_tools:              form.cad_tools,
      hands_on_experience:    form.hands_on_experience,
      certifications_claimed: form.certifications_claimed.trim() || null,
      subteam_first:     form.subteam_first,
      subteam_second:    form.subteam_second,
      subteam_third:     form.subteam_third || null,
      subteam_rationale: form.subteam_rationale.trim(),
      monday_lunch:         form.monday_lunch,
      tuesday_after_school: form.tuesday_after_school,
      friday_after_school:  form.friday_after_school,
      transport_after_5pm:  form.transport_after_5pm,
      seasonal_conflicts:   form.seasonal_conflicts,
      conflict_detail:      form.conflict_detail.trim() || null,
      build_season_acknowledged: form.build_season_acknowledged,
      parent_name:        form.parent_name.trim(),
      parent_email:       form.parent_email.trim(),
      parent_phone:       form.parent_phone,
      parent_two_name:    form.parent_two_name.trim() || null,
      parent_two_contact: form.parent_two_contact.trim() || null,
      dietary_restrictions:    form.dietary_restrictions.trim() || null,
      emergency_contact_name:  form.emergency_contact_name.trim(),
      emergency_contact_phone: form.emergency_contact_phone,
      discord_username:     form.discord_username.trim(),
      conduct_acknowledged: form.conduct_acknowledged,
      // discord_server_confirmed is staff-set — never written from here.
    }

    const { error: insErr } = await supabase.from('member_applications').insert(row)
    if (insErr) {
      setSaving(false)
      // 23505 = the unique (member_id, season_id) index: already applied.
      if (insErr.code === '23505') { setDone(true); return }
      setError(insErr.message)
      return
    }

    // The three fields that DO belong on profiles, because they're already
    // there and already team-visible by design. Direct own-row update via the
    // existing "profiles update own or admin" policy, same path ProfilePage
    // uses. The application row is the source of truth, so a failure here is a
    // note, not a blocked submit.
    const { error: profErr } = await supabase.from('profiles').update({
      nickname:   form.preferred_name.trim() || null,
      grad_year:  form.grad_year !== '' ? Number(form.grad_year) : null,
      shirt_size: form.shirt_size || null,
    }).eq('id', uid)

    setSaving(false)
    if (profErr) setError(`Application saved. Your profile details didn't update: ${profErr.message}`)
    setDone(true)
  }

  // ── steps ──────────────────────────────────────────────────────────────────
  function renderStep(id) {
    switch (id) {
      case 'identity': return (
        <>
          <label className="ma-field">
            <span className="ma-label">School email</span>
            <input className="ma-input" type="email" value={email} readOnly aria-readonly="true" />
            <span className="ma-hint">From your sign-in. Tell a mentor if this is wrong.</span>
          </label>
          <TextRow label="Legal first name" value={form.legal_first_name} onChange={field('legal_first_name')} autoComplete="given-name" />
          <TextRow label="Legal last name"  value={form.legal_last_name}  onChange={field('legal_last_name')}  autoComplete="family-name" />
          <TextRow
            label="Preferred name"
            value={form.preferred_name}
            onChange={field('preferred_name')}
            optional
            hint="What we call you on the team. Blank means we use your legal first name."
          />
          <PhoneRow label="Your phone number" value={form.student_phone} onChange={digits('student_phone')} />
        </>
      )

      case 'school': return (
        <>
          <SelectRow label="Pathway" value={form.pathway} onChange={field('pathway')} options={PATHWAYS} />
          <SelectRow
            label="Graduation year"
            value={form.grad_year}
            onChange={field('grad_year')}
            options={gradYearOptions()}
            placeholder="Choose your grade…"
          />
          <SelectRow
            label="Were you on the team last season?"
            value={form.returning_member}
            onChange={field('returning_member')}
            options={[
              { value: 'yes', label: 'Yes — returning member' },
              { value: 'no',  label: 'No — this is my first season' },
            ]}
          />
          {returning && (
            <label className="ma-field">
              <span className="ma-label">Seasons on the team<span className="ma-optional"> (optional)</span></span>
              <input
                className="ma-input"
                type="number"
                min="1"
                max="6"
                value={form.seasons_on_team}
                onChange={field('seasons_on_team')}
              />
              <span className="ma-hint">Counting this one.</span>
            </label>
          )}
          {returning && prior && (
            <p className="ma-note">
              We prefilled what we have from last season — check it and fix
              anything that changed.
            </p>
          )}
        </>
      )

      case 'experience': return (
        <>
          <p className="ma-note">
            This is how we find out what you already know. Nothing here certifies
            you on anything — a mentor still signs off on every certification.
          </p>
          <ChipRow label="Robotics you've done before" options={PRIOR_ROBOTICS} selected={form.prior_robotics}        onToggle={toggle('prior_robotics')}        hint="Pick all that apply." />
          <ChipRow label="Programming you've written"  options={LANGUAGES}      selected={form.programming_languages} onToggle={toggle('programming_languages')} hint="Any amount counts, including a class." />
          <ChipRow label="CAD you've used"             options={CAD_TOOLS}      selected={form.cad_tools}             onToggle={toggle('cad_tools')} />
          <ChipRow label="Hands-on / shop experience"  options={HANDS_ON}       selected={form.hands_on_experience}   onToggle={toggle('hands_on_experience')} />
          <TextareaRow
            label="Certifications you already hold"
            value={form.certifications_claimed}
            onChange={field('certifications_claimed')}
            optional
            rows={3}
            placeholder="e.g. shop safety from a class, first aid"
          />
        </>
      )

      case 'subteams': return (
        <>
          <p className="ma-note">
            Rank three. First choice is what you most want to do — we use these to
            place people and to see where the team is short.
          </p>
          <SelectRow label="First choice"  value={form.subteam_first}  onChange={field('subteam_first')}  options={SUBTEAMS} />
          <SelectRow
            label="Second choice"
            value={form.subteam_second}
            onChange={field('subteam_second')}
            options={SUBTEAMS.filter(s => s !== form.subteam_first)}
          />
          <SelectRow
            label="Third choice"
            value={form.subteam_third}
            onChange={field('subteam_third')}
            options={SUBTEAMS.filter(s => s !== form.subteam_first && s !== form.subteam_second)}
            optional
            placeholder="No third choice"
          />
          <TextareaRow
            label="Why these?"
            value={form.subteam_rationale}
            onChange={field('subteam_rationale')}
            rows={4}
            minLength={20}
            placeholder="A sentence or two is plenty."
          />
        </>
      )

      case 'commitment': return (
        <>
          <div className="ma-schedule">
            <span className="ma-label">Meeting schedule</span>
            {MEETING_SCHEDULE.map(s => (
              <p key={s.label} className="ma-schedule-line">
                <strong>{s.label}:</strong> {s.detail}
              </p>
            ))}
          </div>
          <SelectRow label="Can you make the Monday lunch meeting?" value={form.monday_lunch}         onChange={field('monday_lunch')}         options={AVAILABILITY} />
          <SelectRow label="Tuesday after school until 5:00pm?"     value={form.tuesday_after_school} onChange={field('tuesday_after_school')} options={AVAILABILITY} />
          <SelectRow label="Friday after school until 5:00pm?"      value={form.friday_after_school}  onChange={field('friday_after_school')}  options={AVAILABILITY} />
          <SelectRow label="How do you get home after 5:00pm?"      value={form.transport_after_5pm}  onChange={field('transport_after_5pm')}  options={TRANSPORT} />
          <ChipRow
            label="Anything else that takes your time"
            options={CONFLICTS}
            selected={form.seasonal_conflicts}
            onToggle={toggle('seasonal_conflicts')}
            hint="Pick all that apply — we would rather know in August."
          />
          <TextareaRow
            label="Conflict details"
            value={form.conflict_detail}
            onChange={field('conflict_detail')}
            optional
            rows={3}
            placeholder="e.g. wrestling practice Tue/Thu until 6, November through February"
          />
          <CheckRow checked={form.build_season_acknowledged} onChange={check('build_season_acknowledged')}>
            I have read the schedule above and I understand build season asks for
            more time than the offseason does.
          </CheckRow>
        </>
      )

      case 'parent': return (
        <>
          <p className="ma-note">
            Only mentors and team staff can see this. It is not on your profile
            and no other student can read it.
          </p>
          <TextRow  label="Parent or guardian name"  value={form.parent_name}  onChange={field('parent_name')} />
          <label className="ma-field">
            <span className="ma-label">Parent or guardian email</span>
            <input className="ma-input" type="email" value={form.parent_email} onChange={field('parent_email')} required />
          </label>
          <PhoneRow label="Parent or guardian phone" value={form.parent_phone} onChange={digits('parent_phone')} />
          <TextRow  label="Second parent or guardian name"    value={form.parent_two_name}    onChange={field('parent_two_name')}    optional />
          <TextRow  label="Second parent or guardian contact" value={form.parent_two_contact} onChange={field('parent_two_contact')} optional hint="Phone or email." />
        </>
      )

      case 'logistics': return (
        <>
          <SelectRow label="Shirt size (unisex)" value={form.shirt_size} onChange={field('shirt_size')} options={SHIRT_SIZES} />
          <TextRow
            label="Dietary restrictions"
            value={form.dietary_restrictions}
            onChange={field('dietary_restrictions')}
            optional
            placeholder="e.g. vegetarian, nut allergy"
            hint="We feed the team at competitions and offseason events."
          />
          <TextRow
            label="Emergency contact name"
            value={form.emergency_contact_name}
            onChange={field('emergency_contact_name')}
            hint="Someone other than the parent above, if you can."
          />
          <PhoneRow label="Emergency contact phone" value={form.emergency_contact_phone} onChange={digits('emergency_contact_phone')} />
        </>
      )

      case 'discord': return (
        <>
          <TextRow
            label="Discord username"
            value={form.discord_username}
            onChange={field('discord_username')}
            placeholder="yourname"
            hint="We run day-to-day team comms on Discord. Staff check you into the server against the roster."
          />
          <CheckRow checked={form.conduct_acknowledged} onChange={check('conduct_acknowledged')}>
            I agree to show up when I have said I will, to tell a mentor when I
            cannot, and to follow the shop safety and conduct rules.
          </CheckRow>
        </>
      )

      default: return null
    }
  }

  // ── shell ──────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="ma-wrap">
        <div className="ma-card ma-card-narrow">
          <img src="/assets/logos/Mark-Gold.svg" className="ma-mark" alt="Techmen" />
          <h1 className="ma-title">You're on the list</h1>
          <p className="ma-msg">
            Your {season.name} application is in. Mentors use it to place you on a
            subteam — you will hear about that at the first meetings.
          </p>
          {error && <p className="ma-error">{error}</p>}
          <button className="ma-submit" type="button" onClick={() => (onDone ? onDone() : window.location.reload())}>
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (prior === undefined) {
    return (
      <div className="ma-wrap">
        <div className="ma-card ma-card-narrow"><div className="ma-spinner" /></div>
      </div>
    )
  }

  const pct = Math.round(((safeStep + 1) / steps.length) * 100)

  return (
    <div className="ma-wrap">
      <div className="ma-card">
        <img src="/assets/logos/Mark-Gold.svg" className="ma-mark" alt="Techmen" />
        <h1 className="ma-title">{season.name} application</h1>
        <p className="ma-msg">
          Every member fills this out once a season. It takes a few minutes, and
          it is how we place you, reach your family, and plan the season.
        </p>

        <div className="ma-progress">
          <div className="ma-progress-head">
            <span className="ma-progress-step">Step {safeStep + 1} of {steps.length}</span>
            <span className="ma-progress-title">{current.title}</span>
          </div>
          <div
            className="ma-progress-track"
            role="progressbar"
            aria-valuenow={safeStep + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label="Application progress"
          >
            <div className="ma-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <form className="ma-form" onSubmit={handleNext}>
          {renderStep(current.id)}

          {error && <p className="ma-error">{error}</p>}

          <div className="ma-actions">
            {safeStep > 0 && (
              <button
                className="ma-back"
                type="button"
                onClick={() => { setError(''); setStep(safeStep - 1) }}
                disabled={saving}
              >
                Back
              </button>
            )}
            <button className="ma-submit" type="submit" disabled={saving}>
              {last ? (saving ? 'Submitting…' : 'Submit application') : 'Next'}
            </button>
          </div>
        </form>

        <p className="ma-email">Signed in as <strong>{email}</strong></p>
        <button className="ma-signout" type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  )
}
