import { createContext, useContext } from 'react'
import { cx } from '../cx.js'

/**
 * AssetSlot — internal. The clearly marked empty slot every mark-bearing
 * component renders until its file lands. Filled, it is the supplied artwork
 * and nothing else: no border, no tint, no containing shape.
 *
 * UNFILLED, IT RENDERS NOTHING EXCEPT WHERE SOMETHING ASKS FOR THE PLACEHOLDER.
 *
 * The placeholder is a WORKBENCH affordance. It exists so the person building
 * the system can see, at a glance, which files have not landed. In a deck it is
 * the opposite of useful: a cover sheet that has no seal file shipped a 200x200
 * dashed "5669-SEAL.SVG" box into the room, because CoverSheet hardcodes
 * SealMark and ASSETS.seal is null by design. Nobody asked for that box, no
 * call site could suppress it, and it read as a broken deck.
 *
 * THE DISCRIMINATOR IS AN OPT-IN CONTEXT, DEFAULTING TO OFF, AND THE DEFAULT IS
 * THE WHOLE POINT. Three candidates were considered and rejected:
 *
 *   • A prop (`placeholder`) — refused by construction. Every mark component
 *     would have to accept it and forward it, and every deck author would have
 *     to remember NOT to pass it. The correct behaviour must be the one you get
 *     by writing nothing.
 *   • isHarnessMode() from guard.jsx — wrong axis and actively unsafe here. It
 *     controls whether a GUARD THROWS, and /_ds toggles it at run time (the
 *     refusal sections flip it, a capture run turns it off). Reading it would
 *     make empty slots disappear from the specimen the moment someone flipped
 *     that switch, and out of every captured PNG — exactly the visibility the
 *     specimen exists to provide.
 *   • A `.frc-deck` ancestor in CSS — cannot discriminate: the /_ds route's own
 *     root IS `.frc-deck` (it has to be, so components resolve their aliases).
 *     It would also only hide the box, leaving the markup in the deck.
 *
 * So: a deck renders nothing because it provides nothing, including a deck
 * assembled on the Claude Design canvas that mounts no provider of ours at all.
 * /_ds and the dev harness wrap themselves in <AssetSlotPlaceholders> and see
 * every empty slot exactly as before.
 */

const PlaceholderContext = createContext(false)

/**
 * Show the marked empty slot for every unfilled AssetSlot inside. The specimen
 * route (both the page and the capture view) is the only thing that mounts it.
 */
export function AssetSlotPlaceholders({ children }) {
  return <PlaceholderContext.Provider value>{children}</PlaceholderContext.Provider>
}

export function AssetSlot({
  src,
  file,
  width,
  height,
  minWidth,
  minHeight,
  alt = '',
  label,
  first = false,
  className,
  style,
  ...rest
}) {
  const placeholders = useContext(PlaceholderContext)
  const filled = Boolean(src)
  if (!filled && !placeholders) return null
  const tiny = !filled && ((width != null && width < 96) || (height != null && height < 40))
  const name = label || (file ? file.split('/').pop() : 'asset')
  return (
    <span
      className={cx('frc-slot', first && 'frc-slot-first', tiny && 'frc-slot-tiny', className)}
      style={{ width, height, minWidth, minHeight, ...style }}
      data-asset={file}
      data-filled={filled ? '' : undefined}
      title={filled ? undefined : `Empty slot — expected ${file}`}
      {...rest}
    >
      {filled ? (
        <img src={src} alt={alt} />
      ) : (
        <span className="frc-slot-label">
          {name}
          {width != null && height != null ? <small>{`${width} × ${height}`}</small> : null}
        </span>
      )}
    </span>
  )
}
