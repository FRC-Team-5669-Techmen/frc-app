# Continue the Techmen scouting review

The actual implementation and its checkpoint history are on **codex/scouting-2026-evidence**, [draft PR #4](https://github.com/FRC-Team-5669-Techmen/frc-app/pull/4). This is the existing React/Vite/Supabase app; do not rebuild it or replace this branch with main.

```sh
git clone --branch codex/scouting-2026-evidence https://github.com/FRC-Team-5669-Techmen/frc-app.git
cd frc-app
npm ci
```

Read `CLAUDE.md`, `docs/subsystems/scouting.md`, then **docs/scouting/RESUME.md** and **docs/scouting/VERIFICATION.md**. `EVIDENCE.md`, `CONTRACT.md` and `acceptance-oracles.md` distinguish the original source evidence, proposed Techmen rules and independent expectations. `RELEASE.md` gives apply order and field gates. `FIELD_GUIDE.md` gives day-of-event instructions; `RECOVERY.md` defines reviewed backup restoration. `DECISION_SUPPORT.md` defines confirmed-evidence projections, complete observation review and locally saved, reviewed drive-team briefs. The original private handoff was read but is intentionally excluded from public source.

Remain on the review branch. Preserve newer remote changes. Do not push main, deploy production, change the live database or send real Discord messages without explicit release authorization. A successful local test is not a deployed or human-validated competition system.

The GitHub source ZIP is a portable source checkpoint; cloning this branch also restores Git history. `npm run scouting:preview:check` regenerates an interactive fictional review HTML from the real components. The native database/browser/PostgREST harnesses and all test instructions travel with this source; they do not need the original AI session.
