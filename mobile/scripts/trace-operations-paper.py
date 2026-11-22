#!/usr/bin/env python3
"""Traces the sheet of the Operations empty state from the first application's recording and writes src/ui/operations-paper.ts.

Usage:  python3 scripts/trace-operations-paper.py REST_FRAME.png [src/ui/operations-paper.ts]

REST_FRAME.png is the last frame of the recording of the empty Operations screen (720 x 1600, 1 px = 1 dp at density 2); the
recording is not part of the repository, this script is the record of how the numbers were made. Needs python3 with numpy,
scipy and opencv.

What it does (0.3.10; before, the sheet was drawn by hand and the owner circled three faults: the top curl, the rounded left
end of the roll, the curve inside the roll at the right):
  1. The dark grey of the sheet (its outline and its two fills, the curl and the roll) is cut out of the frame at the level
     half way between the background and the grey, on a 4 times enlarged copy so the outline is sub-pixel. The lens (a light
     ring over the right edge) is not dark and is left out; the right edge is carried under it so the two ends meet.
  2. Every contour is smoothed lightly (sigma 1 px) and fitted by cubic Bezier curves (Schneider's method, corners found
     from the turning of the contour) within MAX_ERROR px.
  3. The paths are written in the picture's own units: frame pixels minus (0, Y_ORIGIN). The sheet is one dark shape, so the
     outline and the fills are written as filled shapes (the same colour); the four light text lines are measured
     separately and written as their centre lines.
"""
import sys

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d

MAX_ERROR = 0.75
Y_ORIGIN = 202
SCALE = 4
LENS = (459, 516, 62)         # centre and radius of the lens in the frame, px


# ---- Schneider's curve fitting ---------------------------------------------------------------------
def bez(p, t):
    t = np.asarray(t)[:, None]
    u = 1 - t
    return u ** 3 * p[0] + 3 * u * u * t * p[1] + 3 * u * t * t * p[2] + t ** 3 * p[3]


def chord_params(pts):
    d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return d / d[-1]


def fit_one(pts, u, t1, t2):
    p0, p3 = pts[0], pts[-1]
    b0, b1, b2, b3 = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3
    a1, a2 = t1[None] * b1[:, None], t2[None] * b2[:, None]
    c = np.array([[np.sum(a1 * a1), np.sum(a1 * a2)], [np.sum(a1 * a2), np.sum(a2 * a2)]])
    tmp = pts - (p0[None] * (b0 + b1)[:, None] + p3[None] * (b2 + b3)[:, None])
    x = np.array([np.sum(a1 * tmp), np.sum(a2 * tmp)])
    det = c[0, 0] * c[1, 1] - c[0, 1] * c[1, 0]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        al, ar = (x[0] * c[1, 1] - x[1] * c[0, 1]) / det, (c[0, 0] * x[1] - c[1, 0] * x[0]) / det
    else:
        al = ar = 0
    if al < 1e-6 * seg or ar < 1e-6 * seg:
        al = ar = seg / 3
    return np.array([p0, p0 + t1 * al, p3 + t2 * ar, p3])


def reparam(curve, pts, u):
    d1 = 3 * (curve[1:] - curve[:-1])
    d2 = 2 * (d1[1:] - d1[:-1])
    out = u.copy()
    for k, t in enumerate(u):
        q = bez(curve, [t])[0]
        v = 1 - t
        q1 = 3 * v * v * (curve[1] - curve[0]) + 6 * v * t * (curve[2] - curve[1]) + 3 * t * t * (curve[3] - curve[2])
        q2 = 6 * v * (curve[2] - 2 * curve[1] + curve[0]) + 6 * t * (curve[3] - 2 * curve[2] + curve[1])
        num = np.dot(q - pts[k], q1)
        den = np.dot(q1, q1) + np.dot(q - pts[k], q2)
        out[k] = t - num / den if abs(den) > 1e-12 else t
    return np.clip(out, 0, 1)


