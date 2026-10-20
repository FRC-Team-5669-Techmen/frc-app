---
title: "Connector writes: every direct table write moved into a database function, plus set a member's name and merge accounts (ledger 0014)"
date: 2026-10-20
branches: [main]
commits: []
migrations: ["0019_connector_writes.sql", "0019_connector_writes_rls_test.sql", "0020_member_admin.sql", "0020_member_admin_rls_test.sql"]
subsystems: ["Connector", "Roster and access", "Testing"]
---

## Progress

Kept current so a restarted session can resume. Each milestone is a local commit.

- [x] M0 ledger 0014 written; numbers read: ledger 0014 free, migrations 0019 and 0020 free (highest 0018)
- [ ] M1 src/writeVia.js and its test
- [ ] M2 0019_connector_writes.sql
- [ ] M3 every page converted; no direct write left under src/
- [ ] M4 registry: exclusions removed, coverage guard, create_event and its undo
- [ ] M5 0019 test (differential, live-safe) passing in the harness; mutants
- [ ] M6 0020 set name and merge, test and harness proof
- [ ] M7 docs
- [ ] M8 full gate, rebase, push
