// FRC5669DesignSystem — asset registry.
//
// NONE of these files are in the repo yet. Until the file lands, every
// component that needs one renders NOTHING in a deck and a clearly marked empty
// slot, at the correct minimum size, inside /_ds and the dev harness — see the
// discriminator note in components/brand/AssetSlot.jsx. No substitute mark is drawn and nothing resembling either logo
// is generated. When a file arrives, drop it at the path below and set the
// matching ASSETS entry to an imported URL, e.g.
//
//   import sealUrl from './assets/team/5669-Seal.svg'
//   ASSETS.seal = sealUrl
//
// The marks are used AS SUPPLIED: never recolored, rotated, skewed, cropped,
// contained, bordered, or captioned with added text.

export const ASSET_FILES = {
  // Team — from https://frcteam5669.com/outreach/branding
  markGold:   'assets/team/Mark-Gold.svg',
  markWhite:  'assets/team/Mark-White.svg',
  markBlack:  'assets/team/Mark-Black.svg',
  typeGold:   'assets/team/Type-Gold.svg',
  typeWhite:  'assets/team/Type-White.svg',
  typeBlack:  'assets/team/Type-Black.svg',
  seal:       'assets/team/5669-Seal.svg',
  markGuides: 'assets/team/Mark-Guides.svg',
  typeGuides: 'assets/team/Type-Guides.svg',
  // FIRST — from https://www.firstinspires.org/about/brand (dark-ground lockups ship as PNG)
  firstHorizontalReverse: 'assets/first/FIRST-Horizontal-Reverse.png',
  firstVerticalReverse:   'assets/first/FIRST-Vertical-Reverse.png',
  frcHorizontalReverse:   'assets/first/FRC-Icon-Horizontal-Reverse.png',
  frcVerticalReverse:     'assets/first/FRC-Icon-Vertical-Reverse.png',
  ftcHorizontalReverse:   'assets/first/FTC-Icon-Horizontal-Reverse.png',
  ftcVerticalReverse:     'assets/first/FTC-Icon-Vertical-Reverse.png',
  fllHorizontalReverse:   'assets/first/FLL-Horizontal-Reverse.png',
  fllVerticalReverse:     'assets/first/FLL-Vertical-Reverse.png',
  // Season — from https://www.firstinspires.org/resources/library/season-brand-downloads, replaced each January
  seasonArt: 'assets/season/season-lockup.png',
}

// The three team MARKS and the three LOGOTYPES are wired: their bytes were
// compared against the canonical files on the team branding page before
// wiring, and assets/PROVENANCE.json pins each sha256 so a later edit fails
// the audit. They are used AS SUPPLIED — never recolored, rotated, cropped,
// contained or captioned. Everything else below is still an empty, marked slot.
//
// THE SEAL IS DELIBERATELY NOT WIRED. The canonical 5669-Seal.svg published at
// https://frcteam5669.com/assets/logos/seal/svg/5669-Seal.svg carries #ffe623
// in all 71 of its gold declarations, not the published Techmen Gold #FFE629
// that Mark-Gold.svg and Type-Gold.svg both carry. That is a near-gold, and a
// near-gold is exactly what the provenance check exists to refuse, so the file
// was fetched, checked, and NOT adopted. See the `rejected` block in
// assets/PROVENANCE.json. SealMark keeps rendering its marked empty slot.
import markGoldUrl from './assets/team/Mark-Gold.svg'
import markWhiteUrl from './assets/team/Mark-White.svg'
import markBlackUrl from './assets/team/Mark-Black.svg'
import typeGoldUrl from './assets/team/Type-Gold.svg'
import typeWhiteUrl from './assets/team/Type-White.svg'
import typeBlackUrl from './assets/team/Type-Black.svg'

// SEASON ARTWORK IS WIRED. assets/season/season-lockup.png is the FIRST
// Robotics Competition 2027 season logo, BIOCORE presented by Haas, taken
// byte-for-byte from first-biocore-logos.zip on the FIRST season brand
// downloads page (the vertical, full-color, RGB lockup). It is FIRST artwork,
// so the FIRST usage rules apply in full and it is used AS SUPPLIED: never
// recolored, rotated, skewed, cropped, bordered, or combined with added text.
// The slot renders it with object-fit: contain (tokens/image-slot.css), so a
// non-square slot letterboxes it rather than distorting or cropping it. The
// artwork carries its own filled plates, so one file serves every ground and
// no reverse variant is needed. sha256 in assets/PROVENANCE.json.
//
// The path stays generic on purpose: replacing this one file is the whole
// annual reskin, exactly as SeasonLockup documents.
import seasonArtUrl from './assets/season/season-lockup.png'

/** Resolved URLs. Null until the file lands. */
export const ASSETS = {
  markGold: markGoldUrl,
  markWhite: markWhiteUrl,
  markBlack: markBlackUrl,
  typeGold: typeGoldUrl,
  typeWhite: typeWhiteUrl,
  typeBlack: typeBlackUrl,
  seal: null,
  firstHorizontalReverse: null,
  firstVerticalReverse: null,
  frcHorizontalReverse: null,
  frcVerticalReverse: null,
  ftcHorizontalReverse: null,
  ftcVerticalReverse: null,
  fllHorizontalReverse: null,
  fllVerticalReverse: null,
  seasonArt: seasonArtUrl,
}

/**
 * Minimum rendered sizes, in CSS px at 1920.
 * FIRST values are published (Branding & Design Guidelines, digital).
 * Team values are system floors pending Mark-Guides.svg / Type-Guides.svg.
 *
 * `logotype` now carries the REAL aspect of Type-*.svg (1049.669 x 287.139,
 * LOGOTYPE_RATIO below) rather than the 5:1 placeholder that stood in while
 * the slot was empty. The floor stays 24px tall; its width follows from that.
 */
export const MIN_SIZES = {
  firstHorizontal: { height: 30 },
  firstVertical:   { height: 60 },
  programHorizontal: { height: 60 },
  programVertical:   { height: 120 },
  seal:     { width: 48,  height: 48 },
  mark:     { width: 24,  height: 24 },
  logotype: { width: 88, height: 24 },
}

/**
 * Intrinsic aspect of Type-Gold/White/Black.svg, read from their shared
 * viewBox (all three are byte-identical apart from the fill). A logotype slot
 * is height-driven, so this is what turns a height into a width.
 */
export const LOGOTYPE_RATIO = 1049.669 / 287.139

export function assetFor(key) {
  return ASSETS[key] ?? null
}

export function assetFile(key) {
  return ASSET_FILES[key] ?? null
}
