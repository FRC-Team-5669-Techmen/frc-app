import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'

// Role-split onboarding tour. Anchored entirely on the dashboard: it spotlights
// the persistent NavBar items and a few dashboard elements by stable data-tour
// attributes, so it never has to navigate across routes mid-tour.

function tourSteps(isStaff) {
  const welcome = {
    popover: {
      title: 'Welcome to Techmen',
      description: 'A quick tour of the team platform. You can replay it anytime from your avatar menu.',
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
  const hours = {
    element: '[data-tour="nav-hours"]',
    popover: {
      title: 'Hours',
      description: 'See your hours, the team board, and log outside hours like outreach or competition.',
    },
  }
  const jobs = {
    element: '[data-tour="nav-jobs"]',
    popover: {
      title: 'Jobs',
      description: isStaff
        ? 'Post jobs and sign off finished work per claimant. Jobs can be solo or a group with a capacity, and some require a certification to claim.'
        : 'Claim team jobs here — solo or group. Some require a certification first; submit your work when done for mentor sign-off.',
    },
  }
  const skills = {
    element: '[data-tour="nav-skills"]',
    popover: {
      title: 'Skills',
      description: 'The skills ladder, grouped into collapsible categories — tap a section header to expand it and see the skills inside.',
    },
  }
  const study = {
    element: '[data-tour="nav-study"]',
    popover: {
      title: 'Self-study',
      description: 'Log study minutes and keep your daily streak going.',
    },
  }
  const profile = {
    element: '[data-tour="nav-profile"]',
    popover: {
      title: isStaff ? 'Profile & staff tools' : 'Your profile',
      description: isStaff
        ? 'Edit your details and notification settings, replay this tour, or sign out. Your staff tools — readiness, activity, squad, roster, access requests, verify hours, certify, and coverage — all live in this menu.'
        : 'Edit your details, choose which notifications you get, replay this tour, or sign out — all from here.',
    },
  }

  return [welcome, checkin, checkout, schedule, hours, jobs, skills, study, profile]
}

// Starts the tour for the given track. Steps whose target is not in the DOM for
// this user/role are dropped so a missing element never breaks the run.
// onDone (optional) fires once when the tour finishes or is skipped.
export function startTour(isStaff, onDone) {
  const steps = tourSteps(isStaff).filter(s => !s.element || document.querySelector(s.element))

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
