import { CAPABILITIES } from './model'

export default function FootageWorkbook({ rows = [], onChange }) {
  function update(id, patch) { onChange(rows.map(r=>r.id===id?{...r,...patch}:r)) }
  return <details className="sc-training-task"><summary>Real footage workbook ({rows.length} entries)</summary>
    <p>Ask your mentor to choose six recordings and annotate the expected evidence before you begin. Keep your first observation and later correction separate. These practice entries stay on this device and never enter competition statistics.</p>
    <p className="sc-training-muted">The app cannot verify a recording or grade these notes automatically. Your mentor reviews the source, your timestamps and your uncertainty.</p>
    {rows.map((r,i)=><article className="sc-training-task" key={r.id}><h4>Footage {i+1}</h4>
      <div className="sc-fields"><label>Team<input inputMode="numeric" maxLength={5} value={r.team??''} onChange={e=>update(r.id,{team:e.target.value.replace(/\D/g,'')})}/></label><label>Source match<input maxLength={100} value={r.match??''} placeholder="Actual event and match key" onChange={e=>update(r.id,{match:e.target.value})}/></label></div>
      <label>Recording URL<input type="url" value={r.url??''} maxLength={2000} placeholder="https://…" onChange={e=>update(r.id,{url:e.target.value})}/></label>
      {r.url && !/^https:\/\//i.test(r.url) && <p role="status">Use an HTTPS recording URL.</p>}
      <label>Who selected this source?<input maxLength={100} value={r.selectedBy??''} placeholder="Mentor or practice partner" onChange={e=>update(r.id,{selectedBy:e.target.value})}/></label>
      <div className="sc-fields">{CAPABILITIES.map(c=><label key={c.key}>{c.label}<select aria-label={c.label} value={r.answers?.[c.key]??''} onChange={e=>update(r.id,{answers:{...r.answers,[c.key]:e.target.value}})}><option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option><option value="did_not_see">Did Not See</option><option value="not_applicable">Not Applicable</option></select></label>)}</div>
      <label>First-pass notes and timestamps<textarea aria-label="First-pass notes and timestamps" rows={3} maxLength={4000} value={r.firstPass??''} onChange={e=>update(r.id,{firstPass:e.target.value})} placeholder="What did you actually see? Keep uncertainty explicit."/></label>
      <label>Review, correction and supporting timestamp<textarea aria-label="Review, correction and supporting timestamp" rows={3} maxLength={4000} value={r.review??''} onChange={e=>update(r.id,{review:e.target.value})} placeholder="What changed after review, and why? Keep the first pass above."/></label>
      <label className="sc-training-check"><input type="checkbox" checked={r.reviewed===true} onChange={e=>update(r.id,{reviewed:e.target.checked})}/>I discussed this evidence with a mentor or partner (self-reported).</label>
    </article>)}
    <button disabled={rows.length>=24} onClick={()=>onChange([...rows,{id:crypto.randomUUID(),createdAt:new Date().toISOString(),answers:{}}])}>Add practice footage</button>
    <p className="sc-training-muted">Up to 24 entries. Workbook entries are included in your practice export.</p>
  </details>
}
