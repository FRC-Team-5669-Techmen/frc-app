# FirstName

`brand/FirstName` · class `frc-first` · namespace FRC5669DesignSystem

**Load-bearing for legal compliance.** Renders the FIRST name the way the FIRST Branding & Design Guidelines require, so a presenter never has to remember the rule:

- all capitals and italic; weight inherited, so never bolded except inside fully bolded text;
- a superscript ® on **first use per deck**, tracked separately for the `heading` channel and the `body` channel;
- program names handled: `FIRST® Robotics Competition`, `FIRST® Tech Challenge`, `FIRST® LEGO® League` (and the Challenge / Explore / Discover divisions), with LEGO taking its own first-use mark;
- **plural and possessive forms are refused**, never rendered: `FIRST's`, `FIRSTs`, `FIRST Robotics Competitions` produce a fault marker (internal audience) or throw (external audience, where enforcement is mandatory).

## Copy

- The child is the name: `<FirstName>FIRST Robotics Competition</FirstName>`, or the shorthand `program="frc" | "ftc" | "fll" | "first"`. `<FirstName />` alone is the bare word FIRST.
- `channel="heading"` inside a heading; default `body`.

## Scope

Wrap the deck (or a sheet) in `<FirstNameScope audience="internal|external">` to give it its own first-use registry. Without a scope, a page-level registry is used. First use is decided in document order.

## Rules

- Use it for every occurrence of the word in team copy. Plain text `FIRST` bypasses the tracking and the italics.
- Do not style it. The mark and the italics are the rule, not a look.

## Example

```jsx
<h1 className="frc-h1">Welcome to <FirstName channel="heading" /> season</h1>
<p className="frc-body">We compete in the <FirstName program="frc" />.</p>
```
