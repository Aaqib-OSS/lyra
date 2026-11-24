# Updates and release pipeline: audit

Audit date 2026-11-24 (Windows 0.27.1, Android 0.12.1). Written before the changes in this branch; the "Done" column says what
this branch changed. Nothing here was run against real GitHub releases (no tag, no workflow, no publish was triggered).

## What exists

| Area | State at audit |
|---|---|
| Windows updater (`src/main/updater.ts`) | electron-updater on GitHub releases: first check 25 s after start, then every 6 h, auto-download (blockmap = only changed blocks), install on quit or "Restart to update". sha512 from `latest.yml` is verified by electron-updater. Downloads live in `<install folder>-updates`. |
| Windows UI (`UpdateRow.tsx`) | checking / none / downloading % / ready / error / disabled. No release notes, no "last checked", no progress bar, "Check now" after an error has no retry wording. |
| Android updater (`update/*.kt`) | Strong: ETag-cached GitHub API call, 12 h floor (20 s for manual), WorkManager with backoff, resumable download (`.part`), SHA-256 from the release `.sha256` asset or GitHub's asset `digest`, APK signing certificate must equal the installed one, PackageInstaller session, never installs during playback/recording, store-installed builds disabled, channel stable/beta. Version compare is real semver (0.9.0 < 0.10.1 is covered by `UpdateLogicTest`). |
| Workflows | `release.yml` (Windows) and `android.yml` publish only when `ci.yml` was green for the same SHA (`force` override). Android refuses a debug-signed publish. |
| Notes | Human notes live in `website/whats-new.html`; the GitHub release body was only `--generate-notes` (a PR list), and the in-app updater shows none of it. Fastlane changelog `<versionCode>.txt` per Android release. |
| Bump / publish | Fully manual: edit `package.json`, `package-lock.json` (two places), `android/app/version.properties`, then dispatch the workflows by hand. Nothing checks that a notes card or changelog exists, that the version is higher than the last release, or that the published assets are right. |

## Findings (ordered by risk)

1. **Unsigned Windows installer** (SmartScreen warning). Documented below with costs. No workflow wiring existed.
2. **Release could ship without notes or with a stale version**: nothing compared the tag with `package.json`, nothing required the
   `whats-new` card or the fastlane changelog. A tag push built whatever `package.json` said.
3. **Windows error handling**: after a network failure the next try was up to 6 h away; the first failure stayed on screen until then.
   Checks ran while offline and produced a scary error. Stale downloaded installers stayed in the cache after a successful update.
4. **No post-release check**: nobody verified that the `.exe`, `.blockmap`, `latest.yml` (version, sha512 matches the `.exe`)
   or the APK and its `.sha256` were actually attached.
5. **Release body**: auto-generated PR titles, not the user-facing notes.
6. **CI**: no concurrency cancel (superseded PR pushes kept running two Windows+Ubuntu jobs), Playwright's Chromium downloaded every run.
7. **F-Droid metadata** (`fdroid/dev.lyra.android.yml`) is at 0.10.1 on purpose (it describes what was submitted to F-Droid); the release
   script only warns about it.
8. **Windows prerelease channel**: `allowPrerelease = false` is hard-coded; Android has a channel choice, Windows has none (owner decision, below).
9. **Rollback**: electron-updater has no rollback. A bad release is mitigated by (a) the user can run the previous `Lyra-Setup-x.exe`
   from the releases page (NSIS keeps user data), (b) shipping a fixed higher version quickly, (c) marking the bad release
   as pre-release on GitHub, which removes it from `latest.yml` serving instantly (the updater reads `releases/latest`).
   Android: the updater never downgrades; same fix-forward rule.
10. **Rate limits**: Windows uses GitHub's `releases.atom`/`latest.yml` redirect (not the rate-limited REST API) so 6 h polling is fine.
    Android uses the REST API with ETag (304 does not count against the limit) and a 12 h floor: fine.

## Done in this branch

