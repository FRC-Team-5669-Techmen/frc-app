# App mail

`supabase/functions/_shared/mail.js` owns `readMailCredentials` and delivery for
every app-controlled notification email. `EMAIL_FROM` is the one Workspace sender
setting. Its mailbox is also the Gmail delegated user (`sub`) and Reply-To. No
route, queued row or caller can supply From, Sender, Reply-To or arbitrary headers.
The production setting must be `Techmen 5669 <apina@boscotech.edu>`.

## Send-path audit

Checked against the tree for job `codex-frc-mail-from`, starting at `5aede08`.

| Path | Existing delivery | Sender after this change |
| --- | --- | --- |
| Event family invites, recovered links, trip reminders, car departures and alerts | `hub_outbox` through `event-family` | Shared mailer |
| General family links | `staff_send_family_link` queues `notice_outbox`, drained by `notice-mail` | Shared mailer |
| Standing, discipline, safety, voided sessions, removal, handbook notices and access-request alerts | `notice_outbox` through `notice-mail` | Shared mailer |
| Feedback replies | `feedback_reply` in 0024 queues `notice_outbox`, through `notice-mail` | Shared mailer |
| Access approval courtesy email | `send-approval-email` | Shared mailer |
| Parent application questionnaire | `send-parent-request` | Shared mailer |
| Sign-out request/approval/return | No separate email sender. Returns in 0024 create an app notice and push; voided-session notices use `notice-mail` | Covered where email already exists |
| Announcements, calendar and week-ahead reminders | Discord/push, no email send in these modules | No email sender to change |
| Staff invitation | `invite-member` calls `auth.admin.inviteUserByEmail` | Supabase Auth custom SMTP settings, separately administered |
| Login and connector sign-in codes | `LoginPage` and `ConnectorPage` call `auth.signInWithOtp` | Supabase Auth custom SMTP settings, separately administered |
| `api/` and connector | No direct mail transport; family-link and feedback tools invoke the existing functions/RPCs | Same shared paths above |

Ledger 0027 already added Reply-To to all four SMTP functions. It did not change
From or add Workspace credentials. Denomailer 1.6.0's published `SendConfig`
confirms `replyTo?: string`; the old history's uncertainty about that field is
resolved by reading that version's source documentation.

## Configuration and fallback

Only the shared reader reads mail environment settings. These are **Supabase
Edge Function secrets**, since the functions execute there, not on Vercel.

| Setting | Meaning |
| --- | --- |
| `EMAIL_FROM` | Bare mailbox or display form. Required for Workspace, with mailbox `apina@boscotech.edu` in production. No separate impersonation setting. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The service account's `client_email` value. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Its PKCS#8 `private_key`, including PEM markers. Actual line breaks and literal `\n` both work. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Existing fallback only, used until all three Workspace settings above are nonempty. |
| `EMAIL_REPLY_TO` | Legacy SMTP override from 0027, defaulting to the school address. Ignored in Workspace mode, where Reply-To always uses `EMAIL_FROM`'s mailbox. |
| `APP_URL` | Existing link base; unchanged. |
| `NOTICE_MAIL_SECRET`, `EVENT_HUB_CRON_SECRET` | Existing invocation secrets; unchanged. |

Missing or partial Workspace configuration preserves today's Gmail SMTP behavior,
including the legacy `EMAIL_FROM` override. No available credential preserves the
existing skip behavior and leaves queues untouched. **During this explicitly
requested transition the old Gmail sender can still appear.** Removing that
exception requires finishing configuration, not a code change.

Complete Workspace configuration selects Gmail API exclusively, even when legacy
SMTP credentials remain. A consumer Gmail From, invalid header, bad key, denied
delegation or failed Gmail request cannot fall back to the old account. A fixed
error code reaches existing failure/outbox handling. The shared transport makes
one attempt per send call. Existing queue behavior is unchanged: the event hub
returns a failed send to pending until its third attempt and reclaims a sending
row after 15 minutes; notice mail excludes rows stamped with an error. Thus an
ambiguous event send can still be retried by the queue and duplicated. This is
not an exactly-once delivery guarantee. Fix configuration and review failed rows
through the existing staff process before requesting further delivery.

The shared module signs an RS256 assertion (one hour maximum), requests only
`https://www.googleapis.com/auth/gmail.send`, and posts MIME as base64url `raw` to
`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`. Tokens are reused
within a batch and renewed with a 60-second margin. Requests time out after 15
seconds. Provider error bodies, keys, assertions and tokens are never logged or
returned. Plain text, Unicode subjects and multipart text/HTML are supported.

## Mr. Pina's setup, in order

Only the administrator performs these steps. Never send credentials to an agent,
chat, repository, issue or ledger. This task does not retrieve or configure them.

1. **Workspace mailbox:** in Google Admin > Directory > Users, confirm
   `apina@boscotech.edu` is a real, licensed Workspace user with Gmail enabled.
   Under Apps > Google Workspace > Gmail > Service status, enable Gmail for that
   user's organizational unit if necessary. Use this mailbox, not an alias or a
   service account address, as the sender.
2. **Google Cloud:** select the school's approved project. Under APIs & Services
   > Library, enable **Gmail API**. Under IAM & Admin > Service Accounts, create
   `frc-app-mail` (display name `FRC app notification mail`). No project IAM role
   is needed merely to send delegated Gmail. In the service account's details,
   enable Google Workspace domain-wide delegation where offered and copy its
   **numeric OAuth 2 Client ID**, not its email or project ID. Under Keys > Add
   key > Create new key, choose **JSON**. Keep that download private; the admin
   supplies only its `client_email` and `private_key` to step 4. If school policy
   prohibits service-account keys or delegation, the Workspace admin must approve
   an alternative, such as the relay below.
