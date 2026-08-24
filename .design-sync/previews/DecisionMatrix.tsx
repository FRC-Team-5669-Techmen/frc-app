import { DecisionMatrix } from 'frc5669-design-system'

export const IntakeGeometry = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 900 }}>
    <DecisionMatrix weights={[3, 2, 2, 1]} scores={[[4, 3, 5, 4], [5, 2, 3, 2], [2, 5, 4, 5]]}>
      <span slot="caption">Intake geometry, weighted 3 / 2 / 2 / 1</span>
      <span slot="criterion">Cycle time</span>
      <span slot="criterion">Build hours</span>
      <span slot="criterion">Reliability</span>
      <span slot="criterion">Cost</span>
      <span slot="option">Over the bumper</span>
      <span slot="option">Under the bumper</span>
      <span slot="option">Ground pickup</span>
    </DecisionMatrix>
  </div>
)

export const DriveChoice = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 900 }}>
    <DecisionMatrix weights={[3, 3, 1]} scores={[[5, 2, 2], [3, 5, 5]]}>
      <span slot="caption">Drivetrain, weighted 3 / 3 / 1</span>
      <span slot="criterion">Manoeuvrability</span>
      <span slot="criterion">Build hours</span>
      <span slot="criterion">Cost</span>
      <span slot="option">Swerve</span>
      <span slot="option">West coast</span>
    </DecisionMatrix>
  </div>
)