* `scripts/release.mjs` with `prepare`, `check`, `notes`, `changelog`, `verify` (see `docs/DISTRIBUTION.md`): one safe command, logic unit-tested in `scripts/lib/release.test.ts`.
* Workflows: tag must equal the file version; release notes card must exist; release body comes from the notes card; verify step after publishing;
  optional code signing behind secrets that do not exist today (steps are skipped when absent); CI concurrency + Playwright browser cache.
* Windows updater: release notes in state and UI, last-checked time, progress bar, backoff retry after a network error, no checks while
  offline, stale installer cleanup. Pure helpers are unit-tested.

## Code signing the Windows installer

Why: unsigned installers show "Windows protected your PC" (SmartScreen), and some antivirus products flag them. A signature removes
the "Unknown publisher" line; SmartScreen reputation still has to build up for OV certificates (instantly trusted for EV and for Trusted Signing's identity-validated certs in practice, not guaranteed).

| Option | Cost (2026, check current prices) | Notes |
|---|---|---|
| **Azure Trusted Signing** (now "Artifact Signing") | about 10 USD per month (Basic) | Cheapest hosted option. Needs an Azure account, an identity validation (individuals accepted in supported regions, takes days), a certificate profile. Short-lived certs, no private key to guard. electron-builder supports it natively (`win.azureSignOptions`). |
| **SignPath Foundation** (free for open source) | free | Requires an open-source project with a public repo, OSI licence and an application/approval; signing runs through SignPath's GitHub Action with a manual approval step. Best fit if Lyra's licence qualifies; some lead time. |
| **OV code-signing certificate** | about 70 to 250 USD per year | Since 2023 the key must live on a hardware token or HSM (CA-hosted cloud signing counts), so CI needs the CA's cloud signing client. SmartScreen warnings fade only after reputation builds. |
| **EV certificate** | about 250 to 500 USD per year | Instant SmartScreen reputation, hardware token, hardest to automate. Overkill here. |

Recommendation: apply to **SignPath Foundation** first (free) and, in parallel or if rejected, use **Azure Trusted Signing** (about 120 USD per year).
Both keep the key out of the repo.

### Exact steps (Azure Trusted Signing)

1. Azure account, create a "Trusted Signing" account and complete identity validation (government ID for an individual).
2. Create a certificate profile (Public Trust). Note the endpoint (for example `https://eus.codesigning.azure.net`), account name and profile name.
3. Create an app registration (service principal), give it the role "Trusted Signing Certificate Profile Signer" on the account.
4. In the GitHub repo add secrets (owner does this, never in code): `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
   `AZURE_SIGN_ENDPOINT`, `AZURE_SIGN_ACCOUNT`, `AZURE_SIGN_PROFILE`, and `AZURE_PUBLISHER_NAME` (the certificate subject, must match exactly).
5. Nothing else: `release.yml` already has a step that turns signing on when `AZURE_SIGN_ACCOUNT` is non-empty and then fails the
   run unless `Get-AuthenticodeSignature` reports `Valid` on the built `.exe`.
6. electron-updater then also verifies the publisher: add `"publisherName"` under `build.win` only after the first signed release
   (otherwise users on the unsigned build could not update; the first signed release must be installed manually once, or keep publisherName unset: updating still works, the check is just not enforced).

### Exact steps (a certificate / token via CSC_LINK)

Secrets `WIN_CSC_LINK` (base64 `.pfx`) and `WIN_CSC_KEY_PASSWORD`; the workflow maps them to `CSC_LINK` / `CSC_KEY_PASSWORD` only when present.
Only possible for a file-based certificate (older OV certs or a CA that exports a pfx); hardware-token certs need the CA's client instead.

## Not verified here

No real release was made, so the updater state changes, the new workflow steps (signing, verify, notes body) and the Android path were not exercised end to end.
The workflow YAML was parsed locally; the script logic is unit-tested; the signing wiring has never run.

## Update: owner decisions (2026-11-24)

Signing stays off (wiring kept, nothing more). Added: Windows stable/beta channel, nightly pre-release workflow, F-Droid metadata kept in step by `scripts/release.mjs` (see `docs/DISTRIBUTION.md`).
