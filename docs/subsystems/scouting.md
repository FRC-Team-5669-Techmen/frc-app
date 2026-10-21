# Event scouting

Scouting is an additive, lazy-loaded part of Techmen at `/scouting` and `/scouting/:eventId`. Records reference existing `events` and member profiles. No check-in import is added. The existing protected shell supplies feedback.

## Data contract

See [contract](../scouting/CONTRACT.md), [evidence](../scouting/EVIDENCE.md) and [verification](../scouting/VERIFICATION.md). Claim, observation, assignment, message, personal list and external team data are separate record kinds. Every correction stores a new version, preserving the prior value and actor. Missing answers are never zeros. Individual FUEL contribution is never inferred from an official alliance total.

All writes call `scouting_save` through `writeVia`; new scouting has no legacy direct-write fallback. Operation IDs deduplicate retries. Optimistic version checks reject stale corrections rather than silently overwriting another tab. The connector calls the same SQL operation and adds its own audit trail.

Domain conflicts use SQLSTATE `PT409` (HTTP 409). Application-raised `40001` loops on hosted PostgREST 14, so it is no longer emitted for stale/missing/duplicate scouting records. The client recognizes both codes and holds either proposal for explicit review. Synchronization publishes the durable queue with refreshed evidence, so a new conflict cannot open review against the previous server value. `docs/scouting/HOSTED_HTTP.md` documents the real hosted Auth/REST/Edge harness and its isolated fictional identities; OTP/OAuth, successful providers and real delivery remain separate acceptance work.

## Access

Approved active students and staff may scout. Parent-only accounts cannot access scouting, including through capability grants; a parent holding mentor, lead or admin is staff. Managers are staff, event scouting leads or holders of `scouting.manage`. Individual observations and pick lists remain author-owned. Shared pit and assignment changes have explicit manager gates.

## Offline behavior

Open the app and event while online before entering the venue. Cached event records and IndexedDB drafts/operations are scoped to the signed-in member and event. Local capture is not server synchronization. Synchronization is not Discord delivery. Pending proposals survive reload; conflicts require an explicit reviewed correction. A revoked account cannot continue uploading, and changing accounts never uploads the previous account's queue. External footage is not downloaded for offline use.

## Setup and verification

Apply migration 0022 only after the existing chain through 0021. Until its schema is installed, the page shows a setup state through `schemaMissing`. Edge integrations deploy separately by hand. No production database change or production deployment was performed. Temporary isolated hosted staging was verified and deleted after evidence capture; see `docs/scouting/STAGING.md`.

Training prepares students for mentor assessment; it does not write IDEA certification rows or revive the retired skills system. Certification remains an IDEA Classroom action.

## Planning, replies and practice

Managers can paste a match schedule or accept the imported schedule, choose a match range and available scouts, mark breaks, preview workload/coverage, and save the shift. Existing work is kept and uncovered robots are visible. Local batch enqueue is atomic; server authorization/conflicts remain per record. `scouting_roster` provides only eligible names and is event-manager gated.

Pit conversations support separately attributed replies with immutable original-thread links. Comparison voting has side-by-side evidence cards. Pit addresses display their source, time and freshness warning. Training now saves incomplete decisions, active mission, simulation answers and real-footage worksheets as drafts; completion does not award certification.

The standalone review is built by `npm run scouting:preview` from the same route and fixture backend. `npm run scouting:preview:check` checks the compiled bundle under DOM emulation. Neither is a deployment or substitute for native browser/phone checks.

## Recovery and evidence quality

`Export event data` now includes account/event-scoped drafts, practice, pending operations, confirmed receipts and cached evidence in a versioned JSON archive. The archive is for reviewed recovery; it never automatically uploads or overwrites existing work. Offline event opening skips remote data queries. Team imports are atomic locally.

Prior-event footage must retain its source event and full match key, appears with a provenance label and stays outside current-event reliability percentages. Full TBA and short current-event match labels share one logical identity. The coverage panel in Teams finds missing pit reports, thin or disputed evidence and prior-event context.

## Built PWA recovery

The scouting route and installed start URL have a service-worker navigation fallback. After an eligible online event load confirms `scouting_can_access`, a local identity hint remembers only member/event IDs and preparation time. Cold offline scouting opens that account's cached data and durable queue, including when Auth needs a network refresh. It does not grant server authorization. Explicit sign-out, account changes and an online access denial clear the hint. Reconnection returns to normal auth/approval and server actor/RLS checks before upload. First-time offline login and uncached events are unavailable. The identity hint can be cleared without deleting pending evidence.

