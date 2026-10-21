---
title: "Offline pit navigation and competition verification"
date: 2026-10-21
branches: [codex/scouting-2026-evidence]
commits: []
migrations: []
subsystems: ["Scouting", "Connector", "Fixture mode"]
---

Continued the restored review branch after the request to make scouting competition ready. Added a source-backed Nexus geometry adapter, map/directory UI, device-scoped offline cache, conflicting-location and freshness handling, and optional map reads through the existing connector preview tool. No database migration, production write/deployment or Discord send was performed.

`docs/scouting/PIT_MAP.md` fixed independent acceptance expectations before implementation. Pure/DOM tests, fictional fixture browser flows and the real local PostgREST/native PostgreSQL PWA harness now exercise the map. The first broad unit run caught the stale generated connector registry; it was regenerated. The standalone review builder caught a case collision between `PitMap.jsx` and its helper; renaming the helper to `pit-map-model.js` restores portable compilation without changing map behavior. The first expanded fixture browser run exposed a missing wait after reconnecting; the corrected test waits for the authenticated event before checking its controls. Current counts, full reruns and limitations belong in `docs/scouting/VERIFICATION.md`, not this historical entry.

Read-only hosted catalog checks again found no scouting tables/functions or scouting Edge deployments, and no development branches. Physical iPhone/Android, novice measurements, real annotated footage, current TideScout fidelity and hosted/provider/delivery acceptance remain external gates. Code completion does not mark those gates passed.
