// Every route in src/App.jsx, with a concrete URL to open it at under fixture
// mode. Read by the /_fixture control page and by tools/e2e/shoot.mjs.
//
// This is a second list of App.jsx's routes, which CLAUDE.md (working
// convention 7) allows only when the duplicate is gated: tests/
// fixture-routes.test.js parses every `path="..."` out of App.jsx and fails
// if one is missing here, or if one listed here no longer exists there.

import { IDS } from './personas.js'

// The student's application parent_token, fixed in seed.js so the public
// parent questionnaire has a working capability URL.
export const PARENT_TOKEN = '41000000-0000-4000-8000-000000000001'

// group: public | member | staff | admin | checkin | dev
// writes: opening the route writes to the store by itself (the NFC paths do).
export const ROUTES = Object.freeze([
  { path: '/', url: '/', group: 'public', label: 'Landing (signed-out) / redirect' },
  { path: '/login', url: '/login', group: 'public', label: 'Login' },
  { path: '/parent/:token', url: `/parent/${PARENT_TOKEN}`, group: 'public', label: 'Parent questionnaire' },
  { path: '/dashboard', url: '/dashboard', group: 'member', label: 'Dashboard' },
  { path: '/schedule', url: '/schedule', group: 'member', label: 'Schedule' },
  { path: '/my-hours', url: '/my-hours', group: 'member', label: 'My Hours' },
  { path: '/log-hours', url: '/log-hours', group: 'member', label: 'Log Hours' },
  { path: '/hours', url: '/hours', group: 'member', label: 'Team Hours' },
  { path: '/skills', url: '/skills', group: 'member', label: 'Skills' },
  { path: '/jobs', url: '/jobs', group: 'member', label: 'Jobs' },
  { path: '/study', url: '/study', group: 'member', label: 'Study' },
  { path: '/members/:id', url: `/members/${IDS.student}`, group: 'member', label: 'Member page (Sam)' },
  { path: '/profile', url: '/profile', group: 'member', label: 'My Profile' },
  { path: '/survey', url: '/survey', group: 'member', label: 'Weekly Survey' },
  { path: '/display', url: '/display', group: 'member', label: 'Presence Board' },
  { path: '/certifications', url: '/certifications', group: 'member', label: 'Certifications' },
  { path: '/certify', url: '/certify', group: 'staff', label: 'Certify' },
  { path: '/coverage', url: '/coverage', group: 'staff', label: 'Coverage' },
  { path: '/verify-hours', url: '/verify-hours', group: 'staff', label: 'Verify Hours' },
  { path: '/reports', url: '/reports', group: 'staff', label: 'Reports' },
  { path: '/activity', url: '/activity', group: 'staff', label: 'Activity' },
  { path: '/readiness', url: '/readiness', group: 'staff', label: 'Readiness' },
  { path: '/squad', url: '/squad', group: 'staff', label: 'Squad' },
  { path: '/access-requests', url: '/access-requests', group: 'staff', label: 'Access Requests' },
  { path: '/applications', url: '/applications', group: 'staff', label: 'Applications' },
  { path: '/surveys', url: '/surveys', group: 'staff', label: 'Surveys (admin)' },
  { path: '/roster', url: '/roster', group: 'admin', label: 'Roster' },
  { path: '/feedback', url: '/feedback', group: 'admin', label: 'Feedback inbox' },
  { path: '/announce', url: '/announce', group: 'admin', label: 'Discord announce' },
  { path: '/checkin', url: '/checkin?loc=shop-main', group: 'checkin', label: 'NFC check-in (shop)', writes: true },
  { path: '/checkin-volunteer', url: '/checkin-volunteer?loc=fll-room', group: 'checkin', label: 'NFC volunteer check-in', writes: true },
  { path: '/_ds', url: '/_ds', group: 'dev', label: 'Design-system specimen' },
  { path: '/_fixture', url: '/_fixture', group: 'dev', label: 'Fixture controls' },
])
