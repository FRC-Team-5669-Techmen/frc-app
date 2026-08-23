// FRC5669DesignSystem — literal token mirror.
// Mirrors tokens/colors.css and tokens/typography.css as plain strings so the
// /_ds route can prove computed values against them in a live browser and the
// manifest can list them. scripts/design-system/ds-audit.mjs fails when this
// file and the CSS drift. Values are LITERALS here for the same reason they are
// literals in the ground scopes: nothing is allowed to resolve indirectly.

export const NAMESPACE = 'FRC5669DesignSystem'
export const CLASS_PREFIX = 'frc-'
export const VERSION = '1.1.0'

/** The five published team colors, roles fixed. */
export const BRAND = {
  gold:  '#FFE629',   // Techmen Gold. Identity, hero type, hero numerals, LIVE. Never body copy.
  black: '#000000',   // Jet Black. SQUADRON page ground.
  space: '#53565F',   // Space Gray. Structure, inactive strokes, plate edges.
  ash:   '#94989C',   // Ash Gray. Metadata, timestamps, secondary labels.
  white: '#FFFFFF',   // Prism White. Body copy.
}

/** The three ground ramps, as published. */
export const RAMPS = {
  squadron: { bg0: '#000000', bg1: '#0B0C0E', bg2: '#141619', plate: '#1E2126', edge: '#000000', line: 'rgba(148,152,156,0.22)', lineStrong: 'rgba(255,230,41,0.50)' },
  field:    { bg0: '#0E1013', bg1: '#16191E', bg2: '#1E222A', plate: '#272C35', edge: '#05070A', line: 'rgba(148,152,156,0.20)', lineStrong: 'rgba(0,156,215,0.45)' },
  paper:    { paper: '#E9E7E1', paper2: '#DCD9D1', ink: '#14161A', inkDim: '#55595F', lineInk: 'rgba(20,22,26,0.22)', goldInk: '#7A6300' },
}

/** The red partition. Nothing outside it may use a red. */
export const PARTITION = {
  allianceRed:  '#ED1C24',   // FIELD ground only. Alliance data only.
  allianceBlue: '#0066B3',   // FIELD ground only. Alliance data only.
  warn:  '#D98C3F',
  fault: '#B0503C',
  ok:    '#6FA57B',
}

/** Program layer. Chrome only. */
export const PROGRAM = {
  frc: '#009CD7',
  ftc: '#F57E25',
  fll: '#ED1C24',
  fllExplore:  '#00A651',
  fllDiscover: '#662D91',
  fllInk:      '#231F20',
}

/** Season layer default: gold. */
export const SEASON_DEFAULT = '#FFE629'

export const GROUNDS = ['squadron', 'field', 'paper']
export const GROUND_CLASSES = {
  squadron: 'frc-ground-squadron',
  field:    'frc-ground-field',
  paper:    'frc-ground-paper',
}
export const AUDIENCE_CLASSES = {
  internal: 'frc-audience-internal',
  external: 'frc-audience-external',
}

/**
 * The complete semantic alias set, per ground, exactly as declared in
 * tokens/colors.css. Same 35 names in every ground. Literal strings only.
 */
