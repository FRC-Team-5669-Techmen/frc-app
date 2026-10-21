import { useEffect, useState } from 'react'
import { MISSIONS, REPLAY, TRAINING_VERSION, gradeReplay, trainingProgress } from './training.js'
import './Training.css'

export default function Training({ store, memberId, eventId }) {
 const [index,setIndex]=useState(0), [progress,setProgress]=useState({}), [loaded,setLoaded]=useState(false)
 const [answers,setAnswers]=useState({}), [checked,setChecked]=useState(false), [note,setNote]=useState(''), [didActivity,setDidActivity]=useState(false)
 const [error,setError]=useState(''), [seconds,setSeconds]=useState(null), [replay,setReplay]=useState({}), [replayChecked,setReplayChecked]=useState(false)
 const mission=MISSIONS[index], totals=trainingProgress(progress)
 useEffect(()=>{ let active=true; setLoaded(false); setProgress({})
   store?.getDraft(memberId,eventId,'training:'+TRAINING_VERSION).then(value=>{if(active){setProgress(value||{});setLoaded(true)}}).catch(()=>{if(active)setError('Practice progress could not be loaded. Your scouting records are unaffected.')})
   return()=>{active=false}
 },[store,memberId,eventId])
 useEffect(()=>{setAnswers({});setChecked(false);setNote(progress[mission.id]?.note||'');setDidActivity(false)},[index,loaded])
 useEffect(()=>{if(seconds===null||seconds>=15)return;const t=setTimeout(()=>setSeconds(s=>s+1),1000);return()=>clearTimeout(t)},[seconds])
 async function complete(){
   if(!loaded||!didActivity||!note.trim()||mission.questions.some((q,i)=>answers[i]!==q.answer))return
   const next={...progress,[mission.id]:{completed:true,note:note.trim(),completedAt:new Date().toISOString(),quizCorrect:mission.questions.length}}
   try{await store.saveDraft(memberId,eventId,'training:'+TRAINING_VERSION,next);setProgress(next);setError('')}catch{setError('Practice progress could not be saved. Keep this page open and retry.')}
 }
 function download(){
   const b=new Blob([JSON.stringify({version:TRAINING_VERSION,memberId,eventId,practiceOnly:true,officialCertificationAwarded:false,plannedMinutes:totals.plannedMinutes,measuredPracticeTime:null,progress},null,2)],{type:'application/json'})
   const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='techmen-scouting-practice.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
 }
 return <section className="sc-training" aria-label="Scout practice">
  <header><p className="sc-training-kicker">SCOUT LAB · BEGINNER TO MATCH READY</p><h2>Your practice season</h2><p>Eight missions. Real decisions. Room to make mistakes and learn.</p><p>{totals.completed} / {totals.total} missions recorded · About {totals.plannedMinutes} minutes of planned activities</p><progress aria-label="Practice missions completed" value={totals.completed} max={totals.total}/><p className="sc-training-muted">Activity estimates are a practice plan, not measured time or a certification threshold. Progress stays on this device for this account and event.</p></header>
  {error&&<p role="alert">{error}</p>}
  <nav aria-label="Practice missions">{MISSIONS.map((m,i)=><button key={m.id} className={i===index?'active':''} aria-current={i===index?'step':undefined} onClick={()=>setIndex(i)}>{progress[m.id]?.completed?'✓ ':String(i+1)+'. '}{m.title}</button>)}</nav>
  <article className="sc-training-lesson"><span className="sc-training-kicker">MISSION {index+1} · {mission.minutes} MINUTE ACTIVITY PLAN</span><h3>{mission.title}</h3><p><strong>{mission.skill}</strong></p><p>{mission.lesson}</p><div className="sc-training-task"><h4>Try it with your crew</h4><p>{mission.activity}</p></div>
   {mission.id==='observe'&&<section aria-label="Synthetic practice replay" className="sc-training-task"><h4>15-second observation drill</h4><p>Invented actions, not a real match. Watch first, then choose what you saw.</p><button onClick={()=>{setSeconds(0);setReplay({});setReplayChecked(false)}}>{seconds===null?'Start practice replay':'Replay from start'}</button>{seconds!==null&&<><p role="status">{seconds} / 15 seconds</p><ol>{REPLAY.filter(r=>r.at<=seconds).map(r=><li key={r.at}>{r.text}</li>)}</ol></>}
   {seconds>=15&&<><div className="sc-training-replay">{[['ground_intake','Floor intake'],['bump','BUMP crossing'],['trench','TRENCH passage']].map(([key,label])=><fieldset key={key}><legend>{label}</legend>{[['yes','Yes'],['no','No'],['did_not_see','Did Not See'],['not_applicable','Not Applicable']].map(([value,text])=><button key={value} aria-pressed={replay[key]===value} onClick={()=>{setReplay({...replay,[key]:value});setReplayChecked(false)}}>{text}</button>)}</fieldset>)}</div><button onClick={()=>setReplayChecked(true)}>Review my observations</button>{replayChecked&&<ul>{gradeReplay(replay).map(r=><li key={r.key}>{r.key.replaceAll('_',' ')}: {r.correct?'Matches the evidence':'Review: '+r.answer.replaceAll('_',' ')}</li>)}</ul>}</>}
   </section>}
   <h4>Check your judgment</h4>{mission.questions.map((q,i)=><fieldset key={mission.id+':'+i}><legend>{q.prompt}</legend>{q.options.map((option,j)=><button key={option} aria-pressed={answers[i]===j} onClick={()=>{setAnswers({...answers,[i]:j});setChecked(false)}}>{option}</button>)}{checked&&<p role="status"><strong>{answers[i]===q.answer?'Yes. ':'Review this. '}</strong>{q.why}</p>}</fieldset>)}
   <button onClick={()=>setChecked(true)}>Check my choices</button>
   <label className="sc-training-check"><input type="checkbox" checked={didActivity} onChange={e=>setDidActivity(e.target.checked)}/>I completed the partner or mentor activity above.</label>
   <label>One thing I learned, and one question for my mentor<textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Name specific evidence or a recovery you practiced."/></label>
   <button disabled={!loaded||!didActivity||!note.trim()||mission.questions.some((q,i)=>answers[i]!==q.answer)} onClick={complete}>Record mission practice</button>{progress[mission.id]?.completed&&<p role="status">Practice recorded for this mission.</p>}
   <footer><button disabled={index===0} onClick={()=>setIndex(i=>i-1)}>Previous mission</button><button disabled={index===MISSIONS.length-1} onClick={()=>setIndex(i=>i+1)}>Next mission</button></footer>
  </article>
  <aside className="sc-training-task"><h3>Ready for mentor review?</h3><p>Export your practice record and bring your annotated footage, corrected observations and pick-list reasoning. Your mentor checks your work on the phones and match recordings your team will use.</p><p><strong>This path does not award certification.</strong> Official certifications are earned in IDEA Classroom.</p><button disabled={!loaded} onClick={download}>Export practice record</button> <a href="https://ideabosco.com/certifications" target="_blank" rel="noreferrer">Open IDEA certifications</a></aside>
 </section>
}
