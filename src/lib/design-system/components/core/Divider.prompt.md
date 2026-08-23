# Divider

`core/Divider` · class `frc-divider` · namespace FRC5669DesignSystem

The rule between blocks. Renders BOTH a hairline and a chevron rail; the ground scope shows one in CSS. **Chevrons are the SQUADRON rule element and replace the generic divider on that ground.** FIELD and paper get a 1px hairline.

## Props (no copy)

- `variant="auto"` (default) lets the ground choose. `"line"` or `"chevron"` forces one.
- `strong` uses the active hairline (`--line-strong`).
- `tone` colors the chevron form: `accent` | `dim` | `structure`.

## Rules

- One divider between sections, not after every paragraph. Hairlines separate, plates give depth.
- Never draw a divider by hand with a border; use this so the SQUADRON rule holds everywhere.

## Example

```jsx
<Divider />
<Divider variant="line" strong />
```
