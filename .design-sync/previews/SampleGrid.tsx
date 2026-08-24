import { SampleGrid, Sample } from 'frc5669-design-system'

/* NO slot="caption" here. SampleGrid renders its caption as a child of the
   grid itself, so a caption takes the first CELL and pushes every sample one
   position along, wrapping the last one onto a second row. Recorded in
   .design-sync/NOTES.md as a component finding; until it is fixed, a sample
   set carries its title on the sheet rather than on the grid. */

export const Finishes = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <SampleGrid cols={4}>
      <Sample><span slot="name">6061 bare</span><span slot="note">Shop stock, milled finish</span></Sample>
      <Sample><span slot="name">Anodized gold</span><span slot="note">Vendor lead time two weeks</span></Sample>
      <Sample><span slot="name">Powder black</span><span slot="note">In house, one day cure</span></Sample>
      <Sample><span slot="name">Printed PETG</span><span slot="note">Prototype only</span></Sample>
    </SampleGrid>
  </div>
)

export const ThreeUp = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <SampleGrid cols={3}>
      <Sample><span slot="name">Supplier A</span><span slot="note">Heaviest weave, holds colour</span></Sample>
      <Sample><span slot="name">Supplier B</span><span slot="note">Cheapest, frays at the corners</span></Sample>
      <Sample><span slot="name">Supplier C</span><span slot="note">What we ran last season</span></Sample>
    </SampleGrid>
  </div>
)
