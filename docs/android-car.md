# Lyra in the car

Status: Car mode (phone screen) built and checked in the browser harness; Android build, unit tests and lint pass. Nothing was run on a real phone, car or head unit (see "What could not be verified").

## 1. What cars allow third-party apps to do

Sources: developer.android.com/training/cars ("Android for Cars overview", supported app categories), /training/cars/media/auto, /docs/quality-guidelines/car-app-quality, /training/cars/testing/dhu (read in Nov 2026).

**Android Auto (projected from the phone) and Android Automotive OS (built into the car) only run certain app categories.** The overview page lists them; the ones that matter here:

| Category | Built with | Where | While driving |
| --- | --- | --- | --- |
| Media (audio) | `MediaBrowserService` + `MediaSession` (a templated variant on Car App Library is Early Access only; such apps can only go to Internal/Closed testing tracks) | Android Auto and AAOS | allowed |
| Navigation, POI, IOT, Weather, Messaging, Calling | Car App Library templates | Android Auto and AAOS | allowed, templates only |
| Video | Views / Compose | AAOS only | parked only (limited audio while driving) |
| Games (Browsers is a parked category too in the quality rules; its platform row was not read) | Views / Compose | Games: Android Auto and AAOS | parked only |

Consequences:

* **No custom UI while driving.** Apps in the driving categories cannot show their own activity, a `WebView`, or arbitrary drawing on the car screen. The car shows its own media player, built from the session metadata and browse tree the app provides. On AAOS the quality rule PE-1 says that, apart from setup, settings and sign-in while parked, the app must not provide functionality through its own activities.
* **Parked categories (video, games, browsers)** may draw their own UI, but rule DD-2: while driving the app must not be launchable and its UI must not be visible, audio stops when driving starts and cannot be resumed while driving. They also need touch targets of at least 64dp, 24dp between targets and screen edges, and fonts of at least 24sp (UX-1/2/3).
* **Lyrics are not a category.** The documentation has no category, template or exception for lyrics, karaoke or any running text display. The "Media" category is defined as apps that let users browse and play audio, and it excludes video. So there is no sanctioned way to put Lyra's lyric view (a WebView with animated vibes) on a car screen, and none while driving. (Inference from the category table, not a quote: scrolling or animated lyric text is exactly the kind of glanceable-text-while-driving UI the categories exist to keep out.)
* **Manifest declaration for media:** `<meta-data android:name="com.google.android.gms.car.application" android:resource="@xml/automotive_app_desc"/>` plus `res/xml/automotive_app_desc.xml` containing `<automotiveApp><uses name="media"/></automotiveApp>`, and a `MediaBrowserService` Android Auto can bind to. The guide assumes you "have already built a media browser service".
* **Play review:** apps for cars get an extra manual review on top of normal Play review, against the car app quality criteria; failures are emailed to the Play Console account. Relevant criteria: MA-1 (a media app must not autoplay on startup or without a user action), IN-1 (notifications only when relevant to the driver; a new album release is the stated bad example), NA-1 (no ads in notifications), GB-1 (disabled controls must be non-functional), plus DD-2 / UX / PE-1 above for the parked and AAOS cases. Apple CarPlay is not applicable: Lyra is an Android app.

## 2. Is a media-app declaration legitimate for Lyra? No.

Lyra does not play audio. `MediaMonitor` mirrors another app's (Spotify's) media session; `LyricsNotifier` keeps a session of its own only so the notification and lock screen draw a proper media card, and its transport buttons forward commands to the other player. Declaring `uses name="media"` and shipping a `MediaBrowserService` would:

* register Lyra in Android Auto's media launcher as a player with an empty or fake library (a second "music app" that cannot play anything), which misrepresents the app against the "browse and play audio" definition;
* fail the manual car review in practice (nothing to browse, nothing to play, controls that act on a different app);
* risk the whole listing, not just the car feature.

So **nothing was declared**: no `com.google.android.gms.car.application` meta-data, no `automotive_app_desc.xml`, no `MediaBrowserService`. This was deliberate, not an omission. The same reasoning rules out an Automotive OS variant and a Car App Library template for now (section 6).

What the user gets in a car today is already good and compliant: Spotify (or any real media app) is the one Android Auto shows. Lyra is not visible there. Lyra's own session and notification stay on the phone.

## 3. What was built

### 3.1 Session metadata for a car stereo (existing work, one new rule)

`LyricsNotifier.kt` already puts the current line into the session metadata (title / display title = the line, display subtitle = next line, artist = song and position) when "show lyrics on the lock screen" is on. A Bluetooth car stereo that shows AVRCP metadata may display those fields; which player's metadata it takes, and how it renders it, is the head unit's business and is **not verifiable without hardware** (and Android Auto's own UI does not read Lyra's session, because Lyra is not a declared media app).

New: **running text on a car display is a distraction risk, so when the phone is in a car dock (`UiModeManager.currentModeType == UI_MODE_TYPE_CAR`) the session carries song and artist only**, the same as the privacy setting. The user can opt in (`CarModeSupport.setLyricsOnCarSurfaces`, stored in the `car-mode` preferences; there is no UI for it yet). Implementation: `dev.lyra.android.car.CarLogic` (pure, unit-tested), `CarModeSupport`, and a one-line change in `LyricsNotifier.refresh()`. Limitation: this detects a car dock; Android Auto projection and plain Bluetooth-to-stereo do not set car UI mode on every phone, so there the lyric line may still reach the stereo. Detecting those needs `androidx.car.app.connection.CarConnection` (a new dependency) and is on the roadmap.

