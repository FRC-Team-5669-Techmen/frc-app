// Fixture: the event hub roster and names (supabase/migrations/0010_event_hub_roster_names.sql).
// Contract: src/dev/fixture/README.md. 0010 adds no table and no RPC a page
// calls by a new name; it changes who the hub lists and how it names them.
// That rule is ported in features/eventhub.js (rosterStudent, studentName),
// gated on engine.applied('0010'). The SQL is the rule, proven by
// 0010_event_hub_roster_names_rls_test.sql on tools/sql-harness/.
//
// This file seeds the two people the rule is about, besides Robin Park (a
// student who also holds lead, in the core seed):
//   Jesse Vega   a student whose PROFILE name is a sign-in email and whose
//                nickname is a joke title; the application has the real name
//   Drew Nakamura  a student who also holds mentor, with an application: never
//                on the roster, before or after 0010
const JESSE = '00000000-0000-0000-0000-0000000000cd'
const DREW = '00000000-0000-0000-0000-0000000000ce'

const laToday = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

function application(id, first, last, season, now) {
  return {
    member_id: id, season_id: season, submitted_at: new Date(now.getTime() - 20 * 86400_000).toISOString(),
    legal_first_name: first, legal_last_name: last,
    student_phone: '5555550100', pathway: 'MSET', returning_member: false,
    seasons_on_team: 1, prior_robotics: [], programming_languages: [], cad_tools: [], hands_on_experience: [], certifications_claimed: null,
    subteam_first: 'Electrical', subteam_second: 'Mechanical', subteam_third: null,
    subteam_rationale: 'I want to learn how the robot is wired.',
    monday_lunch: 'Yes', tuesday_after_school: 'Yes', friday_after_school: 'Sometimes', transport_after_5pm: 'Parent pickup',
    seasonal_conflicts: [], conflict_detail: null, fll_volunteering_interest: null, build_season_acknowledged: true,
    parent_name: 'Fixture Parent', parent_email: `${first.toLowerCase()}.family@example.com`, parent_phone: '5555550199',
    parent_two_name: null, parent_two_contact: null, dietary_restrictions: null,
    emergency_contact_name: 'Fixture Guardian', emergency_contact_phone: '5555550188',
    discord_username: `${first.toLowerCase()}_5669`, discord_server_confirmed: false, conduct_acknowledged: true,
  }
}

export const ROSTER_FIXTURE = Object.freeze({ JESSE, DREW })

export default {
  migration: '0010',
  creates: {},
  seed: ({ ids, now }) => {
    const season = laToday(now) >= '2027-01-07' ? ids.seasonBiocore : ids.seasonOff2026
    const created = new Date(now.getTime() - 120 * 86400_000).toISOString()
    const profile = (id, full_name, nickname, grad_year) => ({
      id, full_name, nickname, bio: null, approved: true, created_at: created, grad_year, status: 'active',
      shirt_size: null, subteams: ['Electrical'], disciplines: [], onboarded_at: created, geofence_exempt: false,
    })
    return {
      profiles: [
        profile(JESSE, 'jvega.2029@boscotech.edu', 'Supreme Leader', 2029),
        profile(DREW, 'Drew Nakamura', 'Drew', 2027),
      ],
      member_roles: [
        { member_id: JESSE, role: 'student' },
        { member_id: DREW, role: 'student' },
        { member_id: DREW, role: 'mentor' },
      ],
      member_applications: [
        application(JESSE, 'Jesse', 'Vega', season, now),
        application(DREW, 'Drew', 'Nakamura', season, now),
      ],
    }
  },
}
