#!/usr/bin/env bash
# Runs inside the emulator job of .github/workflows/audit.yml (or by hand with any emulator `adb devices` lists):
# puts the data file on the phone, then measures both applications with tools/audit/compare.mjs.
set -uo pipefail
OUT="$PWD/audit-results"
mkdir -p "$OUT"
adb wait-for-device
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
adb shell getprop ro.build.version.release > "$OUT/android-version.txt"
adb shell getprop ro.product.model >> "$OUT/android-version.txt"
adb shell wm size >> "$OUT/android-version.txt"
adb push perf-data.json /sdcard/Download/perf-data.json >/dev/null
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/perf-data.json >/dev/null 2>&1
OLD="$(ls apks/old-apk/monivra-*[0-9].apk | head -1)"
RN="$(ls apks/rn-apk/*.apk | head -1)"
node tools/audit/compare.mjs "$OUT" "old=$OLD" "rn=$RN" 2>&1 | tee "$OUT/compare-log.txt"
exit 0