export const GROUND_ALIASES = {
  squadron: {
    '--ground': 'squadron',
    '--bg0': '#000000',
    '--bg1': '#0B0C0E',
    '--bg2': '#141619',
    '--plate': '#1E2126',
    '--edge': '#000000',
    '--line': 'rgba(148,152,156,0.22)',
    '--line-strong': 'rgba(255,230,41,0.50)',
    '--fg': '#FFFFFF',
    '--fg-dim': '#94989C',
    '--fg-structure': '#53565F',
    '--fg-hero': '#FFE629',
    '--accent': '#FFE629',
    '--accent-fg': '#000000',
    '--accent-soft': 'rgba(255,230,41,0.14)',
    '--rim': '#FFE629',
    '--glow': '0 0 18px rgba(255,230,41,0.45), 0 0 48px rgba(255,230,41,0.18)',
    '--glow-box': '0 0 18px rgba(255,230,41,0.35)',
    '--glow-strength': '1',
    '--chrome-bg': '#0B0C0E',
    '--chrome-fg': '#94989C',
    '--live': '#FFE629',
    '--plate-rise': 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.80), 0 2px 0 #000000, 0 8px 16px rgba(0,0,0,0.60)',
    '--well-recess': 'inset 0 2px 4px rgba(0,0,0,0.70), inset 0 -1px 0 rgba(148,152,156,0.10)',
    '--panel-shadow': 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.80), 0 2px 0 #000000, 0 8px 16px rgba(0,0,0,0.60)',
    '--focus': '#FFE629',
    '--selection-bg': 'rgba(255,230,41,0.30)',
    '--tex-line': 'rgba(148,152,156,0.30)',
    '--tex-fill': 'rgba(148,152,156,0.12)',
    '--tex-accent': 'rgba(255,230,41,0.22)',
    '--tex-hazard': 'rgba(255,230,41,0.50)',
    '--tex-led': 'rgba(255,230,41,0.22)',
    '--tex-bloom': 'rgba(255,230,41,0.16)',
    '--tex-hi': 'rgba(255,255,255,0.08)',
    '--tex-shade': 'rgba(0,0,0,0.60)',
  },
  field: {
    '--ground': 'field',
    '--bg0': '#0E1013',
    '--bg1': '#16191E',
    '--bg2': '#1E222A',
    '--plate': '#272C35',
    '--edge': '#05070A',
    '--line': 'rgba(148,152,156,0.20)',
    '--line-strong': 'rgba(0,156,215,0.45)',
    '--fg': '#FFFFFF',
    '--fg-dim': '#94989C',
    '--fg-structure': '#53565F',
    '--fg-hero': '#FFE629',
    '--accent': '#FFE629',
    '--accent-fg': '#000000',
    '--accent-soft': 'rgba(255,230,41,0.12)',
    '--rim': '#FFE629',
    '--glow': '0 0 18px rgba(255,230,41,0.40), 0 0 48px rgba(255,230,41,0.14)',
    '--glow-box': '0 0 18px rgba(255,230,41,0.30)',
    '--glow-strength': '1',
    '--chrome-bg': '#16191E',
    '--chrome-fg': '#94989C',
    '--live': '#FFE629',
    '--plate-rise': 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.70), 0 2px 0 #05070A, 0 8px 16px rgba(0,0,0,0.50)',
    '--well-recess': 'inset 0 2px 5px rgba(0,0,0,0.70), inset 0 -1px 0 rgba(148,152,156,0.10), inset 1px 0 0 rgba(0,0,0,0.40)',
    '--panel-shadow': 'inset 0 2px 5px rgba(0,0,0,0.70), inset 0 -1px 0 rgba(148,152,156,0.10), inset 1px 0 0 rgba(0,0,0,0.40)',
    '--focus': '#FFE629',
    '--selection-bg': 'rgba(0,156,215,0.30)',
    '--tex-line': 'rgba(148,152,156,0.28)',
    '--tex-fill': 'rgba(148,152,156,0.10)',
    '--tex-accent': 'rgba(0,156,215,0.22)',
    '--tex-hazard': 'rgba(255,230,41,0.50)',
    '--tex-led': 'rgba(0,156,215,0.35)',
    '--tex-bloom': 'rgba(255,230,41,0.12)',
    '--tex-hi': 'rgba(255,255,255,0.07)',
    '--tex-shade': 'rgba(0,0,0,0.55)',
  },
  paper: {
    '--ground': 'paper',
    '--bg0': '#E9E7E1',
    '--bg1': '#E9E7E1',
    '--bg2': '#DCD9D1',
    '--plate': '#E9E7E1',
    '--edge': '#DCD9D1',
    '--line': 'rgba(20,22,26,0.22)',
    '--line-strong': 'rgba(122,99,0,0.55)',
    '--fg': '#14161A',
    '--fg-dim': '#55595F',
    '--fg-structure': '#55595F',
    '--fg-hero': '#7A6300',
    '--accent': '#7A6300',
    '--accent-fg': '#E9E7E1',
    '--accent-soft': 'rgba(122,99,0,0.12)',
    '--rim': '#7A6300',
    '--glow': 'none',
    '--glow-box': 'none',
    '--glow-strength': '0',
    '--chrome-bg': '#DCD9D1',
    '--chrome-fg': '#55595F',
    '--live': '#7A6300',
    '--plate-rise': 'inset 0 1px 0 rgba(255,255,255,0.70), inset 0 -1px 0 rgba(20,22,26,0.16), 0 1px 0 rgba(20,22,26,0.22), 0 4px 10px rgba(20,22,26,0.10)',
    '--well-recess': 'inset 0 2px 3px rgba(20,22,26,0.16), inset 0 -1px 0 rgba(255,255,255,0.50)',
    '--panel-shadow': 'none',
    '--focus': '#7A6300',
    '--selection-bg': 'rgba(122,99,0,0.25)',
    '--tex-line': 'rgba(20,22,26,0.22)',
    '--tex-fill': 'rgba(20,22,26,0.08)',
    '--tex-accent': 'rgba(122,99,0,0.22)',
    '--tex-hazard': 'rgba(122,99,0,0.40)',
    '--tex-led': 'rgba(20,22,26,0.16)',
    '--tex-bloom': 'rgba(122,99,0,0)',
    '--tex-hi': 'rgba(255,255,255,0.60)',
    '--tex-shade': 'rgba(20,22,26,0.14)',
  },
}

