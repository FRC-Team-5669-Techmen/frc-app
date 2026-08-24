import { ProcessPipeline, PipelineStep } from 'frc5669-design-system'

/* Four steps is the practical ceiling at card width — the fifth crops off the
   right edge, because a pipeline lays its steps out on one row by design. */

export const PartFlow = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <ProcessPipeline>
      <PipelineStep state="done"><span slot="title">Design</span><span slot="note">CAD released</span></PipelineStep>
      <PipelineStep state="done"><span slot="title">Cut</span><span slot="note">Router queue</span></PipelineStep>
      <PipelineStep state="current"><span slot="title">Assemble</span><span slot="note">On the fixture</span></PipelineStep>
      <PipelineStep state="blocked"><span slot="title">Test</span><span slot="note">Needs a field element</span></PipelineStep>
    </ProcessPipeline>
  </div>
)

export const JobLifecycle = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <ProcessPipeline>
      <PipelineStep state="done"><span slot="title">Posted</span><span slot="note">Any member</span></PipelineStep>
      <PipelineStep state="done"><span slot="title">Claimed</span><span slot="note">Certs checked</span></PipelineStep>
      <PipelineStep state="current"><span slot="title">Submitted</span><span slot="note">Awaiting sign-off</span></PipelineStep>
      <PipelineStep><span slot="title">Signed off</span><span slot="note">Mentor or lead</span></PipelineStep>
    </ProcessPipeline>
  </div>
)
