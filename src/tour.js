import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'

// Role-split onboarding tour. Anchored entirely on the dashboard: it spotlights
// the persistent NavBar items and a few dashboard elements by stable data-tour
// attributes, so it never has to navigate across routes mid-tour.

function tourSteps(isStaff, isParent) {
  const welcome = {
    popover: {
      title: 'Welcome to Techmen',
      description: 'A quick tour of the team platform. The top tabs are now icon-labeled for quick scanning. You can replay this anytime from your avatar menu.',
    },
  }
  const checkin = {
    element: '[data-tour="status-card"]',
    popover: {
      title: 'Checking in',
      description: 'Tap your NFC tag at the door to check in. Your live status and hours show here.',
    },
  }
  const checkout = {
    element: '[data-tour="checkout"]',
    popover: {
      title: 'Checking out',
      description: 'When you leave, tap your tag again or use this Check Out button.',
    },
  }
  const schedule = {
    element: '[data-tour="nav-schedule"]',
    popover: {
      title: 'Schedule',
      description: isStaff
        ? 'The team agenda — build nights, meetings, competitions. RSVP-enabled events show a signup list, and you can add one event across many days at once with "Repeat on multiple days."'
        : 'See what\'s happening — build nights, meetings, and competitions — and RSVP to events that need it.',
    },
  }
  // Jobs now sits before Hours in the tab bar.
  const jobs = {
    element: '[data-tour="nav-jobs"]',
    popover: {
      title: 'Jobs',
      description: isStaff
        ? 'Post jobs and sign off finished work per claimant. Click a job to open its detail view — reference links, images, a progress-update thread, and time logged per member. Admins can undo an approval there too.'
        : 'Claim team jobs — solo or group. Open a job to post progress updates, and tap "I\'m on this job" while checked in to log your time to it. Submit when done for mentor sign-off.',
    },
  }
  const hours = {
    element: '[data-tour="nav-hours"]',
    popover: {
      title: 'Hours',
      description: isStaff
        ? 'Your hours, the team board (toggle a by-day breakdown; admins can export the full history to CSV), and logging outside hours like outreach.'
        : 'Your hours, the team board with a per-day breakdown, and logging outside hours like outreach or competition.',
    },
  }
  const skills = {
    element: '[data-tour="nav-skills"]',
    popover: {
      title: 'Skills',
      description: isStaff
        ? 'Manage the skills catalog and disciplines, in collapsible categories. Certify members from the Certify tool, and check team gaps on Skill Coverage — both in your avatar menu.'
        : 'Your certifications and in-progress skills. Request a cert sign-off when you\'re ready, and toggle to the team coverage matrix to see where the team stands.',
    },
  }
  // Parent-only: present only on the parent dashboard, so it self-filters for
  // everyone else.
  const parentLink = {
    element: '[data-tour="parent-link"]',
    popover: {
      title: 'Link your student',
      description: 'Search for your student and send a link request. A mentor approves it, then their live status, hours, and certs appear here.',
    },
  }
  const profile = {
    element: '[data-tour="nav-profile"]',
    popover: {
      title: isStaff ? 'Profile, study & staff tools' : 'Profile & menu',
      description: isStaff
        ? 'Edit your details and notifications, open Self-study, replay this tour, or sign out. Your staff tools — readiness, activity, squad, roster (with search & sort), access + parent-link requests, verify hours, certify, and coverage — all live in this menu.'
        : isParent
          ? 'Edit your details and notification settings, replay this tour, or sign out — all from here.'
          : 'Edit your details and notifications, open Self-study (moved here from the tab bar), replay this tour, or sign out — all from here.',
    },
  }

  return [welcome, checkin, checkout, schedule, jobs, hours, skills, parentLink, profile]
}

// Starts the tour for the given track. Steps whose target is not in the DOM for
// this user/role are dropped so a missing element never breaks the run.
// onDone (optional) fires once when the tour finishes or is skipped.
export function startTour(isStaff, onDone, isParent = false) {
  const steps = tourSteps(isStaff, isParent).filter(s => !s.element || document.querySelector(s.element))

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    if (onDone) onDone()
  }

  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayColor: '#0A0B0D',
    overlayOpacity: 0.7,
    popoverClass: 'techmen-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps,
    onDestroyed: finish,
  })

  d.drive()
}
