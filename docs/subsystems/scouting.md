# Event scouting

Scouting is an additive, lazy-loaded part of Techmen at `/scouting` and `/scouting/:eventId`. Records reference existing `events` and member profiles. No check-in import is added. The existing protected shell supplies feedback.

## Data contract

See [contract](../scouting/CONTRACT.md), [evidence](../scouting/EVIDENCE.md) and [verification](../scouting/VERIFICATION.md). Claim, observation, assignment, message, personal list and external team data are separate record kinds. Every correction stores a new version, preserving the prior value and actor. Missing answers are never zeros. Individual FUEL contribution is never inferred from an official alliance total.

All writes call `scouting_save` through `writeVia`; new scouting has no legacy direct-write fallback. Operation IDs deduplicate retries. Optimistic version checks reject stale corrections rather than silently overwriting another tab. The connector calls the same SQL operation and adds its own audit trail.

## Access

Approved active students and staff may scout. Parent-only accounts cannot access scouting, including through capability grants; a parent holding mentor, lead or admin is staff. Managers are staff, event scouting leads or holders of `scouting.manage`. Individual observations and pick lists remain author-owned. Shared pit and assignment changes have explicit manager gates.

## Offline behavior

Open the app and event while online before entering the venue. Cached event records and IndexedDB drafts/operations are scoped to the signed-in member and event. Local capture is not server synchronization. Synchronization is not Discord delivery. Pending proposals survive reload; conflicts require an explicit reviewed correction. A revoked account cannot continue uploading, and changing accounts never uploads the previous account's queue. External footage is not downloaded for offline use.

## Setup and verification

Apply migration 0022 only after the existing chain through 0021. Until its schema is installed, the page shows a setup state through `schemaMissing`. Edge integrations deploy separately by hand. No database or production deployment was performed by this branch.

Training prepares students for mentor assessment; it does not write IDEA certification rows or revive the retired skills system. Certification remains an IDEA Classroom action.

## Planning, replies and practice

Managers can paste a match schedule or accept the imported schedule, choose a match range and available scouts, mark breaks, preview workload/coverage, and save the shift. Existing work is kept and uncovered robots are visible. Local batch enqueue is atomic; server authorization/conflicts remain per record. `scouting_roster` provides only eligible names and is event-manager gated.

Pit conversations support separately attributed replies with immutable original-thread links. Comparison voting has side-by-side evidence cards. Pit addresses display their source, time and freshness warning. Training now saves incomplete decisions, active mission, simulation answers and real-footage worksheets as drafts; completion does not award certification.

The standalone review is built by `npm run scouting:preview` from the same route and fixture backend. `npm run scouting:preview:check` checks the compiled bundle under DOM emulation. Neither is a deployment or substitute for native browser/phone checks.

## Recovery and evidence quality

`Export event data` now includes account/event-scoped drafts, practice, pending operations, confirmed receipts and cached evidence in a versioned JSON archive. The archive is for reviewed recovery; it never automatically uploads or overwrites existing work. Offline event opening skips remote data queries. Team imports are atomic locally.

Prior-event footage must retain its source event and full match key, appears with a provenance label and stays outside current-event reliability percentages. Full TBA and short current-event match labels share one logical identity. The coverage panel in Teams finds missing pit reports, thin or disputed evidence and prior-event context.
