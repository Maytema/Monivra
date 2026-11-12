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
has "Overall balance" 02-accounts
# The sheet of an account opens over the list and closes with "back".
tap "Cash"
shot 02b-account-sheet 2
has "Current balance" 02b-account-sheet
has "Top up" 02b-account-sheet
adb shell input keyevent 4; sleep 1.5
shot 02c-sheet-closed 1
has "Overall balance" 02c-sheet-closed
tap "Operations"
shot 02d-operations-empty 2
tap "New operation"
shot 03a-add-menu 3
has "Add an operation" 03a-add-menu
tap "Food"
shot 03-editor 4
for k in 1 2 5; do tap "$k"; done
shot 04-amount 1
tap "Save operation"
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
# A tour of the other screens (screenshots for a person; a missing label only logs NOT FOUND).
back() { adb shell input keyevent 4; sleep 1.5; }
tap "Accounts"
tap "Cash"
tap "Edit"
shot 12-account-form 3
adb shell input swipe 540 1800 540 600 300
shot 12b-account-form-end 2
back
tap "Categories"
shot 13-categories 3
tap "Statistics"
shot 13b-statistics 3
adb shell input swipe 540 1800 540 600 300
shot 13c-statistics-scrolled 2
tap "Operations"
tap "More"
shot 14-more 3
for page in "Settings" "Scheduled payments" "Budgets" "Exchange rates"; do
  tap "$page"
  shot "15-$(echo "$page" | tr ' ' '-')" 3
  back
done
tap "Operations"
tap "New operation"
tap "Food"
shot 16-editor 3
tap "Select date"
shot 16b-calendar 2
tap "Cancel"
back
# Gestures: a swipe over the operations moves to the previous period; a long press on a row starts
# the selection.
tap "Operations"
adb shell input swipe 200 1500 900 1500 250
shot 17-swipe-period 3
adb shell input swipe 900 1500 200 1500 250
shot 17b-swipe-back 3
adb shell input swipe 540 990 540 990 900
shot 18-long-press-selection 3
has "Selected" 18-long-press-selection
back
# Layout under other system settings: three-button navigation, a large font, a denser display.
# (Looked at by a person: screenshots only.)
tap "Accounts"
adb shell cmd overlay enable com.android.internal.systemui.navbar.threebutton >/dev/null 2>&1; sleep 4
shot 09-three-buttons 3
adb shell settings put system font_scale 1.3; sleep 3
shot 10-large-font 3
adb shell settings put system font_scale 1.0
adb shell wm density 520; sleep 3
shot 11-dense 3
adb shell wm density reset
adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural >/dev/null 2>&1; sleep 3
adb shell pidof $PKG > "$OUT/pid.txt" && log "OK: running" || { log "FAIL: not running"; FAILED=1; }
adb logcat -d -b crash > "$OUT/crash.txt" 2>&1
adb logcat -d -s ReactNativeJS:V > "$OUT/js-log.txt" 2>&1
if grep -q "FATAL\|AndroidRuntime" "$OUT/crash.txt"; then log "FAIL: crash (see crash.txt)"; FAILED=1; fi
log "result: $([ $FAILED = 0 ] && echo passed || echo failed)"
exit $FAILED
