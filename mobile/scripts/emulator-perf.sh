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
  if [ -z "$xy" ]; then
    # A system window of the emulator ("Pixel Launcher isn't responding") can cover the application: it is
    # answered "Wait" and the tap tried once more.
    if [ -z "${RETRY:-}" ] && grep -q "isn't responding" /tmp/ui.xml 2>/dev/null; then
      log "system window: isn't responding — Wait"
      RETRY=1 tap "Wait" 1 && { RETRY=1 tap "$@"; return $?; }
    fi
    log "NOT FOUND: $1"; return 1
  fi
  { [ -n "${HOLD:-}" ] && adb shell input swipe $xy $xy 1000 || adb shell input tap $xy; }; log "tapped: $1"; sleep "${2:-1.5}"
}
# Where an element is, without tapping it (the taps of a measured move must not be delayed by a dump).
where() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  # The last match: a word of the screen under a sheet ("1" among the day numbers) comes earlier in the tree than the sheet's own.
  python3 - "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
want = sys.argv[1]
hit = None
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("text") == want or n.get("content-desc") == want:
        hit = n
if hit is not None:
    a, b, c, d = map(int, re.findall(r"\d+", hit.get("bounds")))
    print((a + c) // 2, (b + d) // 2)
PY
}
back() { adb shell input keyevent 4; sleep 1.2; }
# A measured move: the mark goes to the same log as the application's lines, the frame counters start at zero.
begin() {
  MOVE="$1"
  # One quoted string for the phone's shell: a name with brackets would otherwise be a syntax error there and
  # the mark would be lost.
  adb shell "log -t ReactNativeJS '[perf] mark $MOVE'"
  adb shell dumpsys gfxinfo $PKG reset >/dev/null 2>&1
}
finish() {
  sleep "${1:-2}"
  { echo "== $MOVE"; adb shell dumpsys gfxinfo $PKG | grep -E "Total frames rendered|Janky frames|50th percentile|90th percentile|95th percentile|99th percentile|Number Slow UI thread|Number Frame deadline missed"; } >> "$OUT/gfx.txt"
}

# The busy emulator often shows "Pixel Launcher isn't responding" over the application; the system is asked
# not to show such windows (the tap retry below stays as a second line).
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1
adb shell settings put secure anr_show_background 0 >/dev/null 2>&1
adb install -r "$APK" > "$OUT/install.txt" 2>&1 && log "installed" || { log "FAIL: install"; cat "$OUT/install.txt"; exit 1; }
adb logcat -G 16M >/dev/null 2>&1 || true
adb logcat -c
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
node "$HERE/perf-data.mjs" 3000 18 > /tmp/perf-data.json && adb push /tmp/perf-data.json /sdcard/Download/perf-data.json >/dev/null 2>&1
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Download/perf-data.json" >/dev/null 2>&1

begin "cold start"
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
finish 25
begin "first screen: start with the basic set"
tap "Start"
finish 1

# The owner's case (0.3.7 phone, empty profile: every tab shows its empty state with an animation): quick taps on the
# tabs right after the first screen, while the profile is still empty. The ledger restore below fills the lists and the
# empty states are gone, so the moves further down never saw them. Tab taps go by coordinates taken once (no
# "uiautomator dump" inside a measured move). perf-summary.py counts the "tab press" and "tab press dropped" lines and
# the press-to-shown times of each move.
# shown_tab: the tab the bar shows as open (its "selected" state), written to the steps.
shown_tab() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  python3 - <<'PY'
import xml.etree.ElementTree as ET
names = ["Accounts", "Categories", "Operations", "Statistics", "More"]
found = [n.get("content-desc") for n in ET.parse("/tmp/ui.xml").iter("node") if n.get("content-desc") in names and n.get("selected") == "true"]
print(found[0] if found else "none")
PY
}
# The centre of a tab of the bottom bar (by its label, in the lowest eighth of the screen: the same words appear
# elsewhere on the screens, and a tap meant for a tab then went there — builds 100–110).
tab_xy() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
  python3 - "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
