import { DeckStage, DeckSteps, Card, Eyebrow, StencilTitle } from 'frc5669-design-system'

// DeckSteps renders nothing, so — like DeckStage — it is shown by EFFECT.
//
// On mount it enters the active sheet going FORWARD, which is step 1: the first
// item is revealed and the rest are pending. Pending items keep their space
// (visibility, not display), so nothing reflows as the presenter steps. The
// paired cell is the SAME four cards on a sheet that did NOT opt in — no
// `data-step-group`, so DeckSteps writes no `data-step` and the sheet is whole.
// That pair is the whole contract: pacing is opt-in per sheet, and a sheet that
// says nothing is untouched.
//
// The deck is real, because DeckSteps guards on a real one: it needs a
// `.frc-stage`, a `DeckStage` on the same deck, and an active sheet to drive.
// So the sheet is mounted at its true 1920 x 1440 and the STAGE is scaled down
// to the card, exactly as the sheet-pattern previews do — deck type is drawn for
// that surface and clips at card size. The section is hand-written rather than a
// sheet pattern so it carries no `frc-slide-*` class: no transition is armed and
// the card shows the guaranteed base state under any capture timing.
//
// nav={false} on both: an embedded deck must not swallow the page's arrow keys.

const S = 0.48

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron frc-audience-internal" style={{ display: 'inline-grid' }}>
    <div style={{ width: Math.round(1920 * S), height: Math.round(1440 * S), overflow: 'hidden' }}>
      <DeckStage nav={false} fit={false} thumbs={false} />
      <DeckSteps nav={false} />
      <div className="frc-stage" data-aspect="4:3" style={{ transform: `scale(${S})`, transformOrigin: '0 0' }}>
        {children}
      </div>
    </div>
  </div>
)

const CARDS = [
  ['Drivetrain', 'Welded, belted, wired. Driving on the practice carpet since Tuesday.'],
  ['Intake', 'Rev two is on the bench. Rollers swapped, plate still on the mill.'],
  ['Shooter', 'Waiting on rollers. Hood geometry is settled and the mount is cut.'],
  ['Climber', 'Geometry under review. Two proposals, decision Wednesday.'],
]

const Cards = () => (
  <>
    {CARDS.map(([title, body]) => (
      <Card key={title}>
        <span slot="title">{title}</span>
        <p className="frc-card-body">{body}</p>
      </Card>
    ))}
  </>
)

const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 48, alignContent: 'start' } as const

export const Paced = () => (
  <Deck>
    <section className="frc-sheet frc-ground-squadron" data-deck-active>
      <div className="frc-sheet-body">
        <div className="frc-sheet-head">
          <Eyebrow tone="accent">Opted in — entered forward, step 1 of 4</Eyebrow>
          <StencilTitle as="h3" size="h1">Where the robot is</StencilTitle>
        </div>
        <div data-step-group style={grid}><Cards /></div>
      </div>
    </section>
  </Deck>
)

export const NotOptedIn = () => (
  <Deck>
    <section className="frc-sheet frc-ground-squadron" data-deck-active>
      <div className="frc-sheet-body">
        <div className="frc-sheet-head">
          <Eyebrow tone="accent">No opt-in — the whole sheet, as before</Eyebrow>
          <StencilTitle as="h3" size="h1">Where the robot is</StencilTitle>
        </div>
        <div style={grid}><Cards /></div>
      </div>
    </section>
  </Deck>
)
