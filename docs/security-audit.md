# Security and privacy audit (roadmap item 16)

Date: 2026-11-24. Base: `main` at 0a2d7fb. Method: reading the code, `npm audit`, GitHub's Dependabot list, and unit
tests for what was fixed. **Nothing was run in a real Electron window or on a device** (see "Not verified"). Lyra Connect
was out of scope (another review). The release pipeline (`release.yml`, `android.yml`, `updater.ts`) was only read, not changed.

Status: FIXED = changed in this branch, with a test where the code is testable. REPORT = for the owner.

## Findings, by severity

### Medium

**M1. Export IPC trusted any file path from the page and skipped the sender check.** FIXED
- Where: `src/main/studio.ts` `registerStudioIpc` (before: `studioDiscard` ~L361, `studioSaveImage` ~L368, `studioReveal` ~L374, every handler registered with raw `ipcMain.handle`).
- Exploit: any script that can run in the app window (an XSS in a lyrics string, a malicious dependency) calls `window.lyra.studio.discard("C:\\Users\\me\\Documents\\wedding.mp4")` and the file is deleted; `saveImage(path)` wrote a `.jpg` next to any `.mp4`; `reveal` opened Explorer on any `.mp4`. Unlike the other handlers (`ipc.ts` `guard`), these did not check that the caller is Lyra's own window.
- Fix: every studio handler now checks `windows.isAppContents(sender)`; `exportPaths.ts` keeps the paths the **save dialog** returned (and the cover next to them) and discard/saveImage/reveal accept only those; `studioWrite` validates position and chunk (`validChunk`). Tests: `exportPaths.test.ts`.
- Left as is: the page can still write into a file the user picked in the dialog (that is the feature).

**M2. Dependabot alert 2 (high): Electron 44.9.0, "mitigation for compromised eMudhra intermediate certificates".** FIXED in `package.json`/`package-lock.json` (electron `^44.11.5`; patched in 44.9.1). The shared `node_modules` was deliberately not reinstalled here, so run `npm ci` before the next build. Not run under the new Electron.

### Low

**L1. The CSP was only a response header.** FIXED (defense in depth). `src/main/index.ts` sends the policy through `webRequest.onHeadersReceived` for `file://` pages. I could not confirm in a real packaged app that Electron applies that hook to `file://` documents, so the same policy is now also written into `index.html` as a `<meta>` tag at build time (`electron.vite.config.ts`, one definition in `src/shared/csp.ts`, test `csp.test.ts`). The built `out/renderer/index.html` was inspected. The dev server is unchanged (it needs inline scripts for HMR).

**L2. A packaged app still read `.env` and `ELECTRON_RENDERER_URL`.** FIXED. `loadDotEnv()` (`index.ts`) ran in the installed app from the working directory; `startUi()` (`studio.ts`) loads `ELECTRON_RENDERER_URL` into a window that has the full preload API. Anyone who can plant a `.env` or set that variable could make the capture window load a remote page with the app's API. Needs local write access, so low. Both are now dev-only (`app.isPackaged`).

**L3. `powershell.exe` started by bare name** (`studio.ts` `spotifyRootPid`). Node on Windows searches the working directory first, so a planted `powershell.exe` there would run. FIXED: absolute `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`. The same fix is applied to the fallback bridge in `src/main/smtc/source.ts`. (`lyra-media.exe` and `lyra-audio.exe` are bundled files started by absolute path.)

**L4. Log and "Copy diagnostics" redaction had gaps.** FIXED. The old redactor covered bearer tokens, `access/refresh_token` and `?code|state|code_verifier=`. It missed the YouTube key (`?key=AIza...`, which Lyra sends in a URL), Connect overlay link secrets (`#d=...&t=...`) and the Windows account name in paths (shared in bug reports). `src/main/redact.ts` (test `redact.test.ts`) now covers them; `appDiagnostics` redacts the whole text, including old log lines. Verified by reading: Spotify tokens are never passed to the logger (`auth.ts` logs only "signed in"; `tokenStore.ts` logs error objects).
- Log file: `%APPDATA%\Lyra\logs\lyra.log`, rotated to `lyra.old.log` at 1 MB **only at start-up**, so one long session can grow past 1 MB (REPORT, trivial).

