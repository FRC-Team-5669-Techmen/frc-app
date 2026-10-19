// The handbook as a training path: 18 lessons over sections 1 to 22, each
// ending in two real-life questions. Pure data. Every question carries the
// exact words of the rule it checks (quote); tests/handbook.test.js fails if
// a quote is not in that lesson's sections, so a text change that moves a
// rule cannot leave a question teaching the old one.

// The handbook version members sign. Matches the "Version" line of
// handbook.md (October 20, 2026), held by the test.
export const HANDBOOK_VERSION = '2026-10-20'

export const LESSONS = [
  {
    id: 'start', sections: [1, 2, 3], title: 'Start here',
    rule: 'This handbook is the rulebook. Finish your first-two-weeks checklist on time.',
    questions: [
      { q: 'A senior tells you a team rule that is different from this handbook. Which do you follow?',
        o: ['The senior, because they have more experience', 'The handbook', 'Whichever is easier that day'], a: 1,
        quote: 'If someone tells you something different, follow the handbook.' },
      { q: 'You joined two weeks ago and still have not registered with FIRST or signed the signature page. What happens?',
        o: ['Nothing, there is no deadline', 'You get one more month', 'Your acceptance is withdrawn'], a: 2,
        quote: 'Steps 3 to 8 are due by two weeks after you join. Miss it and the acceptance is withdrawn.' },
    ],
  },
  {
    id: 'week', sections: [4, 5], title: 'Your week and key dates',
    rule: 'Two required meetings a week. Only an emergency excuses a mandatory event.',
    questions: [
      { q: 'You have soccer practice on a meeting day. Does it excuse the team meeting?',
        o: ['Yes, sports come first', 'No, other activities never excuse a team meeting', 'Yes, if you tell your lead'], a: 1,
        quote: 'Other activities never excuse a team meeting.' },
      { q: 'A family party falls on Kickoff and you skip Kickoff for it. What happens?',
        o: ['Nothing, Kickoff is optional', 'It counts as one late', 'You cannot be on the drive team or pit crew that season'], a: 2,
        quote: 'Miss it without an emergency and you cannot be on the drive team or pit crew that season.' },
    ],
  },
  {
    id: 'attendance', sections: [6], title: 'Attendance and absences',
    rule: 'Scan in during the first 15 minutes. Three lates make one absence.',
    questions: [
      { q: 'You scan the tag 20 minutes after the meeting starts. How is it logged?',
        o: ['Present', 'Late', 'Excused'], a: 1,
        quote: 'After that you are late. No scan is an absence.' },
      { q: 'You were late three times this month. What does that count as?',
        o: ['Nothing, lates never count', 'One absence', 'Probation'], a: 1,
        quote: 'Three lates in a calendar month count as one absence' },
    ],
  },
  {
    id: 'hours', sections: [7], title: 'Hours and sessions',
    rule: 'Sign in, work on a task, leave a note and wait for approval to sign out.',
    questions: [
      { q: 'It is build season and you logged 6 hours this week. Did you meet the hours standard?',
        o: ['Yes, 2 hours a week is the minimum', 'No, build season needs 10 hours every week', 'Yes, if you made both meetings'], a: 1,
        quote: '2 hours of signed-in work every week, 10 in build season.' },
      { q: 'Your ride is here and no mentor is free, so you leave without approval. What happens?',
        o: ['You keep the meeting credit but lose that session\'s hours', 'The whole session counts', 'You lose the meeting credit too'], a: 0,
        quote: 'you keep the meeting credit but lose that session\'s hours' },
    ],
  },
  {
    id: 'safety', sections: [8], title: 'Shop safety',
    rule: 'Glasses on, dressed for the shop. Report every injury and near miss.',
    questions: [
      { q: 'You are not using a tool, but a teammate 3 feet away is drilling. Do you need safety glasses?',
        o: ['No, only the person using the tool', 'Yes, anyone within 5 feet of a tool in use wears them', 'Only in the machine area'], a: 1,
        quote: 'Safety glasses when you use a tool, or anyone within 5 feet of you does.' },
      { q: 'You nearly cut yourself, but you are not hurt. What do you do?',
        o: ['Nothing, nobody was hurt', 'Mention it at the next meeting', 'Report the near miss to a mentor at once'], a: 2,
        quote: 'Report at once every injury, near miss, damaged tool or battery problem to a mentor.' },
    ],
  },
  {
    id: 'medical', sections: [9], title: 'Medical and emergencies',
    rule: 'Make it safe, get the nearest adult, log it the same day.',
    questions: [
      { q: 'A teammate is badly hurt. What does the adult do first?',
        o: ['Calls the parent', 'Calls 911, then gives first aid', 'Logs it in the app'], a: 1,
        quote: 'For a serious injury, the adult calls 911 first, then gives first aid.' },
      { q: 'You use an inhaler. What does the handbook ask?',
        o: ['Leave it at home', 'Give it to a teammate to hold', 'Carry your own and tell your lead where it is'], a: 2,
        quote: 'Carry your own inhaler or epinephrine, and tell your lead where it is.' },
    ],
  },
  {
    id: 'training', sections: [10], title: 'Training and certifications',
    rule: 'Run a machine alone only with its IDEA certification.',
    questions: [
      { q: 'A teammate shows you how to use a machine once. Can you now run it alone?',
        o: ['Yes, you have been shown', 'No, only with its IDEA certification', 'Yes, if that teammate is certified'], a: 1,
        quote: 'Run a machine alone only if you hold its IDEA certification.' },
      { q: 'Your sub-team training is not done by Kickoff. What happens?',
        o: ['You are removed', 'You get a two-week extension', 'Nothing until the next season'], a: 0,
        quote: 'It is due before Kickoff. Miss it and you are removed.' },
    ],
  },
  {
    id: 'standing', sections: [11], title: 'Standing, probation and removal',
    rule: 'Miss a standard and you are on probation. Miss again and you are removed.',
    questions: [
      { q: 'You are on hours probation. Do you go to the next competition?',
        o: ['No, probation means no events', 'Yes, you attend and work, but not on the drive team or pit crew', 'Only if a parent comes'], a: 1,
        quote: 'Attend and work, competitions included. No drive team, pit crew or speaking for the team' },
      { q: 'On meetings probation, you miss one more meeting without an excuse. What happens?',
        o: ['Probation is extended', 'A verbal warning', 'You are removed'], a: 2,
        quote: 'One unexcused miss or one short week and you are removed.' },
    ],
  },
  {
    id: 'grades', sections: [12], title: 'Grades and school',
    rule: 'Keep a 2.0 GPA at every grade check. School comes first.',
    questions: [
      { q: 'You missed school today with a fever, but you feel better by the afternoon. Can you come to the meeting?',
        o: ['No, absent from school means no team activity that day', 'Yes, if you feel better', 'Yes, for the first 15 minutes'], a: 0,
        quote: 'Absent from school that day? No team activity that day.' },
      { q: 'You will miss class for a competition. When do you tell your teachers?',
        o: ['The morning of the event', 'A week ahead, and make up the work', 'When you get back'], a: 1,
        quote: 'Tell your teachers a week ahead and make up the work.' },
    ],
  },
  {
    id: 'roles', sections: [13], title: 'Sub-teams, roles and leadership',
    rule: 'Responsibility is earned. No title guarantees a spot.',
    questions: [
      { q: 'Halfway through your first season you want to move to another sub-team. Can you?',
        o: ['Yes, any time', 'Yes, with a team leader\'s OK', 'No, there is no switching in your first season'], a: 2,
        quote: 'No switching in your first season.' },
      { q: 'You are a sub-team lead. Does that title guarantee you a drive team seat?',
        o: ['No, no title guarantees one', 'Yes, leads drive', 'Only at the home event'], a: 0,
        quote: 'No title guarantees a pit crew spot, a drive team seat or an award role.' },
    ],
  },
  {
    id: 'conduct', sections: [14], title: 'Conduct, discipline and reporting',
    rule: 'Respect everyone. You never get in trouble for reporting.',
    questions: [
      { q: 'An adult volunteer asks you to keep a conversation secret and to message them on another app. What do you do?',
        o: ['Keep it private, it is probably harmless', 'Tell a trusted adult right away', 'Wait to see if it happens again'], a: 1,
        quote: 'Tell a trusted adult right away if any adult:' },
      { q: 'You got a written warning and think it was unfair. What can you do?',
        o: ['Ask a team leader to delete it', 'Nothing, warnings cannot be questioned', 'Appeal it to Mr. Pina within 5 school days'], a: 2,
        quote: 'Appeal a written warning to Mr. Pina within 5 school days.' },
    ],
  },
  {
    id: 'comms', sections: [15], title: 'Communication',
    rule: 'The FRC app is the record. Missing a message is never an excuse.',
    questions: [
      { q: 'You missed a Discord message about a deadline, so you missed the deadline. Is that an excuse?',
        o: ['Yes, if you were offline', 'Yes, once a season', 'No, missing a message is never an excuse'], a: 2,
        quote: 'Missing a message is never an excuse for missing a deadline.' },
      { q: 'A mentor sends a message that is not urgent. How soon do you answer?',
        o: ['Within 48 hours', 'Within a week', 'Only if the answer is yes'], a: 0,
        quote: 'Answer the same day if it is urgent, and within 48 hours otherwise.' },
    ],
  },
  {
    id: 'events', sections: [16], title: 'Competitions and travel',
    rule: 'Every member attends every competition, every day. Roles are earned.',
    questions: [
      { q: 'Your family has not done the sign-up for a mandatory event. A mentor reminded you 48 hours ago. What is it now?',
        o: ['Still optional', 'An unexcused absence', 'An excused absence'], a: 1,
        quote: 'Still missing 48 hours later? It is an unexcused absence.' },
      { q: 'Your family wants to swap carpool seats 8 hours before leaving. Can they?',
        o: ['Yes, in the app', 'Yes, with any parent\'s OK', 'No, nothing changes in the last 12 hours'], a: 2,
        quote: 'nothing changes in the last 12 hours' },
    ],
  },
  {
    id: 'media', sections: [17], title: 'Confidentiality and media',
    rule: 'Keep our designs and plans inside the team. A mentor approves anything said for us.',
    questions: [
      { q: 'Two weeks after Kickoff, before our first event, you want to post a robot photo on your own account. Can you?',
        o: ['Yes, it is your account', 'No, nothing about this season\'s robot leaves the team yet', 'Yes, if you blur it'], a: 1,
        quote: 'From Kickoff to our first event, nothing about this season\'s robot or strategy leaves the team.' },
      { q: 'A reporter at an event asks you for an interview about the team. What do you do?',
        o: ['Get a mentor\'s OK first', 'Answer, you know the team', 'Send them to a team leader'], a: 0,
        quote: 'Nobody speaks for the team without a mentor\'s OK' },
    ],
  },
  {
    id: 'letters', sections: [18], title: 'Recognition and varsity letters',
    rule: 'A letter takes a full clean season, not just hours.',
    questions: [
      { q: 'You logged the most hours on the team, but you got a written warning for conduct. Can you letter?',
        o: ['Yes, hours are what count', 'No, a letter allows no written warning for conduct', 'Yes, if your lead signs off'], a: 1,
        quote: 'At most one safety violation, and no written warning for conduct' },
      { q: 'You were on hours probation once in the fall, then met every standard. Can you letter this season?',
        o: ['No, a letter needs no probation for meetings or hours', 'Yes, you recovered', 'Yes, with extra volunteer hours'], a: 0,
        quote: 'with no probation for meetings or hours' },
    ],
  },
  {
    id: 'families', sections: [19], title: 'Parents and families',
    rule: 'One family answer, on time. Helping never buys a spot.',
    questions: [
      { q: 'A parent drives every carpool and donates to the team. Does that help their student get picked?',
        o: ['Yes, it counts as contribution', 'No, it never helps or hurts selection', 'Only for away events'], a: 1,
        quote: 'Driving, donating or mentoring never helps or hurts a student\'s selection.' },
      { q: 'A parent has a concern about how roles were chosen. What comes first?',
        o: ['Post it in the parent GroupMe', 'The student raises it with a leader or mentor', 'Wait until the season ends'], a: 1,
        quote: 'Let your student raise it with a leader or mentor first.' },
    ],
  },
  {
    id: 'adults', sections: [20], title: 'Adults on the team',
    rule: 'No adult is ever alone with one student, in person or in a message.',
    questions: [
      { q: 'A mentor sends you a direct message, just the two of you. What does the handbook say?',
        o: ['Fine if it is about robotics', 'Fine during build season', 'An adult never messages one student privately'], a: 2,
        quote: 'an adult never messages one student privately' },
      { q: 'You and one friend are the last students waiting, and your ride is late. What happens?',
        o: ['Your friend waits with you as your buddy', 'You wait alone with the mentor', 'You wait outside alone'], a: 0,
        quote: 'A student whose ride is late waits with a buddy.' },
    ],
  },
  {
    id: 'joining', sections: [21, 22], title: 'Joining and how this handbook works',
    rule: 'Everyone reapplies each May. Deadlines and standards are never judgment calls.',
    questions: [
      { q: 'You worked on the robot in IDEA class but never joined the team. Can you travel to an event?',
        o: ['Yes, class counts', 'Yes, with 10 hours a week', 'No, class participants are not on the roster and do not travel'], a: 2,
        quote: 'Class participants are not on the roster, do not travel and do not earn letters.' },
      { q: 'Can a mentor give you an extra week on the hours standard as a judgment call?',
        o: ['No, the three standards are never judgment calls', 'Yes, mentors can always decide', 'Only in build season'], a: 0,
        quote: 'Deadlines and the three standards are never judgment calls.' },
    ],
  },
]