def fit_cubic(pts, t1, t2, max_error, depth=0):
    if len(pts) == 2:
        d = np.linalg.norm(pts[1] - pts[0]) / 3
        return [np.array([pts[0], pts[0] + t1 * d, pts[1] + t2 * d, pts[1]])]
    u = chord_params(pts)
    curve = fit_one(pts, u, t1, t2)
    worst, split = 0.0, len(pts) // 2
    for _ in range(6):
        err = np.linalg.norm(bez(curve, u) - pts, axis=1)
        worst, split = err.max(), int(err.argmax())
        if worst < max_error:
            return [curve]
        u = reparam(curve, pts, u)
        curve = fit_one(pts, u, t1, t2)
    err = np.linalg.norm(bez(curve, u) - pts, axis=1)
    worst, split = err.max(), int(err.argmax())
    if worst < max_error:
        return [curve]
    split = min(max(split, 1), len(pts) - 2)
    tm = pts[split - 1] - pts[split + 1]
    tm = tm / (np.linalg.norm(tm) or 1)
    return fit_cubic(pts[: split + 1], t1, tm, max_error, depth + 1) + fit_cubic(pts[split:], -tm, t2, max_error, depth + 1)


def unit(v):
    return v / (np.linalg.norm(v) or 1)


def corners(pts, window=6, degrees=38):
    """Indices where the closed contour turns sharply (a corner of the sheet, not the roundness of a curve)."""
    n = len(pts)
    out = []
    for i in range(n):
        a = pts[i] - pts[(i - window) % n]
        b = pts[(i + window) % n] - pts[i]
        ang = np.degrees(np.arccos(np.clip(np.dot(unit(a), unit(b)), -1, 1)))
        out.append(ang)
    out = np.array(out)
    idx = [i for i in range(n) if out[i] > degrees and out[i] == out[np.arange(i - window, i + window + 1) % n].max()]
    # keep one per cluster
    keep = []
    for i in idx:
        if not keep or i - keep[-1] > window:
            keep.append(i)
    return keep