**L5. Karaoke screen contacted Google without a YouTube key.** FIXED. `KaraokeScreen.tsx` added `preconnect` links to `youtube-nocookie.com` and `i.ytimg.com` for everyone; PRIVACY.md promises YouTube is contacted only with a key. Now only with a key.

**L6. `ci.yml` had no `permissions:` block** (token defaulted to the repository setting). FIXED: `contents: read`.

**L7. PRIVACY.md did not match the code.** FIXED. Missing: Spotify Web API and sign-in hosts, Apple's clip CDN, the STUN host, the log file, what "Copy diagnostics" includes. The full list is in `docs/network-inventory.md`.

### Reported only (not changed)

**R1. Actions are pinned by major tag, not commit SHA** (`actions/checkout@v7`, `github/codeql-action/*@v4`, ... in all four workflows). A moved tag runs new code with `contents: write` in `release.yml`/`android.yml`. Pin to SHAs (Dependabot's `github-actions` ecosystem is on and will keep them current).

**R2. `android.yml` L97-101 puts `${{ secrets.* }}` straight into `run:` scripts** (keystore, passwords). They are masked in logs, but passing them through `env:` is the safer pattern. Release pipeline is another agent's; not edited.

**R3. The Windows installer is not code-signed** (no certificate settings in `package.json` `build`). `electron-updater` verifies the sha512 in `latest.yml`, which comes from the same GitHub release, so the update channel is only as safe as the GitHub account and release permissions. Keep 2FA on, protect `v*` tags, consider signing. SmartScreen warnings for users are the visible symptom.

**R4. Android** (read from `AndroidManifest.xml`, `WebSetup.kt`, `Rpc.kt`; another agent owns the code):
- Good: `allowBackup="false"`; no cleartext (targetSdk 36 default, no `networkSecurityConfig`); `allowFileAccess=false`, `allowContentAccess=false`, mixed content never; WebView debugging only when the build is debuggable; top-level navigation limited to the app's own origin; the `AndroidRpc` bridge is limited to that origin **and the main frame** (a YouTube iframe cannot call it); FileProvider is `exported=false` and shares only `cache/share/`; receivers and the record/ambient/overlay services are `exported=false`; the exported services are protected by system-only permissions (`BIND_DREAM_SERVICE`, `BIND_NOTIFICATION_LISTENER_SERVICE`, `BIND_QUICK_SETTINGS_TILE`).
- `android.html` has **no CSP** (the Windows app has one). Adding one needs a device test (YouTube, PeerJS, Apple clips), so not done.
- `AmbientToggleActivity` is `exported="true"` without an intent filter: any installed app can start it and toggle ambient mode. Harmless, but if the launcher shortcut still works with `exported="false"`, switch it.
- `WebSetup.previewProxy` host-checks the first URL, but `HttpURLConnection` follows redirects (same scheme) to any host; the response only feeds a video element and nothing is sent. Low.
- Powerful permissions are all used for stated features (`REQUEST_INSTALL_PACKAGES`, `UPDATE_PACKAGES_WITHOUT_USER_ACTION`, `SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO`). PRIVACY.md says the updater checks SHA-256 and the signing certificate; I did not re-read `UpdateManager.kt` to confirm.

**R5. Redirects on host-allow-listed fetches.** `artwork.ts` and the `lyra-media://preview` fallback in `service.ts` check the host of the first URL, then `net.fetch` follows redirects. The hosts are Spotify's and Apple's CDNs and no credentials are sent, so the SSRF value is tiny. `redirect: 'manual'` plus a re-check would close it.

**R6. IPC argument validation is uneven.** Handlers that take a `Track` (`lyrics*`, `choices*`, `bgResolve`, `bgYtCandidates`, `playerOpen` for non-URL fields) trust its shape; `lyricsImport` text has no size limit; `settingsSet` goes through `sanitize` but unknown value *types* for keys it does not normalise pass through. Not exploitable beyond breaking the app's own state (the renderer is already trusted to be the UI), but cheap to tighten.

**R7. `lyra-media://` answers `Access-Control-Allow-Origin: *`.** Reachable by the YouTube iframe inside the window; `bg/` needs a 16-hex name (not guessable), `preview/` serves public Apple data. Low.

**R8. Dependabot alert 5 (medium): `minimatch`** DoS (needs 11.0.1). It is a build-tool dependency of `electron-builder` (not shipped in the app) and needs a major (`minimatch` 7-11 line). `npm audit` also lists `app-builder-lib`, `dmg-builder`, `@electron/universal`, `electron-builder-squirrel-windows` as moderate; its suggested fix ("electron-builder@25.1.0") is a **downgrade** and should be ignored. Wait for an `electron-builder` release that updates `minimatch`.

**R9. Capture windows.** The hidden window that films the lyrics screen (`studio.ts` `startUi`) loads Lyra's own page with the full preload API (it must, it is the app), is sandboxed, has navigation and `window.open` blocked, and is only started by an IPC call from an app window. The YouTube stage window has **no** preload, is sandboxed, and shares the default session; the permission handlers only grant capture to `file://`/`localhost` pages, so YouTube cannot get the microphone or screen. Not blocked: YouTube's own page navigating itself (it is a hidden, preload-less page).

## Checked and fine (by reading)
- Windows `webPreferences` for the main window, capture window and stage window: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; no `webviewTag`, no `webSecurity: false`.
- `src/preload/index.ts` exposes a fixed `window.lyra` object; no raw `ipcRenderer`, no generic invoke.
- `ipc.ts`: every `handle` runs `guard` (sender must be the app window or a capture window); every `on` handler checks the main window.
- `shell.openExternal`: only `spotify:` URIs matching `^spotify:(track|episode):[A-Za-z0-9]+$`, `https://open.spotify.com/` links, and the PKCE authorize URL. `setWindowOpenHandler` allow-list of https hosts, everything else denied; `will-navigate` always prevented.
- Permissions: device access is denied except capture/microphone while an export or karaoke runs, and only for the app's own pages.
- `lyra-media://`: `bg/` accepts only `^[a-f0-9]{16}\.ext$` names inside the backgrounds folder; `preview/` accepts only `https://<label>.itunes.apple.com/` (the host pattern cannot contain `@`, `:` or `.` tricks). Imported backgrounds are copied and renamed to a content hash.
- Spotify PKCE (`auth.ts`): 64 random bytes verifier, S256 challenge, random `state` checked before the code is used, callback server on `127.0.0.1` only, 3 minute timeout, no client secret, wrong-`state` requests do not cancel the login. Tokens are stored only through `safeStorage` (DPAPI); if it is unavailable they stay in memory, never plaintext. The Spotify client ID is not a secret and lives in `settings.json`; "Copy diagnostics" leaves it out.
- The YouTube key is stored through `safeStorage` (`platform.ts` `SafeStorageSecret`) and never sent to the renderer.
- No analytics, telemetry or crash-reporting code or dependency was found.

## Not verified
- Nothing was run in real Electron or on an Android device. The new Electron (44.11.5) was not installed or launched.
- Whether the CSP **header** reaches `file://` pages in the packaged app (the meta tag makes this moot, but the header path itself is unproven).
- Lyra Connect (out of scope), the Android updater's SHA/certificate check, the Android native code beyond the manifest, `WebSetup.kt`, `Rpc.kt` and the lines quoted.
- Network behaviour was derived from code, not captured with a proxy. The YouTube player iframe is Google's code and its own requests and cookies were not inspected.

## Owner decisions
1. Run `npm ci` and a packaged smoke test (login, export, karaoke) on Electron 44.11.5 before releasing.
2. Pin GitHub Actions to commit SHAs; move the `secrets` in `android.yml` to `env:`.
3. Decide on Windows code signing and tag protection (R3).
4. Android: CSP for `android.html`, and `AmbientToggleActivity` exported or not.
5. `minimatch` alert: wait for `electron-builder`, or dismiss as "build tool, not shipped".
