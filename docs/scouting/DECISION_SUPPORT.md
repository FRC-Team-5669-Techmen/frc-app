# Reviewed decision support — Techmen requirements

These are proposed Techmen behaviors, not verified TideScout features or win predictions. Acceptance criteria were recorded before implementation on October 21, 2026.

- Strategy calculations retain the last confirmed record while its correction is queued. A newer confirmed receipt supersedes an older downloaded version even when refresh fails. Foreign-account/event operations and unreleased recovered proposals cannot contribute.
- Every downloaded observation remains searchable and correctable by its author, including entries beyond the first 30. Search and pagination never change reliability inputs. Current-event disputes expose contradictory contributors; prior-event footage remains separate. No automatic majority adjudication.
- A match brief uses an explicitly entered six-team lineup; schedule array order does not establish alliance color. The coach records opening coordination, roles, endgame and contingencies. These are plans, not observed capabilities.
- Briefs are actor/event-scoped device drafts. Saving, reviewing and exporting are separate actions. Export freezes confirmed evidence, record IDs/versions, review time, pending count and plan. Changing evidence or the plan requires another review. Offline operation uses prepared evidence and explicitly reports its age.
- A printed brief must escape user text and carry no executable scripts or external assets. JSON retains auditable inputs. Neither export sends notifications or writes shared database records.

Independent examples: confirmed ballot A ranks 5669 first; a pending correction placing it third must leave the master rank at 1 until confirmation. A confirmed version 2 receipt changes it to 3 even if the cache still contains version 1. For one match, one yes plus one no is disputed, not 50% or two trials. A did-not-see response adds no failure. A six-team brief with a repeated team is rejected; an unknown robot displays no evidence, never a zero capability rating.

Field acceptance remains separate: real drive-team usefulness, novice proficiency, real-phone recovery and annotated match accuracy require people/devices and cannot be certified by synthetic tests.
