# 0001 Bring frc-app into conformance with the repo workflow standard, section 2
- Issued: 2026-09-02 (the closeout chat; the exact minute was not recorded in the prompt)
- By: the closeout chat, delivered to Claude Code session
  `https://claude.ai/code/session_0138wV6L8J5dVvfrd8VLJnFy`
- Owns: `.github/workflows/**`, `docs/**` (new), `tools/**` (new), `tests/**` (new),
  `supabase/migrations/**` (new directory, no SQL written), `CLAUDE.md`, `package.json`
  (scripts and devDependencies only), and `README.md` if one is created.
- Migration permitted: no. Highest in supabase/migrations/ at issue: none (the directory
  did not exist; every SQL file in the repo is unnumbered under `supabase/` and `sql/`)
- Status: pushed
- Branch: `claude/repo-standards-conformance-uk5er7` (two commits: `ad98f03` the ledger
  and the integrate rewrite, `e1972d9` the rest)
- Notes: The first entry in this ledger, and the prompt that creates the directory it is
  recorded in. The prompt asked for this entry to be committed and pushed before anything
  else was built. It was, with ONE addition forced by the tree: the `.github/workflows/`
  `integrate.yml` that was live on `main` at `abf7182` is not the shape the prompt
  described (it does not key on `ci.yml`; it is a plain `on: push: claude/**` job that
  runs `npm run build` and, on green, merges the branch into `main` and deletes it, and
  it had already done exactly that once, run 33339016542 on 2026-08-30). Pushing this
  entry with that file still on the branch would have merged the branch into `main`
  immediately, which the prompt forbids. So the first push also carries `integrate.yml`
  rewritten to the `idea-app` shape (`workflow_run` on CI, never pushes `main`). A `push`
  event evaluates the workflow files at the pushed commit, so the old copy on `main` does
  not fire for this branch.

  Deliberately excluded, per the prompt: nothing under `src/`, `supabase/*.sql`, `sql/`,
  `supabase/functions/`, `scripts/discord/`, or `src/lib/design-system/` is changed;
  findings there are reported, not fixed. No SQL is written. No merge to `main`.
