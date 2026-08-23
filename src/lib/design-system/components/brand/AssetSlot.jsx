import { cx } from '../cx.js'

/**
 * AssetSlot — internal. The clearly marked empty slot every mark-bearing
 * component renders until its file lands. Filled, it is the supplied artwork
 * and nothing else: no border, no tint, no containing shape.
 */
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
  const filled = Boolean(src)
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
