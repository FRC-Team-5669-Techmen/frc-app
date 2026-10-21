# Scouting reference evidence

Checked October 20, 2026 (America/Los_Angeles). This is a behavioral reference and a specification of Techmen choices, not a claim that TideScout's private implementation was recovered. The private handoff and feedback archive are excluded from this repository.

## Evidence labels

- **Observed:** directly inspected working behavior or original audiovisual content.
- **Documented:** first-party text, published metadata or official schema inspected.
- **Inferred:** an interpretation or Techmen design choice, explicitly identified below.
- **Unknown:** not established by accessible evidence.

There are **no observed TideScout application workflow claims** in this run. The supplied secondary transcript supplies workflow leads. Its labels and timestamps do not become independent verification by being repeated here.

## What dated version is established

| Source | Result | Scope and limitation |
| --- | --- | --- |
| [FUN Robotics Network video](https://www.youtube.com/watch?v=XM7l9Z1HiDs) | **Documented metadata:** title `4414 HighTide / Behind the Bumpers / REBUILT Champions`; publisher FUN Robotics Network; published May 5, 2026 at 3:53:14 PM Pacific; duration 1,835 seconds. | YouTube player metadata was retrieved directly over HTTPS and independently with yt-dlp. This pins publication, not filming date, app commit, or current production version. |
| [Chief Delphi tutorial post](https://www.chiefdelphi.com/t/scouting-app-in-20-minutes-tideapp-tutorial/520424) | **Documented:** Kenny Sandon's May 8 UTC post links a one-take example tutorial and generic prompts; a reply describes using Convex similarly. | Tutorial example, not a complete production behavior contract. The post is later than the May 5 video. |
| [TideScout Alliance](https://www.team4414.com/tidescout-alliance) | **Documented:** cooperation and shared scouting data; event listings explicitly say 2023. | Historical alliance material cannot establish the 2026 interface. |
| Current production TideScout, source code, exports and schema | **Unknown.** None supplied or accessed with authorization. | No claim of “latest” or exact schema/permission parity is warranted. |

The defensible target is **the capability set described in secondary notes about the May 5, 2026 video**, implemented as explicit Techmen rules. Newer TideScout revisions remain unknown.

## Original-source access attempts

The web reader throttled the video. Direct YouTube HTML succeeded and exposed dated metadata, caption tracks and format metadata. The auto-caption download returned HTTP 429. YouTube storyboard image URLs returned a 195-byte HTML “Site Unavailable” response instead of image bytes. A yt-dlp request obtained media-format metadata, but an ffmpeg attempt to retrieve 22:40 through 29:50 failed (exit 183). No original audio was heard and no original video frame was inspected. This is an access gap, not proof the public video is unavailable to a person.

A locally captured official manual was inspected as text; the manual and other FIRST source files are not re-hosted in this public repo. [FIRST's season page](https://www.firstinspires.org/resources/library/frc/season-materials) asks users to link rather than redistribute.

## Workflow evidence matrix

Times below are **secondary leads**, not independently checked audiovisual timestamps. Stored fields, access rules and failure behavior are **inferred Techmen requirements** from [CONTRACT.md](CONTRACT.md); they are not verified TideScout internals.

| ID / source lead | User action and state change | Proposed stored data | Techmen permission | Derived output | Acceptance oracle |
| --- | --- | --- | --- | --- | --- |
| W1 / [23:03](https://www.youtube.com/watch?v=XM7l9Z1HiDs&t=1383s), secondary | Record pit claims, then record yes, no or unseen during a match. | Separate `pit` and `observation` records, author, event, team, match, source and revisions. | Eligible member captures own observation; manager may maintain shared pit information. | Claim beside match-level verification, denominator and disputed evidence. | A1: unknown and N/A never become failures; duplicate scouts do not increase independent trials; correction replaces contribution. |
| W2 / [24:14](https://www.youtube.com/watch?v=XM7l9Z1HiDs&t=1454s), secondary | Assign a team/match to a scout; inspect live action or prior footage; save notes. | `assignment` with assignee/status; `observation` with live/video provenance and optional recording link. | Managers assign; authors save their observations. | Scout's work queue and attributed notes; delivery state is separate. | A2: only manager can assign, assignee can capture, another member cannot overwrite author; retry gives one logical record. |
| W3 / [25:21](https://www.youtube.com/watch?v=XM7l9Z1HiDs&t=1521s), secondary | Select a team and send a question from stands to pit crew; inspect pit location. | `message`, independent delivery row, team pit location with source/freshness. | Eligible members write; dispatcher authenticates and checks event access. | Open pit questions, optional Discord status, location or explicit unavailable state. | A3: Discord failure leaves saved question; ambiguous delivery is uncertain and does not auto-resend; absent map never invents location. |
| W4 / [26:48](https://www.youtube.com/watch?v=XM7l9Z1HiDs&t=1608s), secondary | Build four-tier individual lists; filter on capability/estimate; review aggregate. | One author/event `pick_list`; team data preserves API provenance separately. | Author owns list; eligible members read shared strategy data. | Tier 1/2/3/DNP list, source-labeled filters and aggregate with support. | A4: unranked is absent, DNP is explicit; unknown EPA cannot pass numeric threshold; medians match hand examples. |
| W5 / [28:40](https://www.youtube.com/watch?v=XM7l9Z1HiDs&t=1720s), secondary | Select three teams, compare, preview changed order, then apply or cancel. | Own pick-list revised only on apply; stale version refused. | Author only, including connector. | Preview before mutation; explicit conflict after concurrent edit. | A5: cancel changes zero records; apply changes only selected positions; tie preserves order; stale apply cannot overwrite newer list. |

The secondary account mentions outlier exclusion but does not establish the formula. It describes a three-team comparison; it does **not establish Elo**, a K-factor, initial ratings, or a rating update equation. Permission roles, correction history, failure states, empty states, offline behavior and delivery guarantees of TideScout are unknown.

## Official game pin

- [REBUILT Game Manual](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf), **TU22**, 166 pages. Download SHA-256: `5c67300fc412a1eed8ca9dc37fb6644aee05795a2befed1f69736643cbf95139`.
- [Team Update 22](https://firstfrc.blob.core.windows.net/frc2026/Manual/TeamUpdates/REBUILT_TeamUpdate22.pdf), **April 21, 2026**, explicitly the final season update. SHA-256: `2a16c7ef2f25123710508de7029d98a00ab1ccb83121ed947d38c598a28dd062`.
- [Combined updates](https://firstfrc.blob.core.windows.net/frc2026/Manual/TeamUpdates/REBUILT_TeamUpdate-Combined.pdf) available; TU22 is the consolidated manual baseline. Event-specific offseason changes still require confirmation.

**Documented terminology:** BUMP is traversed over, TRENCH underneath, FUEL is the scoring element, and TOWER has three levels. Mapping the secondary caption's “low bar” to TRENCH is **inferred**, not an original-audio correction. “Ground intake” is a Techmen observable capability label, not an official scoring category. The module does not infer individual FUEL totals or points from qualitative capability answers.

[WPILib 2026 game data](https://docs.wpilib.org/en/stable/docs/yearly-overview/2026-game-data.html) documents R/B for the first inactive HUB, delivered after AUTO scoring assessment; an empty string precedes availability. No app clock should invent that missing field state. A manual phone timer is not authoritative FMS time.

## API contracts inspected

| Provider / pin | Contract verified | Implementation boundary |
| --- | --- | --- |
| [TBA OpenAPI](https://www.thebluealliance.com/swagger/api_v3.json), API **3.27.2**, OpenAPI **3.1.1** | `X-TBA-Auth-Key`; event teams/matches; nullable score breakdown; `Cache-Control` and `ETag`. 2026 breakdown has alliance HUB/FUEL data and robot-indexed tower values. | Preserve alliance totals as alliance totals. Map robot fields only through supplied alliance team order. Keep null results null. Respect cache headers, use conditional requests. No numeric rate quota was established. |
| [Statbotics OpenAPI](https://api.statbotics.io/openapi.json), **3.0.0** | `GET /v3/team_event/{team}/{event}`, `/v3/team_events`; no auth scheme declared; response schema allows arbitrary object properties. SHA-256 `7b24722146a3b6eb8fa121a2bb5cbd1465f3a394f7b95042833830a21c2bf1a9`. | The schema is permissive, but the first-party model pinned below establishes numeric `epa.total_points`. A sample `4414/2026dal` request failed HTTP 500; no live-data success claimed. Validate consumed fields and preserve missing estimates. EPA is an estimate. No numeric rate quota established. |
| [Nexus API](https://frc.nexus/api/v1/docs), **1.8.0** | Header `Nexus-Api-Key`; `/event/{eventKey}/pits` returns team/address map; `/map` returns geometry; `dataAsOfTime` is milliseconds; use newest snapshot. | Event not found and absent map are supported failure states. Times only reliable when Nexus handles queuing. Include Nexus attribution. New raw-map endpoint means AI parsing is unnecessary for a structured import. No numeric rate quota established. |

The [Statbotics TeamEvent model](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/db/models/team_event.py) at commit `a2cea5553e35693d423400f419bd770cb2143408` was inspected independently from a shallow source checkout. `to_dict()` emits **numeric `epa.total_points`**, while `epa.stats.mean` is a separate event statistic. Do not read `epa.total_points.mean` for this endpoint. The matching [API router](https://github.com/avgupta456/statbotics/blob/a2cea5553e35693d423400f419bd770cb2143408/backend/src/api/team_event.py) serializes that model for both endpoints, caps lists at 1,000 and supports limit/offset. Source-level cache TTL is two minutes; this is not a promised client rate limit.

API version pins describe inspected contracts, not proof a connector is configured or live imports have run. Any local normalized import is a Techmen interface and must not be presented as a direct provider response. Keys belong only in server settings. Integration absence must preserve manual scouting and existing cached data.

## Deliberate Techmen deviations

1. Offline storage, immutable operation IDs, version conflicts, separate delivery receipts and append-only correction history are Techmen reliability requirements. TideScout behavior is unknown.
2. Match-level consensus prevents several scouts watching one match from artificially expanding the denominator. Disagreement is visible and excluded from the numeric rate.
3. Aggregation uses transparent medians with visible support and DNP fraction. **No observations or votes are silently removed as outliers.** This differs from the secondary description and avoids inventing an undisclosed formula.
4. Comparison uses a deterministic three-team preview, not an asserted Elo replica.
5. Structured Nexus locations can be consumed without an AI parsing step. Hand-entered locations retain manual provenance.
6. Certification and beginner training follow Techmen's existing IDEA certification authority; practice completion must not mint an official certification.

## Remaining fidelity and release gates

Original frames/audio; TideScout's exact controls, formulas and permissions; authorized production/source/export comparison; a fixed independently annotated real-match video corpus; live API credentials and representative responses; real iPhone/Android interruption testing; measured beginner usability with actual students. Automated browser emulation cannot close these gates. See [acceptance-oracles.md](acceptance-oracles.md) for the acceptance specification and [VERIFICATION.md](VERIFICATION.md) if present for executed results.

## Source recheck — October 21, 2026

The current continuation re-opened the Chief Delphi tutorial and historical Alliance page through the web reader; their scope remains as described above. The video reader again reported an online-fetch throttle; no original frames/audio were inspected.

A newly discovered first-party [2026 Technical Binder](https://2026.team4414.com/) has indexed descriptions of TideScout, film review, pick lists and other tools. **Documented lead only:** the search index describes multiplayer lists, qualitative insights and paired video/data. Direct text extraction returned zero lines. No dated app revision, working workflow, screenshot semantics, undisclosed formula or current production contract was established. This expands the reference leads without upgrading secondary workflow leads to observed behavior or claiming latest-version parity.
