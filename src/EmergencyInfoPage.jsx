import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { errText } from './standing'
import MedicalForm from './MedicalForm'
import './Standing.css'

// /emergency-info (handbook Section 9, migration 0017). A signed-in parent
// enters their student's emergency information (?member=); staff see the
// sheet for every member and print it to carry to an event. The student and
// other members never see it (the table's read policy).

export default function EmergencyInfoPage({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [params] = useSearchParams()
  const member = params.get('member')
  if (member) return <EditOne member={member} />
  if (isStaff) return <Sheet />
  return <ParentPick uid={session?.user?.id} />
}

function ParentPick({ uid }) {
  const [kids, setKids] = useState(null)
  useEffect(() => {
    (async () => {
      const { data: links } = await supabase.from('guardian_links').select('student_id').eq('parent_id', uid)
      const ids = (links ?? []).map((l) => l.student_id)
      const { data: profs } = ids.length ? await supabase.from('profiles').select('id, full_name, nickname').in('id', ids) : { data: [] }
      setKids((profs ?? []).map((p) => ({ student_id: p.id, profiles: p })))
    })()
  }, [uid])
  if (!kids) return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  return (
    <div className="st-wrap">
      <h1 className="st-title">Emergency information</h1>
      {kids.length === 0 ? <p className="st-muted">No student is linked to your account. Use the family link Mr. Pina emailed you instead.</p> : (
        <ul className="st-list">{kids.map((k) => (
          <li key={k.student_id}><a href={`/emergency-info?member=${k.student_id}`}>{k.profiles?.nickname || k.profiles?.full_name || 'Your student'}</a></li>))}</ul>
      )}
    </div>
  )
}

function EditOne({ member }) {
  const [row, setRow] = useState(undefined)
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('member_medical').select('*').eq('member_id', member).maybeSingle()
    if (error) { setState(isSchemaMissing(error) ? 'missing' : 'error'); return }
    setRow(data); setState('ok')
  }, [member])
  useEffect(() => { load() }, [load])
  if (state === 'loading') return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  if (state === 'missing') return <div className="st-wrap"><h1 className="st-title">Emergency information</h1><p className="st-muted">Not set up yet.</p></div>
  return (
    <div className="st-wrap">
      <h1 className="st-title">Emergency information</h1>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      <section className="st-card">
        <MedicalForm key={row?.updated_at ?? 'new'} initial={row} busy={busy} onSave={async (v) => {
          setBusy(true)
          const { error } = await supabase.rpc('save_medical', { p_member: member, p: v })
          setBusy(false)
          setMsg(error ? errText(error) : 'Saved.')
          if (!error) load()
        }} />
      </section>
    </div>
  )
}

function Sheet() {
  const [rows, setRows] = useState(null)
  const [state, setState] = useState('loading')
  useEffect(() => {
    supabase.rpc('staff_emergency_sheet').then(({ data, error }) => {
      if (error) { setState(isSchemaMissing(error) ? 'missing' : 'error'); return }
      setRows(data ?? []); setState('ok')
    })
  }, [])
  if (state === 'loading') return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  if (state === 'missing') return <div className="st-wrap"><h1 className="st-title">Emergency information</h1><p className="st-muted">Not set up yet. It starts when migration 0017 is pasted.</p></div>
  const missing = rows.filter((r) => !r.contact1).length
  return (
    <div className="st-wrap st-wide">
      <div className="st-head">
        <div><h1 className="st-title">Emergency information</h1><p className="st-sub">Staff only. Carry it to every event.</p></div>
        <button className="st-btn st-noprint" onClick={() => window.print()}>Print</button>
      </div>
      {missing > 0 && <p className="st-warn st-noprint">{missing} member{missing === 1 ? '' : 's'} with nothing on file.</p>}
      <div className="st-table-wrap">
        <table className="st-table" data-table="emergency">
          <thead><tr><th>Member</th><th>Contacts</th><th>Conditions</th><th>Allergies</th><th>Medicines</th><th>Carried</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.member_id} className={r.contact1 ? '' : 'st-warn'}>
              <td><a href={`/emergency-info?member=${r.member_id}`}>{r.name}</a></td>
              <td>{r.contact1 ? <>{r.contact1}<br />{r.contact2}</> : 'Nothing on file'}</td>
              <td>{r.conditions || '-'}</td><td>{r.allergies || '-'}</td><td>{r.medicines || '-'}</td><td>{r.carried_meds || '-'}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  )
}