### 3.2 Car mode on the phone screen

For a phone on a dash mount, used by a passenger or while parked. Files:

* `src/renderer/src/components/CarMode.tsx` (screen, offer chip, settings row), `src/renderer/src/store/car.ts`, `src/renderer/src/lib/car.ts` (pure logic, `car.test.ts`), `src/renderer/src/styles/car.css` (imported in `main.tsx`), `src/android-web/car.ts` (asks the app for the car environment).
* Android: `dev.lyra.android.car.CarLogic`, `CarModeSupport`; `Rpc.kt` gets one method, `carInfo`.

Behaviour: `data-platform='android'` + `data-car='1'` on `<html>`. When on, `App` renders only `CarMode`: song and artist, three lyric lines (previous dim, current huge, next dim), previous / play-pause / next as 76-140 px round buttons, a Done button, and a footer: "For passengers, or when parked. Please do not read this while driving." No scrolling, no motion beyond a 140 ms fade (none under reduced motion), no video, no vibes, no settings. Lines shrink by length class, never below 24 px; text clamps rather than scrolls. Dark low-glare palette at night (`data-car-night='1'`), plain high-contrast light palette by day, taken from the UI mode night flag, falling back to `prefers-color-scheme`, falling back to night. Landscape short screens (<=520 px high) move the buttons to a column on the right. No lyrics / loading / ad / idle states show a plain sentence instead of an empty screen. Plain (unsynced) lyrics are not shown: scrolling text has no place here.

How it is entered, deliberately never automatic: the app cannot tell whether the car is moving (a phone has no reliable driving signal), so Car mode **never opens by itself and is not remembered across restarts**. Two explicit entries: a "Car mode" chip that appears only when the phone is in a car dock (`carInfo.dock`), and Settings -> Phone -> Car mode -> Open. Done returns to the normal player.

### 3.3 Voice-friendly design note (hands-free)

Lyra adds no voice UI and no in-car speech handling. Hands-free control goes through the system: the transport actions on Lyra's `MediaSession` (play, pause, play/pause, next, previous, seek) are the standard media-button actions, so steering-wheel buttons, Bluetooth headsets, and "Hey Google, next song" reach the player through them, and `MediaMonitor.command` forwards them to the real player (Spotify). Nothing in Car mode needs reading or tapping while driving; the intended driving experience is "audio from the real player, controls by voice or wheel buttons". Lyra deliberately does not claim voice actions (`PLAY_FROM_SEARCH` etc.): it cannot play anything.

## 4. Verified vs not

Verified:

* Car mode rendered in the browser harness (`?android=1&car=1`, also `carnight=0`, `track=1`, `paused=1`, `ly=none`, `ly=plain`, `lang=hi`, `idle=1`, and `dock=1` for the offer chip) at 1280x720, 800x480, 360x800 and 412x915 using `node scripts/harness/car-shots.mjs`. The script also asserts: every button >= 64 px (the main ones are 76-140), all text >= 24 px, lyrics area does not overflow, at all four sizes.
* `vitest` for `lib/car.ts` (7 tests), `npm run typecheck`.
* Android with `ANDROID_HOME=C:\Users\TEST\AppData\Local\Android\Sdk`: `assembleDebug`, `testDebugUnitTest` (includes `CarLogicTest`, 3 tests) and `lintDebug` succeeded (one new info-level KTX style hint in `CarModeSupport`).

Not verified (needs hardware or Google):

* **Desktop Head Unit: not run.** The SDK has no "Android Auto Desktop Head Unit Emulator" package (`extras/google/auto` is missing), `adb` is not on PATH, and no phone is attached. The DHU also requires a real phone (Android 9+) with developer mode, the Android Auto app and its head unit server; it cannot run against an AVD alone. Since Lyra declares no car capability, the DHU would only confirm Lyra is absent from the launcher, which is the intended result.
* Car mode on a real phone (touch, glare, dock detection, `carInfo` wiring, night flag): only the web layer was exercised; the native `carInfo` path is compiled and unit-tested for its logic but was not run on a device.
* What a Bluetooth stereo or AA's media UI shows from Lyra's session, and whether car dock detection fires on a given phone/dock.
* Play car review: not applicable until something is declared; nothing was submitted.

## 5. Needs Google approval

Nothing shipped here needs it. Anything that puts Lyra on the car screen would: a media declaration (rejected on merit, section 2), a Car App Library template app (an approved category is required; templated media is Early Access and limited to Internal/Closed testing), or a parked-only category such as Browsers (would need a real browser). There is no lyrics category to apply to.

## 6. Roadmap

1. Detect Android Auto projection and Bluetooth car audio via `CarConnection`, and apply the "no lyric text on car surfaces" rule there too; add a Settings switch for the opt-in.
2. Optional static launcher shortcut "Car mode" and a Quick Settings tile for mounted phones (still explicit, never automatic).
3. If Lyra ever plays audio itself (for example a built-in player for local files), a real media app becomes legitimate: `MediaBrowserService`, `automotive_app_desc.xml`, then the AAOS variant (no own UI while driving; setup/settings only while parked). Subtitle on AA = session `DISPLAY_SUBTITLE`, kept short and glanceable; still no video.
4. Car App Library media templates once they leave Early Access and Google accepts a companion use case; ask Google through the Android for Cars developer channel before building.
5. Apple CarPlay: not applicable (no iOS app).
6. Hardware pass: DHU with a dev phone, a real dock, a Bluetooth stereo.
