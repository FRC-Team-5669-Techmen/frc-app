import {describe,it,expect} from 'vitest'
import {freezeFootageEntry,appendFootageReview,workbookProgress} from '../src/scouting/workbook.js'
const first={id:'practice-a',team:'9001',match:'synthetic_qm1',url:'https://example.invalid/fictional-recording',selectedBy:'Synthetic fixture author',answers:{trench:'did_not_see',bump:'no'},firstPass:'0:30 view blocked; 0:40 bump attempt visibly failed.'}
describe('practice footage evidence history',()=>{
 it('freezes the first judgment and appends distinct corrected reviews without overwriting it',()=>{
  const frozen=freezeFootageEntry(first,'2026-10-21T09:00:00Z')
  expect(frozen.submission).toEqual({team:9001,match:'synthetic_qm1',url:first.url,selectedBy:first.selectedBy,answers:{trench:'did_not_see',bump:'no'},notes:first.firstPass,submittedAt:'2026-10-21T09:00:00Z'})
  expect(()=>freezeFootageEntry(frozen)).toThrow('already frozen')
  first.answers.trench='no';expect(frozen.submission.answers.trench).toBe('did_not_see');first.answers.trench='did_not_see'
  const reviewed=appendFootageReview({...frozen,reviewAnswers:{trench:'yes',bump:'no'},review:'Second camera at 0:30 shows a complete passage.',reviewed:true},'2026-10-21T09:05:00Z')
  expect(reviewed.submission.answers).toEqual({trench:'did_not_see',bump:'no'})
  expect(reviewed.reviews[0].answers).toEqual({trench:'yes',bump:'no'})
  expect(reviewed.reviews[0].notes).toContain('Second camera')
  expect(workbookProgress([reviewed,{id:'draft'}])).toEqual({entries:2,frozen:1,reviewed:1})
  const next=appendFootageReview({...reviewed,reviewAnswers:{trench:'did_not_see'},review:'Camera identity uncertain; withdraw the claimed confirmation.',reviewed:true})
  expect(next.reviews).toHaveLength(2);expect(next.reviews[0]).toEqual(reviewed.reviews[0]);expect(next.submission).toEqual(frozen.submission)
 })
 it('preserves missing vs unknown and refuses invalid or unreviewable submissions',()=>{
  expect(freezeFootageEntry(first).submission.answers).not.toHaveProperty('ground_intake')
  for(const patch of [{team:'0'},{url:'http://example.invalid/clip'},{url:'https://user:password@example.invalid/clip'},{match:''},{selectedBy:''},{firstPass:''},{answers:{trench:'unknown'}}])expect(()=>freezeFootageEntry({...first,...patch})).toThrow()
  const frozen=freezeFootageEntry(first)
  expect(()=>appendFootageReview({...frozen,review:'',reviewed:true})).toThrow()
  expect(()=>appendFootageReview({...frozen,review:'Review without discussion',reviewed:false})).toThrow()
  expect(appendFootageReview({...frozen,review:'No new information; keep the uncertainty.',reviewed:true}).reviews[0].answers.trench).toBe('did_not_see')
 })
})
