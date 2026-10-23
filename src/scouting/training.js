// Techmen instructional material. Synthetic situations, never match evidence.
export const TRAINING_VERSION = '2026.1'
export const MISSIONS = [
 { id:'evidence', title:'See it. Record it.', minutes:15, skill:'Separate a claim from an observation.',
   lesson:'A pit answer is what a team says its robot can do. An observation is what you saw in one match. Keep both. If your view is blocked, choose Did Not See. If the capability does not apply to that situation, choose Not Applicable. Leave a field unanswered only when you have not recorded it yet.',
   activity:'With a partner, take turns describing five robot actions. Include a blocked view and a capability you never had a chance to observe. Explain your answer before your partner reveals what happened.',
   questions:[
    {prompt:'The pit crew says the robot crosses the BUMP. You never see it approach a BUMP. What do you record?',options:['Yes, because the pit crew said so','No','Did Not See'],answer:2,why:'The pit claim stays a claim. There was no observable trial in this match.'},
    {prompt:'You clearly see a robot try a crossing and fail. What do you record for that trial?',options:['No','Did Not See','Delete the pit claim'],answer:0,why:'A visible failed attempt is evidence. It does not erase the original pit claim.'}] },
 { id:'pit',title:'A useful pit conversation',minutes:20,skill:'Ask about the robot without making assumptions.',
   lesson:'Introduce your team, ask if this is a good time, and keep questions short. Ask what changed since the previous event. Record capabilities as claims, a specific pit location, and robot-focused notes. Do not record personal information about another team’s students.',
   activity:'Role-play a three-minute pit interview twice. One partner is repairing a robot and cannot talk. Then swap roles. Write a concise note that another scout could use without meeting the team.',
   questions:[
    {prompt:'The team is repairing damage and asks you to return later. What belongs in your note?',options:['This team is unhelpful','Pit interview pending; return when repairs allow','All capabilities: No'],answer:1,why:'The note records the situation without judging people or inventing robot evidence.'},
    {prompt:'A team tells you it can pass under the TRENCH, but you have not seen it. Where does that go?',options:['Pit capability: Yes','Observed reliability: 100%','Official result'],answer:0,why:'It is an attributed capability claim, not a confirmed match trial.'}] },
 { id:'observe',title:'One robot, one match',minutes:25,skill:'Track evidence through distractions.',
   lesson:'Check your event, match and team before the match begins. Follow your assigned robot. Record only the capabilities you can see. Use short notes about a specific action and when it happened. Official alliance FUEL totals cannot reveal your robot’s individual contribution. Shifts are match numbers, not clock times: a block like Q13 to Q24 stays correct when the field runs late. The Now panel on Scout this shows the match on the field and says when you are up; your lead moves it as matches start, so be in your seat two matches early.',
   activity:'Use the practice replay below, then watch three recordings chosen by your mentor. Pause after each and compare your notes with a partner. Keep the recording link and timestamps. The replay is invented and is not evidence about a real team.',
   questions:[
    {prompt:'The alliance scored 120 FUEL points. How many did your assigned robot score?',options:['40, divided equally','120','Unknown from that alliance total'],answer:2,why:'Alliance totals are not an individual robot score.'},
    {prompt:'Two scouts disagree on the same crossing. What is the next useful step?',options:['Count both as two independent matches','Mark the trial disputed and review the footage','Choose the more optimistic answer'],answer:1,why:'Review the specific evidence. A disagreement should not become false confidence.'}] },
 { id:'count',title:'Count it, or leave it blank',minutes:15,skill:'Record FUEL, TOWER and reliability without inventing zeros.',
   lesson:'Each observation now has match fields: FUEL scored in auto and teleop, FUEL missed, shuttling, defense and its effectiveness, driver skill, the TOWER level, and whether the robot died, tipped, got stuck or broke something. Every field starts as not recorded. Tap +1 or +5 as FUEL goes in, and -1 to fix a miscount. If you watched and it scored none, tap Saw zero. If you did not see it, leave it blank. Ratings are 1 to 5; leave them blank if you cannot judge. With 12 or more scouts on a shift, two scouts watch every robot. Count on your own and do not compare until the match ends: the pairs spreadsheet averages your two counts and flags any field where you differ by more than 10 FUEL or 1 rating point, or on a yes or no, for a lead to check.',
   activity:'Watch one mentor-chosen match twice with a partner on the same robot. Count FUEL with the steppers, one hand only. Compare totals after each viewing and explain any difference. Then each of you names one field you left blank and why.',
   questions:[
    {prompt:'Your view was blocked for all of auto. Auto FUEL should be:',options:['0','Not recorded','The alliance total divided by three'],answer:1,why:'You did not see it. Blank is the honest answer; 0 would claim you saw none.'},
    {prompt:'Two scouts on the same match count 14 and 18 teleop FUEL. How does the team view treat it?',options:['Two separate matches','One match, valued at the middle of the two, with both counts kept','Throw out the higher one'],answer:1,why:'Scouts on one match are not independent samples. The team view takes one value per match and keeps every record.'}] },
 { id:'film',title:'Scout This: film room',minutes:25,skill:'Prepare a useful match-strategy note.',
   lesson:'Open the assigned team and match. When using footage from another event, label that source and retain the link. Describe observed behavior, not reputation: where the robot collected, how it crossed, what interrupted it, and what you could not see.',
   activity:'Review three mentor-selected matches of one team from two events if available. Write one observation per match. Build a short strategy note with a supporting timestamp and one uncertainty. Compare it with a partner’s note before discussing rankings.',
   questions:[
    {prompt:'You watch an older event while preparing for a new match. Which source is accurate?',options:['Live at this event','Video, with its actual link and source match identified','Official result for the upcoming match'],answer:1,why:'The source and match identity must describe what you actually reviewed.'},
    {prompt:'Which note helps the strategy lead most?',options:['They are bad','At 1:14 the robot stopped near the loading area; cause not visible','Their driver panicked'],answer:1,why:'The note describes a robot behavior and its uncertainty, without guessing about a person.'}] },
 { id:'recover',title:'Beat a bad connection',minutes:20,skill:'Recover without duplicate submissions.',
   lesson:'Saved locally means this device has your record. Synchronized means the server confirmed it. Delivered means Discord confirmed the notification. These are three different states. A retry reuses the original save ID. A conflict means another version exists and needs review.',
   activity:'In a mentor-approved training event, save a practice observation offline, reload, reconnect, and synchronize. Verify exactly one record appears. Open two tabs, edit one record from both, and explain why the second edit conflicts. Never use real event data for this drill.',
   questions:[
    {prompt:'Your screen says Saved locally. Can the strategy lead on another phone read it yet?',options:['Yes','Only if it has also synchronized','Only if Discord is open'],answer:1,why:'The server must confirm synchronization before another device can read it.'},
    {prompt:'A Discord send timed out after the request left the app. What is safe?',options:['Tap send repeatedly','Treat delivery as uncertain and check the channel','Delete the observation'],answer:1,why:'It may already have arrived. Repeated sends can duplicate notifications; your scouting record remains saved.'}] },
 { id:'rank',title:'Build a defensible pick list',minutes:25,skill:'Compare evidence, support and role fit.',
   lesson:'Build your own four-tier list. Keep Do Not Pick reasons robot-focused and specific. The Techmen master uses median tier and rank, shows support counts and DNP votes, and does not silently remove outliers. A high EPA is an estimate, not a guarantee. A team filtered out for missing data has not failed. Super scouts watch a whole alliance and count nothing. They rate driver skill, defense, speed and intake reliability from 1 to 5 and write down failures. Their ratings appear beside the counts on each team in the pick list; a blank rating means not judged, never 1.',
   activity:'Using six fictional teams in a training event, build a list independently. Compare with two partners. Each person must defend one choice with observation evidence and identify one choice with weak support. Use a three-team comparison and inspect the preview before applying it.',
   questions:[
    {prompt:'There are two Yes matches, one No, and four Did Not See responses. What is the observed rate?',options:['2/7, about 29%','2/3, about 67%','2/2, 100%'],answer:1,why:'Only the three visible, undisputed trials enter the denominator. Unknown responses stay visible separately.'},
    {prompt:'A comparison preview moves a team you disagree with. What should you do?',options:['It is already final','Cancel the preview and review evidence','Overwrite the master list'],answer:1,why:'Preview is a proposal. Applying is an explicit change to your own versioned list.'}] },
 { id:'communicate',title:'Stands to pits',minutes:15,skill:'Send a clear, respectful request.',
   lesson:'Name the team, observable issue, match, and question for the pit crew. Check the pit location’s source and freshness. Do not send private details or blame another team’s students. The note saves even when notification delivery fails.',
   activity:'With a partner in another part of the room, practice three messages: a robot stops, a capability changes, and a pit location is missing. The recipient must restate the question correctly. Use the training event only; do not request Discord delivery for practice.',
   questions:[
    {prompt:'Which message is actionable?',options:['Team 9001 stopped in QM12 at 0:40; could the pit crew ask whether repairs changed their climbing plan?','Team 9001 is terrible','Tell everyone they broke'],answer:0,why:'It gives a team, observed event and specific question while leaving the cause uncertain.'},
    {prompt:'The pit map was last refreshed yesterday and a team moved. What should change?',options:['Silently trust the old map','Record a corrected location and its source','Change their match result'],answer:1,why:'Location evidence needs correction and freshness just like other data.'}] },
 { id:'assessment',title:'Your practice scrimmage',minutes:35,skill:'Run the whole workflow and explain your decisions.',
   lesson:'Practice completion is preparation, not certification. Your mentor reviews accuracy, communication and recovery on real match footage and the phones the team uses. Official certification is awarded in IDEA Classroom. No automatic passing threshold has been set here.',
   activity:'Ask a mentor to choose a fixed set of six recordings before you start. Scout independently without pausing the first viewing. Review disagreements with timestamps, revise your records, build a pick list, and explain one uncertainty. Export this practice record for mentor review.',
   questions:[
    {prompt:'You finished every activity in this practice path. Are you officially certified?',options:['Yes, automatically','No; official assessment and certification remain in IDEA Classroom','Only if you spent exactly three hours'],answer:1,why:'Time and practice completion do not establish competence or award the official certification.'},
    {prompt:'A mentor finds a mistake in an observation. What is the right recovery?',options:['Hide it','Correct the version with evidence and explain what changed','Submit several extra copies'],answer:1,why:'Corrections preserve the original evidence and make consequential errors detectable.'}] },
]
export const REPLAY = [
 {at:0,text:'Synthetic practice: Team 9001 starts in view. The TRENCH is on the far side.'},
 {at:3,text:'You clearly see 9001 collect FUEL from the floor.'},
 {at:6,text:'9001 approaches the BUMP and attempts to cross. It stops, backs away and does not cross.'},
 {at:9,text:'A flag blocks your view while 9001 moves near the TRENCH.'},
 {at:12,text:'Your view returns. The robot is on the other side, but you did not see its route.'},
 {at:15,text:'Replay complete. Record only the actions you saw.'},
]
export function gradeReplay(answers) {
 const expected = {ground_intake:'yes',bump:'no',trench:'did_not_see'}
 return Object.entries(expected).map(([key,answer])=>({key,correct:answers[key]===answer,answer}))
}
export function trainingProgress(progress = {}) {
 const completed = MISSIONS.filter(m=>progress[m.id]?.completed === true).length
 return {completed,total:MISSIONS.length,plannedMinutes:MISSIONS.reduce((s,m)=>s+m.minutes,0)}
}
