# 02 The published team seal is a near-gold. Ask for a corrected export, or adopt it as published?
- Raised: 2026-09-02 by the closeout chat, from a finding first recorded 2026-08-23
- Status: open
- Default if nobody decides: **ask for a corrected export; the seal slot stays
  empty until one arrives.** That is what ships today and it is close to
  invisible, because `DeckFooter` defaults to `mark="logotype"` -- 32 of 32
  footer rails render a filled logotype. Only `CoverSheet`, `ClosingSheet` and
  an explicit `mark="seal"` still show an empty slot.
- Decided: --

## What is actually true right now

From `src/lib/design-system/assets/PROVENANCE.json`, which records the refusal
in full, including the hash of what was refused:

- The canonical `5669-Seal.svg` at
  `https://frcteam5669.com/assets/logos/seal/svg/5669-Seal.svg` carries
  **`#ffe623`** in **all 71** of its gold declarations (41 stroke, 30 fill; the
  only other colour value in the file is `fill="none"`).
- The published Techmen Gold is **`#FFE629`**, which is what `Mark-Gold.svg` and
  `Type-Gold.svg` both carry byte-for-byte, fetched from the same branding page
  in the same pass.
- The difference is one channel: blue `0x23` (35) against `0x29` (41). It is
  invisible to the eye at seal scale, which is exactly why a hash check exists
  and an eye does not suffice.
- The fetch was repeated cold and both downloads hash identically
  (`819571c2...`), so this is the published artwork rather than a transfer fault.
- `ASSETS.seal` is `null`, `SealMark` renders its marked empty slot, and
  `ds:audit` check 13 hash-pins every adopted asset so a silent recolor cannot
  land later.

## The options

**A. Ask for a corrected export.** (The default.) Somebody re-exports the seal
with the same gold as the mark and the logotype. Costs a message and a wait, and
it fixes the source rather than the copy -- anyone else downloading that seal
from the site today gets the near-gold too, including print vendors.

**B. Adopt it as published, and record the exception.** The team's own site is
arguably the authority on the team's own artwork, and a 6-value difference in
one channel is not perceptible. Costs: `ds:audit`'s provenance check has to be
told this file is deliberately off-palette, which weakens the check for every
other asset; and the deck would then carry two golds that are almost the same,
which is the state the whole `--gold` correction pass in August existed to end.

**C. Recolor it here.** Cheapest, and **not recommended**: it makes this repo's
copy disagree with the published file, which is precisely the drift the
provenance record was built to catch. The app's `public/assets/logos/` copies
were found recolored this way in August and were replaced with the canonical
bytes for that reason.

## Worth knowing before answering

This is not blocking anything. It has been in this state since 2026-08-23 and
the only visible consequence is an empty slot on two sheet patterns. It is here
because it was recorded as a finding rather than asked as a question, and had
been carried forward unchanged ever since.