best = None
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if n.get("content-desc") == sys.argv[1]:
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        if b > 2050 and (best is None or b > best[1]): best = (a, b, c, d)
print(f"{(best[0] + best[2]) // 2} {(best[1] + best[3]) // 2}" if best else "540 1200")
PY
}
ops=$(tab_xy "Operations"); stats=$(tab_xy "Statistics"); cats=$(tab_xy "Categories"); accs=$(tab_xy "Accounts"); more=$(tab_xy "More")
log "empty profile, tab centres: accounts $accs, categories $cats, operations $ops, statistics $stats, more $more"
# The cost of each picture on its own (0.3.15): for every tab with a picture, a visit from another tab, 3.5 s on it with the
# picture playing (JS busy over those seconds, the frames the system drew, the press-to-shown time of the tab), then the same tab
# again after the picture was left running to its end ("settled": the picture at rest is the baseline the playing one is
# compared with). The tabs replay on every visit until the owner acts, so nothing here changes what the later moves see.
picture_cost() { # $1 kind, $2 tab centre, $3 another tab's centre
  adb shell input tap $3; sleep 1.5
  begin "picture $1: visit, playing (3.5 s)"; adb shell input tap $2; sleep 1.2; adb exec-out screencap -p > "$OUT/picture-$1-mid.png"; finish 2.5
  begin "picture $1: same tab, at rest (3 s, after the run)"; finish 3
}
picture_cost operations "$ops" "$accs"
picture_cost accounts "$accs" "$ops"
picture_cost statistics "$stats" "$ops"
picture_cost categories "$cats" "$ops"
begin "empty: Accounts → Statistics → Accounts (0.3 s)"
adb shell input tap $stats; sleep 0.3; adb shell input tap $accs
finish 3
log "empty, after Accounts → Statistics → Accounts: shown $(shown_tab) (expected Accounts)"
adb shell input tap $cats; sleep 2
begin "empty: Categories → Operations → Categories (0.3 s)"
adb shell input tap $ops; sleep 0.3; adb shell input tap $cats
finish 3
log "empty, after Categories → Operations → Categories: shown $(shown_tab) (expected Categories)"
# 12 taps, a different tab each time, 0.25-0.5 s apart; the order and the pauses come from a fixed seed.
mix=$(python3 - "$accs" "$cats" "$ops" "$stats" "$more" <<'PY'
import random, sys
random.seed(2311)
tabs = [a.split() for a in sys.argv[1:]]
last = 0  # the move starts on Accounts
for _ in range(12):
    last = random.choice([i for i in range(5) if i != last])
    print(tabs[last][0], tabs[last][1], round(random.uniform(0.25, 0.5), 2), last)
PY
)
adb shell input tap $accs; sleep 2
begin "empty: 12 taps in random tab order, 0.25-0.5 s apart"
while read -r x y pause _; do adb shell input tap $x $y </dev/null; sleep $pause; done <<< "$mix"
finish 3
last_tab=$(echo "$mix" | tail -1 | awk '{print $4}')
log "empty, after 12 random taps: shown $(shown_tab) (expected index $last_tab of Accounts, Categories, Operations, Statistics, More)"

