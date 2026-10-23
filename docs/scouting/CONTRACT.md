# Scouting implementation contract

Techmen design, not a recovered TideScout schema. Specified before the initial implementation; proposed Techmen behavior.

One lazy route /scouting and /scouting/:eventId, linked to existing events and members. Parent-only denied; approved students and staff allowed. Managers: staff, event scouting_lead, or scouting.manage capability (parent-only never receives access through capability). Capture is available to any eligible member, consistent with everyone without another job scouting.

`scouting_records`: id UUID, event_id UUID, member_id UUID (author), kind, team_number integer nullable, match_key text nullable, payload JSONB, version integer, created_at, updated_at. Strong kind-specific server validation. `scouting_revisions` append-only full versions. No destructive delete. Inactive data uses explicit status.

Kinds and payloads:
- pit: {capabilities: {trench: yes|no|unknown, bump: yes|no|unknown, ground_intake: yes|no|unknown}, notes, pit_location}; team required.
- observation: {answers: {trench: yes|no|did_not_see|not_applicable, bump: ..., ground_intake: ...}, match: optional REBUILT match fields (0027), notes, source: live|video, video_url: optional HTTPS, assignment_id: optional UUID}; team and match required. Absent answers stay absent.
- observation.match (0027): {auto_fuel, teleop_fuel, teleop_missed: whole numbers 0-500; auto_climb, shuttled, died, tipped, stuck, broke: yes|no|did_not_see; defense: none|some|most; defense_rating, driver_skill: 1-5; tower: none|level1|level2|level3|failed|did_not_see; fouls: text <= 500}. Every key optional; an absent key is not recorded; JSON null and unknown keys are refused; 0 is an observed zero. Pit reports cannot carry match fields.
- assignment: {assignee: member UUID, status: assigned|complete|cancelled, instructions, video_url}; team and match required. Manager creates/edits; assignee completion via observation can be derived.
- message: {text, status: open|resolved, request_delivery: boolean, reply_to: optional original message UUID}; team required. Replies must reference an original message for the same event/team; reply context is immutable. Each reply keeps its own author and revisions. Saved data and notification status are separate.
- pick_list: {entries: [{team: positive integer, tier: 1|2|3|dnp, rank: positive integer}], reason: optional string}; team/match null. One list per author/event. Updates compare version.
- team: {name, pit_location, source: manual|tba|nexus, source_url, fetched_at, epa: nullable number, epa_source: statbotics, epa_fetched_at, official_results: optional JSON array}; manager only, team required. Official alliance results never individual estimates.

RPC `scouting_save(p_id uuid, p_event uuid, p_kind text, p_team integer, p_match text, p_payload jsonb, p_expected_version integer, p_operation uuid, p_actor uuid)` returns saved record JSON. The expected actor must equal auth.uid, protecting a precise account-switch race. Create expects version 0, edits exact current version. Same operation retry returns exact first result; same operation with changed body is refused. Conflict code 40001, auth 42501, validation 22023. Manager can edit shared records except individual pick lists and observations (author only). No client member_id override. Direct writes must not bypass attribution, validation, history or conflict protection. `scouting_can_manage(p_event uuid)` read RPC.

`scouting_delivery`: separate per message/version status queued|sending|delivered|failed|uncertain|not_configured. Server dispatcher authenticates, checks access, reserves delivery atomically and suppresses mentions. Ambiguous network failure never automatically resends. Data must survive delivery failure. No real sends in this run.

Client queue uses IndexedDB, scoped by member and event. Immutable operation UUID and payload survive reload. Explicit local/synced/conflict/failed states. Retry stops on conflicts/permission/validation errors and preserves the local proposal. Missing RPC must never return false success through writeVia fallback. Cache event data only after successful reads, timestamp it, and do not replace with empty failed responses. Account changes cannot sync or expose another account queue/cache.

Techmen ranking: yes / (yes+no) with denominator and minimum 3 observed trials; unknown and N/A excluded and shown. One latest observation per author/team/match, corrections replace numerator contribution. Team reliability aggregates match-level outcomes to avoid duplicate scout inflation: disagreement is disputed and excluded. Median of submitted tier/rank values, no silent outlier removal, unranked ignored, support count shown, DNP vote fraction separate. Pairwise wins among three unique teams produce a preview within selected positions of own list only; ties preserve existing order; apply uses version check and explicit confirmation. Full formulas and independent examples in reference docs/tests.

## Shift planner and eligible roster

`scouting_roster(p_event uuid)` returns a JSON array of eligible scout id/name/nickname fields to managers of that event only. The SQL eligibility check is reused for assignment writes; the UI never suggests inactive or parent-only members. Previously loaded eligible names can be used offline, subject to current authorization on sync.

A reviewed schedule plan uses the existing assignment record contract. One local IndexedDB transaction enqueues the complete batch; server writes remain individually validated, auditable and conflict-aware. Workload balancing and break exclusions are proposed Techmen policies. Existing assignments/observations count as covered. Incomplete coverage is explicit. Concurrent leads must coordinate: the preview is not a global server reservation. Schedule inputs and source timestamps are device/account/event drafts.

Pit location display retains source and time. Addresses older than 24 hours (or unknown/future timestamps) are flagged for verification, not erased. This freshness warning is a Techmen choice. A firsthand pit report takes precedence over a directory import.

