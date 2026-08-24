import { ResultBanner } from 'frc5669-design-system'

/* Write the title as an h3, not a span. The slot helper keeps whatever element
   you wrote and only paints the class onto it, so a span title stays INLINE and
   the note runs on straight after it. A block title puts the note on its own
   line, which is the layout the component is drawn for. */

export const Tones = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, display: 'grid', gap: 20, maxWidth: 860 }}>
    <ResultBanner tone="win"><span slot="tag">Win</span><h3 slot="title">Qualification 42</h3><span slot="note">Red alliance</span><span slot="score">88 - 74</span></ResultBanner>
    <ResultBanner tone="loss"><span slot="tag">Loss</span><h3 slot="title">Quarterfinal 2</h3><span slot="note">Blue alliance</span><span slot="score">61 - 70</span></ResultBanner>
    <ResultBanner><span slot="tag">Rank</span><h3 slot="title">Seeded fourth of 42</h3><span slot="note">Selected first round</span><span slot="score">2.41</span></ResultBanner>
  </div>
)

export const EventSummary = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'grid', gap: 20, maxWidth: 860 }}>
    <ResultBanner tone="win"><span slot="tag">Semifinal</span><h3 slot="title">Advanced to the final</h3><span slot="note">Alliance four</span><span slot="score">2 - 0</span></ResultBanner>
    <ResultBanner tone="loss"><span slot="tag">Final</span><h3 slot="title">Finalist, Los Angeles</h3><span slot="note">Alliance four</span><span slot="score">1 - 2</span></ResultBanner>
  </div>
)
