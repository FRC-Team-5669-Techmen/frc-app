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