Nexus geometry uses a read-only `scouting-import` mode. Existing member eligibility and competition/training event visibility are required; manager permission is still required for roster imports. Geometry is normalized as whole-map data (max 500,000 JSON characters, 1,000 shapes per collection, 2,500 overall, finite bounded coordinates and supported arrow types). Malformed walls reject the whole map. Source text never becomes markup. Map dimensions below one unit or an aspect ratio above 50 are refused as unsupported. These bounds, centered SVG rendering, map controls and freshness/conflict warnings are Techmen policies.

Map downloads commit to the existing member/event IndexedDB draft `nexus-pit-map-v1` before offline availability is announced. The stored event key and retrieval time belong to that geometry; typing a different key never relabels the displayed map. Failures preserve the old cache. Source assignments are not manual pit corrections and never change observations, claims or rankings. The event export includes the map draft. External video and maps never imply live navigation or real-phone validation.

## Footage event boundaries and match identity

Observations and assignments may carry `source_scope: current|external` and an external `source_event` such as `2026cabb`. External footage requires an HTTPS URL and a full match key starting with that source event. An observation tied to an assignment must preserve the assignment's source scope. Prior-event footage remains visible and exportable, with explicit labels, but is excluded from current-event reliability. Legacy video records without scope are labeled “event scope not recorded” and excluded from current-event rates and coverage. They remain searchable in “Video scope needs review” and retained in exports; a lead must review their provenance before relying on them. Only an attributed correction establishing current-event scope allows them into the current denominator. Explicit live observations remain current even if they have an attached reference URL.

For current-event evidence, known TBA qualification/playoff keys (`2026cabb_qm1`, `2026cabb_sf1m1`, `2026cabb_f1m1`) and their short labels name the same match. Case and surrounding spaces do not create new matches. Observation and assignment uniqueness indexes, reliability grouping and shift coverage use this identity. External keys retain their source prefix. Corrections replace earlier versions before source scope is evaluated.

## Portable recovery and coverage

The event JSON export is `techmen-scouting-v2`. It contains the event snapshot, revisions, delivery statuses, unsynchronized operations and a `techmen-scouting-device-v1` snapshot of all operations/receipts, drafts (including practice) and cached data for this member/event. A confirmed receipt remains in the export even when a later download fails. This is a portable review/recovery archive, not a bulk import command; operation IDs, actor bindings and immutable request bodies must survive any reviewed recovery. No login credentials are exported.

Team imports enqueue a reviewed batch in one IndexedDB transaction. Server writes remain separate validated operations. No partial local import is presented as a complete save. Offline opening skips remote data queries and uses the existing account/event cache; an uncached event requests an initial download.

Coverage separates current-event matches, prior-event footage, local observations, missing pit reports, outstanding assignments and per-capability trials/disputes. Three trials per capability is a coverage threshold, not a robot-quality score or scouting certification.

## Prepared offline entry

A successfully loaded online event must first receive `scouting_can_access() = true`. After durable caching, store a device-local hint `{memberId,eventId,preparedAt}` with no Auth token or server permission. The app/SW may open this account's local cache and queue during a cold offline start, even when its real session requires refresh. This surface grants no remote read/write. Changing accounts, signing out or receiving a definitive online access refusal clears the hint. Reconnecting uses the real session and existing actor-bound RPCs; local data cannot authorize synchronization. This is an explicit Techmen requirement, not documented TideScout behavior.

## Practice first-pass history

A footage workbook submission freezes the team, actual source match/URL, source selector, first-pass answers/notes and time. A subsequent review records its own answers, supporting note/time and self-reported discussion; earlier reviews and the first pass remain. These are local practice records, never competition statistics or certification. Source identity mistakes require a new entry and explanatory review rather than silently changing the frozen source. All eight mission workflows and practice export are scriptable; only a real mentor can assess competence on independently chosen recordings and actual phones.

## Match fields summaries (0027)

Per-team match figures follow the reliability rule's structure: confirmed current-event observations, the newest correction per author per match, then ONE value per match (median of the scouts' counts or ratings; a yes/no where scouts disagree is disputed and excluded). Medians are over matches where the field was recorded, with the count shown. Rates have the decisive matches as their denominator. A team with nothing recorded shows no figure, never 0, and fails every numeric filter. Hand examples: `tests/scouting-match.test.js` and `docs/scouting/acceptance-oracles.md` A6.

## Pairs, super scouts and the current match (0030)

- observation.role: optional `scout|super`. A `super` observation carries `super: {driver_skill, defense, speed, intake: whole numbers 1-5; failures: text 1-1000}` with at least one key, JSON null refused, and no `match` key and empty `answers`. `super` on any other observation is refused. Super notes never enter reliability, match summaries or coverage.
- assignment.role: optional `scout|super`. A `super` assignment carries `alliance: red|blue` and `teams`: one to three different team numbers including its own `team_number`. `alliance`/`teams` on any other assignment are refused. Two scouts may hold assignments for one robot and match (redundant pair); one scout twice is still `PT409`.
- `scouting_now(event_id, match_number 0-999, block_size 1-200, updated_at)`: no client privileges. `scouting_now_get(p_event)` for eligible scouts (null before first set); `scouting_now_set(p_event, p_match, p_delta, p_block)` for event managers: set or bump (not both), clamped to 0-999, block size optional.
- Pair reconciliation (client, Techmen rule): average of counts and ratings per team per match; flagged beyond 10 FUEL or 1 rating point, or differing decisive yes/no or choice answers.
