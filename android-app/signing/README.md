# Internal test signing key (PUBLIC)

`monivra-internal-test.keystore` (alias `monivra-test`, password `monivra-test`) signs the
**internal test builds** of the Android app. It exists so that every test build carries the same
signature and can be installed over the previous one without losing data.

**It is not a secret, on purpose.** It is public like the Android SDK's own debug key: anyone who
reads this repository can sign an APK with it. Therefore:

- builds signed with it are for testing on your own phone only; never publish them;
- the Google Play / production key must be a different key, created separately and kept only in
  the repository secrets (see `docs/ANDROID.md`, section "Signing"). The build uses secrets when
  they are present (`MONIVRA_KEYSTORE_B64`, `MONIVRA_KEYSTORE_PASSWORD`, `MONIVRA_KEY_ALIAS`,
  `MONIVRA_KEY_PASSWORD`) and falls back to this test key otherwise;
- moving from the test key to a production key changes the signature, and Android then refuses to
  install over the old app: the data has to be saved to a data file, the old app uninstalled, the
  new one installed and the data file restored.
