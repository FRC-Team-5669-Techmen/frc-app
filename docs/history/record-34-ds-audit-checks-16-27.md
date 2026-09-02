---
title: "ds:audit grows the source-side counterparts of the pre-delivery checks (16-27) and ds:audit:controls"
date: 2026-08-23
branches: []
commits: ["7cca550", "665673c"]
migrations: []
subsystems: ["Design system"]
record_order: 17
---

 Earlier the same day -- ds:audit grew the twelve source-side counterparts of the pre-delivery checks, 16-27, plus ds:audit:controls. See the Verification sentence in the design-system bullet. The letterbox/thumbs-dock token-layer check went first because it is the only one with a shipped regression behind it: those rules lived only in the two templates inline style blocks for weeks, so a deck that set .frc-letterbox exactly as the routing header says got a class DeckStage read correctly and that did nothing. 29 negative controls, 29 caught, tree restored green - a check that has never failed has not been tested. TWO CHECKS WERE NARROWED AFTER THEY FIRED ON LEGITIMATE CODE, both recorded at the check: 19 caught ComparisonSheet painting the winning cell --fg-hero, which FRC_Design_System.md line 123 explicitly permits (gold IS active state; what is banned is running text), so it now skips state-qualified selectors and [data-deck-active] is deliberately not a state; and 22 caught .frc-img-fill, generic image sizing that only shares the frc-img- prefix, so it now matches the documented reveal vocabulary exactly rather than a prefix. One control also found a real hole in check 24 - a substring keyword test accepted SafetyNoteX as SafetyNote - now a whole-token match. ONE ITEM WAS REPORTED NOT MECHANIZABLE rather than shipped fuzzy: FIRST never typed by hand.