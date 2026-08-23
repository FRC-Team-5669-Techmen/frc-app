# ResultBanner

`surfaces/ResultBanner` - class `frc-result` - namespace FRC5669DesignSystem

How a match, a qual run or an inspection came out. Tones: `rank`, `win`, `loss`.

## Copy

- `slot="tag"`, `slot="title"`, `slot="note"`, `slot="score"`.

## Rules

- **The outcome is a word in the tag slot**; the color agrees with it rather than replacing it.
- Win is `--ok`, loss is `--fault`. **Never alliance red or blue**: those are alliance identity, and borrowing them for an outcome makes a red alliance win look like a loss on the same sheet.

## Example

```jsx
<ResultBanner tone="win">
  <span slot="tag">Win</span><span slot="title">Qualification 42</span><span slot="score">88 - 74</span>
</ResultBanner>
```
