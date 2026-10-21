# Scouting implementation contract

Techmen design, not a recovered TideScout schema. Agreed before implementation.

One lazy route /scouting and /scouting/:eventId, linked to existing events and members. Parent-only denied; approved students and staff allowed. Managers: staff, event scouting_lead, or scouting.manage capability (parent-only never receives access through capability). Capture is available to any eligible member, consistent with everyone without another job scouting.

`scouting_records`: id UUID, event_id UUID, member_id UUID (author), kind, team_number integer nullable, match_key text nullable, payload JSONB, version integer, created_at, updated_at. Strong kind-specific server validation. `scouting_revisions` append-only full versions. No destructive delete. Inactive data uses explicit status.

Kinds and payloads:
- pit: {capabilities: {trench: yes|no|unknown, bump: yes|no|unknown, ground_intake: yes|no|unknown}, notes, pit_location}; team required.
- observation: {answers: {trench: yes|no|did_not_see|not_applicable, bump: ..., ground_intake: ...}, notes, source: live|video, video_url: optional HTTPS, assignment_id: optional UUID}; team and match required. Absent answers stay absent.
- assignment: {assignee: member UUID, status: assigned|complete|cancelled, instructions, video_url}; team and match required. Manager creates/edits; assignee completion via observation can be derived.
- message: {text, status: open|resolved, request_delivery: boolean}; team required. Saved data and notification status are separate.
- pick_list: {entries: [{team: positive integer, tier: 1|2|3|dnp, rank: positive integer}], reason: optional string}; team/match null. One list per author/event. Updates compare version.
- team: {name, pit_location, source: manual|tba|nexus, source_url, fetched_at, epa: nullable number, epa_source: statbotics, epa_fetched_at, official_results: optional JSON array}; manager only, team required. Official alliance results never individual estimates.

RPC `scouting_save(p_id uuid, p_event uuid, p_kind text, p_team integer, p_match text, p_payload jsonb, p_expected_version integer, p_operation uuid, p_actor uuid)` returns saved record JSON. The expected actor must equal auth.uid, protecting a precise account-switch race. Create expects version 0, edits exact current version. Same operation retry returns exact first result; same operation with changed body is refused. Conflict code 40001, auth 42501, validation 22023. Manager can edit shared records except individual pick lists and observations (author only). No client member_id override. Direct writes must not bypass attribution, validation, history or conflict protection. `scouting_can_manage(p_event uuid)` read RPC.

`scouting_delivery`: separate per message/version status queued|sending|delivered|failed|uncertain|not_configured. Server dispatcher authenticates, checks access, reserves delivery atomically and suppresses mentions. Ambiguous network failure never automatically resends. Data must survive delivery failure. No real sends in this run.

Client queue uses IndexedDB, scoped by member and event. Immutable operation UUID and payload survive reload. Explicit local/synced/conflict/failed states. Retry stops on conflicts/permission/validation errors and preserves the local proposal. Missing RPC must never return false success through writeVia fallback. Cache event data only after successful reads, timestamp it, and do not replace with empty failed responses. Account changes cannot sync or expose another account queue/cache.

Techmen ranking: yes / (yes+no) with denominator and minimum 3 observed trials; unknown and N/A excluded and shown. One latest observation per author/team/match, corrections replace numerator contribution. Team reliability aggregates match-level outcomes to avoid duplicate scout inflation: disagreement is disputed and excluded. Median of submitted tier/rank values, no silent outlier removal, unranked ignored, support count shown, DNP vote fraction separate. Pairwise wins among three unique teams produce a preview within selected positions of own list only; ties preserve existing order; apply uses version check and explicit confirmation. Full formulas and independent examples in reference docs/tests.
