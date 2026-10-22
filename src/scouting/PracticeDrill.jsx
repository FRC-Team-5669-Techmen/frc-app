import { CAPABILITIES } from './model'
import { DRILLS, EVIDENCE_CARDS, EVIDENCE_OPTIONS, MATCH_DRILLS, gradeChoices, gradeMatch, drillComplete } from './practice'

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
  function change(patch) { onChange({ ...state, matches: { ...state.matches, [drill.id]: { ...current, ...patch } } }) }
  return <section className="sc-training-task" aria-label="Practice match lab">
    <p className="sc-training-kicker">MATCH LAB · SIX FICTIONAL SCENARIOS</p><h4>Follow the robot, protect the unknowns</h4><p>These are written simulations, not actual match footage. Advance through the moments, record only supported answers, then inspect the evidence. Real footage practice comes next.</p>
    <nav aria-label="Practice matches">{MATCH_DRILLS.map((d,i)=><button key={d.id} aria-current={selected===i?'step':undefined} className={selected===i?'active':''} onClick={()=>onChange({...state,selected:i})}>{i+1}. {d.title}{state.matches?.[d.id]?.reviewed && gradeMatch(d,state.matches[d.id].answers).every(r=>r.correct)?' ✓':''}</button>)}</nav>
    <div className="sc-practice-scoreboard"><strong>TEAM {drill.team}</strong><span>{drill.match} · Moment {Math.min(frame+1,drill.frames.length)} / {drill.frames.length}</span></div>
    <ol className="sc-practice-timeline">{drill.frames.slice(0,frame+1).map((text,i)=><li key={i}>{text}</li>)}</ol>
    <button disabled={frame>=drill.frames.length-1} onClick={()=>change({frame:frame+1})}>Next moment</button>
    <div className="sc-training-replay">{CAPABILITIES.map(c=><fieldset key={c.key}><legend>{c.label}</legend>{options.map(([value,label])=><button key={value} aria-pressed={current.answers?.[c.key]===value} onClick={()=>change({answers:{...current.answers,[c.key]:value},reviewed:false})}>{label}</button>)}</fieldset>)}</div>
    <label>Evidence note for this robot<textarea aria-label="Evidence note for this robot" maxLength={2000} rows={2} value={current.note??''} placeholder="Describe an action, its moment, and what you could not see." onChange={e=>change({note:e.target.value})}/></label>
    <button disabled={frame<drill.frames.length-1 || CAPABILITIES.some(c=>!current.answers?.[c.key])} onClick={()=>change({reviewed:true,attempts:attempt(current,results.filter(r=>r.correct).length,results.length)})}>Review this match</button>
    {current.reviewed&&<div role="status"><p>{results.filter(r=>r.correct).length} / 3 observations match the visible evidence.</p><ul>{results.map(r=><li key={r.key}><strong>{CAPABILITIES.find(c=>c.key===r.key).label}: {r.correct?'supported':'review'}</strong>. {r.why}</li>)}</ul></div>}
    {selected<MATCH_DRILLS.length-1&&<button onClick={()=>onChange({...state,selected:selected+1})}>Next practice match</button>}
  </section>
}
