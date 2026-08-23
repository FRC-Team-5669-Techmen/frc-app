# RoleCard

`surfaces/RoleCard` - class `frc-role` - namespace FRC5669DesignSystem

A member: who they are, which subteams they sit on, what they are certified to run.

## Copy

- `slot="portrait"` (a `Cutout` or a round `ImageFrame`), `slot="name"`, `slot="title"`, `slot="subteam"` repeated (`SubteamBadge` children), `slot="cert"` repeated.

## Rules

- A cert child carries `data-status="certified" | "in_progress"` and optional `data-safety`, which mirrors the app model: `member_skills.status` and `skills.safety_critical`.
- **It takes data as props and children and never queries Supabase.** A deck component that fetched would put an auth dependency on a projector in a gym with no network.
- Subteam names come from `SubteamBadge`, which reads the one shared vocabulary.

## Example

```jsx
<RoleCard>
  <Cutout slot="portrait" ground="none" src={portrait} width={160} height={160} />
  <span slot="name">A. Rivera</span>
  <SubteamBadge slot="subteam">Drive Team</SubteamBadge>
  <li slot="cert" data-status="certified" data-safety>Mill</li>
</RoleCard>
```
