# Monivra for Android (first test APK)

Branch `android-first-apk`. Nothing here is merged into `main`, deployed to Pages or published anywhere.
The Android project lives in `android-app/`; the web application in the repository root is the same code
the website serves.

## What it is

An installable APK that runs Monivra from the device, offline: the web files are packed into the APK and
shown in the system WebView through a Capacitor shell. It is **not** a WebView of the public site; it has
no `INTERNET` permission at all, so it cannot reach the network. What Android adds (files, print,
biometrics, secure PIN storage, notifications, the internal data copy) is a small native plugin in
`android-app/overlay/`.

## Why this architecture

| Option                                        | Verdict                                                                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capacitor shell + one small native plugin** | **Chosen.** The app is vanilla ES modules with no build step, one JSON document and HTML-string rendering: it runs unchanged in a WebView. Only the platform boundary (`js/platform/*`, already isolated) needed native code |
| WebView that loads the Pages site             | Rejected by the task and by nature: needs network, no native files, breaks offline                                                                                                                                           |
| PWA / Trusted Web Activity                    | Needs the site online or a service worker cache; no document provider, biometrics, Keystore or alarms                                                                                                                        |
| React Native / Flutter / native rewrite       | Would rewrite the UI and financial logic (all `render()` HTML strings, 216 unit checks, 80 browser scenarios) for no gain on the first APK; risk to financial rules                                                          |

Capacitor is used without a bundler or npm imports in the web code: `window.Capacitor` (injected by the
shell) is reached in `js/platform/native.js`, which is `null` in a browser. Everything Android-specific in
the web code goes through that one module, so the browser version is unchanged (the browser keeps `main.js`;
the APK swaps in `main-native.js`, which first asks the shell for what the data needs).

Versions pinned in `android-app/package.json` / lockfile: Capacitor 7 (`@capacitor/core|android|cli`),
`@capacitor/app`, `@capacitor/local-notifications`, plus `androidx.biometric:biometric:1.1.0`. Android:
`minSdk 23` (Android 6), `compileSdk/targetSdk 35`, Gradle 8.11, JDK 21. No analytics, ads, crash-reporting or
network SDK is present.

## Layout and build

```
android-app/
  package.json, package-lock.json, capacitor.config.json
  scripts/build-web.mjs        copies index.html, css, js, assets to www/ (and points index.html at main-native.js)
  scripts/prepare-android.mjs  after `cap add android`: puts overlay/ over the project, patches app/build.gradle
  scripts/ci-build.sh          the whole build; scripts/publish-build.sh publishes results
  scripts/emulator-test.sh, e2e/emulator.mjs   end-to-end test on a real Android system
  overlay/                     what Android adds: manifest, MainActivity, MonivraNativePlugin, SecureStore,
                               DataMirror, PdfPrintAdapter, icons, themes, FileProvider paths
  signing/                     how test builds are signed (no key is kept here)
  icon-source/                 the supplied SVG artwork (master); PNGs made by scripts/make-icons.py
.github/workflows/android.yml  web tests, APK build, emulator test; results go to branch android-builds
```

The generated `android/` folder is not committed: `cap add android` + `prepare-android.mjs` recreate it
from pinned versions on every build, and the script fails loudly if the generated project is not as
expected. (The development sandbox cannot reach the Android SDK, Maven or npm, so every build runs in
GitHub Actions; local command for a machine with Node 22, JDK 21 and the Android SDK:
`bash android-app/scripts/ci-build.sh`.)

## Where the data lives, and what happens to it

The data model is unchanged: one JSON document in the WebView's `localStorage` (key
`monivra.offline.2026.v1`, origin `https://localhost`, fixed in `capacitor.config.json`: **never change the
scheme or host, or the stored data would not be found**). After every save a second copy is written to
`files/mirror/` in the app's private folder: written whole, `fsync`ed, moved into place with the previous
copy kept, each with a SHA-256 of its text; reading takes the newest copy that checks out.

**Why there is a second copy at all.** On the emulator the WebView turned out to write `localStorage` to
disk some seconds after a change, so a hard kill within those seconds loses the last saves. Every save
therefore carries a save number (`monivra.offline.2026.v1.saves`, written next to the data and also kept
in the second copy). At start the copy with the higher number wins ("newer"): the person is told that the
latest changes were recovered. The browser never uses this (the number and the copy exist only in the APK).

| Event                                                                         | What happens                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App stopped / swiped away / killed by Android                                 | Data is in `localStorage` (on disk). The second copy follows ≤ 0.8 s after each save and at once when the app leaves the screen                                                                                                                                                                       |
| Phone restarted                                                               | Same files; nothing special                                                                                                                                                                                                                                                                           |
| App updated (same ID and signature)                                           | Private files and WebView storage are kept by Android (tested on the emulator)                                                                                                                                                                                                                        |
| `localStorage` lost, app still installed (WebView storage cleared or damaged) | At start the second copy is restored when no stored data exists, or when it is a later save of the stored data (higher save number); the person is told in both cases. Stored data that is as new or newer is never replaced; a damaged stored dataset goes to the existing recovery screen untouched |
| Both copies unreadable                                                        | Start as new; the person is told if a copy existed but was unreadable. Nothing is deleted                                                                                                                                                                                                             |
| Storage pressure                                                              | App data (not cache) is not evicted by Android. The `localStorage` quota (~5M characters, photos included) still applies, as in the browser; when full, the app says so (existing message)                                                                                                            |
| App uninstalled / "Clear storage" / new phone                                 | **Everything is deleted, both copies.** `allowBackup=false` and empty data-extraction rules: Android does not copy the data to Google or a new phone. The data file (Data → Data file → Save) is the only copy that survives                                                                          |

