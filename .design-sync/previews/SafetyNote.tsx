import { SafetyNote, Chip } from 'frc5669-design-system'

export const MillRules = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 860 }}>
    <SafetyNote>
      <p>The mill is a two-person tool. Nobody runs it alone, and nobody runs it without a mentor in the shop.</p>
      <li slot="rule">Eye protection from the door, not from the machine.</li>
      <li slot="rule">Long hair tied back, sleeves down, no gloves at the spindle.</li>
      <li slot="rule">Stock clamped before the spindle turns. Every time.</li>
      <Chip slot="ppe">Eye protection</Chip>
      <Chip slot="ppe">Closed shoes</Chip>
      <Chip slot="ppe">Hearing protection</Chip>
    </SafetyNote>
  </div>
)

export const PitSafety = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 860 }}>
    <SafetyNote>
      <p>The pit is a walkway before it is a workshop. Anything on the floor is a trip hazard for somebody carrying a robot.</p>
      <li slot="rule">Battery on the cart or on the charger. Never on the floor.</li>
      <li slot="rule">Robot tethered and disabled before a hand goes inside the frame.</li>
      <Chip slot="ppe">Eye protection</Chip>
      <Chip slot="ppe">Closed shoes</Chip>
    </SafetyNote>
  </div>
)
