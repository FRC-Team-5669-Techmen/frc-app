import { cx } from '../cx.js'
import { slotted } from '../slots.jsx'
import { eyebrowClass } from '../core/Eyebrow.jsx'
import { DeckFooter } from '../brand/DeckFooter.jsx'

/** The four transitions. There is no fifth, and a pattern may not invent one. */
export const TRANSITIONS = {
  shutter: 'frc-slide-shutter',
  boot: 'frc-slide-boot',
  banner: 'frc-slide-banner',
  cut: 'frc-slide-cut',
  none: null,
}

/**
 * Sheet - the frame every one of the twenty-six patterns is built on. Internal:
 * decks compose PATTERNS, never this.
 *
 * It does four things and nothing else.
 *
 * 1. GROUND AND AUDIENCE ARE INHERITED. This element never carries a ground or
 *    an audience class, and no pattern branches on either. A sheet renders on
 *    SQUADRON, FIELD and PAPER unchanged; if a layout cannot survive all three,
 *    the layout is wrong, not the ground.
 * 2. It applies the default TRANSITION for the pattern role and lets a deck
 *    override it per instance.
 * 3. It stacks any AMBIENT layers the author asked for, behind the content and
 *    clipped out of the footer rail band, so a FIRST mark is never on texture.
 * 4. It renders the FOOTER RAIL, which is what puts 5669 on every sheet -
 *    the team identification that permitted use of a FIRST mark requires.
 *    `footer={false}` is for the hub sheet, the one sheet the format exempts.
 *
 * Nothing here is ever hidden in a base state.
 */
export function Sheet({
  kind,
  transition = 'shutter',
  label,
  screenLabel,
  ambient = [],
  tex,
  footer = {},
  slots = {},
  active = false,
  as: Tag = 'section',
  className,
  style,
  children,
  ...rest
}) {
  const layers = [].concat(ambient).filter(Boolean)
  const footerNode = slots.footer
    ? slots.footer
    : footer === false
      ? null
      : <DeckFooter {...(footer && typeof footer === 'object' ? footer : {})} />
  return (
    <Tag
      className={cx('frc-sheet', TRANSITIONS[transition] ?? TRANSITIONS.shutter, kind && `frc-sheet-${kind}`, className)}
      data-label={label}
      data-screen-label={screenLabel ?? label}
      data-deck-active={active ? '' : undefined}
      style={tex != null ? { '--tex': tex, ...style } : style}
      {...rest}
    >
      {layers.map((name) => <div key={name} className={cx('frc-ambient', `frc-ambient-${name}`)} aria-hidden="true" />)}
      <div className="frc-sheet-body">{children}</div>
      {footerNode}
    </Tag>
  )
}

/**
 * SheetHead - eyebrow, title, lede. The eyebrow is the real Eyebrow component
 * wrapped around the author's own element, so the chrome comes from the
 * component and the copy stays exactly where it was typed.
 *
 * The title is deliberately NOT StencilTitle: a sheet title is --fg, and gold
 * on every heading in a deck is how gold stops meaning "this team". Patterns
 * whose subject IS identity (cover, section, statement, award, season) use
 * StencilTitle on purpose.
 */
export function SheetHead({ slots = {}, className }) {
  if (!slots.eyebrow && !slots.title && !slots.lede) return null
  return (
    <header className={cx('frc-sheet-head', className)}>
      {slotted(slots.eyebrow, eyebrowClass({ tone: 'accent' }), 'p')}
      {slotted(slots.title, 'frc-sheet-title', 'h2')}
      {slotted(slots.lede, 'frc-sheet-lede', 'p')}
    </header>
  )
}
