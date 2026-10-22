// Practice evidence, never competition observations or an automatic grade.
// Frozen first passes and appended reviews let a mentor inspect real learning.
const choices = new Set(['yes','no','did_not_see','not_applicable'])
function answers(value = {}) {
  for (const [key,answer] of Object.entries(value)) if (!['trench','bump','ground_intake'].includes(key) || !choices.has(answer)) throw new Error('Choose a supported answer or leave it unrecorded.')
  return structuredClone(value)
}
export function freezeFootageEntry(row, now = new Date().toISOString()) {
  if (row.submission) throw new Error('This first pass is already frozen. Add a review to explain a correction.')
  const team=Number(row.team)
  if (!Number.isInteger(team) || team<1 || team>99999 || !row.match?.trim()) throw new Error('Identify the team and actual source match before freezing the first pass.')
  let url
  try { url=new URL(row.url) } catch { throw new Error('Use an HTTPS recording URL that your mentor can review.') }
  if (url.protocol!=='https:' || url.username || url.password) throw new Error('Use an HTTPS recording URL without embedded credentials.')
  if (!row.selectedBy?.trim() || !row.firstPass?.trim()) throw new Error('Record who chose the source and your first-pass evidence notes.')
  const recorded=answers(row.answers)
  return {...row,submission:{team,match:row.match.trim(),url:url.href,selectedBy:row.selectedBy.trim(),answers:recorded,notes:row.firstPass.trim(),submittedAt:now},reviewAnswers:structuredClone(recorded),reviews:row.reviews??[]}
}
export function appendFootageReview(row, now = new Date().toISOString()) {
  if (!row.submission) throw new Error('Freeze your first pass before recording a review.')
  if (!row.review?.trim()) throw new Error('Explain the review, supporting timestamps and any correction.')
  if (!row.reviewed) throw new Error('Discuss the evidence with your mentor or partner before recording the review.')
  const review={answers:answers(row.reviewAnswers),notes:row.review.trim(),discussed:true,recordedAt:now}
  return {...row,reviews:[...(row.reviews??[]),review],review:'',reviewed:false}
}
export function workbookProgress(rows = []) {
  return {entries:rows.length,frozen:rows.filter(r=>r.submission).length,reviewed:rows.filter(r=>r.reviews?.length).length}
}