export const ALIAS_NAMES = Object.keys(GROUND_ALIASES.squadron)

/** Aliases that MUST differ between a dark ground and paper (a match is the freeze bug). */
export const PAPER_MUST_DIFFER = [
  '--ground', '--bg0', '--bg1', '--bg2', '--plate', '--edge', '--fg', '--fg-hero', '--accent', '--accent-fg',
  '--rim', '--glow', '--glow-box', '--glow-strength', '--chrome-bg', '--chrome-fg', '--live', '--focus',
]

/** Type scale at 1920px. */
export const TYPE_SCALE = {
  '--fs-hero': '160px',
  '--fs-display': '112px',
  '--fs-h1': '84px',
  '--fs-h2': '64px',
  '--fs-h3': '40px',
  '--fs-body': '28px',
  '--fs-body-sm': '24px',
  '--fs-label': '20px',
  '--fs-micro': '18px',
}

export const FONTS = {
  '--font-display': { family: 'Space Grotesk', weight: 700, role: 'Hero type, sheet titles, hero numerals, wordmark' },
  '--font-body':    { family: 'Space Grotesk', weight: [400, 500], role: 'All running copy' },
  '--font-mono':    { family: 'Space Mono', weight: [400, 700], role: 'Chrome, labels, metadata, codes, telemetry, timers' },
  '--font-first':   { family: 'Roboto', weight: [400, 700], italic: true, role: 'FIRST-attributed blocks only. Never a fallback for Space Grotesk.' },
}

export const RADII = { chip: '2px', control: '3px', panel: '4px' }

/** Motion vocabulary, as class names. */
export const MOTION = {
  transitions: ['frc-slide-shutter', 'frc-slide-boot', 'frc-slide-banner', 'frc-slide-cut'],
  entrances: ['frc-in-rise', 'frc-in-drop', 'frc-in-left', 'frc-in-right', 'frc-in-fade', 'frc-in-blur', 'frc-in-tracking', 'frc-in-stamp', 'frc-in-zoom', 'frc-in-strike', 'frc-in-flicker'],
  reveals: ['frc-img-wipe', 'frc-img-wipe-down', 'frc-img-iris', 'frc-img-chamfer', 'frc-img-zoom', 'frc-img-kenburns'],
  loops: ['frc-bg-pan', 'frc-scanlines', 'frc-pulse', 'frc-drift', 'frc-shimmer'],
  stagger: ['frc-d1', 'frc-d2', 'frc-d3', 'frc-d4', 'frc-d5', 'frc-d6', 'frc-d7', 'frc-d8'],
}

/** Ambient texture layers, per ground. A separate library from MOTION.loops. */
export const AMBIENT = {
  squadron: ['patch', 'stencil', 'chevron', 'stars', 'rivet', 'bloom'],
  field: ['extrusion', 'tread', 'hazard', 'matrix', 'fieldgrid', 'bracket', 'bloom'],
  paper: ['grid', 'hatch', 'foldline'],
}
