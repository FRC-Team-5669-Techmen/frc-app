import { describe, it, expect } from 'vitest'
import { MISSIONS, gradeReplay, trainingProgress } from '../src/scouting/training.js'
describe('synthetic scout practice',()=>{
 it('judges the visible intake, failed attempt and occluded route independently',()=>{
  expect(gradeReplay({ground_intake:'yes',bump:'no',trench:'did_not_see'}).map(r=>r.correct)).toEqual([true,true,true])
  expect(gradeReplay({ground_intake:'no',bump:'yes',trench:'yes'}).map(r=>r.correct)).toEqual([false,false,false])
  expect(gradeReplay({}).every(r=>!r.correct)).toBe(true)
 })
 it('counts explicit recorded missions, never elapsed time or unknown entries as competence',()=>{
  expect(trainingProgress({evidence:{completed:true},pit:{completed:false},other:{completed:true}})).toEqual({completed:1,total:9,plannedMinutes:195})
  expect(trainingProgress()).toEqual({completed:0,total:9,plannedMinutes:195})
  expect(trainingProgress(Object.fromEntries(MISSIONS.map(m=>[m.id,{completed:true}]))).completed).toBe(9)
 })
})

import { EVIDENCE_CARDS, DRILLS, MATCH_DRILLS, gradeChoices, gradeMatch, gradeMatchFields, drillComplete } from '../src/scouting/practice.js'
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
  const fieldsOf = d => Object.fromEntries(Object.entries(d.matchExpected).filter(([,v]) => v !== 'unrecorded'))
  const matches = Object.fromEntries(MATCH_DRILLS.map(d=>[d.id,{reviewed:true,answers:{...d.expected},match:fieldsOf(d)}]))
  expect(drillComplete('observe',{matches})).toBe(true)
  // A recorded 0 where nothing was seen is wrong; leaving it blank is right (0027 rule).
  expect(gradeMatchFields(byId.occluded,{stuck:'yes',tower:'did_not_see'}).every(r=>r.correct)).toBe(true)
  expect(gradeMatchFields(byId.occluded,{teleop_fuel:0,stuck:'yes',tower:'did_not_see'}).find(r=>r.key==='teleop_fuel').correct).toBe(false)
  expect(gradeMatchFields(byId.no_trial,{teleop_fuel:0,tower:'did_not_see',stuck:'no'}).every(r=>r.correct)).toBe(true)
  expect(gradeMatchFields(byId.no_trial,{tower:'did_not_see',stuck:'no'}).find(r=>r.key==='teleop_fuel').correct).toBe(false)
  expect(drillComplete('observe',{matches:{...matches,clear:{...matches.clear,match:{}}}})).toBe(false)
  delete matches.scoreboard
  expect(drillComplete('observe',{matches})).toBe(false)
 })
})
