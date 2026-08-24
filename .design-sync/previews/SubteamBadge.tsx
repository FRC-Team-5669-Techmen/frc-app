import { SubteamBadge } from 'frc5669-design-system'

const Deck = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron" style={{ padding: 40, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
)

export const Vocabulary = () => (
  <Deck>
    <SubteamBadge>Mechanical</SubteamBadge>
    <SubteamBadge>Electrical</SubteamBadge>
    <SubteamBadge>Programming</SubteamBadge>
    <SubteamBadge>CAD</SubteamBadge>
    <SubteamBadge>Field &amp; Pit</SubteamBadge>
    <SubteamBadge>Strategy and Scouting</SubteamBadge>
  </Deck>
)

export const Lead = () => (
  <Deck>
    <SubteamBadge lead>Drive Team</SubteamBadge>
    <SubteamBadge lead>Management</SubteamBadge>
    <SubteamBadge>Media</SubteamBadge>
  </Deck>
)
