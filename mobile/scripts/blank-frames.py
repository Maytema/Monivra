#!/usr/bin/env python3
"""Empty pages in a screen recording of period swipes (white pages task).

A frame counts as an empty page when the page area (under the period bar, above the bottom bar) is nearly one flat
colour: the empty-month picture ("Empty" with its drawing) has dark lines and does not count. Prints, per video, the
number of frames read, the empty ones, and the longest run of empty frames in milliseconds.

    python3 blank-frames.py VIDEO.mp4 [VIDEO.mp4 ...]
Needs ffmpeg and Pillow.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

FPS = 30
# The page area as shares of the screen height (1080 x 2400 screen: y 470 … 2120).
TOP, BOTTOM = 0.196, 0.883


def empty(path: Path) -> bool:
    im = Image.open(path).convert("L")
    w, h = im.size
    # (The right edge is left out: the round Add button floats over the page there.)
    area = im.crop((int(w * 0.04), int(h * TOP), int(w * 0.72), int(h * BOTTOM)))
    hist = area.histogram()
    total = sum(hist)
    peak = max(range(256), key=lambda i: hist[i])
    near = sum(hist[max(0, peak - 6) : peak + 7])
    return near / total > 0.995


def read(video: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={FPS},scale=270:-1", f"{tmp}/%05d.png"], check=True)
        frames = sorted(Path(tmp).glob("*.png"))
        flags = [empty(f) for f in frames]
    runs, run = [], 0
    for flag in flags:
        run = run + 1 if flag else 0
        runs.append(run)
    longest = max(runs or [0])
    print(f"{Path(video).name}: {len(flags)} frames, {sum(flags)} empty, longest empty run {longest * 1000 // FPS} ms")
    # Where the empty runs are (seconds into the video).
    starts = [i for i, f in enumerate(flags) if f and (i == 0 or not flags[i - 1])]
    for s in starts[:12]:
        end = s
        while end + 1 < len(flags) and flags[end + 1]:
            end += 1
        print(f"  empty {s / FPS:.2f}–{(end + 1) / FPS:.2f} s")


if __name__ == "__main__":
    for v in sys.argv[1:]:
        read(v)
