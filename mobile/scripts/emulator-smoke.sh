#!/usr/bin/env bash
# Smoke test of the React Native APK on an Android emulator: install, first start, the basic set,
# an operation entered with the calculator, a restart (the operation must still be there), and no
# crash. Screenshots and the UI trees go to emulator-results/ for a person to look at.
set -u
OUT="$PWD/emulator-results"
mkdir -p "$OUT"
PKG=app.monivra.finance.next
APK=$(ls results-apk/*.apk | head -1)
log() { echo "$*" | tee -a "$OUT/steps.txt"; }
shot() { sleep "${2:-2}"; adb exec-out screencap -p > "$OUT/$1.png"; adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/$1.xml" >/dev/null 2>&1; }
# Taps the centre of the first element whose text or description is exactly $1.
tap() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  local xy
  xy=$(python3 - "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want = sys.argv[1]
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("text") == want or n.get("content-desc") == want:
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        print((a + c) // 2, (b + d) // 2); break
PY
)
  if [ -z "$xy" ]; then log "NOT FOUND: $1"; return 1; fi
  adb shell input tap $xy; log "tapped: $1"; sleep 1.5
}
has() { grep -q "text=\"[^\"]*$1" "$OUT/$2.xml" && log "OK: '$1' on $2" || { log "FAIL: '$1' not on $2"; FAILED=1; }; }
FAILED=0

adb install -r "$APK" > "$OUT/install.txt" 2>&1 && log "installed" || { log "FAIL: install"; cat "$OUT/install.txt"; exit 1; }
adb logcat -c
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
shot 01-first-start 25
has "Start with a basic set" 01-first-start
tap "Start with a basic set"
shot 02-accounts 4
has "Cash" 02-accounts
tap "New operation"
shot 03-editor 4
for k in 1 2 5; do tap "$k"; done
shot 04-amount 1
tap "Category"
shot 04b-categories 2
tap "Food"
adb shell input swipe 540 1900 540 500 300; adb shell input swipe 540 1900 540 500 300; sleep 1
tap "Save"
shot 05-after-save 3
has "125" 05-after-save
tap "Operations"
shot 06-operations 3
has "125" 06-operations
adb shell am force-stop $PKG
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
shot 07-restarted 20
tap "Operations"
shot 08-operations-after-restart 3
has "125" 08-operations-after-restart
adb shell pidof $PKG > "$OUT/pid.txt" && log "OK: running" || { log "FAIL: not running"; FAILED=1; }
adb logcat -d -b crash > "$OUT/crash.txt" 2>&1
adb logcat -d -s ReactNativeJS:V > "$OUT/js-log.txt" 2>&1
if grep -q "FATAL\|AndroidRuntime" "$OUT/crash.txt"; then log "FAIL: crash (see crash.txt)"; FAILED=1; fi
log "result: $([ $FAILED = 0 ] && echo passed || echo failed)"
exit $FAILED
