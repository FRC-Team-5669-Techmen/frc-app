# Reviewed recovery of pending saves

Techmen reliability requirement, not an observed TideScout feature. These expectations were written before implementation on October 21, 2026.

## Acceptance contract

A scout whose original device is lost or cleared can open the same event under the same member account, choose their exported `techmen-scouting-v2` event JSON, inspect its pending saves and explicitly restore them. Recovery is additive: it never replaces existing local work, caches, permissions, synchronized evidence, practice or form drafts. Those other archive sections remain available for manual review; this flow recovers queued submissions only.

1. Wrong account, wrong event, invalid format, malformed operation identity/request or excessive file size is rejected before any local write. Unknown answers and missing fields survive byte-equivalent JSON values; recovery never normalizes a request body.
2. Each original operation ID, record ID, actor, expected version and complete request body is retained. Identical operations already present are skipped, even if the local operation has advanced to synchronized. A changed request under an existing operation ID is rejected. Different pending operations for the same record block restoration of that row.
3. Preview is read-only. The user selects recoverable rows. Confirmation writes the chosen set in one IndexedDB transaction, rechecking collisions so a second tab cannot invalidate the preview silently. Any failure rolls back the entire selected set.
4. Restored rows are held for review and survive reload. Opening the event, reconnecting or pressing Sync now does not release them. A separate per-row review/retry action releases the original request. They do not become evidence in robot cards or rankings until the server confirms them.
5. The server remains the authority on permissions, validation, prior operation receipts and conflicts. A previously committed request with a lost response is retried with exactly the same operation ID/body and returns one logical record/revision. A stale edit produces an explicit conflict. A rejected recovered body is retained for export/discard, never fed unchecked into editable forms.
6. A duplicate re-import makes zero local writes. A concurrent record edit cannot be overwritten. A malformed archive cannot install a fake cache, manager roster, successful receipt or login state.
7. Review displays requested notification delivery before retry. Recovery itself makes no network call and does not claim notification delivery. Releasing a save uses the normal synchronization and delivery safeguards.

## Independent examples

- Archive pending O1/R1 (match qm10, `trench: did_not_see`) and O2/R2; local O1 is already synchronized. Preview skips O1, allows O2. Restore O2 as held, zero RPC calls. Reload and Sync now still make zero O2 calls. Release O2 and receive version 1; exactly one R2 and one revision exist.
- Archive O3/R3 expected version 1; server R3 is version 2. The original O3 is rejected as a conflict. Only explicit conflict resolution may create a new operation against version 2.
- Preview O4/R4, then another tab queues O5/R4. Confirm O4 plus unrelated O6: the transaction refuses the set; neither O4 nor O6 is inserted, and O5 is untouched.
- Archive O7 claims another member/event inside its request despite a matching outer header. Reject the entire archive. A positive same-scope control must succeed.

## Verification limits

Executed results belong in `VERIFICATION.md`; this document specifies expected behavior. Browser emulation, fixture Auth and local PostgreSQL tests do not establish real-phone, hosted Auth or human recovery proficiency.
