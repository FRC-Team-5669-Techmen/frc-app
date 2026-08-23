# ProcessPipeline / PipelineStep

`surfaces/ProcessPipeline` - classes `frc-pipeline`, `frc-pipeline-step` - namespace FRC5669DesignSystem

A left-to-right process: design, cut, assemble, wire, test. Chevron-shaped steps; the last one is squared off so the chain reads as finished rather than cut off.

## Copy

- Steps are child components; inside: `slot="title"`, `slot="note"`.

## Rules

- Step numbers come from position, so reordering cannot leave a wrong number.
- States: `default`, `done`, `current`, `blocked`.
- Five steps is the practical ceiling at 4:3.

## Example

```jsx
<ProcessPipeline>
  <PipelineStep state="done"><span slot="title">Design</span><span slot="note">CAD released</span></PipelineStep>
  <PipelineStep state="current"><span slot="title">Assemble</span><span slot="note">On the fixture</span></PipelineStep>
</ProcessPipeline>
```
