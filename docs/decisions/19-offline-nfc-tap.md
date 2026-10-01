# 19 What should an NFC check-in tap do when the phone has no connection: refuse with a clear message, or queue the tap?
- Raised: 2026-10-01 by the overhaul audit (`docs/OVERHAUL_AUDIT.md`, item 32)
- Status: open
- Default if nobody decides: **unchanged: an offline tap gets whatever the
  browser shows, and nothing is queued.** A session asked to work here refuses
  clearly and never queues ("No connection. Nothing was recorded. Tap again
  when you have signal."), and adds a service-worker navigation fallback so the
  shell always boots.
- Decided: --

## What is actually true right now

- `src/sw.js` registers only `precacheAndRoute`. vite-plugin-pwa adds a
  navigation fallback only in generateSW mode, so the move to injectManifest
  dropped it. Read from source; the offline page itself was not measured.
- An offline deep link such as `/checkin?loc=...` therefore needs the network.
- `CLAUDE.md` says offline is preserved; for navigations it is not.
- A queued write would carry the phone's clock and land out of order, which is
  the class of integrity problem the hours work of 2026-10-01 fixed.

## The options

**A. Refuse clearly (S, the recommendation).**

**B. Queue and sync later (M to L).** Background sync, plus a server that
trusts a device timestamp.

**C. Do nothing.** A student in a dead spot sees a browser error in the shop.
