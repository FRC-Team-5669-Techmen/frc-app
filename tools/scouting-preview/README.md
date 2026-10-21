# Portable scouting review

This is a review entry point for the existing scouting route, not a separate product or deployment. It bundles `src/ScoutingPage.jsx`, its actual components and the existing fictional fixture backend. No live Supabase client is included; CSP rejects network connections. Videos open externally only when the reviewer deliberately follows a link. No Discord messages can be sent.

```sh
npm ci
npm run scouting:preview:check
```

Output: `artifacts/scouting-review/REVIEW.html`. Open it in Chrome/Edge with browser storage enabled. The checkpoint ZIP includes a copy at its root. Fonts and scripts are embedded; there is no installation, server, account login or network dependency. Browser file/security policies may require opening it in a normal browser instead of an attachment viewer.

The review offers Student, Mentor and Parent roles. The first two use fixture identities; Parent shows access denied. Practice records and test changes stay in that browser. This is not production auth, real RLS, real notifications or an acceptance test for venue networking. Do not enter real student/private data.

`check.mjs` executes the compiled artifact under jsdom and fake-indexeddb, asserts all five tab surfaces and role views, and produces a static DOM capture for inspection. It catches broken packaging (including unresolved Vite `import.meta.glob`) but cannot establish browser layout, touch behavior or native IndexedDB reliability. The actual browser suite remains `npm run test:features -- --only scouting`.

The PNG requested during development was rendered from this DOM using WeasyPrint 66.0 with print compatibility CSS. It was labeled a static preview, not a browser screenshot. Chromium was blocked by the execution environment's socket restrictions.
