# Button

`core/Button` · class `frc-button` · namespace FRC5669DesignSystem

A click target in the mono face: UPPERCASE, wide tracking, 3px radius, 52px tall (64px large). Variants `primary` (accent fill — gold on SQUADRON/FIELD, bronze ink on paper — with `--accent-fg` text), `secondary` (active hairline, default), `ghost` (no stroke, ash text). Renders an `<a>` when `href` is given.

## Copy

- **Label is the child.** `<Button>Run match</Button>`. Never a `label` prop.
- Icons are inlined Lucide SVGs passed as elements: `icon={<IconPlay />}`, `iconEnd={<IconArrowRight />}`. No emoji.

## Rules

- Click targets may change emphasis. **They may never reveal content.** Base state shows everything.
- Gold appears only as the primary fill (an active state), never as the label color of a secondary or ghost button.
- Use sparingly on a sheet; a deck is not a web page.

## Ground behaviour

Takes every color from the ground aliases. On paper the primary fill becomes bronze ink with paper-colored text; nothing else changes.

## Example

```jsx
<Button variant="primary" icon={<IconPlay />}>Run match</Button>
<Button size="lg" iconEnd={<IconArrowRight />}>Next part</Button>
<Button variant="ghost" href="#roster">Roster</Button>
```