# Layers over an empty Operations tab (0.3.12): the add sheet opened right after entering the tab, while its picture runs,
# and again with the picture at rest (the person has acted: the period changed, the tab was seen). Written as "layer sheet
# shown" per move; perf-summary.py lists them. Then the period dialog: four picks of a tile, the old order (pick, then
# close) and the new one (close, then pick) in turns; "period dialog: tile tap to dialog gone" per pick.
adb shell input tap $accs; sleep 2
begin "empty: add sheet 0.7 s after entering Operations, picture running"
adb shell input tap $ops; sleep 0.7
tap "Add" 0 || true
finish 2
back
adb shell input tap $accs; sleep 1
adb shell input tap $ops; sleep 2
tap "Next period" 1 || true      # the person acts: pictures of seen tab screens stay at rest from now on
adb shell input tap $accs; sleep 1
adb shell input tap $ops; sleep 2
adb shell input tap $accs; sleep 1
begin "empty: add sheet 0.7 s after entering Operations, picture at rest"
adb shell input tap $ops; sleep 0.7
tap "Add" 0 || true
finish 2
back
for round in 1 2 3 4; do
  begin "empty: period dialog, tile pick $round"
  title_xy=$(python3 - <<'PY'
import re, xml.etree.ElementTree as ET
import subprocess
subprocess.run("adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1", shell=True)
for n in ET.parse("/tmp/ui.xml").iter("node"):
    if re.fullmatch(r"[A-Za-z]+ [0-9]{4}", n.get("content-desc") or ""):
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        if 300 < (a + c) // 2 < 780:
            print((a + c) // 2, (b + d) // 2); break
PY
)
  [ -n "$title_xy" ] && adb shell input tap $title_xy; sleep 1.5
  if tap "Month" 0; then :; else tap "Today" 0 || true; fi
  finish 2
done
shot 12z-after-period-dialog 0

# The large ledger comes in as a data file, the way a person moves data from the first application.
tap "More"; tap "Data"; tap "Data file"; tap "Restore from file" 4
begin "read the file and open the restore page"
tap "perf-data.json" 6 || { tap "Show roots"; tap "Downloads"; tap "List view"; tap "perf-data.json" 6; }
finish 1
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
shot 02b-operations-scrolled 0
# Half a row more, so a day head is being pushed away by the next one (the sticky head must stay opaque).
adb shell input swipe 540 1400 540 1250 600; shot 02c-operations-sticky 1
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

# The owner's complaints, one move each (build 100 on): a tab pressed soon after another one, two quick period
# swipes, the expense/income switch of the statistics, the pages that open slowly, a tab of a sheet chosen by a tap.
ops=$(tab_xy "Operations"); stats=$(tab_xy "Statistics"); cats=$(tab_xy "Categories"); accs=$(tab_xy "Accounts"); more=$(tab_xy "More")
log "tab centres: accounts $accs, categories $cats, operations $ops, statistics $stats, more $more"
adb shell input tap $ops; sleep 3
for gap in 1.5 0.8 0.4; do
  begin "tab back and forth, ${gap}s apart (Operations → Statistics → Operations)"
  adb shell input tap $stats; sleep $gap; adb shell input tap $ops
  finish 3
  log "after back and forth (${gap}s): shown $(shown_tab) (expected Operations)"
done
begin "tab chain quickly: Categories, Accounts, Statistics, Operations (0.5s apart)"
for xy in "$cats" "$accs" "$stats" "$ops"; do adb shell input tap $xy; sleep 0.5; done
finish 3
log "after the chain: shown $(shown_tab) (expected Operations)"
# A finger swipe (down, moves, up: like a hand, not one "swipe" command) inside a tab's pager, then at once a tap on
# another tab: does the first tap after a swipe reach the bar? (The owner: "the first press is ignored, the second
# works"; bar notes in perf.txt: "bar touched" without "tab press", "touch start with N touches".)
# (One gesture of 250 ms: separate motionevent commands are ~0.3 s apart, the finger rested longer than a long press
# and the rows went into selection — build 110.)
finger_swipe() { adb shell input swipe 950 1500 260 1500 250; }
for pair in "$cats:Categories:$accs:Accounts" "$accs:Accounts:$cats:Categories" "$ops:Operations:$accs:Accounts"; do
  IFS=: read from fname to tname <<< "$pair"
  adb shell input tap $from; sleep 2
  begin "finger swipe in $fname, then one tap on $tname"
  finger_swipe; sleep 0.6; adb shell input tap $to
  finish 2
  log "after a swipe in $fname, one tap on $tname: shown $(shown_tab) (expected $tname)"
done
period_title() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1; python3 - <<'PY'
import re, xml.etree.ElementTree as ET
# The title in the middle of the screen (the neighbours' titles are in the tree too, off to the sides).
t = []
for n in ET.parse("/tmp/ui.xml").iter("node"):
    name = n.get("text") or n.get("content-desc") or ""   # the period bar gives the title as a description
    if re.match(r"^[A-Z][a-z]+ \d{4}$", name):
        a, b, c, d = map(int, re.findall(r"\d+", n.get("bounds")))
        if 300 < (a + c) // 2 < 780: t.append(name)
print(t[0] if t else "?")
PY
}
before=$(period_title)
begin "two quick period swipes (0.35s apart)"
adb shell input swipe 900 1500 250 1500 120; sleep 0.35; adb shell input swipe 900 1500 250 1500 120
finish 3
shot 13-two-quick-swipes 0
log "two quick swipes: $before → $(period_title) (expected two months later)"
before=$(period_title)
begin "swipe back and forth quickly (0.35s apart)"
adb shell input swipe 250 1500 900 1500 120; sleep 0.35; adb shell input swipe 900 1500 250 1500 120
finish 3
shot 14-back-and-forth 0
log "back and forth: $before → $(period_title) (expected the same)"
adb shell input tap $stats; sleep 3
begin "statistics: Incomes"; tap "Incomes" 0; finish 3
begin "statistics: Expenses"; tap "Expenses" 0; finish 3
tap "More"
begin "open Budgets"; tap "Budgets" 0; finish 4
shot 11-budgets 0
back
begin "open Scheduled payments"; tap "Scheduled payments" 0; finish 4
shot 12-scheduled 0
back
adb shell input tap $ops; sleep 2

