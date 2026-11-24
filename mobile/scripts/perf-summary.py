"""One table from the speed check: for every move, the pauses of the JavaScript thread and the slow frames.
Usage: python3 perf-summary.py perf.txt gfx.txt"""
import re
import sys

perf, gfx = sys.argv[1], sys.argv[2]
moves = []  # name, list of stalls (ms), other timed lines
current = None
for line in open(perf, encoding="utf8", errors="replace"):
    text = line.split("[perf] ", 1)[-1].strip()
    if text.startswith("mark "):
        current = {"name": text[5:], "stalls": [], "notes": []}
        moves.append(current)
    elif current is not None:
        m = re.match(r"stall ([\d.]+)ms", text)
        if m:
            current["stalls"].append(float(m.group(1)))
        else:
            current["notes"].append(text)

frames = {}
name = None
try:
    for line in open(gfx, encoding="utf8", errors="replace"):
        line = line.strip()
        if line.startswith("== "):
            name = line[3:]
            frames[name] = {}
        elif name and ":" in line:
            key, value = line.split(":", 1)
            frames[name][key.strip()] = value.strip()
except FileNotFoundError:
    pass

print(f"{'move':52} {'JS busy':>9} {'longest':>9} {'pauses':>6} {'frames':>7} {'janky':>12} {'p90':>6} {'p99':>6}")
total = 0.0
for move in moves:
    stalls = move["stalls"]
    f = frames.get(move["name"], {})
    if f.get("Total frames rendered") == "0":
        f = {"Total frames rendered": "0"}  # no frame drawn: the percentiles of gfxinfo are meaningless
    total += sum(stalls)
    print(
        f"{move['name'][:52]:52} {sum(stalls):8.0f}ms {max(stalls, default=0):8.0f}ms {len(stalls):6d} "
        f"{f.get('Total frames rendered', '-'):>7} {f.get('Janky frames', '-'):>12} {f.get('90th percentile', '-'):>6} {f.get('99th percentile', '-'):>6}"
    )
print(f"{'all moves':52} {total:8.0f}ms")
print()

# The bench (features/perf-bench.tsx): per scenario the time to the end of the commit and to the second frame, the first run (cold)
# and the median of the other two.
bench = {}
for move in moves:
    for n in move["notes"]:
        m = re.match(r"bench (.+) run (\d): (commit|frame) ([\d.]+)ms", n)
        if m:
            bench.setdefault(m.group(1), {}).setdefault(m.group(3), {})[int(m.group(2))] = float(m.group(4))
if bench:
    print(f"{'bench':36} {'commit cold':>11} {'commit warm':>11} {'frame cold':>11} {'frame warm':>11}")
    for name, v in bench.items():
        def pair(kind):
            r = v.get(kind, {})
            warm = [r[k] for k in (2, 3) if k in r]
            return (f"{r[1]:.0f}ms" if 1 in r else "-", f"{sum(warm) / len(warm):.0f}ms" if warm else "-")
        c, f = pair("commit"), pair("frame")
        print(f"{name:36} {c[0]:>11} {c[1]:>11} {f[0]:>11} {f[1]:>11}")
    print()

# The balanced swipe runs ("swipes <setting> run N: ..."): per setting the median and the range of the JS busy time and of the
# longest pause over the runs, how often a page was mounted and drawn again (notes of the page), and the cold block for comparison.
runs = {}
for move in moves:
    m = re.match(r"swipes (\S+) run (\d+):", move["name"])
    if m:
        notes = move["notes"]
        runs.setdefault(m.group(1), []).append((sum(move["stalls"]), max(move["stalls"], default=0), sum(n.startswith("operations page mount") for n in notes),
                                                 sum(n.startswith("operations page prop changed") for n in notes), sum(n.startswith("operations page built") for n in notes)))
if runs:
    def med(values):
        values = sorted(values)
        return values[len(values) // 2]
    print(f"{'10 swipes back, balanced order':32} {'runs':>4} {'JS busy median':>15} {'range':>14} {'pause median':>13} {'range':>12} {'mounts':>6} {'prop':>5} {'built':>5}")
    for name, rs in runs.items():
        busy, pause = [r[0] for r in rs], [r[1] for r in rs]
        print(f"{name:32} {len(rs):4d} {med(busy):13.0f}ms {min(busy):6.0f}-{max(busy):<6.0f}ms {med(pause):11.0f}ms {min(pause):5.0f}-{max(pause):<5.0f}ms {med([r[2] for r in rs]):6d} {med([r[3] for r in rs]):5d} {med([r[4] for r in rs]):5d}")
    print()
for move in moves:
    for note in move["notes"]:
        print(f"{move['name'][:40]:40} | {note}")

# Tab moves: how many presses the bar saw, how many it dropped as true repeats, and how long from the finger to the
# drawn screen ("tab shown X 123.4ms", p50/p90 over the move). Only moves that had a press are listed. The empty-profile
# moves ("empty: ...") are the owner's case: acceptance on the weak profile is no dropped press that was not a true
# repeat and p90 press-to-shown under 200 ms.
def percentile(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, int(round(q * (len(values) - 1))))]


