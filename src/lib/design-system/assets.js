// FRC5669DesignSystem — asset registry.
//
// NONE of these files are in the repo yet. Every component that needs one
// renders a clearly marked empty slot at the correct minimum size until the
// file lands. No substitute mark is drawn and nothing resembling either logo
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
  // Season — team-supplied each January
  seasonArt: 'assets/season/season-lockup.png',
}

/** Resolved URLs. Null until the file lands. */
export const ASSETS = {
  markGold: null,
  markWhite: null,
  markBlack: null,
  typeGold: null,
  typeWhite: null,
  typeBlack: null,
  seal: null,
  firstHorizontalReverse: null,
  firstVerticalReverse: null,
  frcHorizontalReverse: null,
  frcVerticalReverse: null,
  ftcHorizontalReverse: null,
  ftcVerticalReverse: null,
  fllHorizontalReverse: null,
  fllVerticalReverse: null,
  seasonArt: null,
}

/**
 * Minimum rendered sizes, in CSS px at 1920.
 * FIRST values are published (Branding & Design Guidelines, digital).
 * Team values are system floors pending Mark-Guides.svg / Type-Guides.svg.
 */
export const MIN_SIZES = {
  firstHorizontal: { height: 30 },
  firstVertical:   { height: 60 },
  programHorizontal: { height: 60 },
  programVertical:   { height: 120 },
  seal:     { width: 48,  height: 48 },
  mark:     { width: 24,  height: 24 },
  logotype: { width: 120, height: 24 },
}

export function assetFor(key) {
  return ASSETS[key] ?? null
}

export function assetFile(key) {
  return ASSET_FILES[key] ?? null
}
