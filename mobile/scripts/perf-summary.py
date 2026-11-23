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
print(f"{'tab moves':62} {'presses':>7} {'dropped':>7} {'shown':>5} {'p50':>7} {'p90':>7} {'JS busy':>8}")
for move in moves:
    presses = sum(1 for n in move["notes"] if n.startswith("tab press ") and not n.startswith("tab press dropped"))
    dropped = sum(1 for n in move["notes"] if n.startswith("tab press dropped"))
    shown = [float(m.group(1)) for n in move["notes"] for m in [re.match(r"tab shown \w+ ([\d.]+)ms", n)] if m]
    if not presses and not dropped:
        continue
    p50 = f"{percentile(shown, 0.5):.0f}ms" if shown else "-"
    p90 = f"{percentile(shown, 0.9):.0f}ms" if shown else "-"
    print(f"{move['name'][:62]:62} {presses:7d} {dropped:7d} {len(shown):5d} {p50:>7} {p90:>7} {sum(move['stalls']):7.0f}ms")

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
