#!/usr/bin/env bash
# Keyboard, focus and layers on the Android emulator (task "keyboard audit", 2026-11-21). Runs after the smoke test
# on the same emulator, on a fresh application (its data cleared). For every step it writes whether the system
# keyboard is shown (dumpsys input_method: mInputShown), and takes a screenshot; where the keyboard should go away
# it writes how long that took (polled every ~0.1 s, so ±0.1 s), and it checks the typed text is still in the form.
# Results: emulator-results/keyboard/ (steps.txt, *.png).
set -u
OUT="$PWD/emulator-results/keyboard"
mkdir -p "$OUT"
PKG=app.monivra.finance.next
log() { echo "$*" | tee -a "$OUT/steps.txt"; }
shot() { sleep "${2:-1}"; adb exec-out screencap -p > "$OUT/$1.png"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1; }
xy_of() {
  dump
  python3 - "$1" "${2:-first}" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want, which = sys.argv[1], sys.argv[2]
found = [n for n in ET.parse("/tmp/ui.xml").iter("node") if n.get("text") == want or n.get("content-desc") == want]
if found:
    n = found[-1] if which == "last" else found[0]
    a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
    print((a + c) // 2, (b + d) // 2)
PY
}
# A system window of the busy emulator ("Pixel Launcher isn't responding") can cover the application: it is answered
# "Wait" before anything else is done (build 119 ran entirely under it).
clear_system_window() {
  dump
  if grep -q "isn't responding" /tmp/ui.xml 2>/dev/null; then
    local w; w=$(xy_of "Wait")
    [ -n "$w" ] && adb shell input tap $w && sleep 1.5 && log "system window: isn't responding — Wait"
  fi
}
tap() {
  local xy; xy=$(xy_of "$1" "${3:-first}")
  if [ -z "$xy" ] && grep -q "isn't responding" /tmp/ui.xml 2>/dev/null; then clear_system_window; xy=$(xy_of "$1" "${3:-first}"); fi
  if [ -z "$xy" ]; then log "NOT FOUND: $1"; return 1; fi
  adb shell input tap $xy; sleep "${2:-1.5}"
}
has() { dump; grep -q "text=\"$1" /tmp/ui.xml && echo yes || echo no; }
kb() { adb shell dumpsys input_method | grep -o "mInputShown=[a-z]*" | head -1 | cut -d= -f2; }
# Time until the keyboard is hidden after an action (or "still shown" after 3 s).
gone_after() {
  local start end
  start=$(date +%s%3N)
  for i in $(seq 30); do
    if [ "$(kb)" = "false" ]; then end=$(date +%s%3N); echo "hidden after $((end - start)) ms"; return; fi
    sleep 0.1
  done
  echo "STILL SHOWN after 3 s"
}
# The tab of the bottom bar (low on the screen only: the same words appear on the screens).
tab() {
  dump
  local xy; xy=$(python3 - "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("content-desc") == sys.argv[1]:
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        if b > 2050: print((a + c) // 2, (b + d) // 2)
PY
)
  [ -n "$xy" ] && adb shell input tap $(echo "$xy" | tail -1) && sleep 2 || log "NOT FOUND: tab $1"
}
# Focus the title field of the account form and type in it (its placeholder while empty, its label after).
type_name() {
  tap "Enter the title" 1 || tap "Title" 1 || return 1
  adb shell input text "$1"; sleep 1
}
open_form() { tap "New account" 2 && tap "Regular" 2; }

adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
adb shell pm clear $PKG >/dev/null 2>&1
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
adb logcat -c
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
# Wait for the first screen (up to 60 s), answering system windows on the way.
for i in $(seq 30); do
  clear_system_window
  grep -q "Start with basic set" /tmp/ui.xml 2>/dev/null && break
  sleep 2
done
log "first screen after $((i * 2)) s or more: $(grep -q "Start with basic set" /tmp/ui.xml && echo shown || echo NOT SHOWN)"
shot k0-start 0
tap "Start with basic set" 4

# K1 — the owner's case: New account, the name typed, Customize icon opened with the keyboard up.
tab "Accounts"
open_form
type_name "Kbtest"
log "K1 typing in the form: keyboard $(kb)"
shot k1-typing 0
adb shell input tap $(xy_of "Icon" | tail -1)
log "K1 Customize icon opened: $(gone_after)"
shot k1-icon-sheet 1
log "K1 icon sheet: keyboard $(kb)"
adb shell input keyevent 4; sleep 1.5
log "K1 back on the form: keyboard $(kb); name kept: $(has Kbtest)"
shot k1-back-on-form 0

# K2 — a selection sheet (the currency) from a focused field.
type_name "x"
tap "Account currency" 0
log "K2 currency sheet opened: $(gone_after)"
shot k2-currency-sheet 1
adb shell input keyevent 4; sleep 1.5
log "K2 back on the form: keyboard $(kb); name kept: $(has Kbtestx)"

# K3 — Android Back with the keyboard up: the keyboard goes, the form stays.
type_name "y"
adb shell input keyevent 4
log "K3 Back pressed: $(gone_after); form still open: $(has "Account currency")"

# K4 — a tap on an empty part of the form (not on a control).
type_name "z"
adb shell input tap 540 2000
log "K4 tap on an empty area: $(gone_after)"
shot k4-empty-tap 0

# K5 — leaving the form with the keyboard up (back arrow of the page).
type_name "w"
# (The back arrow of the page: its description differs between versions; at the top left otherwise.)
tap "Navigate up" 0 || adb shell input tap 72 200
log "K5 left the form: $(gone_after); on Accounts: $(has "New account")"
shot k5-left-form 1

# K6 — the search of Operations (it focuses itself), then another tab.
tab "Operations"
tap "Operation search" 1
log "K6 search opened: keyboard $(kb)"
tab "Statistics"
log "K6 tab changed during the search: $(gone_after)"
shot k6-other-tab 0
tab "Operations"
log "K6 back on Operations: keyboard $(kb)"
tap "Close search" 1

# K7 — repeated: open and close the icon sheet five times from a focused field (stuck keyboard? layout?).
tab "Accounts"
open_form
for i in 1 2 3 4 5; do
  type_name "r"
  adb shell input tap $(xy_of "Icon" | tail -1); sleep 1
  log "K7 run $i: keyboard over the icon sheet: $(kb)"
  adb shell input keyevent 4; sleep 1.2
done
log "K7 form kept: $(has Kbtestrrrrr)"
shot k7-after-repeats 0

adb logcat -d -s ReactNativeJS:V ReactNative:V AndroidRuntime:E > "$OUT/log.txt" 2>&1
log "done"
