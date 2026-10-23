// Every route in src/App.jsx, with a concrete URL to open it at under fixture
// mode. Read by the /_fixture control page and by tools/e2e/shoot.mjs.
//
// This is a second list of App.jsx's routes, which CLAUDE.md (working
// convention 7) allows only when the duplicate is gated: tests/
// fixture-routes.test.js parses every `path="..."` out of App.jsx and fails
// if one is missing here, or if one listed here no longer exists there.

import { IDS } from './personas.js'
import { EH } from './features/eventhub.js'

// The student's application parent_token, fixed in seed.js so the public
// parent questionnaire has a working capability URL.
export const PARENT_TOKEN = '41000000-0000-4000-8000-000000000001'

// group: public | member | staff | admin | checkin | dev
// writes: opening the route writes to the store by itself (the NFC paths do).
export const ROUTES = Object.freeze([
  { path: '/', url: '/', group: 'public', label: 'Landing (signed-out) / redirect' },
  { path: '/login', url: '/login', group: 'public', label: 'Login' },
  { path: '/parent/:token', url: `/parent/${PARENT_TOKEN}`, group: 'public', label: 'Parent questionnaire' },
  { path: '/family/:token', url: `/family/${PARENT_TOKEN}`, group: 'public', label: 'Family link' },
  { path: '/rules', url: '/rules', group: 'public', label: 'Handbook, no login' },
  { path: '/e/:token', url: `/e/${EH.tokens.sam}`, group: 'public', label: 'Event family page (Sam, fresh)' },
  { path: '/e', url: '/e', group: 'public', label: 'Event family page: no link (goes to /join)' },
  { path: '/join', url: '/join', group: 'public', label: 'Event open sign-up link' },
  { path: '/join/:eventId', url: `/join/${EH.event}`, group: 'public', label: 'Event open sign-up link (by event)' },
  { path: '/dashboard', url: '/dashboard', group: 'member', label: 'Dashboard' },
  { path: '/schedule', url: '/schedule', group: 'member', label: 'Schedule' },
  { path: '/my-hours', url: '/my-hours', group: 'member', label: 'My Hours' },
  { path: '/log-hours', url: '/log-hours', group: 'member', label: 'Log Hours' },
  { path: '/hours', url: '/hours', group: 'member', label: 'Team Hours' },
  { path: '/skills', url: '/skills', group: 'member', label: 'Skills (retired, redirects to /certifications)' },
  { path: '/jobs', url: '/jobs', group: 'member', label: 'Jobs' },
  { path: '/study', url: '/study', group: 'member', label: 'Study (retired, redirects to /certifications)' },
  { path: '/members/:id', url: `/members/${IDS.student}`, group: 'member', label: 'Member page (Sam)' },
  { path: '/profile', url: '/profile', group: 'member', label: 'My Profile' },
  { path: '/survey', url: '/survey', group: 'member', label: 'Weekly Survey' },
  { path: '/display', url: '/display', group: 'member', label: 'Presence Board' },
  { path: '/certifications', url: '/certifications', group: 'member', label: 'Certifications' },
  { path: '/handbook', url: '/handbook', group: 'member', label: 'Member handbook' },
  { path: '/trips', url: '/trips', group: 'member', label: 'Trips' },
  { path: '/batteries', url: '/batteries', group: 'member', label: 'Batteries' },
  { path: '/robot', url: '/robot', group: 'member', label: 'Robot hub' },
  { path: '/manage', url: '/manage', group: 'staff', label: 'Team admin' },
  { path: '/roles/:eventId', url: '/roles/16000000-0000-4000-8000-000000000001', group: 'member', label: 'Role board (Fixture Regional)' },
  { path: '/autos', url: '/autos', group: 'member', label: 'Autos' },
  { path: '/meet', url: '/meet', group: 'member', label: 'Meet a team' },
  { path: '/meet/:eventId', url: '/meet/35000000-0000-4000-8000-000000000001', group: 'member', label: 'Meet a team (Fixture Blitz)' },
  { path: '/drivers', url: '/drivers', group: 'member', label: 'Drivers' },
  { path: '/human-player', url: '/human-player', group: 'member', label: 'Human player' },
  { path: '/match-sim', url: '/match-sim', group: 'member', label: 'Match simulator' },
  { path: '/updates', url: '/updates', group: 'member', label: "What's new" },
  { path: '/standing', url: '/standing', group: 'member', label: 'My standing' },
  { path: '/scouting', url: '/scouting', group: 'member', label: 'Scouting events' },
  { path: '/scouting/:eventId', url: '/scouting/16000000-0000-4000-8000-000000000001', group: 'member', label: 'Event scouting' },
  { path: '/rosters', url: '/rosters', group: 'member', label: 'Event rosters' },
  { path: '/leaderboard', url: '/leaderboard', group: 'member', label: 'Hours leaderboard' },
  { path: '/status-reports', url: '/status-reports', group: 'member', label: 'Sub-team status' },
  { path: '/driver-docs', url: '/driver-docs', group: 'member', label: 'Driver documents' },
  { path: '/emergency-info', url: '/emergency-info', group: 'staff', label: 'Emergency information' },
  { path: '/no-photo', url: '/no-photo', group: 'staff', label: 'No-photo list' },
  { path: '/rosters/:id', url: '/rosters/20000000-0000-4000-8000-000000000002', group: 'member', label: 'Event roster (all-team meeting)' },
  { path: '/trips/:id', url: `/trips/${EH.event}`, group: 'member', label: 'Trip boards (Fixture Blitz)' },
  { path: '/certify', url: '/certify', group: 'staff', label: 'Certify (retired, redirects to /certifications)' },
  { path: '/coverage', url: '/coverage', group: 'staff', label: 'Coverage (retired, redirects to /certifications)' },
  { path: '/verify-hours', url: '/verify-hours', group: 'staff', label: 'Verify Hours' },
  { path: '/reports', url: '/reports', group: 'staff', label: 'Reports' },
  { path: '/activity', url: '/activity', group: 'staff', label: 'Activity' },
  { path: '/readiness', url: '/readiness', group: 'staff', label: 'Readiness' },
  { path: '/signouts', url: '/signouts', group: 'staff', label: 'Sign-out approvals' },
  { path: '/standing/team', url: '/standing/team', group: 'staff', label: 'Team standing' },
  { path: '/squad', url: '/squad', group: 'staff', label: 'Squad' },
  { path: '/access-requests', url: '/access-requests', group: 'staff', label: 'Access Requests' },
  { path: '/applications', url: '/applications', group: 'staff', label: 'Applications' },
  { path: '/surveys', url: '/surveys', group: 'staff', label: 'Surveys (admin)' },
  { path: '/trips/:id/manage', url: `/trips/${EH.event}/manage`, group: 'staff', label: 'Trip mentor page' },
  { path: '/roster', url: '/roster', group: 'admin', label: 'Roster' },
  { path: '/feedback', url: '/feedback', group: 'admin', label: 'Feedback inbox' },
  { path: '/announce', url: '/announce', group: 'admin', label: 'Discord announce' },
  { path: '/connector/*', url: '/connector', group: 'admin', label: 'Claude connector' },
  { path: '/checkin', url: '/checkin?loc=shop-main', group: 'checkin', label: 'NFC check-in (shop)', writes: true },
  { path: '/checkin-volunteer', url: '/checkin-volunteer?loc=fll-room', group: 'checkin', label: 'NFC volunteer check-in', writes: true },
  { path: '/_ds', url: '/_ds', group: 'dev', label: 'Design-system specimen' },
  { path: '/_fixture', url: '/_fixture', group: 'dev', label: 'Fixture controls' },
])
