// Compatibility entry for old imports. Training now lives on /training.
// Dismissal never invokes an onboarding or completion callback.
export function startTour() {
  window.location.assign('/training')
}
