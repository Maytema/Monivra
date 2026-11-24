"""Folds the Hermes sampling profiles that the speed-check build wrote to the log ("[perf-profile] <n> <part>/<parts> <text>") by function:
the top functions by self time and by inclusive time, per profile. Usage: python3 perf-profile.py js-log.txt [out-dir]
(with out-dir the reassembled traces are saved there, compressed)."""
import collections
import gzip
import json
import os
import re
import sys

log = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else None
parts = collections.defaultdict(dict)
for line in open(log, encoding="utf8", errors="replace"):
    m = re.search(r"\[perf-profile\] (\d+) (\d+)/(\d+) (.*)$", line.rstrip("\n"))
    if m:
        parts[int(m.group(1))][int(m.group(2))] = (int(m.group(3)), m.group(4))


def frames_of(trace):
    """(sample list of (stack of names, weight in microseconds)) for the two formats Hermes and Chrome use."""
    if "stackFrames" in trace:
        sf = trace["stackFrames"]
        def stack(i):
            names = []
            while i and str(i) in sf:
                f = sf[str(i)]
                name = f.get("name") or ""
                where = f.get("line")
                names.append(name if name else f"(anonymous {f.get('category', '')} line {where})")
                i = f.get("parent")
            return names  # leaf first
        samples = trace.get("samples", [])
        out_samples = []
        for k, s in enumerate(samples):
            weight = float(s.get("weight", 1) or 1)
            out_samples.append((stack(s.get("sf")), weight))
        return out_samples
    nodes = {n["id"]: n for n in trace.get("nodes", [])}
    parent = {}
    for n in nodes.values():
        for c in n.get("children", []):
            parent[c] = n["id"]
    def stack(i):
        names = []
        while i in nodes:
            cf = nodes[i]["callFrame"]
            names.append(cf.get("functionName") or f"(anonymous line {cf.get('lineNumber')})")
            i = parent.get(i)
        return names
    deltas = trace.get("timeDeltas", [])
    return [(stack(i), float(deltas[k]) if k < len(deltas) else 1.0) for k, i in enumerate(trace.get("samples", []))]


for number in sorted(parts):
    got = parts[number]
    total = next(iter(got.values()))[0]
    text = "".join(got[i][1] for i in sorted(got))
    print()
    print(f"Hermes profile {number}: {len(got)} of {total} parts, {len(text)} characters")
    if len(got) != total:
        print("  (parts are missing, the profile is not read)")
        continue
    if out:
        os.makedirs(out, exist_ok=True)
        with gzip.open(os.path.join(out, f"hermes-{number}.json.gz"), "wt") as f:
            f.write(text)
    try:
        trace = json.loads(text)
        samples = frames_of(trace)
    except Exception as error:  # noqa: BLE001
        print(f"  (not read: {error})")
        continue
    whole = sum(w for _, w in samples) or 1.0
    own = collections.Counter()
    inclusive = collections.Counter()
    for names, w in samples:
        if names:
            own[names[0]] += w
        for name in set(names):
            inclusive[name] += w
    print(f"  samples {len(samples)}, time {whole / 1000:.0f} ms (the sum of the weights, microseconds taken as given)")
    for title, table in (("self time", own), ("inclusive time", inclusive)):
        print(f"  top 30 by {title}")
        for name, w in table.most_common(30):
            print(f"    {w / 1000:9.1f} ms {100 * w / whole:5.1f}%  {name[:100]}")
