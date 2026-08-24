import { AllianceSplit } from 'frc5669-design-system'

/* Scores are always NUMERALS. A dash or an em-dash renders as a solid bar at
   hero size in the display face, which reads as a rendering fault rather than
   as "no score yet" — an undecided match shows its live score with no outcome
   set instead. */

export const RedWins = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 940 }}>
    <AllianceSplit outcome="red">
      <span slot="red-tag">Red alliance</span>
      <span slot="red-score">88</span>
      <span slot="red-teams">5669 &middot; 1678 &middot; 4322</span>
      <span slot="vs">Qual 42</span>
      <span slot="blue-tag">Blue alliance</span>
      <span slot="blue-score">74</span>
      <span slot="blue-teams">254 &middot; 973 &middot; 1671</span>
    </AllianceSplit>
  </div>
)

export const Undecided = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 940 }}>
    <AllianceSplit>
      <span slot="red-tag">Red alliance</span>
      <span slot="red-score">42</span>
      <span slot="red-teams">5669 &middot; 1678 &middot; 4322</span>
      <span slot="vs">Qual 46, live</span>
      <span slot="blue-tag">Blue alliance</span>
      <span slot="blue-score">38</span>
      <span slot="blue-teams">254 &middot; 973 &middot; 1671</span>
    </AllianceSplit>
  </div>
)
