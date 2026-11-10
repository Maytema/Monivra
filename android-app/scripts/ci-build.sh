#!/usr/bin/env bash
# Builds the Android APKs from a clean checkout. Used by .github/workflows/android.yml and works the
# same on any machine with Node 22, JDK 21 and the Android SDK (ANDROID_HOME).
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${OUT:-$PWD/dist}"
rm -rf "$OUT"; mkdir -p "$OUT"

echo "::group::npm install"
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
echo "::endgroup::"

echo "::group::web files"
node scripts/build-web.mjs
echo "::endgroup::"

export MONIVRA_APPLICATION_ID="${MONIVRA_APPLICATION_ID:-app.monivra.finance.dev}"
echo "::group::android project"
rm -rf android
npx cap add android
node scripts/prepare-android.mjs
npx cap sync android
echo "::endgroup::"

# Signing. The owner's test key comes from the repository secrets (MONIVRA_KEYSTORE_B64 and its
# password, alias and key password); nothing about a key is kept in the repository. Without those
# secrets the build is signed with a key made for this run only: such an APK can be checked on the
# emulator but is never published (see publish-build.sh), because nobody could update it later.
TMP="${RUNNER_TEMP:-$(mktemp -d)}"
if [ -n "${MONIVRA_KEYSTORE_B64:-}" ]; then
  echo "$MONIVRA_KEYSTORE_B64" | base64 -d > "$TMP/monivra.keystore"
  export MONIVRA_KEYSTORE_FILE="$TMP/monivra.keystore"
  SIGNING="owner test key from the repository secrets"
  OWNER_SIGNED=1
else
  PASS="$(openssl rand -hex 16)"
  keytool -genkeypair -keystore "$TMP/ephemeral.jks" -alias monivra-ci -keyalg RSA -keysize 2048 \
    -validity 2 -storepass "$PASS" -keypass "$PASS" -dname "CN=Monivra CI one-run key" >/dev/null 2>&1
  export MONIVRA_KEYSTORE_FILE="$TMP/ephemeral.jks"
  export MONIVRA_KEYSTORE_PASSWORD="$PASS" MONIVRA_KEY_ALIAS="monivra-ci" MONIVRA_KEY_PASSWORD="$PASS"
  SIGNING="EPHEMERAL one-run key (no owner key in the secrets): for the emulator test only, not for phones"
  OWNER_SIGNED=0
fi
VERSION="$(node -p "require('./package.json').version")"
export MONIVRA_VERSION_NAME="${VERSION}-build.${GITHUB_RUN_NUMBER:-0}"
export MONIVRA_VERSION_CODE="${GITHUB_RUN_NUMBER:-1}"

echo "::group::gradle"
(cd android && ./gradlew --no-daemon --console=plain assembleRelease assembleDebug)
echo "::endgroup::"

cp android/app/build/outputs/apk/release/app-release.apk "$OUT/monivra-${MONIVRA_VERSION_NAME}.apk"
cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT/monivra-${MONIVRA_VERSION_NAME}-debuggable.apk"

# A second debuggable build with a higher version code, signed with the same key: the emulator test
# installs it over the first one to check that an update keeps the data.
echo "::group::gradle (upgrade-test build)"
(cd android && MONIVRA_VERSION_CODE=$((MONIVRA_VERSION_CODE + 1)) MONIVRA_VERSION_NAME="${MONIVRA_VERSION_NAME}-next" \
  ./gradlew --no-daemon --console=plain assembleDebug)
echo "::endgroup::"
cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT/upgrade-test-debuggable.apk"
cp package-lock.json "$OUT/package-lock.json"
cp android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml "$OUT/merged-manifest-release.xml" 2>/dev/null || true

# Facts about the finished APK, read from the APK itself.
BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
cp "$BT/lib/apksigner.jar" "$OUT/apksigner.jar" 2>/dev/null || true
{
  echo "version name: $MONIVRA_VERSION_NAME   version code: $MONIVRA_VERSION_CODE"
  echo "signing: $SIGNING"
  echo "application id: $MONIVRA_APPLICATION_ID"
  echo "git commit: ${GITHUB_SHA:-local}"
  for apk in "$OUT"/*.apk; do
    echo; echo "=== $(basename "$apk")"
    echo "size: $(stat -c %s "$apk") bytes"
    echo "sha256: $(sha256sum "$apk" | cut -d' ' -f1)"
    "$BT/aapt2" dump badging "$apk" | grep -E "^(package|sdkVersion|minSdkVersion|targetSdkVersion|application-label:|uses-permission|launchable-activity|application-debuggable)" | sed 's/^/  /'
    echo "  signature:"; "$BT/apksigner" verify --verbose --print-certs "$apk" 2>&1 | grep -E "Verifies|Verified using|certificate (DN|SHA-256)" | sed 's/^/    /'
    if "$BT/aapt2" dump badging "$apk" | grep -q "^application-debuggable"; then echo "  debuggable: yes (test build only)"; else echo "  debuggable: no"; fi
  done
} | tee "$OUT/build-report.txt"
(cd "$OUT" && sha256sum *.apk > SHA256SUMS.txt)
# The publisher reads this: only builds signed with the owner key may leave the run.
[ "$OWNER_SIGNED" = 1 ] && echo owner > "$OUT/.owner-signed" || true
