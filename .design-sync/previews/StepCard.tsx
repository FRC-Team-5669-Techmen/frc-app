import { StepCard, Step } from 'frc5669-design-system'

export const MillProcedure = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 900 }}>
    <StepCard>
      <Step state="done"><span slot="title">Square the stock</span><span slot="text">Face one side, then the adjacent edge. Deburr before it goes in the vise again.</span></Step>
      <Step state="current"><span slot="title">Locate the datum</span><span slot="text">Edge find both walls, zero the readout, write the offsets on the traveller.</span></Step>
      <Step><span slot="title">Cut the pocket</span><span slot="text">Rough at depth minus 0.020, finish in one pass, then check with the caliper.</span></Step>
    </StepCard>
  </div>
)

export const PitTurnaround = () => (
  <div className="frc-deck frc-ground-field" style={{ padding: 40, maxWidth: 900 }}>
    <StepCard>
      <Step state="done"><span slot="title">Tether and disable</span><span slot="text">Nothing goes inside the frame until the driver station reads disabled.</span></Step>
      <Step state="current"><span slot="title">Swap the battery</span><span slot="text">Log the pack number on the cart sheet so we can retire the weak ones.</span></Step>
      <Step><span slot="title">Match the bumpers</span><span slot="text">Alliance colour on before the queue, not in the queue.</span></Step>
    </StepCard>
  </div>
)
