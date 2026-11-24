# Where to list Lyra

Ordered by effort vs. audience. "You" = needs the maintainer's account; "Ready" = files are in this repo.

## Windows
| Place | Audience | Status |
|---|---|---|
| **winget** (`winget install DhruvHarani1.Lyra`) | Everyone on Windows 10/11, built in | Manifest ready in `packaging/winget`. Submit: `winget install wingetcreate`, then `wingetcreate submit packaging/winget/manifests/d/DhruvHarani1/Lyra/0.5.0` (needs a GitHub token with `public_repo`, you sign the CLA once). |
| **Scoop** | Developers, power users | `packaging/scoop/lyra.json` ready. Create a repo `scoop-bucket`, put the file in `bucket/`, share `scoop bucket add lyra https://github.com/DhruvHarani1/scoop-bucket`. |
| **Chocolatey** | IT / power users | Community moderation takes days; do after winget. |
| **Microsoft Store** | Casual users who only trust the Store | Individual developer accounts are free (start at storedeveloper.microsoft.com, ID check). Needs an MSIX/store package and certification. Worth it once the app is stable. |
| **SignPath Foundation** | Removes the SmartScreen warning | Free code signing for open-source projects: signpath.org/foundation. |

## Android
| Place | Audience | Status |
|---|---|---|
| **IzzyOnDroid** | Open-source Android fans, no Play Protect warning | Reads GitHub releases and `fastlane/`. Request inclusion with an issue in the IzzyOnDroid repo-data project (see their inclusion policy). Draft text in `docs/launch/izzyondroid-request.md`. |
| **F-Droid** | Biggest open-source Android audience | Recipe + steps in `docs/FDROID.md` (needs a GitLab account). Slower: review takes weeks. |
| **Google Play** | Largest reach | One-time $25. Needs a Notification-access declaration and a privacy policy URL. Later. |
| **GitHub Releases** | Direct APK | Done. |

## Release gate (both workflows)

`release.yml` (Windows) and `android.yml` run on their own, not after CI, so each one now checks before publishing that the **CI**
workflow's newest run for the same commit SHA finished `success` (`gh run list --workflow ci.yml --commit <sha>`). No CI run, a
running one or a failed one stops the publish with an error that says so. This applies to a pushed tag and to "Run workflow" with
`publish` on; a dry run (publish off) is never gated.

- Override: run the workflow by hand with `publish` **and** `force` ticked. It prints a warning and skips only this check. A tag push
  cannot set `force`; to ship a tagged commit CI rejected, run the workflow by hand with `force`.
- `android.yml` also refuses to publish when the signing secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) are missing: the build would silently fall back to the debug key, and the in-app
  updater refuses any update not signed like the installed app, so every user would be stuck. `force` does not bypass this.
- `android.yml` runs `./gradlew testDebugUnitTest lintDebug` before building the APK (the Kotlin unit tests did not run in CI before).
- After a green CI the order is: bump version, merge to main, wait for CI, then tag or run the workflow.

## Releasing (one script, nothing is pushed or published by it)

`node scripts/release.mjs` (also `npm run release -- ...`):

| Command | What it does |
|---|---|
| `prepare 0.28.0 [--android 0.13.0] [--dry-run] [--skip-tests]` | Refuses a version that is not higher (semver, so 0.9.0 < 0.10.1), requires a clean tree and the notes **before** it changes anything (the `website/whats-new.html` card, and for Android the `fastlane/.../changelogs/<versionCode>.txt`), then bumps `package.json`, both places in `package-lock.json` and `android/app/version.properties` (versionCode = minor * 1000 + patch), re-checks consistency, runs typecheck and unit tests, and prints the exact `git` / `gh` commands for the PR, the wait for green CI and the two `publish=true` workflow runs. |
| `check [--tag v0.28.0]` | Versions agree everywhere, the notes card and the changelog exist, versionCode fits versionName, changelog is at most 500 characters. Runs in CI (`npm run release:check`) and at the start of both release workflows. Warns when `fdroid/dev.lyra.android.yml` lags (it is updated when you submit to F-Droid). |
| `notes [windows\|android]` | The release body: the whats-new card (Windows) or the fastlane changelog (Android). The workflows use it instead of an auto-generated PR list. |
| `changelog [--from v0.27.1]` | Draft notes from commit subjects since the last tag, grouped by type. Edit it into the whats-new card in plain words. |
| `verify 0.28.0 [--android 0.13.0] [--deep]` | After publishing: assets present, `latest.yml` names this version and the installer's size, "latest" is still the `v*` release, the Android `.sha256` equals GitHub's digest of the APK; `--deep` downloads the installer and compares its sha512 with `latest.yml`. HTTPS only. The workflows run it after publishing. |

Bad release: nothing in electron-updater rolls back. Mark the release as pre-release on GitHub (the updater only serves "latest"), or ship a higher fixed version.
Sitemap: `website/sitemap.xml` lists the three pages and has no per-release entries, so it does not need regenerating.
F-Droid metadata (`fdroid/dev.lyra.android.yml`): `prepare --android` rewrites its Builds entry and CurrentVersion / CurrentVersionCode, and `check` (also in CI) fails when they differ from `version.properties`.

## Nightly pre-release and the beta channel

`.github/workflows/nightly.yml` runs daily (02:17 UTC) and by hand. It builds only when main has commits newer than the last nightly **and** CI is green for that exact commit (no override), then publishes a GitHub **pre-release** `nightly-YYYYMMDD` (installer, blockmap, `latest.yml`; versioned `X.Y.(Z+1)-nightly.YYYYMMDD`, never "latest"), runs `verify --deep`, and deletes nightlies older than 14 days. With the Android signing secret present it also attaches a signed APK (+ `.sha256`) for sideloading; the Android in-app updater ignores nightlies. A manual run without `publish` only builds an artifact.

Windows Settings, Updates has a **Stable / Beta** channel (setting `updateChannel`, default stable). Beta asks GitHub for the newest `nightly-*` pre-release and installs it if newer; if there is none, GitHub is unreachable or the nightly is broken it uses the stable check, so a stable release newer than the nightly is still offered. Stable users never see nightlies because they read the "latest" release. Switching back to Stable keeps the installed nightly until the next stable release is newer (electron-updater does not downgrade).

Ideas not built: a scheduled job that runs `verify` on the latest stable release.

## Code signing (Windows)

The installer is unsigned. The wiring is ready but off: `release.yml` signs only when the Azure secrets (`AZURE_SIGN_ACCOUNT` and friends) or `WIN_CSC_LINK` exist, then fails unless the signature is valid. Options, costs and exact steps: `docs/release-audit.md`.

## Directories and communities
- **AlternativeTo** (list as an alternative to Musixmatch, Lyrically, Spotify's lyrics view), **Product Hunt**, **Show HN**.
- **Reddit:** r/spotify, r/opensource, r/FOSS, r/androidapps, r/windows, r/developersIndia (read each sub's self-promo rules first).
- **Lists:** awesome-spotify, awesome-electron, awesome-android-open-source, itsfoss / OMG! Ubuntu style blogs, alternativeto.
- Short vertical video (Reels / Shorts / TikTok): the reel in `brag-output/` and clips in `website/assets`.

## Do not
- Do not buy followers or stars, post the same text everywhere on one day, or ask for upvotes. It backfires.
