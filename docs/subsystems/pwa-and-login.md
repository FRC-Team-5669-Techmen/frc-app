# PWA and login

Moved verbatim from `CLAUDE.md` (The subsystems) on 2026-10-19, so `CLAUDE.md` stays short. `CLAUDE.md` links here; keep this file current in the same commit as any change to what it describes.

- Installable PWA, OTP + Google OAuth login.

- Login screen (`LoginPage.jsx`) routes by audience: "Continue with school account" (Google, org-internal `@boscotech.edu`) for students/mentors; an email sign-in-code path labeled "parents & guests" so non-org users don't hit Google's org_internal block. The Google OAuth consent screen is Internal by design — external users must use the email path.

- Scouting has a narrow offline entry for a previously prepared account and event. `src/scouting/offlineIdentity.js` stores no tokens or server permissions. The app start URL can reopen that prepared event offline, while all online auth/approval gates continue to apply. Only `/` and `/scouting` navigations receive the offline app shell; API/connector routes do not. See `docs/subsystems/scouting.md` and `tools/e2e/scouting-pwa.mjs`.