// Glossary words to underline in the text, tap to define. Each entry names
// the glossary term and the spellings that point at it. Acronyms match by
// case; other words match any case. Only the first use in a lesson is marked.
export const TERM_MATCHES = [
  ['Armory', ['Armory']],
  ['Build season', ['build season']],
  ['Bumpers', ['bumpers']],
  ['CAD', ['CAD']],
  ['Chaperone', ['chaperones', 'chaperone']],
  ['Chief Delphi', ['Chief Delphi']],
  ['District event', ['district event']],
  ['Drive team', ['drive team']],
  ['FACTS', ['FACTS']],
  ['FIRST', ['FIRST']],
  ['FLL', ['FLL']],
  ['FRC', ['FRC']],
  ['GitHub', ['GitHub']],
  ['GPA', ['GPA']],
  ['Gracious Professionalism', ['Gracious Professionalism']],
  ['Impact Award', ['Impact']],
  ['Kickoff', ['Kickoff']],
  ['Live Scan', ['Live Scan']],
  ['Mandated reporter', ['mandated reporters', 'mandated reporter']],
  ['NFC tag', ['NFC tags', 'NFC tag']],
  ['Off-season', ['off-season']],
  ['Pit, pit crew', ['pit crew']],
  ['Probation', ['probation']],
  ['Progress report', ['progress report']],
  ['RESP-1', ['RESP-1']],
  ['Roster', ['roster']],
  ['Rule of Three', ['Rule of Three']],
  ['SAFE-1', ['SAFE-1']],
  ['Scouting', ['scouting']],
  ['Sponsor', ['sponsors', 'sponsor']],
  ['Station', ['station']],
  ['Sub-team lead', ['sub-team lead']],
  ['Sub-team', ['sub-teams', 'sub-team']],
  ['Varsity letter', ['varsity letter']],
  ['Voided', ['voided']],
]