def fit_closed(pts, max_error):
    n = len(pts)
    cs = corners(pts)
    if not cs:
        cs = [0, n // 2]
    curves = []
    for k, start in enumerate(cs):
        end = cs[(k + 1) % len(cs)]
        seg = np.vstack([pts[start:end + 1]]) if end > start else np.vstack([pts[start:], pts[:end + 1]])
        t1 = unit(seg[min(4, len(seg) - 1)] - seg[0])
        t2 = unit(seg[max(-5, -len(seg))] - seg[-1])
        curves += fit_cubic(seg, t1, t2, max_error)
    return curves


def path_of(curves):
    f = lambda p: f"{p[0]:.1f} {p[1] - Y_ORIGIN:.1f}"
    d = f"M{f(curves[0][0])}"
    for c in curves:
        d += f"C{f(c[1])} {f(c[2])} {f(c[3])}"
    return d + "Z"


# ---- the sheet ---------------------------------------------------------------------------------------
def dark_mask(gray):
    """The dark grey on a 4 times enlarged copy, cut half way between the background and the grey."""
    big = cv2.resize(gray, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    bg = float(np.median(gray[0:50, 0:50]))
    core = float(np.percentile(gray[(gray < 150) & (np.arange(gray.shape[0])[:, None] > 300)], 50))
    level = (bg + core) / 2
    return (big < level).astype(np.uint8), level


def trace(rest, out_path):
    gray = cv2.cvtColor(cv2.imread(rest), cv2.COLOR_BGR2GRAY)
    mask, level = dark_mask(gray)
    mask[: 300 * SCALE] = 0
    mask[800 * SCALE:] = 0
    # the right edge goes under the lens: carry its two ends in, so that they meet the ring
    cx, cy, r = LENS
    # the blue cross inside the lens is dark too: it is not the sheet
    yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    mask[(xx - cx * SCALE) ** 2 + (yy - cy * SCALE) ** 2 < ((r - 2) * SCALE) ** 2] = 0
    edge_x = []
    for y in (cy - r - 20, cy + r + 20):
        xs = np.flatnonzero(mask[y * SCALE, (cx - 25) * SCALE:] > 0) + (cx - 25) * SCALE
        edge_x.append((xs.min(), xs.max()) if len(xs) else None)
    print("right edge columns above / below the lens (px):", [tuple(v / SCALE for v in e) if e else None for e in edge_x])
    if edge_x[0] and edge_x[1]:
        x0 = int(round((edge_x[0][0] + edge_x[1][0]) / 2))
        x1 = int(round((edge_x[0][1] + edge_x[1][1]) / 2))
        mask[(cy - r - 6) * SCALE:(cy + r + 6) * SCALE, x0:x1 + 1] = 1
    # the lens' own dark pixels (none: the ring is lighter than the cut) and the title text below stay out
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
    paths = []
    gray_big = cv2.resize(gray, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if area < 12 * SCALE * SCALE or y > 700 * SCALE:
            continue
        comp = (lab == k).astype(np.uint8)
        # only the dark grey of the sheet: the text lines are lighter, the cross in the lens is blue (and inside the lens)
        inside = (x + w / 2) / SCALE
        med = float(np.median(gray_big[comp > 0]))
        if med > 145 or ((x / SCALE - cx) ** 2 + (y / SCALE - cy) ** 2 < (r + 10) ** 2 and w < 60 * SCALE):
            continue
        # the outer contour and the holes (the paper inside the outline), drawn together with the even-odd rule
        contours, _ = cv2.findContours(comp, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        d_all, total = "", 0
        for contour in contours:
            if cv2.contourArea(contour) < 20 * SCALE * SCALE:
                continue
            c = contour[:, 0, :].astype(float)
            c = np.stack([gaussian_filter1d(c[:, 0], 1 * SCALE, mode="wrap"), gaussian_filter1d(c[:, 1], 1 * SCALE, mode="wrap")], 1)
            # resample at about 1 px (of the real picture) steps
            seg = np.linalg.norm(np.diff(np.vstack([c, c[:1]]), axis=0), axis=1)
            d = np.concatenate([[0], np.cumsum(seg)])
            samples = np.linspace(0, d[-1], int(d[-1] / SCALE), endpoint=False)
            cc = np.stack([np.interp(samples, d, np.append(c[:, 0], c[0, 0])), np.interp(samples, d, np.append(c[:, 1], c[0, 1]))], 1) / SCALE
            curves = fit_closed(cc, MAX_ERROR)
            d_all += path_of(curves)
            total += len(curves)
        paths.append((x / SCALE, y / SCALE, d_all, total))
        print(f"shape at ({x / SCALE:.0f}, {y / SCALE:.0f}) size {w / SCALE:.0f} x {h / SCALE:.0f}: {total} curves")
    paths.sort(key=lambda p: (p[1], p[0]))

    # the four light text lines: centre line from the moments of each light grey bar
    lines = []
    light = ((gray > 120) & (gray < 200)).astype(np.uint8)
    light[:300] = 0
    light[700:] = 0
    n, lab, st, cen = cv2.connectedComponentsWithStats(light)
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if 100 < area < 3000 and h <= 12 and w > 30 and 280 <= x <= 300:
            weights = (200 - gray[lab == k].astype(float))
            ys = np.nonzero(lab == k)[0]
            xs = np.nonzero(lab == k)[1]
            cy_ = float((ys * weights).sum() / weights.sum())
            lines.append((cy_ - Y_ORIGIN, x + h / 2, x + w - h / 2, h))
    lines.sort()
    print("text lines (y, from x, to x, bar height):", [tuple(round(v, 1) for v in l) for l in lines])
    with open(out_path, "w", encoding="utf8") as f:
        f.write("// Generated by scripts/trace-operations-paper.py from the last frame of the first application's recording of the empty\n")
        f.write("// Operations screen: the dark grey of the sheet (outline, curl, roll) as filled shapes in the picture's own units, and the\n")
        f.write("// centre lines of the four light text lines [y, from x, to x].\n")
        f.write(f"export const PAPER_SHAPES: ReadonlyArray<string> = {[p[2] for p in paths]!r};\n".replace("'", '"'))
        f.write(f"export const PAPER_LINES: ReadonlyArray<readonly [number, number, number]> = {[[round(float(l[0]), 1), round(float(l[1]), 1), round(float(l[2]), 1)] for l in lines]};\n")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    trace(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "src/ui/operations-paper.ts")
