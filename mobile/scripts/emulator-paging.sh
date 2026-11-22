#!/usr/bin/env bash
# Paging check on the Android emulator (task "stable paging", 2026-11-17): period swipes on Operations, Categories
# and Statistics, by month, week and day, empty and full periods, at a person's pace, quickly and as a stress test,
# each main scenario three times. Run by the CI on two emulator profiles (usual and weak).
#
# Written down per scenario (paging-results/):
#   steps.txt      what was done, the header/content check, CPU time and memory of the application;
#   perf.txt       the application's lines (speed-check build): per swipe, when the page chosen had its first
#                  meaningful content ("page ready after it was chosen"), page mounts, JavaScript pauses;
#   gfx.txt        the frames the system counted (dumpsys gfxinfo);
#   *.mp4          screen recordings, read afterwards by blank-frames.py (frames with an empty page area).
set -u
OUT="$PWD/paging-results"
mkdir -p "$OUT"
PKG=app.monivra.finance.next
APK=$(ls results-apk/*.apk | head -1)
HERE="$(cd "$(dirname "$0")" && pwd)"
log() { echo "$*" | tee -a "$OUT/steps.txt"; }
shot() { sleep "${2:-1}"; adb exec-out screencap -p > "$OUT/$1.png"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1; }
tap() {
  dump
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
  if [ -z "$xy" ]; then
    if grep -q "isn't responding" /tmp/ui.xml 2>/dev/null && [ -z "${RETRY:-}" ]; then RETRY=1 tap "Wait" 1; RETRY=1 tap "$@"; return $?; fi
    log "NOT FOUND: $1"; return 1
  fi
  { [ -n "${HOLD:-}" ] && adb shell input swipe $xy $xy 1000 || adb shell input tap $xy; }; sleep "${2:-1.5}"
}
# The centre of a tab of the bottom bar (by its label, low on the screen only).
tab_xy() {
  dump
  python3 - "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
best = None
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("content-desc") == sys.argv[1]:
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        if b > 2050: best = (a, b, c, d)
print(f"{(best[0] + best[2]) // 2} {(best[1] + best[3]) // 2}" if best else "540 1200")
PY
}
# The period title in the middle of the bar and the month of the first day head under it: the page must show the
# period its title names ("header/content" line; day heads exist on Operations only).
check() {
  dump
  python3 - "$1" <<'PY' | tee -a "$OUT/steps.txt"
import re, sys, xml.etree.ElementTree as ET
nodes = list(ET.parse("/tmp/ui.xml").iter("node"))
def box(n): return list(map(int, re.findall(r"\d+", n.get("bounds"))))
# The period title: a text (or description) with a year in it, in the middle of the upper part of the screen.
def label(n): return (n.get("text") or n.get("content-desc") or "")
title = [label(n) for n in nodes if re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|Today|Yesterday|Tomorrow|\b20\d\d\b", label(n)) and 300 < sum(box(n)[0::2]) // 2 < 780 and 150 < box(n)[1] < 650 and not re.search(r"KGS|USD", label(n))]
heads = [n.get("text") for n in nodes if re.match(r"^[A-Z][a-z]+\n[A-Z][a-z]+ \d{4}$", n.get("text") or "") and box(n)[1] > 400]
t = title[0] if title else "?"
h = heads[0].split("\n")[1] if heads else "-"
# The month of the first day head must be named in the title (a week across two months names both; "Today" and
# "Yesterday" are this month).
ok = "no rows" if h == "-" else ("matches" if h.split(" ")[0][:3] in t or (t in ("Today", "Yesterday", "Tomorrow")) else "MISMATCH")
print(f"header/content after {sys.argv[1]}: title «{t}», first day head «{h}»: {ok}")
PY
}
pid() { adb shell pidof $PKG | tr -d '\r'; }
# CPU time of the application in ms (user + system, from /proc), and its memory (PSS, kB).
cpu() { adb shell cat /proc/$(pid)/stat 2>/dev/null | awk '{print ($14 + $15) * 10}'; }
pss() { adb shell dumpsys meminfo $PKG | grep -m1 "TOTAL PSS" | awk '{print $3}'; }
begin() {
  MOVE="$1"
  adb shell "log -t ReactNativeJS '[perf] mark $MOVE'"
  adb shell dumpsys gfxinfo $PKG reset >/dev/null 2>&1
  CPU0=$(cpu)
}
finish() {
  sleep "${1:-3}"
  { echo "== $MOVE"; adb shell dumpsys gfxinfo $PKG | grep -E "Total frames rendered|Janky frames|90th percentile|99th percentile"; } >> "$OUT/gfx.txt"
  log "$MOVE: CPU $(( $(cpu) - CPU0 )) ms, memory $(pss) kB"
}
record() { adb shell "screenrecord --time-limit $2 /sdcard/$1.mp4" >/dev/null 2>&1 & REC=$!; sleep 1; }
stop_record() { wait $REC 2>/dev/null; sleep 1; adb pull "/sdcard/$1.mp4" "$OUT/$1.mp4" >/dev/null 2>&1 || log "video $1 not recorded"; }
back_swipe() { adb shell input swipe 250 1500 900 1500 ${1:-90}; }
next_swipe() { adb shell input swipe 900 1500 250 1500 ${1:-90}; }
# Choose the kind of period with the period dialog (the title opens it).
mode() {
  dump
  local xy
  xy=$(python3 - <<'PY'
import re, xml.etree.ElementTree as ET
for n in ET.parse("/tmp/ui.xml").iter("node"):
    a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
    t = n.get("text") or n.get("content-desc") or ""
    if re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|Today|Yesterday|Tomorrow|\b20\d\d\b", t) and 300 < (a + c) // 2 < 780 and 150 < b < 650 and "KGS" not in t:
        print((a + c) // 2, (b + d) // 2); break
PY
)
  [ -n "$xy" ] && adb shell input tap $xy && sleep 1.5 && tap "$1" 2 || log "NOT FOUND: period title"
}

# ---- Setup: the same ledger as the speed check (3000 operations over 18 months). ----------------------------
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
adb install -r "$APK" > "$OUT/install.txt" 2>&1 && log "installed" || { log "FAIL: install"; exit 1; }
adb logcat -G 16M >/dev/null 2>&1 || true
adb logcat -c
node "$HERE/perf-data.mjs" 3000 18 > /tmp/perf-data.json && adb push /tmp/perf-data.json /sdcard/Download/perf-data.json >/dev/null 2>&1
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/perf-data.json" >/dev/null 2>&1
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 20
tap "Start"
tap "More"; tap "Data"; tap "Data file"; tap "Restore from file" 4
tap "perf-data.json" 6 || { tap "Show roots"; tap "Downloads"; tap "List view"; tap "perf-data.json" 6; }
dump; python3 - <<'PY' > /tmp/xy
import re, xml.etree.ElementTree as ET
f = [n for n in ET.parse("/tmp/ui.xml").iter("node") if n.get("text") == "Replace data"]
if f:
    a, b, c, d = map(int, re.findall(r"\d+", f[-1].get("bounds"))); print((a + c) // 2, (b + d) // 2)
PY
[ -s /tmp/xy ] && adb shell input tap $(cat /tmp/xy) && sleep 1.5 && tap "Confirm" 20 || log "NOT FOUND: Replace data"
ops=$(tab_xy "Operations"); cats=$(tab_xy "Categories"); stats=$(tab_xy "Statistics"); accs=$(tab_xy "Accounts")
log "tabs: operations $ops, categories $cats, statistics $stats"
log "memory after the restore: $(pss) kB"

# ---- Scenarios ---------------------------------------------------------------------------------------------
# set NAME: on the screen shown, in the kind of period chosen.
#   normal  — 5 swipes back at a person's pace (1.5 s apart), then 5 forward (back where it started);
#   quick   — 10 swipes back 0.25 s apart (with the time `input` itself takes, one every ~0.5 s), 10 forward;
#   both three times, the first of each recorded; then once: reverse (back/forward ×6), revisit (10 back,
#   10 forward at a person's pace over periods seen just before).
set_of() {
  local name=$1
  for r in 1 2 3; do
    [ $r = 1 ] && record "$name-normal" 18
    begin "$name: normal ×5 back, run $r"; for i in $(seq 5); do back_swipe; sleep 1.5; done; finish 3
    [ $r = 1 ] && stop_record "$name-normal"
    check "$name normal run $r"
    begin "$name: normal ×5 forward, run $r"; for i in $(seq 5); do next_swipe; sleep 1.5; done; finish 3
  done
  for r in 1 2 3; do
    [ $r = 1 ] && record "$name-quick" 14
    begin "$name: quick ×10 back, run $r"; for i in $(seq 10); do back_swipe; sleep 0.25; done; finish 3
    [ $r = 1 ] && stop_record "$name-quick"
    check "$name quick run $r"
    begin "$name: quick ×10 forward, run $r"; for i in $(seq 10); do next_swipe; sleep 0.25; done; finish 3
  done
  begin "$name: reverse back/forward ×6"; for i in $(seq 6); do back_swipe 60; next_swipe 60; done; finish 3
  check "$name reverse"
  begin "$name: revisit 10 back, 10 forward (1 s apart)"; for i in $(seq 10); do back_swipe; sleep 1; done; for i in $(seq 10); do next_swipe; sleep 1; done; finish 3
  check "$name revisit"
}

adb shell input tap $ops; sleep 4
set_of operations-month
# Stress (a diagnostic, not a target): 30 swipes with no pause, recorded.
record operations-month-stress30 20
begin "operations-month: stress ×30 back, no pause"; for i in $(seq 30); do back_swipe 60; done; finish 4
stop_record operations-month-stress30
check "operations stress"
begin "operations-month: stress ×30 forward, no pause"; for i in $(seq 30); do next_swipe 60; done; finish 4
# Empty periods: the future months (no operations), quickly.
record operations-month-empty 12
begin "operations-month: quick ×10 into empty future months"; for i in $(seq 10); do next_swipe; sleep 0.25; done; finish 3
stop_record operations-month-empty
begin "operations-month: back from the future"; for i in $(seq 10); do back_swipe; sleep 0.25; done; finish 3
# A tab changed in the middle of quick swipes, then back: the period must be the one swiped to.
begin "operations-month: 5 quick swipes, tab Statistics, tab Operations"; for i in $(seq 5); do back_swipe 60; done; adb shell input tap $stats; sleep 2; adb shell input tap $ops; finish 3
check "operations after a tab change"
for i in $(seq 5); do next_swipe; sleep 0.6; done; sleep 2

mode "Week"; sleep 2
set_of operations-week
mode "Today"; sleep 2
set_of operations-day
mode "Month"; sleep 2

adb shell input tap $cats; sleep 4
set_of categories-month
adb shell input tap $stats; sleep 4
set_of statistics-month

log "memory at the end: $(pss) kB"
adb logcat -d -b crash > "$OUT/crash.txt" 2>&1
adb logcat -d -s ReactNativeJS:V > "$OUT/js-log.txt" 2>&1
grep "\[perf\]" "$OUT/js-log.txt" > "$OUT/perf.txt"
python3 "$HERE/perf-summary.py" "$OUT/perf.txt" "$OUT/gfx.txt" > "$OUT/perf-summary.txt" 2>/dev/null
if grep -q "FATAL\|AndroidRuntime" "$OUT/crash.txt"; then log "FAIL: crash (see crash.txt)"; exit 1; fi
log "done"
