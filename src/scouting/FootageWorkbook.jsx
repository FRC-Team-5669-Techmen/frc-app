import { useState } from 'react'
import { CAPABILITIES } from './model'
import { freezeFootageEntry, appendFootageReview, workbookProgress } from './workbook'

export default function FootageWorkbook({ rows = [], onChange }) {
  const [error, setError] = useState('')
  const progress = workbookProgress(rows)
  function capture(row, action) {
    try { const next=action(row); onChange(rows.map(r=>r.id===row.id?next:r)); setError('') }
    catch(e) { setError(e.message) }
  }
  function update(id, patch) { onChange(rows.map(r=>r.id===id?{...r,...patch}:r)) }
  return <details className="sc-training-task"><summary>Real footage workbook ({rows.length} {rows.length===1?'entry':'entries'})</summary>
    <p>Ask your mentor to choose six recordings and annotate the expected evidence before you begin. Keep your first observation and later correction separate. These practice entries stay on this device and never enter competition statistics.</p>
    <p className="sc-training-muted">The app cannot verify a recording or grade these notes automatically. Your mentor reviews the source, your timestamps and your uncertainty.</p>
    <p role="status">{progress.frozen} frozen first {progress.frozen===1?'pass':'passes'} · {progress.reviewed} reviewed {progress.reviewed===1?'entry':'entries'}. These counts do not measure accuracy or award certification.</p>
    {error && <p role="alert">{error}</p>}
    {rows.map((r,i)=><article className="sc-training-task" aria-label={`Practice footage ${i+1}`} key={r.id}><h4>Footage {i+1}</h4>
      <fieldset disabled={!!r.submission}><legend>{r.submission ? 'Frozen first pass' : 'Your independent first pass'}</legend>
      <div className="sc-fields"><label>Team<input inputMode="numeric" maxLength={5} value={r.team??''} onChange={e=>update(r.id,{team:e.target.value.replace(/\D/g,'')})}/></label><label>Source match<input maxLength={100} value={r.match??''} placeholder="Actual event and match key" onChange={e=>update(r.id,{match:e.target.value})}/></label></div>
      <label>Recording URL<input type="url" value={r.url??''} maxLength={2000} placeholder="https://…" onChange={e=>update(r.id,{url:e.target.value})}/></label>
      {r.url && !/^https:\/\//i.test(r.url) && <p role="status">Use an HTTPS recording URL.</p>}
      <label>Who selected this source?<input maxLength={100} value={r.selectedBy??''} placeholder="Mentor or practice partner" onChange={e=>update(r.id,{selectedBy:e.target.value})}/></label>
      <div className="sc-fields">{CAPABILITIES.map(c=><label key={c.key}>{c.label}<select aria-label={c.label} value={r.answers?.[c.key]??''} onChange={e=>{const next={...r.answers};if(e.target.value)next[c.key]=e.target.value;else delete next[c.key];update(r.id,{answers:next})}}><option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option><option value="did_not_see">Did Not See</option><option value="not_applicable">Not Applicable</option></select></label>)}</div>
      <label>First-pass notes and timestamps<textarea aria-label="First-pass notes and timestamps" rows={3} maxLength={4000} value={r.firstPass??''} onChange={e=>update(r.id,{firstPass:e.target.value})} placeholder="What did you actually see? Keep uncertainty explicit."/></label>
      </fieldset>
      {!r.submission ? <button onClick={()=>capture(r,freezeFootageEntry)}>Freeze first pass</button> : <>
        <p className="sc-training-muted">Frozen {new Date(r.submission.submittedAt).toLocaleString()}. Keep this original judgment; explain corrections in a review below. Source identity corrections need a new entry.</p>
        <a href={r.submission.url} target="_blank" rel="noreferrer">Open source recording</a>
        <div className="sc-fields">{CAPABILITIES.map(c=><label key={c.key}>Reviewed: {c.label}<select aria-label={`Reviewed: ${c.label}`} value={r.reviewAnswers?.[c.key]??''} onChange={e=>{const next={...r.reviewAnswers};if(e.target.value)next[c.key]=e.target.value;else delete next[c.key];update(r.id,{reviewAnswers:next})}}><option value="">Not recorded</option><option value="yes">Yes</option><option value="no">No</option><option value="did_not_see">Did Not See</option><option value="not_applicable">Not Applicable</option></select></label>)}</div>
      <label>Review, correction and supporting timestamp<textarea aria-label="Review, correction and supporting timestamp" rows={3} maxLength={4000} value={r.review??''} onChange={e=>update(r.id,{review:e.target.value})} placeholder="What changed after review, and why? Keep the first pass above."/></label>
      <label className="sc-training-check"><input type="checkbox" checked={r.reviewed===true} onChange={e=>update(r.id,{reviewed:e.target.checked})}/>I discussed this evidence with a mentor or partner (self-reported).</label>
      <button onClick={()=>capture(r,appendFootageReview)}>Record footage review</button>
      {!!r.reviews?.length && <details><summary>Review history ({r.reviews.length})</summary>{r.reviews.map((review,index)=><div className="sc-training-task" key={index}><strong>Review {index+1}</strong><p>{review.notes}</p><ul>{CAPABILITIES.map(c=><li key={c.key}>{c.label}: {{yes:'Yes',no:'No',did_not_see:'Did Not See',not_applicable:'Not Applicable'}[review.answers[c.key]]??'Not recorded'}</li>)}</ul><p className="sc-training-muted">{new Date(review.recordedAt).toLocaleString()} · discussion self-reported</p></div>)}</details>}
      </>}
    </article>)}
    <button disabled={rows.length>=24} onClick={()=>onChange([...rows,{id:crypto.randomUUID(),createdAt:new Date().toISOString(),answers:{}}])}>Add practice footage</button>
    <p className="sc-training-muted">Up to 24 entries. Workbook entries are included in your practice export.</p>
  </details>
}
