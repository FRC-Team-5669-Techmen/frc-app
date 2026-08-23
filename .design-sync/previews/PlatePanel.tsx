import { PlatePanel, Eyebrow } from 'frc5669-design-system'

export const Treatments = () => (
  <div
    className="frc-deck frc-ground-squadron"
    style={{ padding: 48, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 32 }}
  >
    <PlatePanel>
      <Eyebrow tone="accent">Auto</Eyebrow>
      <p className="frc-body" style={{ margin: '8px 0 0' }}>The ground chooses the treatment.</p>
    </PlatePanel>
    <PlatePanel treatment="plate" rivets>
      <Eyebrow tone="accent">Plate, riveted</Eyebrow>
      <p className="frc-body" style={{ margin: '8px 0 0' }}>Forced rise with the seam.</p>
    </PlatePanel>
    <PlatePanel treatment="well">
      <Eyebrow tone="accent">Well</Eyebrow>
      <p className="frc-body" style={{ margin: '8px 0 0' }}>Forced recess.</p>
    </PlatePanel>
    <PlatePanel pad="tight">
      <Eyebrow tone="accent">Tight</Eyebrow>
      <p className="frc-body" style={{ margin: '8px 0 0' }}>Less padding.</p>
    </PlatePanel>
  </div>
)
