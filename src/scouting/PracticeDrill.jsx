import { CAPABILITIES } from './model'
import { DRILLS, EVIDENCE_CARDS, EVIDENCE_OPTIONS, MATCH_DRILLS, gradeChoices, gradeMatch, gradeMatchFields, drillComplete } from './practice'
import { MATCH_FIELDS, YES_NO, stepCount } from './match'

const options = [['yes','Yes'],['no','No'],['did_not_see','Did Not See'],['not_applicable','Not Applicable']]
const attempt = (state, correct, total) => [...(state.attempts ?? []), { at: new Date().toISOString(), correct, total }].slice(-50)
export default function PracticeDrill({ missionId, state = {}, onChange }) {
  if (missionId === 'observe') return <MatchLab state={state} onChange={onChange} />
  const cards = missionId === 'evidence' ? EVIDENCE_CARDS : DRILLS[missionId]
  if (!cards) return null
  const results = gradeChoices(cards, state.answers)
  return <section className="sc-training-task" aria-label="Interactive practice">
    <p className="sc-training-kicker">TRY IT HERE · FICTIONAL PRACTICE</p><h4>{missionId === 'evidence' ? 'Sort the evidence' : 'Make the next call'}</h4>
    <p>Choose an answer for each situation, then review the explanation. Mistakes are practice; try again with the evidence in mind.</p>
    {cards.map(card => <fieldset key={card.id}><legend>{card.prompt || card.text}</legend>{(missionId === 'evidence' ? EVIDENCE_OPTIONS : card.options.map((v,i) => [i,v])).map(([value, label]) => <button key={value} aria-pressed={state.answers?.[card.id] === value} onClick={() => onChange({ ...state, answers: { ...state.answers, [card.id]: value }, reviewed: false })}>{label}</button>)}
      {state.reviewed && <p role="status"><strong>{results.find(r => r.id === card.id).correct ? 'Supported. ' : 'Take another look. '}</strong>{card.why}</p>}
    </fieldset>)}
    <button disabled={cards.some(c => state.answers?.[c.id] === undefined)} onClick={() => onChange({ ...state, reviewed: true, attempts: attempt(state, results.filter(r=>r.correct).length, cards.length) })}>Review practice decisions</button>
    {state.reviewed && <p role="status">{results.filter(r=>r.correct).length} / {cards.length} decisions match the lesson evidence.{drillComplete(missionId,state) ? ' Ready for the crew activity.' : ' Revise your choices and review again.'}</p>}
  </section>
}
function MatchLab({ state, onChange }) {
  const selected = Math.min(state.selected ?? 0, MATCH_DRILLS.length-1), drill = MATCH_DRILLS[selected]
  const current = state.matches?.[drill.id] ?? {}, frame = current.frame ?? 0
  const results = gradeMatch(drill, current.answers)
  const fieldResults = gradeMatchFields(drill, current.match)
  const fields = MATCH_FIELDS.filter(f => f.key in (drill.matchExpected ?? {}))
  function setField(key, v) { const m = { ...current.match }; if (v === undefined) delete m[key]; else m[key] = v; change({ match: m, reviewed: false }) }
  function change(patch) { onChange({ ...state, matches: { ...state.matches, [drill.id]: { ...current, ...patch } } }) }
  return <section className="sc-training-task" aria-label="Practice match lab">
    <p className="sc-training-kicker">MATCH LAB · SIX FICTIONAL SCENARIOS</p><h4>Follow the robot, protect the unknowns</h4><p>These are written simulations, not actual match footage. Advance through the moments, record only supported answers, then inspect the evidence. Real footage practice comes next.</p>
    <nav aria-label="Practice matches">{MATCH_DRILLS.map((d,i)=><button key={d.id} aria-current={selected===i?'step':undefined} className={selected===i?'active':''} onClick={()=>onChange({...state,selected:i})}>{i+1}. {d.title}{state.matches?.[d.id]?.reviewed && gradeMatch(d,state.matches[d.id].answers).every(r=>r.correct)?' ✓':''}</button>)}</nav>
    <div className="sc-practice-scoreboard"><strong>TEAM {drill.team}</strong><span>{drill.match} · Moment {Math.min(frame+1,drill.frames.length)} / {drill.frames.length}</span></div>
    <ol className="sc-practice-timeline">{drill.frames.slice(0,frame+1).map((text,i)=><li key={i}>{text}</li>)}</ol>
    <button disabled={frame>=drill.frames.length-1} onClick={()=>change({frame:frame+1})}>Next moment</button>
    <div className="sc-training-replay">{CAPABILITIES.map(c=><fieldset key={c.key}><legend>{c.label}</legend>{options.map(([value,label])=><button key={value} aria-pressed={current.answers?.[c.key]===value} onClick={()=>change({answers:{...current.answers,[c.key]:value},reviewed:false})}>{label}</button>)}</fieldset>)}</div>
    <div className="sc-training-replay sc-practice-match" aria-label="Match fields">{fields.map(f => f.type === 'count'
      ? <fieldset key={f.key} className="sc-count"><legend>{f.label}</legend><div className="sc-count-row"><button type="button" className="sc-step sc-step-minus" aria-label={`${f.label} minus 1`} disabled={current.match?.[f.key] === undefined || current.match?.[f.key] === 0} onClick={() => setField(f.key, stepCount(current.match?.[f.key], -1))}>−1</button><output className={`sc-count-value${current.match?.[f.key] === undefined ? ' sc-unrecorded' : ''}`}>{current.match?.[f.key] ?? '--'}</output><button type="button" className="sc-step" aria-label={`${f.label} plus 1`} onClick={() => setField(f.key, stepCount(current.match?.[f.key], 1))}>+1</button><button type="button" className="sc-step" aria-label={`${f.label} plus 5`} onClick={() => setField(f.key, stepCount(current.match?.[f.key], 5))}>+5</button></div>
          <div className="sc-count-foot">{current.match?.[f.key] === undefined ? <button type="button" className="sc-clear" onClick={() => setField(f.key, 0)}>Saw zero</button> : <button type="button" className="sc-clear" onClick={() => setField(f.key, undefined)}>Clear (not recorded)</button>}</div></fieldset>
      : <fieldset key={f.key}><legend>{f.label}</legend>{(f.type === 'yesno' ? YES_NO : f.options).map(([v, label]) => <button key={v} aria-pressed={current.match?.[f.key] === v} onClick={() => setField(f.key, current.match?.[f.key] === v ? undefined : v)}>{label}</button>)}</fieldset>)}</div>
    <label>Evidence note for this robot<textarea aria-label="Evidence note for this robot" maxLength={2000} rows={2} value={current.note??''} placeholder="Describe an action, its moment, and what you could not see." onChange={e=>change({note:e.target.value})}/></label>
    <button disabled={frame<drill.frames.length-1 || CAPABILITIES.some(c=>!current.answers?.[c.key])} onClick={()=>change({reviewed:true,attempts:attempt(current,results.filter(r=>r.correct).length,results.length)})}>Review this match</button>
    {current.reviewed&&<div role="status"><p>{results.filter(r=>r.correct).length + fieldResults.filter(r=>r.correct).length} / {results.length + fieldResults.length} observations match the visible evidence.</p><ul>{results.map(r=><li key={r.key}><strong>{CAPABILITIES.find(c=>c.key===r.key).label}: {r.correct?'supported':'review'}</strong>. {r.why}</li>)}{fieldResults.map(r=><li key={r.key}><strong>{MATCH_FIELDS.find(f=>f.key===r.key).label}: {r.correct?'supported':'review'}</strong>. {r.why}</li>)}</ul></div>}
    {selected<MATCH_DRILLS.length-1&&<button onClick={()=>onChange({...state,selected:selected+1})}>Next practice match</button>}
  </section>
}
