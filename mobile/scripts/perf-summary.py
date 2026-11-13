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
