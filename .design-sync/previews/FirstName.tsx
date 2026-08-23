import { FirstName, FirstNameScope } from 'frc5669-design-system'

export const Usage = () => (
  <FirstNameScope audience="internal">
    <div className="frc-deck frc-ground-squadron frc-audience-internal" style={{ padding: 48, display: 'grid', gap: 16 }}>
      <h2 className="frc-h2" style={{ margin: 0 }}>Welcome to <FirstName channel="heading" /> season</h2>
      <p className="frc-body" style={{ margin: 0 }}>
        Team 5669 competes in the <FirstName>FIRST Robotics Competition</FirstName>. Our{' '}
        <FirstName program="fll" /> teams start in the fall, and the{' '}
        <FirstName program="ftc" /> pathway is under review. A second mention of <FirstName /> carries no mark.
      </p>
    </div>
  </FirstNameScope>
)
