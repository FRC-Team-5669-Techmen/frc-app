// Authored Techmen exercises. Every team/action here is fictional.
// Expected answers are explicit lesson keys, not computed by production rankings.
export const EVIDENCE_CARDS = [
  { id: 'crew', text: 'The pit crew tells you their robot can pass under the TRENCH.', answer: 'claim', why: 'A team statement is a pit claim until independently observed.' },
  { id: 'view', text: 'At 0:36, you clearly see the robot pass under the TRENCH.', answer: 'observation', why: 'This is a time-specific observation of one robot.' },
  { id: 'total', text: 'The official score page reports 120 FUEL points for the red alliance.', answer: 'official', why: 'This is an official alliance result. It is not one robot’s contribution.' },
  { id: 'epa', text: 'Statbotics gives this team an EPA of 48.2.', answer: 'estimate', why: 'EPA is a modeled estimate, not an observed event or official individual score.' },
  { id: 'blocked', text: 'A spectator blocks your view of the attempted crossing.', answer: 'unknown', why: 'No observable outcome is available. Did Not See protects that uncertainty.' },
  { id: 'rumor', text: 'A friend says another scout heard the robot broke.', answer: 'unknown', why: 'Do not convert a rumor into verified robot evidence. Ask for the actual observation.' },
]
export const EVIDENCE_OPTIONS = [['claim', 'Pit claim'], ['observation', 'Scout observation'], ['official', 'Official alliance result'], ['estimate', 'Statistical estimate'], ['unknown', 'Not established']]
export const PIT_STEPS = [
  { id:'permission', prompt:'You reach a crowded pit. The team is replacing a wheel. How do you start?', options:['Ask whether a short interview is okay, or when to return','Start asking questions over the repair work','Mark the team uncooperative'], answer:0, why:'Respect the repair crew’s time. A postponed interview is not a negative capability.' },
  { id:'neutral', prompt:'You have time for one capability question. Which is clearest?', options:['You can go under the TRENCH, right?','Can your current robot pass under the TRENCH? Has that changed this event?','Are you a good robot?'], answer:1, why:'Ask a neutral, current, specific question instead of suggesting the answer.' },
  { id:'uncertain', prompt:'The crew says “we think so, but have not tested it since repairs.”', options:['Record Yes, verified','Record No','Record Unknown and note that post-repair testing is pending'], answer:2, why:'Uncertainty should remain explicit, and the changed configuration matters.' },
  { id:'location', prompt:'The team’s old address is B12; you are standing at C04.', options:['Keep B12 because it came from an API','Record C04 with a note that you verified the move','Delete every imported team field'], answer:1, why:'A specific correction with provenance is more useful than silently trusting stale data.' },
]
export const MATCH_DRILLS = [
  { id:'clear', title:'Clear view', team:9001, match:'practice1', frames:[
    '0:00 — Team 9001 starts in your field of view.',
    '0:12 — You clearly see FUEL enter its intake from the floor.',
    '0:30 — It drives completely over the BUMP.',
    '0:55 — It enters and exits under the TRENCH, continuously in view.',
  ], expected:{ground_intake:'yes',bump:'yes',trench:'yes'}, reasons:{ground_intake:'The intake action was visible.',bump:'The robot completed the crossing.',trench:'The whole passage was visible.'} },
  { id:'occluded', title:'The disappearing robot', team:9002, match:'practice2', frames:[
    '0:00 — Team 9002 is assigned to you.',
    '0:15 — A flag blocks your view near the TRENCH.',
    '0:25 — The robot reappears across the field. You never saw its route.',
    '0:45 — It attempts the BUMP, stops against it and backs away without crossing.',
    '1:00 — You clearly see it collect FUEL from the floor.',
  ], expected:{ground_intake:'yes',bump:'no',trench:'did_not_see'}, reasons:{ground_intake:'The intake action is visible.',bump:'A clearly observed attempt failed.',trench:'The ending position does not prove the route taken.'} },
  { id:'no_trial', title:'No visible trial', team:9003, match:'practice3', frames:[
    '0:00 — The pit crew previously claimed BUMP and TRENCH capability.',
    '0:20 — The robot stays on one side of the field.',
    '0:50 — It receives FUEL from a human player; it never attempts floor intake.',
    '1:20 — The match ends with no visible attempts at the three capabilities.',
  ], expected:{ground_intake:'did_not_see',bump:'did_not_see',trench:'did_not_see'}, reasons:{ground_intake:'Receiving from a person does not demonstrate floor intake.',bump:'No visible attempt is not a failed attempt.',trench:'The prior pit claim cannot fill a missing observation.'} },
  { id:'mixed', title:'Separate the capabilities', team:9004, match:'practice4', frames:[
    '0:00 — Team 9004 approaches loose FUEL.',
    '0:10 — Its running intake tries to pick up the FUEL, but nothing enters; it backs away.',
    '0:35 — It crosses the BUMP completely.',
    '1:10 — A teammate blocks your view of the TRENCH passage.',
  ], expected:{ground_intake:'no',bump:'yes',trench:'did_not_see'}, reasons:{ground_intake:'A visible attempted intake failed.',bump:'The BUMP crossing succeeded.',trench:'The blocked view must remain unknown.'} },
  { id:'practice_lane', title:'Know what the exercise can show', team:9005, match:'practice5', frames:[
    'This is a fictional isolated floor-intake test, not a full match.',
    'There is no BUMP or TRENCH in the test area; those capabilities are explicitly out of scope.',
    '0:15 — Team 9005 visibly collects the FUEL from the floor.',
    'The exercise ends. Record Not Applicable for the capabilities outside this exercise.',
  ], expected:{ground_intake:'yes',bump:'not_applicable',trench:'not_applicable'}, reasons:{ground_intake:'This was a successful visible intake test.',bump:'This isolated exercise explicitly excluded BUMP testing.',trench:'This isolated exercise explicitly excluded TRENCH testing.'} },
  { id:'scoreboard', title:'Ignore the tempting scoreboard', team:9006, match:'practice6', frames:[
    '0:00 — Your robot is Team 9006, on the red alliance.',
    '0:20 — It visibly collects FUEL from the floor.',
    '0:50 — You clearly see it fail to complete a TRENCH passage and back away.',
    '1:10 — It never approaches the BUMP.',
    'The official scoreboard reports 120 FUEL points for red. It does not identify individual robot contributions.',
  ], expected:{ground_intake:'yes',bump:'did_not_see',trench:'no'}, reasons:{ground_intake:'Use what you saw, regardless of the alliance total.',bump:'There was no observed BUMP attempt.',trench:'The visible attempted passage failed.'} },
]
export const FILM_STEPS = [
  {id:'identity',prompt:'Your assigned upcoming match is QM18, but the clip is from another event, 2026demo_qm7. What match do you record?',options:['QM18 because that is the assignment','2026demo_qm7, identifying the actual footage','Either; the team is the same'],answer:1,why:'Evidence belongs to the match you actually observed. Ask the lead to make a footage assignment for that source match.'},
  {id:'timestamp',prompt:'Choose the most useful review note.',options:['Seems unreliable','At 1:14, 9002 stops near the BUMP for 8 seconds. Cause not visible.','Driver error at 1:14'],answer:1,why:'A timestamp, robot action and explicit uncertainty let someone independently review the claim.'},
  {id:'revision',prompt:'A second camera shows the passage clearly succeeded. What now?',options:['Keep both Yes and No as two trials','Correct your original observation and cite the second view','Delete the video URL'],answer:1,why:'A corrected version supersedes your prior answer while preserving its history; it does not create a second match.'},
]
export const RECOVERY_STEPS = [
  {id:'local',prompt:'Your phone loses network. You finish the observation and tap Save.',options:['Discard it until Wi-Fi returns','Keep it as Saved locally on this device','Label it Delivered'],answer:1,why:'The durable local queue holds the observation; no server or Discord receipt exists yet.'},
  {id:'reload',prompt:'You reload while offline. Where should you find the work?',options:['In the local queue and cached event','Only in Discord','It must be retyped'],answer:0,why:'The queue survives reload. Do not clear browser storage before it synchronizes.'},
  {id:'reconnect',prompt:'Network returns. The first request succeeded, but its response was lost.',options:['Create a new observation with a new save ID','Retry the same saved operation','Erase the queue'],answer:1,why:'Retrying the immutable operation lets the server return its original result without duplicating the logical record.'},
  {id:'conflict',prompt:'A stale correction conflicts with a newer server version.',options:['Silently overwrite the server','Compare both versions, then keep the server or submit a reviewed correction','Turn the failure into a successful receipt'],answer:1,why:'Review is required. The local proposal must remain available until you choose.'},
  {id:'receipt',prompt:'Your note synchronized, but Discord timed out after sending.',options:['Keep the saved note, mark delivery uncertain and check the channel','Send ten copies','Mark the observation unsaved'],answer:0,why:'Data and delivery are independent. An uncertain send may already have arrived.'},
]
export const RANK_STEPS = [
  {id:'denominator',prompt:'Robot A has 2 Yes matches, 1 No, 4 Did Not See responses, 1 N/A, and 1 disputed match. Which reliability label is honest?',options:['2/9 = 22%','2/3 = 67%; exclude and report unknown/disputed evidence','2/2 = 100%'],answer:1,why:'Only undisputed observed outcomes enter the denominator. There are three observed trials; the other evidence stays visible.'},
  {id:'support',prompt:'Robot B has 1 Yes and no No. Robot A has 8 Yes and 2 No. Which statement is justified?',options:['B is definitely more reliable','B is 100% on one observed match, provisional; A is 80% on ten','A has failed more, so hide it'],answer:1,why:'A percentage without its denominator hides how little is known.'},
  {id:'unranked',prompt:'Three submitted lists rank a team in tiers 1, 3, and unranked. What is the Techmen median tier?',options:['Tier 2 from the two ranked votes','Tier 1 because unranked equals zero','Do not pick'],answer:0,why:'Unranked contributes no vote. The median of 1 and 3 is 2; this is the proposed Techmen rule.'},
  {id:'cycle',prompt:'Your pairwise choices are A over B, B over C, and C over A. What should the preview do?',options:['Randomly choose a winner','Keep their existing order because each has one win','Overwrite every scout’s list'],answer:1,why:'Techmen ties preserve the selected teams’ existing order. A cycle does not manufacture a winner.'},
]
export const COMMUNICATION_STEPS = [
  {id:'request',prompt:'Your assigned robot stopped. Choose the request the pit crew can act on.',options:['9004 stopped in QM12 at 0:40. Could someone ask whether repairs changed their plan?','9004 is bad; avoid them','The driver caused it'],answer:0,why:'Name the robot, match, observed behavior and next question. Do not invent the cause.'},
  {id:'reply',prompt:'The pit crew confirms an intake repair. How should you close the loop?',options:['Resolve the message with the factual reply, then update the pit claim separately if needed','Rewrite old match observations to say it never failed','Leave the question open forever'],answer:0,why:'The repair is new information. It does not change what happened in an earlier match.'},
  {id:'privacy',prompt:'Another team gives you a student’s private phone number for follow-up.',options:['Put it in a scouting note for everyone','Use team-approved communication; keep personal contact details out of scouting','Publish it in Discord'],answer:1,why:'Scouting notes should describe robots and competition evidence, not students’ personal information.'},
]
export const ASSESSMENT_STEPS = [
  {id:'honesty',prompt:'You missed a match and your group wants every field filled.',options:['Copy another team’s result as your own','Report the gap and ask for an attributed footage review','Guess from EPA'],answer:1,why:'Coverage gaps are fixable. Invented evidence is not trustworthy.'},
  {id:'handoff',prompt:'What should accompany your mentor assessment?',options:['Only a completion badge','Your source footage, timestamps, corrections, uncertainty and pick-list reasoning','A screenshot of an alliance score'],answer:1,why:'The mentor needs evidence they can independently check, not just a completion count.'},
]
export const DRILLS = { pit:PIT_STEPS, film:FILM_STEPS, recover:RECOVERY_STEPS, rank:RANK_STEPS, communicate:COMMUNICATION_STEPS, assessment:ASSESSMENT_STEPS }
export function gradeChoices(cards, answers = {}) {
  return cards.map(card => ({ id:card.id, correct:answers[card.id] === card.answer, why:card.why }))
}
export function gradeMatch(drill, answers = {}) {
  return Object.entries(drill.expected).map(([key, expected]) => ({ key, expected, correct: answers[key] === expected, why: drill.reasons[key] }))
}
export function drillComplete(missionId, state = {}) {
  if (missionId === 'evidence') return EVIDENCE_CARDS.every(c => state.answers?.[c.id] === c.answer) && state.reviewed === true
  if (missionId === 'observe') return MATCH_DRILLS.every(d => state.matches?.[d.id]?.reviewed === true && gradeMatch(d, state.matches[d.id].answers).every(r => r.correct))
  return (DRILLS[missionId] ?? []).every(c => state.answers?.[c.id] === c.answer) && state.reviewed === true
}