The second copy is a recovery aid, not a backup. Moving to a SQLite database in the private folder is the
natural next step (it would remove the quota); it was not needed to meet this task.

## Bringing data from the web app

Nothing transfers automatically: the browser's `localStorage` belongs to the website's origin and the
APK has its own. The explicit route is the one the app already has: in the web app **Data → Data file →
Save**; in the APK **Data → Data file → Restore from file**, pick the file → the app reads it, validates
the schema (`findDataProblem`), shows what is inside and asks for confirmation; nothing changes before
that, and a file that fails validation is refused with a reason and the data stays. A PIN hash inside a web
file is moved into the Keystore-encrypted storage on restore.

## Signing, application ID and updates

- Test builds use the application ID `app.monivra.finance.dev` (set by `MONIVRA_APPLICATION_ID`, which
  defaults to it); `app.monivra.finance` is kept for the production app. The code package stays
  `app.monivra.finance`. `versionCode` = CI run number (grows with each build), `versionName` =
  `0.1.0-build.N`.
- No signing key is kept in the repository. The earlier public test key is compromised (it stays in the
  history). Test builds are signed with the owner's test key from the repository secrets
  `MONIVRA_KEYSTORE_B64`, `MONIVRA_KEYSTORE_PASSWORD`, `MONIVRA_KEY_ALIAS`, `MONIVRA_KEY_PASSWORD`, which
  the owner also keeps offline (`signing/README.md`). Without the secrets CI signs with a one-run key for
  the emulator test only and publishes no APK.
- Changing the key or the ID later means Android refuses to install over the old app. Then: save a data file
  outside the app, uninstall, install, restore. The emulator test checks that a build signed with another key
  is refused and leaves the data alone.
- The release APK is what the owner installs. The "debuggable" APK exists for CI only (the emulator test
  drives the WebView through DevTools); it has the same ID and signature and is never delivered.

## Android features

- **Save**: `ACTION_CREATE_DOCUMENT` (system "save as"). A closed screen writes nothing and shows nothing.
- **Share**: `ACTION_SEND` with a `content://` address (FileProvider, cache folder `shared/`, emptied at start
  and before each share), read-permission grant, any MIME type including JSON. No file paths, no storage
  permission. Android does not report what the person did in the sheet, so "shared" means "opened".
- **Print**: the PDF itself goes to `PrintManager` (`PdfPrintAdapter`); all pages are copied as they are, so the
  text stays selectable and searchable; a chosen range is drawn as pictures. The call is answered when the
  print screen closes.
- **Data UX of the web version is kept**: one print/share per request (guards in `files.js` and
  `deliver()`), progress dialogs, cached prepared documents with the same invalidation, no stale dialogs.
- **Open file**: the WebView `<input type=file>` opens the system document picker (no permission). Taking a
  photo directly needs the camera permission, which the app does not request; the picker offers the gallery.
