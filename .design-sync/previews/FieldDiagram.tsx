import { FieldDiagram } from 'frc5669-design-system'

/* Zone geometry is STRUCTURE, not copy — nobody reads a point list aloud — so
   it stays an array prop while every label is a child. The alliance partition
   resolves only inside frc-ground-field, which is why both cards sit on it. */
const ZONES = [
  { id: 'red-source', alliance: 'red', points: '0,0 300,0 300,300 0,300', at: [9, 19] },
  { id: 'red-amp', alliance: 'red', points: '0,500 300,500 300,800 0,800', at: [9, 81] },
  { id: 'neutral', points: '620,0 980,0 980,800 620,800', at: [50, 50] },
  { id: 'blue-source', alliance: 'blue', points: '1300,0 1600,0 1600,300 1300,300', at: [91, 19] },
  { id: 'blue-amp', alliance: 'blue', points: '1300,500 1600,500 1600,800 1300,800', at: [91, 81] },
]

export const FullField = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 900 }}>
    <FieldDiagram zones={ZONES} viewBox="0 0 1600 800" grid={8}>
      <span slot="zone" data-zone="red-source">Red source</span>
      <span slot="zone" data-zone="red-amp">Red amp</span>
      <span slot="zone" data-zone="neutral">Neutral zone</span>
      <span slot="zone" data-zone="blue-source">Blue source</span>
      <span slot="zone" data-zone="blue-amp">Blue amp</span>
      <span slot="key" className="frc-fd-key frc-fd-key-red">Red side</span>
      <span slot="key" className="frc-fd-key frc-fd-key-blue">Blue side</span>
      <span slot="key" className="frc-fd-key">Neutral</span>
    </FieldDiagram>
  </div>
)

export const AutoPaths = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 900 }}>
    <FieldDiagram
      zones={[
        { id: 'start', alliance: 'red', points: '80,300 380,300 380,500 80,500', at: [14, 50] },
        { id: 'centerline', points: '760,0 840,0 840,800 760,800', at: [50, 12] },
        { id: 'far', alliance: 'blue', points: '1220,300 1520,300 1520,500 1220,500', at: [86, 50] },
      ]}
      viewBox="0 0 1600 800"
      grid={8}
    >
      <span slot="zone" data-zone="start">Start, wall side</span>
      <span slot="zone" data-zone="centerline">Centerline</span>
      <span slot="zone" data-zone="far">Far pickup</span>
      <span slot="key" className="frc-fd-key frc-fd-key-red">Ours</span>
      <span slot="key" className="frc-fd-key frc-fd-key-blue">Contested</span>
    </FieldDiagram>
  </div>
)
