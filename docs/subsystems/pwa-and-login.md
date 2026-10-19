# PWA and login

Moved verbatim from `CLAUDE.md` (The subsystems) on 2026-10-19, so `CLAUDE.md` stays short. `CLAUDE.md` links here; keep this file current in the same commit as any change to what it describes.

- Installable PWA, OTP + Google OAuth login.

- Login screen (`LoginPage.jsx`) routes by audience: "Continue with school account" (Google, org-internal `@boscotech.edu`) for students/mentors; an email sign-in-code path labeled "parents & guests" so non-org users don't hit Google's org_internal block. The Google OAuth consent screen is Internal by design — external users must use the email path.
