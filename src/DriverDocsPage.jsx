import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import { isSchemaMissing } from './schemaMissing'
import { errText } from './standing'
import './Standing.css'

// /driver-docs (handbook Section 16, migration 0017). A driver uploads one
// photo of their license and one of their insurance, stored in a private
// bucket. Only the driver and staff see the row; staff open a file only
// after the database logs the view (the storage read policy requires it), and
// every view is listed. The driver or staff deletes it; a driver who leaves
// the team is flagged for deletion.

const KINDS = [['license', "Driver's license"], ['insurance', 'Proof of insurance']]

export default function DriverDocsPage({ session, hasRole = () => false }) {
  const uid = session?.user?.id
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')
  const [docs, setDocs] = useState(null)
  const [views, setViews] = useState([])
  const [names, setNames] = useState(new Map())
  const [state, setState] = useState('loading')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [driver, setDriver] = useState(session?.user?.user_metadata?.full_name ?? '')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('driver_documents').select('*').order('uploaded_at', { ascending: false })
    if (error) { setState(isSchemaMissing(error) ? 'missing' : 'error'); return }
    setDocs(data ?? []); setState('ok')
    if (isStaff) {
      const [v, p] = await Promise.all([
        supabase.from('driver_document_views').select('*').order('viewed_at', { ascending: false }).limit(30),
        supabase.from('profiles').select('id, full_name, nickname'),
      ])
      setViews(v.data ?? [])
      setNames(new Map((p.data ?? []).map((x) => [x.id, displayName(x)])))
    }
  }, [isStaff])
  useEffect(() => { load() }, [load])

  async function upload(kind, file) {
    if (!file) return
    if (driver.trim().length < 2) { setMsg('Type the driver name first.'); return }
    setBusy(true); setMsg(null)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
    const path = `${uid}/${kind}-${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from('driver-docs').upload(path, file, { contentType: file.type || undefined })
    if (up.error) { setBusy(false); setMsg(errText(up.error)); return }
    const { error } = await supabase.rpc('register_driver_document', { p_path: path, p_kind: kind, p_driver_name: driver.trim() })
    if (error) { await supabase.storage.from('driver-docs').remove([path]); setMsg(errText(error)) } else setMsg('Uploaded. Only staff mentors can see it.')
    setBusy(false)
    load()
  }

  async function open(doc) {
    setMsg(null)
    const { data: path, error } = await supabase.rpc('log_driver_document_view', { p_doc: doc.id })
    if (error) { setMsg(errText(error)); return }
    const s = await supabase.storage.from('driver-docs').createSignedUrl(path, 60)
    if (s.error) { setMsg(errText(s.error)); return }
    window.open(s.data.signedUrl, '_blank', 'noopener')
    load()
  }

  async function remove(doc) {
    setMsg(null)
    const { data: path, error } = await supabase.rpc('delete_driver_document', { p_doc: doc.id })
    if (error) { setMsg(errText(error)); return }
    await supabase.storage.from('driver-docs').remove([path])
    setMsg('Deleted.')
    load()
  }

  if (state === 'loading') return <div className="st-wrap"><p className="st-muted">Loading…</p></div>
  if (state === 'missing') return <div className="st-wrap"><h1 className="st-title">Driver documents</h1><p className="st-muted">Not set up yet. It starts when migration 0017 is pasted.</p></div>
  if (state === 'error') return <div className="st-wrap"><h1 className="st-title">Driver documents</h1><p className="st-error">Could not load.</p></div>
  const mine = docs.filter((d) => d.owner_id === uid)
  const others = docs.filter((d) => d.owner_id !== uid)

  return (
    <div className="st-wrap">
      <h1 className="st-title">Driver documents</h1>
      <p className="st-sub">Before a first ride, a driver uploads one photo of their license and one of their insurance. Stored privately, seen only by staff mentors, every view logged, deleted when you ask or leave the team.</p>
      {msg && <p className="st-msg" role="status">{msg}</p>}
      <section className="st-card" data-card="upload">
        <h2 className="st-h2">Upload</h2>
        <label className="st-label">Driver name <input className="st-input" value={driver} onChange={(e) => setDriver(e.target.value)} /></label>
        <div className="st-row">{KINDS.map(([k, label]) => (
          <label key={k} className="st-btn">{label}<input type="file" accept="image/*,application/pdf" hidden disabled={busy} data-kind={k} onChange={(e) => upload(k, e.target.files?.[0])} /></label>
        ))}</div>
      </section>
      <section className="st-card" data-card="mine">
        <h2 className="st-h2">Yours</h2>
        {mine.length === 0 ? <p className="st-muted">Nothing uploaded.</p> : (
          <ul className="st-list">{mine.map((d) => (
            <li key={d.id} className="st-row-between" data-doc={d.kind}><span>{KINDS.find((k) => k[0] === d.kind)?.[1]} · {d.driver_name}</span>
              <button className="st-link" onClick={() => remove(d)}>Delete</button></li>))}</ul>
        )}
      </section>
      {isStaff && (
        <section className="st-card" data-card="all">
          <h2 className="st-h2">All drivers</h2>
          {others.length === 0 ? <p className="st-muted">None.</p> : (
            <ul className="st-list">{others.map((d) => (
              <li key={d.id} className={`st-row-between${d.purge_reason ? ' bad' : ''}`} data-doc={d.kind}>
                <span>{d.driver_name} · {KINDS.find((k) => k[0] === d.kind)?.[1]}{d.purge_reason ? ` · ${d.purge_reason}: delete it` : ''}</span>
                <span className="st-row"><button className="st-btn" onClick={() => open(d)}>View</button><button className="st-link" onClick={() => remove(d)}>Delete</button></span>
              </li>))}</ul>
          )}
          <h2 className="st-h2">Views</h2>
          <ul className="st-list">{views.map((v) => <li key={v.id}>{names.get(v.viewer_id) ?? 'Staff'} · {new Date(v.viewed_at).toLocaleString()}</li>)}</ul>
        </section>
      )}
    </div>
  )
}
