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

echo "::group::android project"
rm -rf android
npx cap add android
node scripts/prepare-android.mjs
npx cap sync android
echo "::endgroup::"

# Signing: the production key from the secrets when given, the public internal test key otherwise.
if [ -n "${MONIVRA_KEYSTORE_B64:-}" ]; then
  echo "$MONIVRA_KEYSTORE_B64" | base64 -d > "$RUNNER_TEMP/monivra.keystore"
  export MONIVRA_KEYSTORE_FILE="$RUNNER_TEMP/monivra.keystore"
  SIGNING="production key from the repository secrets"
else
  export MONIVRA_KEYSTORE_FILE="$PWD/signing/monivra-internal-test.keystore"
  export MONIVRA_KEYSTORE_PASSWORD="monivra-test"
  export MONIVRA_KEY_ALIAS="monivra-test"
  export MONIVRA_KEY_PASSWORD="monivra-test"
  SIGNING="PUBLIC internal test key (signing/README.md)"
fi
VERSION="$(node -p "require('./package.json').version")"
export MONIVRA_VERSION_NAME="${VERSION}-build.${GITHUB_RUN_NUMBER:-0}"
export MONIVRA_VERSION_CODE="${GITHUB_RUN_NUMBER:-1}"

echo "::group::gradle"
(cd android && ./gradlew --no-daemon --console=plain assembleRelease assembleDebug)
echo "::endgroup::"

cp android/app/build/outputs/apk/release/app-release.apk "$OUT/monivra-${MONIVRA_VERSION_NAME}.apk"
cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT/monivra-${MONIVRA_VERSION_NAME}-debuggable.apk"
cp package-lock.json "$OUT/package-lock.json"
cp android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml "$OUT/merged-manifest-release.xml" 2>/dev/null || true

# Facts about the finished APK, read from the APK itself.
BT="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
{
  echo "version name: $MONIVRA_VERSION_NAME   version code: $MONIVRA_VERSION_CODE"
  echo "signing: $SIGNING"
  echo "git commit: ${GITHUB_SHA:-local}"
  for apk in "$OUT"/*.apk; do
    echo; echo "=== $(basename "$apk")"
    echo "size: $(stat -c %s "$apk") bytes"
    echo "sha256: $(sha256sum "$apk" | cut -d' ' -f1)"
    "$BT/aapt2" dump badging "$apk" | grep -E "^(package|sdkVersion|targetSdkVersion|application-label:|uses-permission|launchable-activity)" | sed 's/^/  /'
    echo "  signature:"; "$BT/apksigner" verify --verbose --print-certs "$apk" 2>&1 | grep -E "Verifies|Verified using|certificate (DN|SHA-256)" | sed 's/^/    /'
    echo "  debuggable: $("$BT/aapt2" dump xmltree --file AndroidManifest.xml "$apk" | grep -c 'debuggable.*0xffffffff' || true) (1 = yes)"
  done
} | tee "$OUT/build-report.txt"
(cd "$OUT" && sha256sum *.apk > SHA256SUMS.txt)
