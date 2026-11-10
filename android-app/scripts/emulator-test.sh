#!/usr/bin/env bash
# Runs the end-to-end test of the APKs on the running emulator (started by the CI job, or by hand:
# any device or emulator that `adb devices` lists works). Results go to android-app/emulator-results/.
set -uo pipefail
cd "$(dirname "$0")/.."
RELEASE="$(ls dist/monivra-*[0-9].apk | head -1)"
DEBUGGABLE="$(ls dist/monivra-*-debuggable.apk | head -1)"
NEXT="dist/upgrade-test-debuggable.apk"
node e2e/emulator.mjs "$RELEASE" "$DEBUGGABLE" "$NEXT" emulator-results
