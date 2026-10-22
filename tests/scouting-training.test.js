import { describe, it, expect } from 'vitest'
import { MISSIONS, gradeReplay, trainingProgress } from '../src/scouting/training.js'
describe('synthetic scout practice',()=>{
 it('judges the visible intake, failed attempt and occluded route independently',()=>{
  expect(gradeReplay({ground_intake:'yes',bump:'no',trench:'did_not_see'}).map(r=>r.correct)).toEqual([true,true,true])
  expect(gradeReplay({ground_intake:'no',bump:'yes',trench:'yes'}).map(r=>r.correct)).toEqual([false,false,false])
  expect(gradeReplay({}).every(r=>!r.correct)).toBe(true)
 })
 it('counts explicit recorded missions, never elapsed time or unknown entries as competence',()=>{
  expect(trainingProgress({evidence:{completed:true},pit:{completed:false},other:{completed:true}})).toEqual({completed:1,total:8,plannedMinutes:180})
  expect(trainingProgress()).toEqual({completed:0,total:8,plannedMinutes:180})
  expect(trainingProgress(Object.fromEntries(MISSIONS.map(m=>[m.id,{completed:true}]))).completed).toBe(8)
 })
})

import { EVIDENCE_CARDS, DRILLS, MATCH_DRILLS, gradeChoices, gradeMatch, drillComplete } from '../src/scouting/practice.js'
describe('interactive practice evidence keys', () => {
 it('requires reviewed correct exercises and never treats empty answers as completion', () => {
  for (const id of ['evidence', 'observe', ...Object.keys(DRILLS)]) expect(drillComplete(id)).toBe(false)
  const answers = Object.fromEntries(EVIDENCE_CARDS.map(c => [c.id, c.answer]))
  expect(gradeChoices(EVIDENCE_CARDS, answers).every(r=>r.correct)).toBe(true)
  expect(drillComplete('evidence', { answers })).toBe(false)
  expect(drillComplete('evidence', { answers, reviewed:true })).toBe(true)
  expect(drillComplete('evidence', { answers:{...answers,crew:'observation'},reviewed:true })).toBe(false)
  for (const [id,cards] of Object.entries(DRILLS)) {
   const answers=Object.fromEntries(cards.map(c=>[c.id,c.answer]))
   expect(drillComplete(id,{answers,reviewed:true})).toBe(true)
   expect(drillComplete(id,{answers:{...answers,[cards[0].id]:-1},reviewed:true})).toBe(false)
  }
 })
 it('distinguishes no trial, occlusion, observed failure and explicit not-applicable scope', () => {
  const byId = Object.fromEntries(MATCH_DRILLS.map(d=>[d.id,d]))
  expect(gradeMatch(byId.no_trial,{ground_intake:'did_not_see',bump:'did_not_see',trench:'did_not_see'}).every(r=>r.correct)).toBe(true)
  expect(gradeMatch(byId.occluded,{ground_intake:'yes',bump:'no',trench:'yes'}).map(r=>r.correct)).toEqual([true,true,false])
  expect(gradeMatch(byId.practice_lane,{ground_intake:'yes',bump:'not_applicable',trench:'not_applicable'}).every(r=>r.correct)).toBe(true)
  const matches = Object.fromEntries(MATCH_DRILLS.map(d=>[d.id,{reviewed:true,answers:{...d.expected}}]))
  expect(drillComplete('observe',{matches})).toBe(true)
  delete matches.scoreboard
  expect(drillComplete('observe',{matches})).toBe(false)
 })
})