# ---- Fast period swipes (white pages task, build 109 on). Each block: a video, then the frames are read for empty
# pages (scripts/blank-frames.py, run after the build). The pager notes say per swipe whether the page the finger
# reached, and the one after it, had their contents drawn. `input` itself needs about 0.3 s per swipe here, so the
# "fastest" run is one swipe every ~0.3–0.4 s.
record() { adb shell "screenrecord --time-limit $2 /sdcard/$1.mp4" >/dev/null 2>&1 & REC=$!; sleep 1; }
stop_record() { wait $REC 2>/dev/null; sleep 1; adb pull "/sdcard/$1.mp4" "$OUT/$1.mp4" >/dev/null 2>&1 && log "video: $1.mp4" || log "video: $1 not recorded"; }
pss() { adb shell dumpsys meminfo $PKG | grep -m1 "TOTAL PSS" | awk '{print $3}'; }
back_swipe() { adb shell input swipe 250 1500 900 1500 ${1:-90}; }
next_swipe() { adb shell input swipe 900 1500 250 1500 ${1:-90}; }
fast_block() { # $1 tab centre, $2 name
  adb shell input tap $1; sleep 2
  log "memory before $2: $(pss) kB"
  record "20-$2-10-fast" 14
  begin "$2: 10 fast swipes back (0.25s apart)"; for i in $(seq 10); do back_swipe; sleep 0.25; done; finish 2
  stop_record "20-$2-10-fast"
  begin "$2: 10 fast swipes forward"; for i in $(seq 10); do next_swipe; sleep 0.25; done; finish 3
  log "memory after $2: $(pss) kB"
  # A swipe must never open a page: the tab bar has to be on the screen after each block (build 140: a swipe over the
  # Statistics tile "Scheduled transfers" opened the Scheduled page and every later step ran on it).
  if [ "$(shown_tab)" = none ]; then log "FAIL: after the swipes in $2 no tab is shown (a page was opened)"; shot "24x-left-tabs-$2" 0; back; adb shell input tap $1; sleep 2; fi
}
fast_block "$ops" operations
# Where the cost of a swipe is (0.3.18): the same 10 swipes with the icons drawn as empty boxes, then with every row a bare text
# line (a tap on the speed-check build's PerfSwitch box moves to the next setting; the third tap puts everything back).
adb shell input tap 20 335; sleep 1
begin "operations (icons off): 10 fast swipes back"; for i in $(seq 10); do back_swipe; sleep 0.25; done; finish 2
begin "operations (icons off): 10 fast swipes forward"; for i in $(seq 10); do next_swipe; sleep 0.25; done; finish 3
adb shell input tap 20 335; sleep 1
begin "operations (plain rows): 10 fast swipes back"; for i in $(seq 10); do back_swipe; sleep 0.25; done; finish 2
begin "operations (plain rows): 10 fast swipes forward"; for i in $(seq 10); do next_swipe; sleep 0.25; done; finish 3
# Warm off: no page drawn beforehand (neighbours of the pager, the other tabs of a sheet, the other kind of Categories).
adb shell input tap 20 335; sleep 1
begin "operations (warm off): 10 fast swipes back"; for i in $(seq 10); do back_swipe; sleep 0.25; done; finish 2
begin "operations (warm off): 10 fast swipes forward"; for i in $(seq 10); do next_swipe; sleep 0.25; done; finish 3
begin "tab mix (warm off): 12 taps"; while read -r x y pause _; do adb shell input tap $x $y </dev/null; sleep $pause; done <<< "$mix"; finish 3
adb shell input tap $ops; sleep 2
adb shell input tap 20 335; sleep 1
begin "tab mix (all on): 12 taps"; while read -r x y pause _; do adb shell input tap $x $y </dev/null; sleep $pause; done <<< "$mix"; finish 3
adb shell input tap $ops; sleep 2
record 21-operations-30-fastest 20
begin "operations: 30 swipes back, no pause"; for i in $(seq 30); do back_swipe 60; done; finish 3
stop_record 21-operations-30-fastest
shot 21-after-30 0
log "memory after 30: $(pss) kB"
record 22-operations-direction 10
begin "operations: direction changes (back, forward ×6, no pause)"; for i in $(seq 6); do back_swipe 60; next_swipe 60; done; finish 3
stop_record 22-operations-direction
begin "operations: revisit (30 swipes forward, no pause)"; for i in $(seq 30); do next_swipe 60; done; finish 3
shot 22-after-revisit 0
begin "operations: 5 fast swipes, then the tab Statistics at once"; for i in $(seq 5); do back_swipe 60; done; adb shell input tap $stats; finish 3
shot 23-after-swipes-tab 0
fast_block "$cats" categories
shot 24-categories-after 0
fast_block "$stats" statistics
shot 25-statistics-after 0
log "memory at the end: $(pss) kB"
# (The colour square is checked by the smoke test, which reaches the colour page.)

