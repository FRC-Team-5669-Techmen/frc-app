import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

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
        ? 'Post jobs and sign off finished work in the verification queue. Some jobs require a certification to claim.'
        : 'Claim team jobs here. Some require a certification before you can claim them.',
    },
  }
  const skills = {
    element: '[data-tour="nav-skills"]',
    popover: {
      title: 'Skills',
      description: 'Browse the skills ladder and track the certifications you have earned.',
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
      title: 'Your profile',
      description: 'Update your subteams and details, replay this tour, or sign out from here.',
    },
  }

  // Staff-only surfaces
  const activity = {
    element: '[data-tour="nav-activity"]',
    popover: {
      title: 'Activity feed',
      description: 'See who is checked in live, and manually check members in or out when needed.',
    },
  }
  const readiness = {
    element: '[data-tour="nav-readiness"]',
    popover: {
      title: 'Readiness',
      description: 'One glance at attendance, cert coverage, staffing, and what is waiting on you.',
    },
  }
  const manage = {
    element: '[data-tour="nav-manage"]',
    popover: {
      title: 'Manage',
      description: 'Verify hours, certify skills, check coverage, and approve new roster members.',
    },
  }

  return isStaff
    ? [welcome, checkin, checkout, hours, jobs, skills, study, activity, readiness, manage, profile]
    : [welcome, checkin, checkout, hours, jobs, skills, study, profile]
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
    overlayOpacity: 0.6,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps,
    onDestroyed: finish,
  })

  d.drive()
}
