import { JumpGrid, JumpCard } from 'frc5669-design-system'

export const DeckHub = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <JumpGrid cols={3}>
      <JumpCard href="#brief"><span slot="title">Brief</span><span slot="note">Where the season stands</span></JumpCard>
      <JumpCard href="#roster" state="done"><span slot="title">Roster</span><span slot="note">Who is on what</span></JumpCard>
      <JumpCard href="#quals"><span slot="title">Quals</span><span slot="note">Match review</span></JumpCard>
    </JumpGrid>
  </div>
)

export const SixUp = () => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, maxWidth: 1000 }}>
    <JumpGrid cols={3}>
      <JumpCard href="#safety" state="done" index={1}><span slot="title">Safety</span><span slot="note">Read first</span></JumpCard>
      <JumpCard href="#design" state="done" index={2}><span slot="title">Design</span><span slot="note">What we chose</span></JumpCard>
      <JumpCard href="#build" index={3}><span slot="title">Build</span><span slot="note">Where each part is</span></JumpCard>
      <JumpCard href="#scouting" index={4}><span slot="title">Scouting</span><span slot="note">How we pick</span></JumpCard>
      <JumpCard href="#outreach" index={5}><span slot="title">Outreach</span><span slot="note">FLL and the open house</span></JumpCard>
      <JumpCard href="#sponsors" index={6}><span slot="title">Sponsors</span><span slot="note">Who pays for this</span></JumpCard>
    </JumpGrid>
  </div>
)
