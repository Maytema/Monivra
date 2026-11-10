# Signing

**No key is kept in this repository.** The earlier public test key (it was tracked here, with its
password written down) is **compromised**: treat it as known to everyone and never trust an APK that
is signed with it. It stays in the Git history; history was not rewritten.

- Test builds use the application id **`app.monivra.finance.dev`** and the owner's own test key. The
  key and its four values live in the repository secrets (`MONIVRA_KEYSTORE_B64`,
  `MONIVRA_KEYSTORE_PASSWORD`, `MONIVRA_KEY_ALIAS`, `MONIVRA_KEY_PASSWORD`) **and** in an offline copy
  the owner keeps. A key that exists only in the secrets (or on a runner) is lost with them.
- `android-app/scripts/make-test-key.sh <folder outside the repository>` makes such a key and the
  file with the four values; it prints no secret.
- Without those secrets the CI build is signed with a one-run key. That APK is only for the emulator
  test; it is not published, because nobody could ever update it.
- `app.monivra.finance` is kept for the production app; its key is a separate decision and is not
  created here.
- A new application id and a new key mean the test APK is **not an update** of an app installed
  earlier: see `docs/ANDROID_KEY_AND_REPO_RU.md` for the export, install and import steps.
