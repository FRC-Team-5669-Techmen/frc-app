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
- Nexus map geometry, verified role ping mapping and an automatic schedule assignment engine remain fidelity gaps. Pit addresses, manually assigned Scout This work and explicit source snapshots are implemented.
- Official certification assessment remains in IDEA Classroom. The in-app practice path prepares that assessment and must not award a conflicting certification.
- Review the source, complete the above checks, push the branch and open the PR once GitHub write access works.

Do not discard the implemented source or rebuild from scratch. Treat verification gaps as unfinished checks, not permission to claim success.