3. **Workspace delegation:** a super administrator opens Security > Access and
   data control > API controls > Manage Domain Wide Delegation > Add new.
   **Client ID** = step 2's numeric client ID. **OAuth scopes (comma-delimited)**
   = exactly `https://www.googleapis.com/auth/gmail.send`. Click **Authorize**.
   Complete a second super-admin approval if the school enables multi-party
   approval. Allow propagation (Google documents up to 24 hours).
4. **Supabase runtime:** in the FRC project's Edge Functions > Secrets, set
   `EMAIL_FROM` = `Techmen 5669 <apina@boscotech.edu>`,
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` = the JSON's `client_email`, and
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` = the JSON's `private_key`. Keep existing
   invocation/link settings and the old SMTP pair during staged setup. The
   complete trio activates Workspace automatically; there is no mode flag.
5. **Deploy all four functions with their shared dependency**, from this repo
   after the change lands, using the admin's existing Supabase CLI login:

   ```sh
   npx supabase functions deploy event-family --project-ref <frc-project-ref> --no-verify-jwt
   npx supabase functions deploy notice-mail --project-ref <frc-project-ref> --no-verify-jwt
   npx supabase functions deploy send-approval-email --project-ref <frc-project-ref>
   npx supabase functions deploy send-parent-request --project-ref <frc-project-ref>
   ```

   These are multi-file functions now. Include `_shared/mail.js`; pasting only
   `index.ts` into an editor is insufficient. Preserve JWT verification OFF for
   `event-family` and `notice-mail`, ON for the other two. `migrate.yml` applies
   database migrations only; no migration is part of this job and it does not
   deploy these functions.
6. **Vercel:** there are **no new mail environment variables or credentials to
   set** in the `frc-app` project. A main push deploys the frontend/API as usual;
   it does not deploy Supabase functions or propagate their secrets. Keep existing
   `VITE_SUPABASE_URL` and client key settings. Never add the service-account key
   under a `VITE_` name or copy it into Vercel for this implementation.
7. **Supabase Auth, for invitations and OTP:** separately verify Authentication
   > Email > SMTP Settings (the custom SMTP page). Enable custom SMTP, set
   **Sender email** = `apina@boscotech.edu`, **Sender name** = `Techmen 5669`, and
   use the school's approved SMTP credentials/relay. The Gmail API service-account
   key is not an SMTP password and these app settings cannot change Auth mail.
   See the relay alternative below. Auth has no Reply-To option in the documented
   SMTP configuration; keeping its From on the school mailbox directs ordinary
   replies there. A distinct Reply-To header for Auth mail would need separate
   supported Auth mail customization.
8. **Admin verification and cleanup:** send a controlled test through each of
   the four app paths and an Auth invite/OTP to an admin-owned test inbox. Check
   full headers: From and Reply-To school mailbox, no personal Gmail Sender or
   Return-Path identity, successful SPF/DKIM/DMARC. Also inspect queue outcomes.
   After all functions pass, remove the legacy `GMAIL_USER` and
   `GMAIL_APP_PASSWORD` secrets to end the transitional fallback. Retain the key
   only in approved secret storage and follow school rotation policy.

## SMTP relay alternative (documented, not implemented for app mail)

Google Admin > Apps > Google Workspace > Gmail > Routing > **SMTP relay service**:
create `FRC app relay`; **Allowed senders** = **Only registered Apps users in my
domains**; **Authentication** = **Require SMTP Authentication**; **Encryption** =
**Require TLS encryption**. Client host = `smtp-relay.gmail.com`, port = `587`,
STARTTLS required, SMTP username = `apina@boscotech.edu`, password = an admin-issued
app password only if school policy permits. Sender = `apina@boscotech.edu`.
Choose authenticated relay rather than allowlisting shared dynamic serverless IPs.
Confirm the deployed SMTP client supports STARTTLS with the selected settings.

This can supply Supabase Auth's custom SMTP host, port, username and password.
App notification code currently supports delegated Gmail API and its **existing**
`smtp.gmail.com:465` legacy fallback; relay support would require an explicit
transport change. If the school forbids both app passwords and service-account
keys, its admin must choose an approved mail provider/authentication mechanism.

## Verification and sources

`tests/reply-to-mail.test.js` drives every real mail entrypoint with faked remote
dependencies, including legacy delivery, Workspace selection and provider refusal.
`tests/mail-transport.test.js` signs/verifies a disposable RSA key, checks the
delegated user, MIME, partial setup, token reuse/renewal, header injection and
sanitized failures. Its three permissive mutants leak From, leak Reply-To and
impersonate the wrong user; the same oracle rejects all three. Tests never send
real email or use real member identities. Browser fixtures prove UI behavior,
not deployed email headers or Workspace authorization.

Source documentation checked during implementation:

- [Google service accounts and domain-wide delegation](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending) and [send-only scope](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Workspace delegation administration](https://support.google.com/a/answer/162106)
- [Google Workspace SMTP relay](https://support.google.com/a/answer/2956491)
- [Supabase secrets](https://supabase.com/docs/guides/functions/secrets), [deployment](https://supabase.com/docs/guides/functions/deploy), and [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Denomailer 1.6.0 SendConfig](https://github.com/EC-Nordbund/denomailer/blob/1.6.0/README.md#send)
