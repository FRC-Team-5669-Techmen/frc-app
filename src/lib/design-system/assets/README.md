# Assets — required and not yet held

None of these files are in the repo. Until they arrive, a mark-bearing component renders NOTHING in a deck and a clearly marked empty slot inside `/_ds` and the dev harness — the missing file is visible on the workbench and never ships as a dashed box into the room. Do not draw a substitute, do not approximate either logo, do not generate anything that resembles one. When a file lands, put it at the path below and point the matching `ASSETS` entry in `../assets.js` at its imported URL.

## Team — from https://frcteam5669.com/outreach/branding

| Path | Used by |
|---|---|
| `assets/team/Mark-Gold.svg` | MarkGlyph (gold, auto on dark grounds) |
| `assets/team/Mark-White.svg` | MarkGlyph (white) |
| `assets/team/Mark-Black.svg` | MarkGlyph (black, auto on paper) |
| `assets/team/Type-Gold.svg` | Logotype (gold, auto on dark grounds) |
| `assets/team/Type-White.svg` | Logotype (white) |
| `assets/team/Type-Black.svg` | Logotype (black, auto on paper) |
| `assets/team/5669-Seal.svg` | SealMark, DeckFooter |
| `assets/team/Mark-Guides.svg` | spacing reference (not rendered) |
| `assets/team/Type-Guides.svg` | spacing reference (not rendered) |

The marks are used as supplied: never edited, distorted, recolored outside the three published versions, or reconfigured.

## FIRST — from https://www.firstinspires.org/about/brand

Dark-background lockups are published as EPS and PNG only; pull the PNG.

| Path | Used by | Published minimum |
|---|---|---|
| `assets/first/FIRST-Horizontal-Reverse.png` | DeckFooter (external audience zone) | 30px tall |
| `assets/first/FIRST-Vertical-Reverse.png` | reserved (cover lockups) | 60px tall |
| `assets/first/FRC-Icon-Horizontal-Reverse.png` | ProgramLockup program="frc" | 60px tall |
| `assets/first/FRC-Icon-Vertical-Reverse.png` | ProgramLockup program="frc" orientation="vertical" | 120px tall |
| `assets/first/FTC-Icon-Horizontal-Reverse.png` | ProgramLockup program="ftc" | 60px tall |
| `assets/first/FTC-Icon-Vertical-Reverse.png` | ProgramLockup program="ftc" orientation="vertical" | 120px tall |
| `assets/first/FLL-Horizontal-Reverse.png` | ProgramLockup program="fll" | 60px tall |
| `assets/first/FLL-Vertical-Reverse.png` | ProgramLockup program="fll" orientation="vertical" | 120px tall |

A gold FIRST logo does not exist and may not be produced. On dark grounds the full-color reverse or one-color reverse artwork is used, on a flat plate, never on a busy background.

## Season — from https://www.firstinspires.org/resources/library/season-brand-downloads

| Path | Used by | Held? |
|---|---|---|
| `assets/season/season-lockup.png` | SeasonLockup (replaced every January) | **yes** — FRC 2027, BIOCORE presented by Haas |

The file on disk is the vertical full-color RGB lockup out of `first-biocore-logos.zip`, byte-for-byte, renamed only. It is FIRST artwork: used as supplied, never recolored, rotated, skewed, cropped, bordered, or combined with added text. The artwork carries its own filled plates, so it needs no reverse variant and one file serves all three grounds. Each January, drop the next FRC season logo at this same path and re-hash it in `PROVENANCE.json`.

## Team-supplied

| Path | Used by |
|---|---|
| `assets/sponsors/<sponsor>.png` | SponsorWall / Cutout (later pass) — transparent PNG, one per sponsor, tiered |
| `assets/photo/…` | ImageFrame (later pass) — robot, field and pit photography per the standing direction |