`tools/e2e/scouting-pwa.mjs`, run through the disposable SQL harness, uses a normal production build, real Chromium/IndexedDB/service worker, real Supabase JS and local PostgREST/native PostgreSQL. Only Auth identities/token issuance are synthetic; no provider or Discord call is made. This separately verifies cold navigation, expired-session offline entry, lost-response retry and HTTP permission/connector boundaries. See the current verification record for actual results.

## Training evidence and account isolation

The practice workbook freezes a source/team/match, first-pass answers and notes, then appends separate reviewed corrections. Unknown and unrecorded remain distinct. Mission completion is withdrawn when its required acknowledgment, reflection or answers change. Practice export waits for durable state and explicitly awards no certification. The retained browser spec completes all eight missions and verifies the exported packet; simulated partner acknowledgment is not human assessment.

Offline entry requires both the prepared identity hint and the current locally stored Supabase session's member ID to match. Reading that ID does not refresh or expose a token. Sign-out/account changes and cross-tab storage updates close the prepared surface. A queued `syncing` operation left by a closed page is retried automatically after its IndexedDB lease expires, with the original operation and actor IDs.

## Pit navigation

Teams includes a Nexus v1.8.0 geometry map and text directory with search, highlighting, zoom and rotation. Download explicitly while online; normalized geometry/key/source/time are stored in the existing member/event draft store and included in event backups. Failed provider/schema/storage refreshes preserve the previous map. Walls, labels, areas, rotated pits and single/double arrows are rendered as bounded data, never upstream SVG/HTML. Scout pit reports remain separate; contradictory locations are flagged and never automatically overwritten.

`scouting-import` accepts read-only `mode: pit_map` for eligible members viewing a competition/training event; its default roster preview remains manager-only. Both paths authenticate and use caller-scoped Supabase clients. The connector's existing preview tool supports the same optional mode. This adds no migration and no public writes. See `docs/scouting/PIT_MAP.md` for independent coordinates and external acceptance limits.

## Reviewed pending-save recovery and large events

An exported event JSON can be previewed and selectively restored under the same account/event. Recovery validates bounded request identity, preserves original operation bodies/IDs and atomically rechecks collisions. Recovered operations stay held and out of evidence until separately released and confirmed by the server. The archive cannot install a cache, permission hint or alleged receipt. Practice, unsubmitted drafts and maps remain available in the JSON for manual review, not automatic restoration. See `docs/scouting/RECOVERY.md`.

Form/planner/pick-list draft-read failures pause editing until retry; failed storage never produces a saved-success message. Dialog cleanup returns keyboard focus. Team evidence cards page in groups of 30; roster search, downloaded cache, percentages and rankings still use all records. The retained `scouting-volume.mjs` and `scouting-accessibility.mjs` harnesses distinguish synthetic local browser checks from field acceptance.


## Confirmed evidence and reviewed match briefs

`projection.js` separates confirmed rows (downloaded data plus newer verified queue receipts) from optimistic local edits. Strategy rates, master ballots, filters, coverage and match briefs use confirmed inputs. Pending corrections retain earlier confirmed evidence. Actor/event checks, recovered-proposal holds and monotonic receipt versions have executable permissive mutation controls.

`ObservationBrowser.jsx` makes all downloaded observations searchable/pageable, with current/prior/disputed filters and existing author-only correction controls. `currentObservations` is shared with reliability so dispute grouping uses the same normalized identities and correction rules. `EvidenceRecord.jsx` retains attribution and revision history.

`MatchBrief.jsx` saves a device-local actor/event draft, requires a manually confirmed six-team lineup, exposes capabilities/unknowns/disputes and coach plans separately, and freezes JSON/escaped printable HTML only after review. Plan/evidence changes invalidate export readiness. Read/write failure pauses editing or review; writes are serialized and only the latest completed write may claim saved. No new remote permissions, notifications or SQL contracts. See `docs/scouting/DECISION_SUPPORT.md` and the retained decision-support checks.

A definitive 42501/PGRST301/account-change response hides the event surface, including old confirmed queue receipts, until access is restored. Local records/drafts remain intact. DOM and native-browser denial/retry checks complement database permission checks.

Video observations with missing/invalid event scope are now excluded from current rates and match coverage, retained as raw evidence and surfaced through a dedicated review filter and explicit brief/comparison exclusions. Explicit live observations remain current even with an attached reference URL. Provenance tests independently fix the expected 0/1 versus 1/2 distinction; a permissive model mutation must be detected.
