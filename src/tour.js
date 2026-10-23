import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'

import { tourSteps } from './tourSteps'

// Starts the tour for the given track. Steps whose target is not in the DOM for
// this user/role are dropped so a missing element never breaks the run.
// onDone (optional) fires once when the tour finishes or is skipped.
export function startTour(isStaff, onDone, isParent = false, isAdmin = false) {
  const steps = tourSteps(isStaff, isParent, { isAdmin, present: (sel) => !!document.querySelector(sel) })

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
