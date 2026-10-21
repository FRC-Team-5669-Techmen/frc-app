# Reviewed decision-support verification

Final application: **db990e51fc24c24a42d8c202eb9107cc7ad33a9e**. Implementation began approximately 16:09 UTC, October 21, 2026; final evidence consolidated **2026-10-21T17:44:31.273120+00:00**. Earlier implementation commits are `09dab54`, `8fef933` and `75fad88`. Final follow-up `db990e5` formats printed cache times and changes the fixture clock to fixed business Date/native UI timers. All screenshots/device data are fictional. No production action or real notification occurred.

| Artifact | Actual source and result |
| --- | --- |
| `unit-dom.log`, `focused-provenance.log` | Final app: 1028/1028 tests in 71 files; the 21 focused provenance/brief/DOM tests preceded only the print timestamp change. DOM and IndexedDB emulation |
| `github-ci-136.*` | Independent CI at db990e5: 1028 tests and build/design/calendar/history passed. Actual job metadata/logs retained |
| `features-final.json`, `serial-source-status.json` | Final app: explicitly labeled aggregate 1801/1801 across all 15 features, including 169 scouting and all eight practice missions. Two disjoint serial browser batches; source unchanged |
| `clock-targets.*`, `features-complement.json`, `features-final.log` | Raw first batch: 619 targeted assertions. Raw second batch: 1182 remaining assertions; its log is `features-final.log`. Aggregate JSON links these retained copies and also records their original workspace filenames |
| `decision-browser.*`, `brief-*.png`, `brief-print.pdf` | Final app: 46 assertions, 23 per width; native Chromium 154/IndexedDB/downloads/PDF, fictional backend and controlled denial. 375px touch/Android user-agent emulation and 1440px desktop. No actual-phone/hosted-Auth/human-effectiveness claim |
| `print-review.json`, `print-review.py` | Final browser-generated four-page PDF: readable UTC cache time, literal escaped script text, unknown/disputed evidence retained; reproducible via pdftotext, no physical-printer claim |
| `mutation-controls.log` | Ten deliberately permissive source mutations caught: scopes/receipt identity/confirmation/recovered hold/monotonic versions/definitive denial/unverified-video eligibility |
| `build.log`, `pwa.*` | Final app: 145 precache entries / 1957.47 KiB; 28 built-PWA checks through native service worker/IndexedDB/Supabase JS/local PostgREST/native PostgreSQL. Synthetic Auth; fictional Nexus map |
| `accessibility.*` | Final app: 20 scoped axe-core 4.11.1 scans without automated violations, plus existing negative/keyboard checks. Manual/incomplete results remain in JSON; no full WCAG/physical-device certification |
| `sql-rls-mutations-races.log` | Disposable native PostgreSQL: migration chain twice, 72 SQL/RLS assertions, 17 mutants, seven concurrent-write checks. SQL contracts unchanged throughout this continuation |
| `checkin.*` | 51 current-run Chromium assertions; check-in source unchanged throughout this continuation |
| `volume.*` | Pre-denial/provenance candidate: both widths, 120 teams / 1,682 records and revisions, complete export/cache, paging/search, independent rates/median ties. All observations explicitly live. Shared-container timings only |
| `portable-review.log`, gate logs | Final actual-route portable DOM review; connector current, design, calendar 19/19 and original history byte/SHA checks |
| `features-initial.*`, `features-predecessor-attempt.*`, `source-boundaries.json` | Initial primary attempt: 1790/1793, 3 failures. Separate 8fef933 predecessor attempt: 1797/1798, one failure. Causes unproven; retained instead of counted as passes |
| `announcements-rerun.*` | Unchanged isolated announcements rerun: 125/125 |
| `github-ci-126.*`, `github-ci-130.*`, `focused-denial-dom.log`, `focused-tests.log` | Earlier 8fef933/6493e9a CI, 28 rendered denial tests and intermediate 15-case focused run; superseded by final complete results |
| `clock-controls.json`, `clock-targets.*` | Native Date/animation/timer/actionability proof and deliberately frozen-animation negative control; all 619 affected-route assertions in the first batch |
| `initial-serial-*` | Third attempt at 75fad88: permissions navigation timeout, cancelled after known failure. No complete result claimed |
| `initial-*` | Original failed harness/setup attempts and broad loading screenshot; corrections and scope recorded in VERIFICATION.md |

The former 1789-assertion broad result predates the newer-main merge. Current expected per-feature counts total 1801 and are retained in source-boundaries.json. No assertion or actionability/navigation timeout was weakened. The complete 1801 coverage is explicitly aggregated from two disjoint serial batches, not one browser process. Prior 39-cycle/2340-second soak evidence remains in the previous checkpoint; it was not repeated here.

`sha256.json` covers every retained file except itself. Actual phones, human training/coach effectiveness, annotated real footage, original audiovisual fidelity, representative hosted providers and authorized delivery remain open in FIELD_ACCEPTANCE.csv.