- **PIN**: the salted PBKDF2 hash is stored in `files/secure/pin.bin`, AES-GCM-encrypted with a non-exportable
  AndroidKeyStore key (hardware-backed where the phone has it); the data and its copy hold only
  `{v:2,native:true,length}`. A hash coming from a browser file is sealed on restore. If the system cannot
  return the hash (key lost), the lock is turned off with a notice, so the person is never locked out of
  their own data. **The lock is not encryption**: the financial data is stored as plain JSON in the app's
  private folder (protected by Android's app sandbox, not by the PIN), and the settings screens say so.
- **Biometrics**: `BiometricPrompt` (class 2 or stronger), only as a faster way into the lock screen; the PIN
  is always the fallback. The switch exists only when the phone can do it ("not set up" is shown when no
  fingerprint/face is enrolled), needs a PIN, and needs one successful check to turn on. Cancel, lockout and
  failure all end on the PIN keys, once per lock (no loop). Nothing biometric is read or stored.
- **Reminders**: `@capacitor/local-notifications`. The next 60 days of reminders (payments with reminders,
  and the periodic one) are rebuilt after changes (1.5 s debounce), at start and on return to the app, as inexact
  `allowWhileIdle` alarms in their own channel ("Payment reminders"), and survive a restart of the phone
  (plugin boot receiver). Notification permission is asked only when the person switches notifications on;
  refusing it leaves the in-app reminders working. Exact-alarm permissions are removed from the manifest.
  Android may deliver a reminder a few minutes late.
- **Scheduled payments are not posted by a background job.** They are posted, once each and with their own
  date/time, whenever the app opens, returns to the front and every minute while open (existing, tested
  rule). A notification only reminds; it does not move money. If the phone is off or the app is not opened,
  the payment is posted at the next launch (the emulator test checks exactly-once and the original time).
  Guaranteeing posting while closed would need a persistent native scheduler that runs the financial
  logic outside the WebView; that is a design decision left for later. Details, the review of the reminder
  APIs, permissions and timing, and the future requirement are in
  [SCHEDULED_AND_NOTIFICATIONS.md](SCHEDULED_AND_NOTIFICATIONS.md).
- **Back button**: steps back through layers and pages (`goBack`), minimises at the first screen and on the
  lock screen.
- **System bars / keyboard / orientation**: the activity gives the page the room the bars and keyboard
  leave (works with Android 15's edge-to-edge), bars take the app's background color and light/dark icons;
  `adjustResize`; rotation is handled without restarting.
- **Hide preview** also sets `FLAG_SECURE` (blank recents preview; screenshots are blocked while on).
- **Theme/language/financial rules**: unchanged code. No registration, sync, billing or onboarding exists.

## Permissions (from the built APK)

| Permission                                                        | Why                                                                                | When                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `USE_BIOMETRIC` (+ `USE_FINGERPRINT`, ≤ API 28, by androidx)      | Fingerprint/face prompt for the lock screen                                        | normal permission, no dialog             |
| `POST_NOTIFICATIONS` (Android 13+)                                | Reminders                                                                          | asked when notifications are switched on |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`                             | Reminders scheduled before a restart come back (added by the notifications plugin) | normal permissions                       |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (own, signature-level) | Added by AndroidX so receivers are not exported                                    | none                                     |

Not present: `INTERNET`, storage, contacts, location, camera, SMS, accessibility, exact alarms.

## Privacy and security review (internal APK, not a Play/legal certification)

- Dependencies are the five listed above and their AndroidX/Capacitor transitive libraries (lockfile committed).
  No telemetry, advertising or crash-reporting SDK; no network endpoints; no `INTERNET` permission.
- No secrets or keys in the repository (`signing/README.md`).
- Logging: the native plugin logs nothing; the web code logs only error messages, never data. The emulator test
  scans the app's log for data and PIN hash markers.
- `allowBackup=false`; data-extraction rules exclude everything. WebView debugging is on only in the
  debuggable CI build, not in the release APK.
- The security promise is limited and stated in the app: the PIN/biometric hides the screen; the data is not
  encrypted; the sandbox protects it from other apps on a non-rooted phone.

## Tests and what they prove

| Level                                  | Command / where                 | Proves                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit checks (browser, 216)             | `node tests/run.mjs`            | financial rules (unchanged) + reminder planning, notification ids, PIN marker, bar color                                                                                                                                                                                                                                   |
| Browser scenarios (80)                 | `node tests/scenarios.mjs`      | the web UI incl. the Data section, unchanged                                                                                                                                                                                                                                                                               |
| **Mock-bridge scenarios (23)**         | `node tests/android-mock.mjs`   | The app calls the bridge correctly and reacts to its answers. **A mock, not Android**                                                                                                                                                                                                                                      |
| **Real Android system (emulator, CI)** | `android-app/e2e/emulator.mjs`  | install, offline launch, persistence across kill, internal-copy restore, damaged data untouched, Keystore PIN, real system save/share/print screens, Back, rotation, alarm registration and notification delivery with the app closed, exactly-once posting, update keeps data, foreign signature refused, web-file import |
| Real phone                             | `ANDROID_PHONE_CHECKLIST_RU.md` | Not done by me: fingerprint, real printer, your Android's behaviour, reboot reminders                                                                                                                                                                                                                                      |

Results of the latest run are in branch `android-builds` (`build-report.txt`, `emulator-results/report.txt`).

Last full run (build 11, commit `2e657dc`): web tests 216/216 units, 80/80 scenarios, 23/23 mock scenarios;
emulator (Android 14, API 34, x86_64) **29 passed, 0 failed**. The emulator runs on shared CI machines and
is sometimes slow or drops out (twice the emulator process itself went offline mid-run; those runs were
repeated, not counted as passes). Two real defects were found by it and fixed with regression tests: the
last saves lost on a hard kill (save counter + internal copy) and the reminders not being handed to the
system at launch.

## Limitations (honest list)

- The data model still lives in `localStorage` (~5M characters limit, shared with photos).
- Reminders are inexact; a payment is posted only when the app is opened (see above and
  [SCHEDULED_AND_NOTIFICATIONS.md](SCHEDULED_AND_NOTIFICATIONS.md): no scheduled operation is committed while
  the app is closed, and no background write to the WebView's `localStorage` is to be added).
- "Shared" only means the share sheet opened. Sharing/printing/biometrics on real hardware is untested by me.
- The emulator has no enrolled fingerprint, so the real biometric prompt and its cancel/lockout results are
  covered by the mock and the phone checklist only.
- Taking a photo straight from the camera is not offered (no camera permission); choose from the gallery.
- Needs a WebView with top-level `await` (Chromium 89+, i.e. any phone with updated "Android System WebView").
- Production signing and the Play listing are not done.
- Phone data cannot move to another phone automatically; use the data file.
