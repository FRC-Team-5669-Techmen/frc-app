import { useLayoutEffect, useRef, useState } from 'react'
import { Cutout } from 'frc5669-design-system'

/** A ring silhouette drawn at runtime in whatever the ground resolves
    --fg-structure to, so the alpha cutout is genuinely filled without a literal
    color entering this file. Same trick the SurfacesDemoCard uses. */
function useInk(w = 220, h = 200) {
  const ref = useRef<any>(null)
  const [src, setSrc] = useState<string | null>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const ink = getComputedStyle(host).getPropertyValue('--fg-structure').trim()
    if (!ink) return
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.5, h * 0.36, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.5, h * 0.15, 0, Math.PI * 2)
    ctx.fill()
    setSrc(c.toDataURL('image/png'))
  }, [])
  return [ref, src] as const
}

export const Grounds = () => {
  const [ref, src] = useInk()
  return (
    <div ref={ref} className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'flex', gap: 56, alignItems: 'flex-end' }}>
      <Cutout ground="shadow" src={src ?? undefined} alt="" width={220} height={200}><span slot="caption">shadow</span></Cutout>
      <Cutout ground="shelf" src={src ?? undefined} alt="" width={220} height={200}><span slot="caption">shelf</span></Cutout>
      <Cutout ground="none" src={src ?? undefined} alt="" width={220} height={200}><span slot="caption">none</span></Cutout>
    </div>
  )
}

/* No captions here: an unfilled slot already carries its own label, and a
   caption under it lands on the marker rather than below it. */
export const EmptySlot = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'flex', gap: 56, alignItems: 'flex-end' }}>
    <Cutout ground="shelf" width={220} height={200} file="gearbox.png" />
    <Cutout ground="none" width={220} height={200} file="sponsor-mark.png" />
  </div>
)
