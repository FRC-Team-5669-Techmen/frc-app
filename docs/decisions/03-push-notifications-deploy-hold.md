# 03 Web push is built and on hold. When does it go live?
- Raised: 2026-09-02 by the closeout chat, from a hold first recorded 2026-06-16
- Status: open
- Default if nobody decides: **it stays on hold, and the hold is self-enforcing.**
  `private.push_config.edge_base_url` is null, so the trigger and the cron
  no-op. Nothing degrades while it waits and nobody has to remember anything.
- Decided: --

## What is actually true right now

The feature is complete and unshipped. From `supabase/push_notifications.sql`,
`supabase/notification_triggers.sql` and `supabase/functions/`:

- **Built**: `push_subscriptions` with own-row RLS,
  `profiles.notification_prefs` (master switch, per-category toggles, quiet
  hours 21:00-07:00 America/LA), `notifications_sent` as a dedupe ledger, the
  `send-push` and `cron-notify` Edge Functions, and the triggers behind task
  sign-off, event reminders, schedule changes (series-coalesced), skill
  sign-off, check-in reminders and the parent daily digest.
- **Not done, and each is a real step**: VAPID keys generated and set
  (`VITE_VAPID_PUBLIC_KEY` on the frontend; `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SECRET` as function secrets); the
  two functions deployed with `--no-verify-jwt` (already pinned in
  `supabase/config.toml`); and the `private.push_config` row filled in.
- **The hold is a null column, not a comment.** Until `edge_base_url` is set,
  every trigger and cron path is a no-op. That is also the pause switch if it
  ever needs pulling after launch.
- **Two prefs keys exist with no feature behind them** and their toggles are
  hidden in `NotificationsPanel`: `job_assignment` and `announcements`.
- The Discord calendar poster was deliberately given its OWN config table
  (`private.discord_calendar_config`) rather than sharing `push_config`,
  precisely so that shipping one would not force shipping the other.

## The options

**A. Name a date.** Push is the difference between a task sign-off a student
finds out about that evening and one they find out about next Tuesday. The work
is done; what is left is roughly an hour of key generation, secret setting and
one row.

**B. Stay on hold indefinitely.** Free today. The cost is not zero and it
compounds quietly: this code has not run against a real subscription, and every
month it sits, the surrounding schema moves under it. The `job_assignment` and
`announcements` toggles are already hidden for want of a feature.

**C. Ship it to staff only first.** Not currently expressible -- the prefs model
is per-member with category defaults, not per-role. It would need a gate in
`cron-notify` and in the trigger, which is real work rather than a config
choice.

## Worth knowing before answering

Sending a first push to every member at once is the kind of thing that is best
done on a day when the person who can turn it off is awake. The quiet-hours
default (21:00-07:00 Pacific) and the dedupe ledger both exist to limit the blast
radius, and neither has been exercised against a live subscription.
