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
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
shot 01-first-start 25
has "Start with basic set" 01-first-start
tap "Start with basic set"
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
tap "Additionally"
shot 03b-additionally 2
adb shell input keyevent 4; sleep 1.5
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
tap "Total"
shot 02e-accounts-total 2
tap "Accounts"
tap "Cash"
tap "Transfer"
shot 02f-transfer 3
back
tap "Cash"
tap "Edit"
shot 12-account-form 3
# The icon dialog, the icon list and the colour page (pages over the whole screen).
tap "Icon"
shot 12c-customize-icon 2
tap "Choose an icon"
shot 12d-icon-page 2
back
tap "Choose color"
shot 12e-color-page 2
tap "Color code"
shot 12e2-color-hex-keyboard 2
back
back
back
tap "Account type"
shot 12g-select-type 2
back
adb shell input swipe 540 1800 540 600 300
shot 12b-account-form-end 2
tap "Account currency"
shot 12f-currency-sheet 2
adb shell input swipe 540 1900 540 900 200
shot 12h-currency-scrolled 1
back
back
tap "Categories"
shot 13-categories 3
tap "Change categories"
shot 13d-change-categories 3
tap "Food"
shot 13e-category-form 3
adb shell input swipe 540 1800 540 700 300
shot 13f-category-form-end 2
back
back
tap "Statistics"
shot 13b-statistics 3
adb shell input swipe 540 1800 540 600 300
shot 13c-statistics-scrolled 2
tap "Filters"
shot 13g-filters 2
tap "All accounts"
shot 13h-filter-accounts 2
back
back
tap "Operations"
tap "More"
shot 14-more 3
for page in "Settings" "Scheduled payments" "Budgets"; do
  tap "$page"
  shot "15-$(echo "$page" | tr ' ' '-')" 3
  back
done
tap "Settings"
for page in "Formatting" "Styles and elements" "Backups" "Notifications" "Security" "Privacy"; do
  tap "$page"
  shot "15s-$(echo "$page" | tr ' ' '-')" 2
  if [ "$page" = "Notifications" ]; then
    # "Run notification" must drop down from the top like the real ones (heads-up on the high-importance channel).
    tap "Run notification"
    sleep 1
    shot 15n-run-notification 1
    adb shell cmd statusbar collapse >/dev/null 2>&1
  fi
  back
done
for i in 1 2 3; do adb shell input swipe 540 1800 540 700 300; sleep 1; done
tap "Exchange rates"
shot 15-Exchange-rates 3
back
back
tap "Operations"
sleep 2
tap "Food, Cash, 125 KGS"
sleep 2
shot 16-editor 3
tap "Select date"
shot 16b-calendar 2
tap "Cancel"
tap "Attachment"
shot 16c-photo-menu 2
back
back
# Gestures: a swipe over the operations moves to the previous period; a long press on a row starts
# the selection.
tap "Operations"
sleep 2
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
xy=$(python3 - <<'PY'
import re, xml.etree.ElementTree as ET
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("content-desc") == "Food, Cash, 125 KGS":
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        print((a + c) // 2, (b + d) // 2); break
PY
)
log "long press at: $xy"
[ -n "$xy" ] && adb shell input swipe $xy $xy 900
shot 18-long-press-selection 3
has "Selected" 18-long-press-selection
tap "More"
shot 18b-bulk-edit 2
back
# (the selection is closed again, then the swipes)
tap "Exit selection"
adb shell input swipe 200 1500 900 1500 250
shot 17-swipe-period 3
# Half a swipe, finger still down: the neighbouring period must already be drawn.
adb shell input motionevent DOWN 950 1500; adb shell input motionevent MOVE 800 1500; adb shell input motionevent MOVE 600 1505; adb shell input motionevent MOVE 520 1505
shot 17a-half-swipe 1
adb shell input motionevent MOVE 900 1500; adb shell input motionevent UP 900 1500; sleep 1
adb shell input swipe 900 1500 200 1500 250
shot 17b-swipe-back 3
# The long press once more after the swipes (only looked at).
adb shell input swipe $xy $xy 900
shot 18c-long-press-after-swipes 3
grep -q 'text="Selected' "$OUT/18c-long-press-after-swipes.xml" && log "long press after swipes: works" || log "long press after swipes: NOT working"
# A tap after the swipes must still open the operation.
grep -q 'text="Selected' "$OUT/18c-long-press-after-swipes.xml" || { adb shell input tap $xy; shot 18d-tap-after-swipes 3; grep -q 'Click on the value to edit' "$OUT/18d-tap-after-swipes.xml" && log "tap after swipes: works" || log "tap after swipes: NOT working"; back; }
tap "Exit selection"
tap "November 2026"
shot 19-period-dialog 2
back
# The Data section: saved backups (make one, open it: what merge and replace would do), the data
# file, the import with its example, the export and its preview, the ways to delete.
tap "More"
tap "Data"
shot 20-data 2
has "Saved backups" 20-data
tap "Saved backups"
tap "Create a backup"
shot 20a-backups 2
has "Local backup" 20a-backups
tap "Local backup"
shot 20b-restore 3
has "Merge data" 20b-restore
adb shell input swipe 500 1600 500 500 300
shot 20c-restore-scrolled 2
back
back
tap "Data file"
shot 20d-data-file 2
back
tap "Import data"
shot 20e-import 2
tap "View example"
shot 20f-import-example 2
back
back
tap "Export data"
shot 20g-export 3
has "All time" 20g-export
tap "Preview"
shot 20h-export-preview 6
back
tap "Detailed transactions"
tap "Preview"
shot 20h2-export-detail 6
back
tap "CSV file"
tap "Preview"
shot 20h3-export-csv 3
back
back
tap "Delete my data"
shot 20i-deletion 2
tap "Delete operations"
shot 20j-delete-dialog 2
has "Create a backup first" 20j-delete-dialog
tap "Cancel"
back
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
grep "\[perf\]" "$OUT/js-log.txt" > "$OUT/perf.txt"; log "perf lines: $(wc -l < "$OUT/perf.txt")"
if grep -q "FATAL\|AndroidRuntime" "$OUT/crash.txt"; then log "FAIL: crash (see crash.txt)"; FAILED=1; fi
log "result: $([ $FAILED = 0 ] && echo passed || echo failed)"
exit $FAILED