print()
print(f"{'tab moves':62} {'presses':>7} {'dropped':>7} {'pill p50':>8} {'pill p90':>8} {'frame p50':>9} {'frame p90':>9} {'shown':>5} {'p50':>7} {'p90':>7} {'JS busy':>8} {'longest':>8}")
for move in moves:
    presses = sum(1 for n in move["notes"] if n.startswith("tab press ") and not n.startswith("tab press dropped"))
    dropped = sum(1 for n in move["notes"] if n.startswith("tab press dropped"))
    shown = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"tab shown \w+ ([\d.]+)ms", n)] if m]
    frame = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"tab frame \w+ ([\d.]+)ms", n)] if m]
    pill = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"pill shown \w+ ([\d.]+)ms", n)] if m]
    if not presses and not dropped:
        continue
    p50 = f"{percentile(shown, 0.5):.0f}ms" if shown else "-"
    p90 = f"{percentile(shown, 0.9):.0f}ms" if shown else "-"
    q50 = f"{percentile(pill, 0.5):.0f}ms" if pill else "-"
    q90 = f"{percentile(pill, 0.9):.0f}ms" if pill else "-"
    f50 = f"{percentile(frame, 0.5):.0f}ms" if frame else "-"
    f90 = f"{percentile(frame, 0.9):.0f}ms" if frame else "-"
    print(f"{move['name'][:62]:62} {presses:7d} {dropped:7d} {q50:>8} {q90:>8} {f50:>9} {f90:>9} {len(shown):5d} {p50:>7} {p90:>7} {sum(move['stalls']):7.0f}ms {max(move['stalls'], default=0):7.0f}ms")

# The eye that hides the balance: per move the time from the finger to the figures drawn masked or shown, the parts of the command
# (change applied, written to the database, state set and listeners told), the JS busy time and the longest pause.
print()
print(f"{'eye moves':62} {'taps':>4} {'text p50':>8} {'text max':>8} {'apply':>6} {'write':>6} {'notify':>6} {'JS busy':>8} {'longest':>8}")
for move in moves:
    text = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"eye: figures \w+ ([\d.]+)ms", n)] if m]
    if not text:
        continue
    def part(label):
        v = [float(m.group(1)) for n in move["notes"] for m in [re.match(re.escape(label) + r" ([\d.]+)ms", n)] if m]
        return f"{percentile(v, 0.5):.1f}" if v else "-"
    print(f"{move['name'][:62]:62} {len(text):4d} {percentile(text, 0.5):7.0f}ms {max(text):7.0f}ms {part('command: change applied'):>6} {part('command: written to the database'):>6} {part('command: state set, listeners told'):>6} {sum(move['stalls']):7.0f}ms {max(move['stalls'], default=0):7.0f}ms")

# Layers: the time from the ask to a sheet drawn ("layer sheet shown", the add sheet right after entering an empty
# Operations tab, with the picture running and with it at rest), and the period dialog's tile tap to dialog gone, the
# old order (pick, then close) against the new one (close, then pick).
print()
print(f"{'layers':62} {'sheet shown':>12} {'dialog gone, old':>17} {'dialog gone, new':>17}")
for move in moves:
    shown = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"layer sheet shown ([\d.]+)ms", n)] if m]
    gone = {"old": [], "new": []}
    mode = None
    for n in move["notes"]:
        if n.startswith("period dialog: old order"):
            mode = "old"
        elif n.startswith("period dialog: new order"):
            mode = "new"
        m = re.match(r"period dialog: tile tap to dialog gone ([\d.]+)ms", n)
        if m and mode:
            gone[mode].append(float(m.group(1)))
    if not shown and not gone["old"] and not gone["new"]:
        continue
    f = lambda xs: ", ".join(f"{x:.0f}" for x in xs) + "ms" if xs else "-"
    print(f"{move['name'][:62]:62} {f(shown):>12} {f(gone['old']):>17} {f(gone['new']):>17}")

# Pictures: what each empty-state picture costs on its own: the JavaScript thread's busy time over the visit while it plays
# against the same tab at rest, and the press-to-shown time of the tab with the picture.
print()
print(f"{'pictures (one tab each)':62} {'JS busy':>8} {'frames':>7} {'janky':>12} {'p90':>6} {'shown':>7}")
for move in moves:
    if not move["name"].startswith("picture "):
        continue
    f = frames.get(move["name"], {})
    shown = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"tab shown \w+ ([\d.]+)ms", n)] if m]
    print(
        f"{move['name'][:62]:62} {sum(move['stalls']):7.0f}ms {f.get('Total frames rendered', '-'):>7} {f.get('Janky frames', '-'):>12} "
        f"{f.get('90th percentile', '-'):>6} {(f'{shown[0]:.0f}ms' if shown else '-'):>7}"
    )

# What the components' own bodies took (selfTime of the speed-check build; children not included; React.Profiler does not run in a
# release build): per move and part, the draws and the total ms. The rest of a stall is the library's drawing (react-native-svg,
# FlashList) and the native commit.
print()
print(f"{'Component bodies (own time)':62} {'part':>14} {'draws':>6} {'total':>8}")
for move in moves:
    parts = {}
    for n in move["notes"]:
        m = re.match(r"render time (.+?) (\d+) draws ([\d.]+)ms", n)
        if m:
            row = parts.setdefault(m.group(1), [0, 0.0])
            row[0] += int(m.group(2))
            row[1] += float(m.group(3))
    for part, (draws, ms) in sorted(parts.items()):
        print(f"{move['name'][:62]:62} {part:>14} {draws:6d} {ms:7.0f}ms")
