import { useEffect, useRef, useState } from 'react'
import { MISSIONS, TRAINING_VERSION, trainingProgress } from './training.js'
import PracticeDrill from './PracticeDrill'
import FootageWorkbook from './FootageWorkbook'
import { drillComplete } from './practice'
import './Training.css'

export default function Training({ store, memberId, eventId }) {
 const [index,setIndex]=useState(0), [progress,setProgress]=useState({}), [savedProgress,setSavedProgress]=useState({}), [loaded,setLoaded]=useState(false)
 const [error,setError]=useState(''), [saveStatus,setSaveStatus]=useState('Loading practice record…'), [retry,setRetry]=useState(0)
 const latest=useRef({}), writes=useRef(Promise.resolve()), sequence=useRef(0), alive=useRef(true)
 const mission=MISSIONS[index], totals=trainingProgress(savedProgress), entry=progress[mission.id]??{}
 const answers=entry.answers??{}, checked=entry.checked===true, note=entry.note??'', didActivity=entry.didActivity===true
 const practiceReady=drillComplete(mission.id,entry.practice)
 useEffect(()=>{ alive.current=true; setLoaded(false); setProgress({}); setSavedProgress({}); setError('')
   store.getDraft(memberId,eventId,'training:'+TRAINING_VERSION).then(value=>{
     if(!alive.current)return
     latest.current=value||{};setProgress(latest.current);setSavedProgress(latest.current);setIndex(Math.min(latest.current._activeMission??0,MISSIONS.length-1));setLoaded(true);setSaveStatus('Practice record loaded on this device.')
   }).catch(()=>{if(alive.current)setError('Practice progress could not be loaded. Retry before changing it. Your scouting records are unaffected.')})
   return()=>{alive.current=false}
 },[store,memberId,eventId,retry])
 function persist(next){
   latest.current=next;setProgress(next);setSaveStatus('Saving practice…')
   const request=++sequence.current
   writes.current=writes.current.catch(()=>{}).then(()=>store.saveDraft(memberId,eventId,'training:'+TRAINING_VERSION,next)).then(()=>{
     if(alive.current)setSavedProgress(next)
     if(alive.current&&request===sequence.current){setSaveStatus('Practice saved on this device.');setError('')}
   }).catch(()=>{if(alive.current&&request===sequence.current){setSaveStatus('Latest practice changes are not saved.');setError('Practice could not be saved. Keep this page open and retry saving.')}})
 }
 function change(patch){
   const previous=latest.current[mission.id]??{}
   persist({...latest.current,[mission.id]:{...previous,...patch,...(('answers' in patch || 'practice' in patch)?{completed:false}:{})}})
 }
 function navigate(next){setIndex(next);persist({...latest.current,_activeMission:next})}
 function complete(){
   if(!loaded||!practiceReady||!didActivity||!note.trim()||mission.questions.some((q,i)=>answers[i]!==q.answer))return
   change({completed:true,note:note.trim(),completedAt:new Date().toISOString(),quizCorrect:mission.questions.length})
 }
 function download(){
   const b=new Blob([JSON.stringify({version:TRAINING_VERSION,memberId,eventId,practiceOnly:true,officialCertificationAwarded:false,plannedMinutes:totals.plannedMinutes,measuredPracticeTime:null,progress,workbook:progress._workbook??[],contentRevision:'2026.2'},null,2)],{type:'application/json'})
   const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='techmen-scouting-practice.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
 }
 return <section className="sc-training" aria-label="Scout practice">
  <header><p className="sc-training-kicker">SCOUT LAB · BEGINNER TO MATCH READY</p><h2>Your practice season</h2><p>Eight missions. Real decisions. Room to make mistakes and learn.</p><p>{totals.completed} / {totals.total} missions recorded · About {totals.plannedMinutes} minutes of planned activities</p><progress aria-label="Practice missions completed" value={totals.completed} max={totals.total}/><p className="sc-training-muted">Activity estimates are a practice plan, not measured time or a certification threshold. Progress stays on this device for this account and event.</p></header>
  {error&&<p role="alert">{error} <button onClick={()=>loaded?persist(latest.current):setRetry(n=>n+1)}>{loaded?'Retry saving practice':'Retry loading practice'}</button></p>}<p role="status" className="sc-training-muted">{saveStatus}</p>
  <nav aria-label="Practice missions">{MISSIONS.map((m,i)=><button key={m.id} className={i===index?'active':''} aria-current={i===index?'step':undefined} disabled={!loaded} onClick={()=>navigate(i)}>{progress[m.id]?.completed?'✓ ':String(i+1)+'. '}{m.title}</button>)}</nav>
  <article className="sc-training-lesson"><span className="sc-training-kicker">MISSION {index+1} · {mission.minutes} MINUTE ACTIVITY PLAN</span><h3>{mission.title}</h3><p><strong>{mission.skill}</strong></p><p>{mission.lesson}</p><div className="sc-training-task"><h4>Try it with your crew</h4><p>{mission.activity}</p></div>
   <fieldset disabled={!loaded} className="sc-practice-fields">
   <PracticeDrill missionId={mission.id} state={entry.practice} onChange={practice=>change({practice})}/>
   <h4>Check your judgment</h4>{mission.questions.map((q,i)=><fieldset key={mission.id+':'+i}><legend>{q.prompt}</legend>{q.options.map((option,j)=><button key={option} aria-pressed={answers[i]===j} onClick={()=>{change({answers:{...answers,[i]:j},checked:false})}}>{option}</button>)}{checked&&<p role="status"><strong>{answers[i]===q.answer?'Yes. ':'Review this. '}</strong>{q.why}</p>}</fieldset>)}
   <button onClick={()=>change({checked:true})}>Check my choices</button>
   <label className="sc-training-check"><input type="checkbox" checked={didActivity} onChange={e=>change({didActivity:e.target.checked})}/>I completed the partner or mentor activity above.</label>
   <label>One thing I learned, and one question for my mentor<textarea aria-label="One thing I learned, and one question for my mentor" rows={3} maxLength={2000} value={note} onChange={e=>change({note:e.target.value})} placeholder="Name specific evidence or a recovery you practiced."/></label>
   <button disabled={!loaded||!practiceReady||!didActivity||!note.trim()||mission.questions.some((q,i)=>answers[i]!==q.answer)} onClick={complete}>Record mission practice</button>{entry.completed&&savedProgress[mission.id]?.completed&&<p role="status">Practice recorded for this mission.</p>}
   {!practiceReady&&<p className="sc-training-muted">Finish and review the interactive practice before recording this mission.</p>}
   </fieldset>
   <footer><button disabled={!loaded||index===0} onClick={()=>navigate(index-1)}>Previous mission</button><button disabled={!loaded||index===MISSIONS.length-1} onClick={()=>navigate(index+1)}>Next mission</button></footer>
  </article>
  {loaded&&<FootageWorkbook rows={progress._workbook} onChange={rows=>persist({...latest.current,_workbook:rows})}/>}
  <aside className="sc-training-task"><h3>Ready for mentor review?</h3><p>Export your practice record and bring your annotated footage, corrected observations and pick-list reasoning. Your mentor checks your work on the phones and match recordings your team will use.</p><p><strong>This path does not award certification.</strong> Official certifications are earned in IDEA Classroom.</p><button disabled={!loaded} onClick={download}>Export practice record</button> <a href="https://ideabosco.com/certifications" target="_blank" rel="noreferrer">Open IDEA certifications</a></aside>
 </section>
}
