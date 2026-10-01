# 41 Is the dashboard's gold-filled Check Out button the deliberate exception to "gold is never a surface fill"?
- Raised: 2026-10-01 by the overnight session (its verification pass)
- Status: open
- Default if nobody decides: **keep the fill.** Check Out is the one action a
  student must find instantly, and the check-out path must not change look
  without a reason.
- Decided: --

## What is actually true right now

- `CLAUDE.md` says large primary actions are a gold label and a gold border on
  the dark plate, with the gold fill kept for hover and focus.
- The dashboard's Check Out (`.mb-checkout` in `src/HomePage.css`) is filled
  with `--gold-dim` and brightens on hover, and its label colour is a raw hex
  (`#0A0B0D`) rather than a token. This predates 2026-10-01.
- The plate keeps gold-filled keys as a flat gold face (`docs/SHAPES.md`).

## The options

**A. Keep the fill, and record it in `CLAUDE.md` as the exception (the
default).** Moving the raw hex to a token is safe either way.

**B. Make it an outline like the other large actions.** Consistent with the
rule; the most-used button on the dashboard gets quieter.
