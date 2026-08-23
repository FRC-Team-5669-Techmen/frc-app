import { HudFrame } from 'frc5669-design-system'

export const Diagram = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 48 }}>
    <HudFrame label="Fig 3 — drive base" readout="1:1 scale">
      <svg viewBox="0 0 640 240" width="640" height="240" aria-hidden="true" style={{ display: 'block', color: 'var(--fg-dim)' }}>
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="40" y="40" width="560" height="160" rx="4" />
          <line x1="40" y1="120" x2="600" y2="120" strokeDasharray="8 8" />
          <circle cx="120" cy="120" r="40" />
          <circle cx="520" cy="120" r="40" />
          <line x1="320" y1="40" x2="320" y2="200" />
        </g>
      </svg>
    </HudFrame>
  </div>
)