# A new expense with the keys, saved: the list must take it without drawing everything again.
adb shell input tap $ops; sleep 2
# The swipe blocks leave the period wherever the swipes ended (builds 141-143: August, September, December 2026). The new
# expense has to go to a month that has operations and is not in the future, so the period is brought to the current month.
this_month=$(date +"%B %Y")
for step in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
  now_title=$(period_title)
  [ "$now_title" = "$this_month" ] && break
  case "$now_title" in "?") break;; esac
  if [ "$(date -d "1 $now_title" +%s)" -lt "$(date -d "1 $this_month" +%s)" ]; then tap "Next period" 0.6 || break; else tap "Previous period" 0.6 || break; fi
done
log "period for the new expense: $(period_title) (wanted $this_month)"
log "before the add menu: shown $(shown_tab) (expected Operations)"
xy=$(where "New operation")
begin "open the add menu"; adb shell input tap $xy; finish 3
begin "add menu: tap the tab Incomes, then Expenses"; tap "Incomes" 1.2 last; tap "Expenses" 0 last; finish 2
shot 05a-add-menu 0
# The last match: a row of the list under the sheet can carry the same word ("Food"); the sheet is later in the tree.
begin "choose a category (the editor opens)"; tap "Food" 0 last || tap "Internet" 0 last; finish 3
shot 05b-editor-opened 0
k1=$(where "1"); k2=$(where "2"); k5=$(where "5"); save=$(where "Save operation")
begin "type 1 2 5 on the keys"
adb shell input tap $k1; sleep 0.4; adb shell input tap $k2; sleep 0.4; adb shell input tap $k5
finish 2
shot 05c-keys-typed 0
log "keys at $k1 $k2 $k5, save at $save"
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
# A refusal leaves a message window: closed, so the moves after this one still find their way.
grep -q 'text="Preview of your data' /tmp/ui.xml 2>/dev/null || { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1; grep -q 'text="Preview of your data' /tmp/ui.xml || { log "FAIL: the preview did not open"; tap "OK" 1 || true; }; }
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
