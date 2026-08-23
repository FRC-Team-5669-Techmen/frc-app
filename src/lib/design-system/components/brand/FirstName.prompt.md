# FirstName

`brand/FirstName` · class `frc-first` · namespace FRC5669DesignSystem

**Load-bearing for legal compliance.** Renders the FIRST name the way the FIRST Branding & Design Guidelines require, so a presenter never has to remember the rule:

- all capitals and italic; weight inherited, so never bolded except inside fully bolded text;
- a superscript ® on **first use per deck**, tracked separately for the `heading` channel and the `body` channel;
- program names handled: `FIRST® Robotics Competition`, `FIRST® Tech Challenge`, `FIRST® LEGO® League` (and the Challenge / Explore / Discover divisions), with LEGO taking its own first-use mark;
- **plural and possessive forms are refused**, never rendered: `FIRST's`, `FIRSTs`, `FIRST Robotics Competitions` trip the guard.

## Copy

- The child is the name: `<FirstName>FIRST Robotics Competition</FirstName>`, or the shorthand `program="frc" | "ftc" | "fll" | "first"`. `<FirstName />` alone is the bare word FIRST.
- `channel="heading"` inside a heading; default `body`.

## Scope

Wrap the deck (or a sheet) in `<FirstNameScope>` to give it its own first-use registry. Without a scope, a page-level registry is used. First use is decided in document order.

`audience` on the scope is carried for the deck's own record and is readable through `useFirstNameScope`. **It no longer changes what the guard does.** Enforcement is identical in both modes: there is one guard behaviour in this system, because two behaviours means nobody can predict what a guard does, and the audience that most needs the rule is the audience a thrown error hurts most.

## Rules

- Use it for every occurrence of the word in team copy. Plain text `FIRST` bypasses the tracking and the italics.
- Do not style it. The mark and the italics are the rule, not a look.

## The guard

This rule is enforced in code. A tripped guard **renders a visible rust fault marker and throws only inside the dev harness** (`/_ds`, the capture script, a test) — a guard that throws during a presentation takes the whole deck down in front of the room, and it does it on the external decks that matter most. The marker is not a soft landing: `npm run ds:audit` fails on a fault marker in a template and pre-delivery audit check 40 requires zero markers in any deck called finished, so the guard's real job is done at audit time and its run-time behaviour only decides how badly a miss hurts.

## Example

```jsx
<h1 className="frc-h1">Welcome to <FirstName channel="heading" /> season</h1>
<p className="frc-body">We compete in the <FirstName program="frc" />.</p>
```
