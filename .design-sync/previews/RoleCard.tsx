import { useLayoutEffect, useRef, useState } from 'react'
import { RoleCard, SubteamBadge, Cutout } from 'frc5669-design-system'

/** A head-and-shoulders silhouette drawn at runtime in whatever the ground
    resolves --fg-structure to, so the FILLED media slot is genuinely filled
    without inventing a color and without standing a team mark in for a member
    photo. Same trick the SurfacesDemoCard uses. */
function useSilhouette(size = 240) {
  const ref = useRef<any>(null)
  const [src, setSrc] = useState<string | null>(null)
  useLayoutEffect(() => {
    const host = ref.current
    if (!host) return
    const ink = getComputedStyle(host).getPropertyValue('--fg-structure').trim()
    if (!ink) return
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = ink
    ctx.beginPath()
    ctx.arc(size / 2, size * 0.36, size * 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(size / 2, size * 0.98, size * 0.32, size * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
    setSrc(c.toDataURL('image/png'))
  }, [])
  return [ref, src] as const
}

export const Default = () => {
  const [ref, portrait] = useSilhouette()
  return (
    <div ref={ref} className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 700 }}>
      <RoleCard mediaFile="rivera-portrait.png">
        <Cutout slot="media" ground="none" src={portrait ?? undefined} alt="" width={160} height={160} />
        <span slot="name">A. Rivera</span>
        <span slot="title">Drive coach, class of 2027</span>
        <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
        <SubteamBadge slot="subteam">Mechanical</SubteamBadge>
        <li slot="cert" data-status="certified" data-safety>Mill</li>
        <li slot="cert" data-status="certified">Bandsaw</li>
        <li slot="cert" data-status="in_progress">Lathe</li>
        <p slot="note">Calls the match and runs the pit checklist before every queue.</p>
      </RoleCard>
    </div>
  )
}

/* Two cards, not six: the grid is what is being shown here, and six rows do not
   fit a card viewport. The filled slot is on the left, the marked EMPTY slot on
   the right, which is the pair worth seeing side by side. */
export const CompactGrid = () => {
  const [ref, portrait] = useSilhouette()
  return (
    <div ref={ref} className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 760 }}>
      <div className="frc-role-grid">
        <RoleCard density="compact" mediaFile="rivera-portrait.png">
          <Cutout slot="media" ground="none" src={portrait ?? undefined} alt="" width={120} height={120} />
          <span slot="name">A. Rivera</span>
          <span slot="title">Drive coach</span>
          <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
          <li slot="cert" data-status="certified" data-safety>Mill</li>
          <p slot="note">Calls the match.</p>
        </RoleCard>
        <RoleCard density="compact" mediaFile="okonkwo-portrait.png">
          <span slot="name">D. Okonkwo</span>
          <span slot="title">Lead programmer</span>
          <SubteamBadge slot="subteam">Programming</SubteamBadge>
          <li slot="cert" data-status="certified">Auto tuning</li>
          <p slot="note">No photo on file yet.</p>
        </RoleCard>
      </div>
    </div>
  )
}
