import { QuoteBlock } from 'frc5669-design-system'

/* attr and role land in ONE figcaption, and the slot helper keeps whatever
   element you wrote — so two spans sit adjacent with nothing between them and
   read as one run-on line. Write the role as a BLOCK element and it takes its
   own line. Recorded in .design-sync/NOTES.md as a component finding. */

export const Senior = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 900 }}>
    <QuoteBlock>
      <span slot="text">They did not hand us a finished robot. They handed us a shop and told us what good work looks like.</span>
      <span slot="attr">Senior, class of 2026</span>
      <div slot="role">Drive coach</div>
    </QuoteBlock>
  </div>
)

export const Mentor = () => (
  <div className="frc-deck frc-ground-paper" style={{ padding: 40, maxWidth: 900 }}>
    <QuoteBlock>
      <span slot="text">The students run the build. My job is to be in the room when the mill is on and to ask better questions than I answer.</span>
      <span slot="attr">Mr. Garza</span>
      <div slot="role">Lead mentor, eleven seasons</div>
    </QuoteBlock>
  </div>
)
