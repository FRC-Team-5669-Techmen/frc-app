---
title: "Reply-To apina@boscotech.edu on all app email"
date: 2026-10-26
branches: [main]
commits: []
migrations: []
subsystems: ["Event family hub", "Standing", "Member application", "Roster and access"]
---

Goal: replies from families land in apina@boscotech.edu instead of the Gmail SMTP
sender mailbox. The From address is unchanged.

## Audit (answered from the tree)

- Senders over denomailer 1.6.0 / smtp.gmail.com: FOUR, not five: `event-family`,
  `notice-mail`, `send-approval-email`, `send-parent-request`. Each now reads
  `EMAIL_REPLY_TO` (default `apina@boscotech.edu`) and passes `replyTo` on every
  send; each header comment names the secret.
- **The claim about `invite-member` was wrong.** It calls
  `admin.auth.admin.inviteUserByEmail`, so Supabase Auth sends that mail through
  the project's own SMTP settings. The function builds no message and cannot set
  a header. Only a comment was added saying so. If invite mail must also carry
  Reply-To, that is a Supabase Dashboard / custom-SMTP matter (Auth > SMTP
  settings has no Reply-To field at the time of writing; not verified), not code.
- No other sender exists under `supabase/functions` (grep for SMTPClient,
  denomailer, smtp, resend, sendgrid, mailgun, nodemailer; `scouting-dispatch`
  and the Discord/push functions send no mail).
- **denomailer 1.6.0 `replyTo`: NOT verified.** deno.land and the module's
  GitHub source were unreachable from this container (proxy 403/404). `replyTo`
  is used from memory of the module's `SendConfig`. If a real send shows no
  Reply-To header, switch to `headers: { 'Reply-To': replyTo }`.

## Checks

- `tests/reply-to-mail.test.js` (13 tests): each of the four functions is loaded
  from its real file under Node, remote imports swapped for fakes, driven down
  its send path; asserts `replyTo` is the default, then the `EMAIL_REPLY_TO`
  value when set, From unchanged, and nothing sent while Gmail is unset. It also
  asserts `invite-member` uses no SMTPClient.
- Mutation proof: removing `replyTo` from all four sends failed 8 of 8 default and
  override tests; restored from a copy.

## Deploy

NOT deployed. This container has no Supabase CLI and no access token, so no
function is live with this change. Redeploy by hand, once per function:
Supabase Dashboard > Edge Functions > the function name > Code tab > paste the
file's content from `supabase/functions/<name>/index.ts` > **Deploy updates**.
Functions: `event-family`, `notice-mail`, `send-approval-email`,
`send-parent-request`. (Not `invite-member`; its behavior is unchanged.) Keep
"Verify JWT" OFF for `event-family` and `notice-mail` as `supabase/config.toml`
pins. Optional secret: `EMAIL_REPLY_TO` under Edge Functions > Secrets.
Button names are from memory of the Dashboard and may differ slightly.
