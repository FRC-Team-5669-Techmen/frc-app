# Resume the scouting implementation

This is ordinary React/Vite/JavaScript and Supabase SQL. Claude Code, Gemini CLI or another coding agent can work directly in this repository. Nothing depends on ChatGPT state or its tool runtime.

Start with CLAUDE.md, then docs/subsystems/scouting.md, docs/scouting/VERIFICATION.md, EVIDENCE.md and the status files in this directory. The private original handoff belongs outside the public repository.

## First commands

```bash
npm ci
npm run connector:build
npm test
npm run build
npm run connector:check
node docs/scouting/check-oracles.mjs
```

Follow `database-status.md` for the optional PGlite SQL check and native PostgreSQL harness. Follow `browser-status.md` for the browser commands. Browser emulation is not real-device verification.

## Delivery constraints

Keep work on a review branch. Do not push main, merge, deploy production, apply SQL to the live database or send real Discord messages without deployment authorization. Do not commit credentials, the original private handoff or private feedback. Recheck current main and open branches before resuming.

The intended branch is `codex/scouting-2026-evidence`, based on `9bb3a07321f6fc8a298835e0ec31fc193e106111`. GitHub integration branch creation returned HTTP403, and shell git push had no credentials. Therefore this session could not create a remote branch or PR; a portable source archive and Git bundle preserve the actual implementation.

## Remaining release gates

- Native PostgreSQL16/Supabase staging RLS and PostgREST behavior.
- Full retained browser suite at375px and1440px, real iPhone and Android, actual interruption/resume behavior, measured beginner usability.
- Original video frames/audio and a fixed annotated real-match corpus. Synthetic fixtures are explicitly not match evidence.
- Deployed integration configuration and provider API behavior; no test Discord messages were sent.
- Nexus map geometry and verified Discord role ping mapping remain fidelity gaps. Pit addresses and provenance, manual assignments, a reviewed automatic shift planner, and explicit source snapshots are implemented. The planner is a Techmen design, not a verified TideScout algorithm.
- Official certification assessment remains in IDEA Classroom. The in-app practice path prepares that assessment and must not award a conflicting certification.
- Review the source, complete the above checks, push the branch and open the PR once GitHub write access works.

Do not discard the implemented source or rebuild from scratch. Treat verification gaps as unfinished checks, not permission to claim success.

## Expanded local implementation

The continued build adds a shift planner with atomic local batch saves, eligible-scout roster, pit conversation replies, comparison evidence cards, pit-address provenance, serialized pick-list drafts, 27 interactive practice decisions plus six written match scenarios, and a real-footage workbook. Practice is locally persisted; official certification remains in IDEA Classroom.

`npm run scouting:preview:check` builds a self-contained review HTML from the actual components and exercises the compiled bundle in jsdom with IndexedDB emulation. The portable archive includes `REVIEW.html`; open it in Chrome/Edge to inspect the fictional student/mentor/parent views. It blocks network connections and has no live credentials. It is not the production app or evidence of real-browser acceptance.

The next local review also adds complete account/event recovery exports, atomic team imports, offline cache opening, event coverage, and explicit prior-event footage. Read the last sections of CONTRACT.md before changing these paths. In particular, never import an archive by inserting its `records` array, and never replace operation IDs during retries. The JSON preserves drafts and practice but does not provide a one-click restore UI. Source-scope labels are recorded provenance, not independently verified claims about the contents of a linked video.
