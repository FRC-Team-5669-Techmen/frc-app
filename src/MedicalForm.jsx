import { useState } from 'react'

// Emergency information (handbook Section 9): two emergency contacts,
// conditions, allergies, medicines, and where carried medicine is. Shared by
// the family link page and the signed-in parent / staff page. The caller owns
// the save; this only collects and checks the two contacts.

const FIELDS = [
  ['contact1_name', 'Emergency contact 1, name'], ['contact1_phone', 'Phone'], ['contact1_relation', 'Relation'],
  ['contact2_name', 'Emergency contact 2, name'], ['contact2_phone', 'Phone'], ['contact2_relation', 'Relation'],
]
const TEXTS = [
  ['conditions', 'Medical conditions'], ['allergies', 'Allergies'], ['medicines', 'Medicines'],
  ['carried_meds', 'Carried inhaler or epinephrine: where it is'],
]

export default function MedicalForm({ initial, onSave, busy = false }) {
  const [v, setV] = useState(() => Object.fromEntries([...FIELDS, ...TEXTS].map(([k]) => [k, initial?.[k] ?? ''])))
  const [problem, setProblem] = useState(null)
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  function submit(e) {
    e.preventDefault()
    if (!v.contact1_name.trim() || !v.contact1_phone.trim() || !v.contact2_name.trim() || !v.contact2_phone.trim()) {
      setProblem('Two emergency contacts, each with a name and a phone.')
      return
    }
    setProblem(null)
    onSave(v)
  }
  return (
    <form className="st-form" onSubmit={submit} noValidate data-form="medical">
      <div className="st-grid">
        {FIELDS.map(([k, label]) => (
          <label key={k} className="st-label">{label}<input className="st-input" value={v[k]} onChange={set(k)} maxLength={k.endsWith('phone') ? 40 : 120} /></label>
        ))}
      </div>
      {TEXTS.map(([k, label]) => (
        <label key={k} className="st-label">{label}<textarea className="st-input" rows={2} value={v[k]} onChange={set(k)} maxLength={1000} placeholder="None" /></label>
      ))}
      {problem && <p className="st-error" role="alert">{problem}</p>}
      <button className="st-btn st-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save emergency information'}</button>
      <p className="st-muted">Only staff mentors see this. A staff mentor carries it at every event.</p>
    </form>
  )
}
