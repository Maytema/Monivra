#!/usr/bin/env bash
# Speed check on the Android emulator: the application gets a large ledger (3000 operations over 18 months, as
# after a year and a half of use) and a person's usual moves are made — tabs, the list, periods, an operation.
# For every move two things are written down:
#   - the pauses of the JavaScript thread ("[perf] stall …" lines of the speed-check build, platform/perf.ts);
#   - the frames the system counted as slow (dumpsys gfxinfo).
# perf-summary.txt puts them in one table; compare it between builds (the emulator is slower than a phone, so
# the numbers mean something only against each other).
set -u
OUT="$PWD/perf-results"
mkdir -p "$OUT"
PKG=app.monivra.finance.next
APK=$(ls results-apk/*.apk | head -1)
HERE="$(cd "$(dirname "$0")" && pwd)"
log() { echo "$*" | tee -a "$OUT/steps.txt"; }
shot() { sleep "${2:-1}"; adb exec-out screencap -p > "$OUT/$1.png"; }
# tap TEXT [PAUSE] [last]: taps the element whose text or description is TEXT; with "last", the last of several
# (a button below a heading of the same words).
tap() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  local xy
  xy=$(python3 - "$1" "${3:-first}" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want, which = sys.argv[1], sys.argv[2]
found = [n for n in ET.parse("/tmp/ui.xml").iter("node") if n.get("text") == want or n.get("content-desc") == want]
if found:
    n = found[-1] if which == "last" else found[0]
    a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
    print((a + c) // 2, (b + d) // 2)
PY
)
  if [ -z "$xy" ]; then log "NOT FOUND: $1"; return 1; fi
  adb shell input tap $xy; log "tapped: $1"; sleep "${2:-1.5}"
}
# Where an element is, without tapping it (the taps of a measured move must not be delayed by a dump).
where() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  python3 - "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want = sys.argv[1]
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("text") == want or n.get("content-desc") == want:
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        print((a + c) // 2, (b + d) // 2); break
PY
}
back() { adb shell input keyevent 4; sleep 1.2; }
# A measured move: the mark goes to the same log as the application's lines, the frame counters start at zero.
begin() {
  MOVE="$1"
  adb shell log -t ReactNativeJS "[perf] mark $MOVE"
  adb shell dumpsys gfxinfo $PKG reset >/dev/null 2>&1
}
finish() {
  sleep "${1:-2}"
  { echo "== $MOVE"; adb shell dumpsys gfxinfo $PKG | grep -E "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile|Number Slow UI thread|Number Frame deadline missed"; } >> "$OUT/gfx.txt"
}

adb install -r "$APK" > "$OUT/install.txt" 2>&1 && log "installed" || { log "FAIL: install"; cat "$OUT/install.txt"; exit 1; }
adb logcat -c
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
node "$HERE/perf-data.mjs" 3000 18 > /tmp/perf-data.json && adb push /tmp/perf-data.json /sdcard/Download/perf-data.json >/dev/null 2>&1
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/perf-data.json" >/dev/null 2>&1

begin "cold start"
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
finish 25
tap "Start with basic set" 4

# The large ledger comes in as a data file, the way a person moves data from the first application.
tap "More"; tap "Data"; tap "Data file"; tap "Restore from file" 4
tap "perf-data.json" 4 || { tap "Show roots"; tap "Downloads"; tap "List view"; tap "perf-data.json" 4; }
shot 00-restore-page 2
begin "restore 3000 operations"
tap "Replace data" 1.5 last; tap "Confirm" 1
finish 20
shot 01-after-restore 1

# ---- The moves -------------------------------------------------------------------------------------
begin "open tab Operations (first time)"; tap "Operations" 0; finish 6
shot 02-operations 0
begin "scroll the operations down (6 flicks)"
for i in 1 2 3 4 5 6; do adb shell input swipe 540 1800 540 600 120; sleep 0.7; done
finish 3
begin "scroll the operations back up (6 flicks)"
for i in 1 2 3 4 5 6; do adb shell input swipe 540 600 540 1800 120; sleep 0.7; done
finish 3
begin "swipe to the previous period (3 times)"
for i in 1 2 3; do adb shell input swipe 200 1500 900 1500 200; sleep 2.5; done
finish 2
begin "swipe to the next period (3 times)"
for i in 1 2 3; do adb shell input swipe 900 1500 200 1500 200; sleep 2.5; done
finish 2
begin "open tab Statistics (first time)"; tap "Statistics" 0; finish 6
shot 03-statistics 0
begin "scroll the statistics (3 flicks down, 3 up)"
for i in 1 2 3; do adb shell input swipe 540 1800 540 600 150; sleep 0.8; done
for i in 1 2 3; do adb shell input swipe 540 600 540 1800 150; sleep 0.8; done
finish 2
begin "statistics: previous period and back"
adb shell input swipe 200 1500 900 1500 200; sleep 2.5; adb shell input swipe 900 1500 200 1500 200
finish 4
begin "open tab Categories (first time)"; tap "Categories" 0; finish 6
shot 04-categories 0
begin "open tab Accounts"; tap "Accounts" 0; finish 4
begin "tabs again: Operations, Statistics, Categories, Accounts"
for name in Operations Statistics Categories Accounts; do xy=$(where "$name"); adb shell input tap $xy; sleep 2; done
finish 2

# A new expense with the keys, saved: the list must take it without drawing everything again.
tap "Operations"
xy=$(where "New operation")
begin "open the add menu"; adb shell input tap $xy; finish 3
begin "choose a category (the editor opens)"; tap "Food" 0 || tap "Internet" 0; finish 3
k1=$(where "1"); k2=$(where "2"); k5=$(where "5"); save=$(where "Save operation")
begin "type 1 2 5 on the keys"
adb shell input tap $k1; sleep 0.4; adb shell input tap $k2; sleep 0.4; adb shell input tap $k5
finish 2
begin "save the operation"; adb shell input tap $save; finish 5
shot 05-after-save 0

# The report of all 3000 operations (many pages): the first preview waits for its first pages behind the dialog,
# the rest are made in the background; the second opening must be at once (the pictures are kept).
tap "More"; tap "Data"; tap "Export data" 3
tap "Detailed transactions" 1
begin "report preview, first time (3000 operations)"; tap "Preview" 0
for i in $(seq 1 90); do sleep 1; adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null | grep -q 'text="Preview of your data' && break; done
log "preview open after ${i}s"
finish 1
shot 08-preview 0
begin "scroll the preview (8 flicks)"
for i in 1 2 3 4 5 6 7 8; do adb shell input swipe 540 1800 540 500 150; sleep 0.8; done
finish 2
shot 09-preview-scrolled 0
back
begin "report preview, second time"; tap "Preview" 0; sleep 3; finish 1
shot 10-preview-again 0
back; back; back

# The lock: a PIN is set, the screen locked, the PIN typed (time from the last digit to the open screen).
tap "More"; tap "Settings"; tap "Security"
tap "PIN code"
for k in 1 2 3 4; do tap "$k" 0.3; done
tap "Save" 0.5
for k in 1 2 3 4; do tap "$k" 0.3; done
begin "save the PIN"; tap "Save" 0; finish 5
tap "Lock now" 2
k1=$(where "1"); k2=$(where "2"); k3=$(where "3"); k4=$(where "4")
begin "type a wrong PIN (1111)"
for i in 1 2 3 4; do adb shell input tap $k1; sleep 0.25; done
finish 4
shot 06-wrong-pin 0
begin "type the right PIN (1234)"
adb shell input tap $k1; sleep 0.25; adb shell input tap $k2; sleep 0.25; adb shell input tap $k3; sleep 0.25; adb shell input tap $k4
finish 4
shot 07-unlocked 0

adb logcat -d -b crash > "$OUT/crash.txt" 2>&1
adb logcat -d -s ReactNativeJS:V > "$OUT/js-log.txt" 2>&1
grep "\[perf\]" "$OUT/js-log.txt" > "$OUT/perf.txt"
python3 "$HERE/perf-summary.py" "$OUT/perf.txt" "$OUT/gfx.txt" > "$OUT/perf-summary.txt"
cat "$OUT/perf-summary.txt"
if grep -q "FATAL\|AndroidRuntime" "$OUT/crash.txt"; then log "FAIL: crash (see crash.txt)"; exit 1; fi
log "result: measured"
