# 8. Release and CI

## CI (`.github/workflows/`)
* `ci.yml` on PRs/push: job `check` (npm ci, typecheck, vitest, build) and job `ui` (Playwright chromium, `test:ui:quick`, `test:settings`, `test:ui:states`, install ffmpeg, `test:video`; uploads `ui-test-out` on failure). Plus `codeql.yml` (analyze). Vercel posts a preview comment; CodeRabbit is skipped.
* Read a failing job: `get_job_logs` with `tail_lines` ~110 and `return_content=true` (small tails return little); the summary lines start with "UI test:".
* `release.yml`: builds the Windows NSIS installer (`Lyra-Setup-<v>.exe`, `.blockmap`, `latest.yml`); `android.yml`: builds `Lyra-Android-<v>.apk`.

## Release procedure (tags cannot be pushed from the cloud session; use the workflow route)
1. Work on the dev branch (`ccr-988f7a52-sj85yz` in the last session), open a PR (use `.github/pull_request_template.md` headings), wait for CI green (`check`, `ui`, `analyze`, CodeQL), **squash-merge**.
2. Bump versions **before** the PR merges: `package.json` + `package-lock.json` (two places) for Windows; `android/app/version.properties` (`versionName`, raise `versionCode`).
3. Dispatch both workflows **on main with `publish=true`** (`actions_run_trigger run_workflow`, inputs `{"publish":"true"}`). GitHub creates the tag and the release itself. Windows becomes "latest" (the desktop auto-updater serves it); Android is created with `--latest=false`. A dash in the **version** (e.g. `0.4.0-beta.1`) means pre-release; the tag name is not used.
4. Verify `v<ver>` has the `.exe`, `.blockmap`, `latest.yml` and `android-v<ver>` has the `.apk` and is not a pre-release; report the links.
5. After a squash merge the dev branch has diverging history: `git fetch origin main && git merge origin/main`, resolve conflicts with `git checkout --ours` (the branch is a superset), commit, push. **Never force-push** (blocked) and do not rewrite history.

## Versioning so far
0.18 vibes -> 0.19 per-vibe layouts/tablet/widget/UI tests -> 0.20 fixed look, share cards, skins, posters, clip cache -> 0.21 per-vibe states, Sketchbook/Glitch/Pop Comic, prefetch -> 0.22 card plates, Stencil/Film Reel, widget palettes, video test, start gate. Android versions run 0.4 -> 0.8 in step.

## Distribution notes
Windows installer is not code-signed (SmartScreen warning, issue #53). Android: Play Protect can block browser installs (website explains workarounds); F-Droid/IzzyOnDroid metadata in `fdroid/`, `fastlane/`, `docs/FDROID.md`, `docs/DISTRIBUTION.md`.

## Commit/PR attribution
Commits end with the session's `Co-Authored-By` and `Claude-Session` trailer lines; PR bodies end with the "Generated with Claude Code" line and session URL (given in the session's system reminder). Do not put model identifiers anywhere in the repo.
