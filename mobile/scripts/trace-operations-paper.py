#!/usr/bin/env python3
"""Measures the sheet of the Operations empty state in the first application's recording and writes src/ui/operations-paper.ts.

Usage:  python3 scripts/trace-operations-paper.py REST_FRAME.png [src/ui/operations-paper.ts]

REST_FRAME.png is the last frame of the recording of the empty Operations screen (720 x 1600, 1 px = 1 dp at density 2); the
recording is not part of the repository, this script is the record of how the numbers were made. Needs python3 with numpy,
scipy and opencv.

0.3.11. The 0.3.10 version traced the whole dark shape, outline included, and the outline kept the video's compression noise
(a bulging left edge, a lens-shaped dash, wavy lines, a stroke of changing width). The sheet is now two kinds of parts:
  1. The outline is geometry: straight strokes of constant width with round caps (left edge in three pieces, the top line,
     the right edge) and one quarter circle for the top-left corner. Every value (centre line, width, the ends of the pieces,
     the corner radius) is fitted over the whole line: the median over its rows or columns of the darkness-weighted centre
     and of the darkness sum, so that blur and noise average out. Strokes end inside the fills they meet.
  2. The two fills (the top curl and the bottom roll) are cut out of the frame at the level half way between the background
     and the grey, on a 4 times enlarged copy; their contours are smoothed lightly (sigma 1 px), straight runs (within
     0.8 px over 20 px or more) are written as true lines, the rest as cubic Beziers within 0.5 px.
  Paths are written in the picture's own units: frame pixels minus (0, Y_ORIGIN).
"""
import json
import sys

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.optimize import minimize_scalar

MAX_ERROR = 0.5
STRAIGHT = 0.8                # px: a contour that stays this close to a line over MIN_RUN px is a line
MIN_RUN = 20
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


# ---- straight runs -----------------------------------------------------------------------------------
def straight_runs(pts):
    """[(start, end)] index ranges of an open polyline that stay within STRAIGHT px of one line for MIN_RUN px or more."""
    runs, i, n = [], 0, len(pts)
    while i < n - 2:
        best = None
        j = i + MIN_RUN
        while j < n:
            seg = pts[i:j + 1]
            c = seg.mean(axis=0)
            u = np.linalg.svd(seg - c, full_matrices=False)[2][0]
            dev = np.abs((seg - c) @ np.array([-u[1], u[0]])).max()
            # signed distance from the chord: a run that bulges to one side by more than a quarter of the limit is an arc, however flat
            ch = seg[-1] - seg[0]
            side = ((seg - seg[0]) @ np.array([-ch[1], ch[0]])) / (np.linalg.norm(ch) or 1)
            lean = np.abs(side).max() > STRAIGHT / 4 and max((side > 0).mean(), (side < 0).mean()) > 0.9
            if dev > STRAIGHT or lean:
                break
            best = j
            j += 1
        if best is None:
            i += 1
        else:
            seg = pts[i:best + 1]
            u = np.linalg.svd(seg - seg.mean(axis=0), full_matrices=False)[2][0]
            tilt = min(abs(u[1]) / (np.linalg.norm(u) or 1), abs(u[0]) / (np.linalg.norm(u) or 1))      # sine of the angle to an axis
            if tilt > 0.035:
                # The drawing's straight lines are horizontal or vertical (the roll's top is within a degree of it); a slanted
                # stretch that is only nearly straight is a flat part of a curve, and a line there would show as a facet.
                i += MIN_RUN // 2
                continue
            runs.append((i, best))
            i = best
    return runs


def snap(a, b):
    """The end points of a straight run, made exactly horizontal or vertical when it is within 1 degree of one."""
    a, b = a.copy(), b.copy()
    dx, dy = b - a
    if abs(dy) < abs(dx) * 0.0175:
        a[1] = b[1] = (a[1] + b[1]) / 2
    elif abs(dx) < abs(dy) * 0.0175:
        a[0] = b[0] = (a[0] + b[0]) / 2
    return a, b


def contour_path(cc):
    """A closed contour (points about 1 px apart) as lines where it is straight, cubic Beziers elsewhere."""
    n = len(cc)
    cs = corners(cc, window=3, degrees=80) or [0]
    f = lambda p: f"{p[0]:.1f} {p[1] - Y_ORIGIN:.1f}"
    pieces = []        # ('L', a, b) or ('C', curves)
    for k, start in enumerate(cs):
        end = cs[(k + 1) % len(cs)]
        seg = np.vstack([cc[start:end + 1]]) if end > start else np.vstack([cc[start:], cc[:end + 1]])
        if len(cs) == 1:
            seg = np.vstack([cc[start:], cc[:start + 1]])
        runs = straight_runs(seg)
        at = 0
        for (i, j) in runs:
            if i - at >= 2:
                pieces.append(("C", seg[at:i + 1]))
            a, b = snap(seg[i], seg[j])
            pieces.append(("L", a, b))
            at = j
        if len(seg) - 1 - at >= 1:
            pieces.append(("C", seg[at:]))
    # the Bezier pieces start and end on the neighbouring lines' end points
    out = []
    for idx, pc in enumerate(pieces):
        if pc[0] == "C":
            seg = pc[1].copy()
            prev, nxt = pieces[idx - 1], pieces[(idx + 1) % len(pieces)]
            if prev[0] == "L":
                seg[0] = prev[2]
            if nxt[0] == "L":
                seg[-1] = nxt[1]
            out.append(("C", seg))
        else:
            out.append(pc)
    # Two horizontal (or vertical) runs with only a short flat stretch of curve between them are one line that the video's noise
    # bent a little: they become one line, so that no half-pixel step is left where the two met.
    merged = True
    while merged and len(out) > 3:
        merged = False
        for idx in range(len(out)):
            a, b, c = out[idx], out[(idx + 1) % len(out)], out[(idx + 2) % len(out)]
            if a[0] == "L" and b[0] == "C" and c[0] == "L" and idx + 2 < len(out) and len(b[1]) <= 40:
                for k in (0, 1):
                    if abs(a[2][k] - a[1][k]) < 1e-6 and abs(c[2][k] - c[1][k]) < 1e-6 and abs(a[1][k] - c[1][k]) < 1.5:
                        o = 1 - k
                        if (a[2][o] - a[1][o]) * (c[2][o] - c[1][o]) > 0:
                            start, end = a[1].copy(), c[2].copy()
                            start[k] = end[k] = (a[1][k] + c[1][k]) / 2
                            out[idx:idx + 3] = [("L", start, end)]
                            merged = True
                            break
            if merged:
                break
    first = out[0][1][0] if out[0][0] == "C" else out[0][1]
    d = f"M{f(first)}"
    cur = first
    for pc in out:
        if pc[0] == "L":
            a, b = pc[1], pc[2]
            if np.linalg.norm(a - cur) > 0.05:
                d += f"L{f(a)}"
            if abs(a[1] - b[1]) < 1e-6:
                d += f"H{b[0]:.1f}"
            elif abs(a[0] - b[0]) < 1e-6:
                d += f"V{b[1] - Y_ORIGIN:.1f}"
            else:
                d += f"L{f(b)}"
            cur = b
        else:
            seg = pc[1]
            t1 = unit(seg[min(4, len(seg) - 1)] - seg[0])
            t2 = unit(seg[max(-5, -len(seg))] - seg[-1])
            for c in fit_cubic(seg, t1, t2, MAX_ERROR):
                d += f"C{f(c[1])} {f(c[2])} {f(c[3])}"
            cur = seg[-1]
    return d + "Z"


# ---- the sheet ---------------------------------------------------------------------------------------
BG, CORE = 250.0, 130.0       # the background and the dark grey, as measured in the frame


def darkness(gray):
    """0 on the background, 1 on the dark grey (linear in between), so sums over a line's cross section are its width."""
    return np.clip(BG - gray.astype(float), 0, None) / (BG - CORE)


def across(dark, line, lo, hi, vertical):
    """For a line running along y (vertical) or x: the median over its length of the cross section's centre and width."""
    centres, widths = [], []
    for pos in line:
        sec = dark[lo[0]:lo[1], pos] if not vertical else dark[pos, lo[0]:lo[1]]
        if sec.sum() < 1:
            continue
        idx = np.arange(lo[0], lo[1])
        centres.append(float((sec * idx).sum() / sec.sum()))
        widths.append(float(sec.sum()))
    # pixel i covers [i, i + 1] in the picture's coordinates, so its centre is i + 0.5
    return float(np.median(centres)) + 0.5, float(np.median(widths)), float(np.std(centres))


def end_of(profile, start, stop, step, level):
    """Position (sub-pixel) where a profile along a line falls to half its plateau, walking from start to stop."""
    plateau = np.median(profile[min(start, stop) + 10:max(start, stop) - 10]) if abs(stop - start) > 25 else profile[start]
    ys = range(start, stop, step)
    prev = None
    for y in ys:
        if profile[y] < level * plateau:
            if prev is None:
                return float(y)
            a, b = profile[prev], profile[y]
            return prev + (y - prev) * (a - level * plateau) / (a - b)
        prev = y
    return float(stop)


def trace(rest, out_path):
    gray = cv2.cvtColor(cv2.imread(rest), cv2.COLOR_BGR2GRAY)
    dark = darkness(gray)
    # --- the outline, as geometry
    xl, wl_main, sl = across(dark, range(410, 470), (240, 260), None, True)        # left edge, main run, rows 410-470
    _, wl_dash, _ = across(dark, range(493, 499), (240, 260), None, True)
    _, wl_low, sl2 = across(dark, range(540, 620), (240, 260), None, True)
    yt, wt, st = across(dark, range(310, 440), (360, 376), None, False)            # top line, columns 310-440 (rows are the cross)
    xr, wr, sr = across(dark, range(582, 630), (452, 482), None, True)             # right edge below the lens
    print(f"left edge x {xl:.2f} (spread {sl:.2f}, {sl2:.2f}); widths main {wl_main:.2f}, dash {wl_dash:.2f}, lower {wl_low:.2f}")
    print(f"top line y {yt:.2f} width {wt:.2f} (spread {st:.2f}); right edge x {xr:.2f} width {wr:.2f} (spread {sr:.2f})")
    col = dark[:, int(xl) - 3:int(xl) + 4].sum(axis=1)
    HALF = 0.5
    main_end = end_of(col, 466, 484, 1, 0.5) + 0.5                    # the main run's lower edge
    dash_top = end_of(col, 482, 497, 1, 0.5)                    # (profile rises: walk the other way)
    # a rising edge: walk from the empty side
    def rising(lo, hi):
        plateau = np.median(col[lo + 6:hi - 6]); prev = lo
        for y in range(lo, hi):
            if col[y] >= 0.5 * plateau:
                a, b = col[prev], col[y]
                return prev + (y - prev) * (0.5 * plateau - a) / (b - a)
            prev = y
        return float(hi)
    dash_a = rising(484, 506) + 0.5
    dash_b = end_of(col, 497, 512, 1, 0.5) + 0.5
    low_a = rising(518, 545) + 0.5
    print(f"left edge pieces (outer ends): main to {main_end:.2f}, dash {dash_a:.2f}..{dash_b:.2f}, lower from {low_a:.2f}")
    # the corner: a quarter circle tangent to the left edge and the top line; radius fitted to the outer boundary
    outer = []
    for y in range(368, 400):
        xs = np.nonzero(dark[y, 240:330] > 0.5)[0]
        if len(xs):
            outer.append((240 + xs.min(), y))
    for x in range(252, 300):
        ys = np.nonzero(dark[360:420, x] > 0.5)[0]
        if len(ys):
            outer.append((x, 360 + ys.min()))
    outer = np.array(outer, float) + 0.5
    hw = (wl_main + wt) / 4

    def err(R):
        d = np.hypot(outer[:, 0] - (xl + R), outer[:, 1] - (yt + R)) - (R + hw)
        sel = (outer[:, 0] < xl + R - 1) & (outer[:, 1] < yt + R - 1)
        return np.sqrt(np.mean(d[sel] ** 2))
    R = float(minimize_scalar(err, bounds=(10, 80), method="bounded").x)
    print(f"corner radius {R:.1f} (rms {err(R):.2f} px)")
    cap = lambda w: w / 2
    inside = 4.0      # a stroke that meets a fill ends this far inside it
    top_end = 462 + 38                                         # inside the curl (it spans x 462..527)
    strokes = []
    v = lambda y: y - Y_ORIGIN
    f1 = lambda x, y: f"{x:.1f} {v(y):.1f}"
    # The recording's left edge and top line differ in width (about 0.7 px): each keeps its own, the quarter circle between them
    # takes the mean (a step of a third of a pixel on either side, which no eye sees, against a wrong width along 200 px).
    wa = (wl_main + wt) / 2
    strokes.append((f"M{f1(xl, main_end - cap(wl_main))}V{v(yt + R):.1f}", wl_main))
    strokes.append((f"M{f1(xl, yt + R)}A{R:.1f} {R:.1f} 0 0 1 {xl + R:.1f} {v(yt):.1f}", wa))
    strokes.append((f"M{xl + R:.1f} {v(yt):.1f}H{top_end:.1f}", wt))
    strokes.append((f"M{f1(xl, dash_a + cap(wl_dash))}V{v(dash_b - cap(wl_dash)):.1f}", wl_dash))
    roll_top = 628.0
    strokes.append((f"M{f1(xl, low_a + cap(wl_low))}V{v(roll_top + inside + 2):.1f}", wl_low))
    cb = [dark[400:440, x] for x in range(480, 516)]
    curl_bottom = float(np.median([400 + int(np.argmax(c < 0.5)) - 1 + (c[int(np.argmax(c < 0.5)) - 1] - 0.5) / (c[int(np.argmax(c < 0.5)) - 1] - c[int(np.argmax(c < 0.5))]) + 0.5 for c in cb]))
    print(f"curl bottom edge y = {curl_bottom:.2f}")
    bowl_cut = 637.0
    strokes.append((f"M{f1(xr, curl_bottom - inside - 4)}V{v(bowl_cut + 1):.1f}", wr))

    # --- the fills, as contours of the frame
    big = cv2.resize(gray, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    mask = (big < (BG + CORE) / 2).astype(np.uint8)
    cx, cy, r = LENS
    yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    mask[(xx - cx * SCALE) ** 2 + (yy - cy * SCALE) ** 2 < ((r + 2) * SCALE) ** 2] = 0
    fills = []
    # the roll's top edge: a straight line fitted to the half-darkness crossing of the columns away from the left edge stroke
    cols, tops = [], []
    for x in range(270, 385):
        c = dark[600:660, x]
        k = int(np.argmax(c > 0.5))
        tops.append(600 + k - 1 + (0.5 - c[k - 1]) / (c[k] - c[k - 1]) + 0.5)
        cols.append(x + 0.5)
    slope, icpt = np.polyfit(cols, tops, 1)
    print(f"roll top edge: y = {icpt:.2f} + {slope:.5f} x (residual {np.std(np.array(tops) - (icpt + slope * np.array(cols))):.2f} px)")
    parts = {
        "curl": (slice(360 * SCALE, int(curl_bottom * SCALE)), slice(int((xr - wr / 2) * SCALE), 540 * SCALE)),
        "roll": (slice(600 * SCALE, 700 * SCALE), slice(200 * SCALE, 500 * SCALE)),
    }
    for name, (rs, cs_) in parts.items():
        m = np.zeros_like(mask)
        m[rs, cs_] = mask[rs, cs_]
        if name == "curl":
            m[:int((yt + 2.5) * SCALE), :496 * SCALE] = 0          # the top line's end inside the curl is the stroke, not the fill
        if name == "roll":
            below = yy >= (icpt + slope * (xx + 0.5) / SCALE) * SCALE - 0.5       # the part under the fitted top edge
            m[~below] = 0
            m[:int((bowl_cut - 30) * SCALE), 440 * SCALE:] = 0        # above this the right edge is the stroke, below it the bowl is the roll's
        contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(contours, key=cv2.contourArea)[:, 0, :].astype(float)
        c = np.stack([gaussian_filter1d(c[:, 0], 1 * SCALE, mode="wrap"), gaussian_filter1d(c[:, 1], 1 * SCALE, mode="wrap")], 1)
        if name == "roll":
            # The bottom edge is one smooth curve: the recording's edge has two small steps where the drawing's pieces meet
            # (x about 287 and 430). The contour's lowest stretch, between the rounded corners, is smoothed along its length.
            bot = (c[:, 1] > c[:, 1].max() - 10 * SCALE) & (c[:, 0] > 235 * SCALE) & (c[:, 0] < 445 * SCALE)
            idx = np.nonzero(bot)[0]
            if len(idx) > 20 and np.all(np.diff(idx) == 1):
                part = c[idx]
                pad = 12 * SCALE
                ext = np.vstack([np.repeat(part[:1], pad, 0), part, np.repeat(part[-1:], pad, 0)])
                sm = gaussian_filter1d(ext[:, 1], 9 * SCALE, mode="nearest")[pad:-pad]
                fade = np.minimum(1.0, np.minimum(np.arange(len(idx)), np.arange(len(idx))[::-1]) / (8.0 * SCALE))
                c[idx, 1] = part[:, 1] + fade * (sm - part[:, 1])
                print(f"roll bottom edge smoothed over {len(idx) / SCALE:.0f} px, largest move {np.abs(sm - part[:, 1]).max() / SCALE:.2f} px")
        if name == "roll":
            # Where the right stroke ends and the bowl begins, the fill's inner edge turned in a corner: a longer smoothing along
            # that stretch of the contour makes the inner edge one curve from the stroke into the bowl.
            win = (c[:, 0] > 436 * SCALE) & (c[:, 0] < xr * SCALE) & (c[:, 1] > (bowl_cut - 36) * SCALE) & (c[:, 1] < (bowl_cut + 40) * SCALE)
            idx = np.nonzero(win)[0]
            runs = np.split(idx, np.nonzero(np.diff(idx) != 1)[0] + 1) if len(idx) else []
            idx = max(runs, key=len) if runs else idx
            if len(idx) > 20 and np.all(np.diff(idx) == 1):
                pad = 14 * SCALE
                part = c[idx]
                ext = np.vstack([np.repeat(part[:1], pad, 0), part, np.repeat(part[-1:], pad, 0)])
                sm = np.stack([gaussian_filter1d(ext[:, k], 7 * SCALE, mode="nearest")[pad:-pad] for k in (0, 1)], 1)
                fade = np.minimum(1.0, np.minimum(np.arange(len(idx)), np.arange(len(idx))[::-1]) / (10.0 * SCALE))[:, None]
                c[idx] = part + fade * (sm - part)
                print(f"roll inner edge at the right stroke smoothed over {len(idx) / SCALE:.0f} px, largest move {np.abs(sm - part).max() / SCALE:.2f} px")
        seg = np.linalg.norm(np.diff(np.vstack([c, c[:1]]), axis=0), axis=1)
        d = np.concatenate([[0], np.cumsum(seg)])
        samples = np.linspace(0, d[-1], int(d[-1] / SCALE), endpoint=False)
        cc = np.stack([np.interp(samples, d, np.append(c[:, 0], c[0, 0])), np.interp(samples, d, np.append(c[:, 1], c[0, 1]))], 1) / SCALE + 0.5 / SCALE
        path = contour_path(cc)
        fills.append(path)
        print(f"fill {name}: {path.count('C')} curves, {path.count('L') + path.count('H') + path.count('V')} lines, {len(path)} characters")

    # --- the four light text lines: the centre line of each, straightness checked along it
    lines = []
    light = ((gray > 120) & (gray < 200)).astype(np.uint8)
    light[:300] = 0
    light[700:] = 0
    n, lab, st_, cen = cv2.connectedComponentsWithStats(light)
    for k in range(1, n):
        x, y, w, h, area = st_[k]
        if 100 < area < 3000 and h <= 12 and w > 30 and 280 <= x <= 300:
            ys_, xs_ = np.nonzero(lab == k)
            wt_ = 200 - gray[lab == k].astype(float)
            spread = []
            for xc in range(x + 6, x + w - 6):
                m_ = xs_ == xc
                spread.append((ys_[m_] * wt_[m_]).sum() / wt_[m_].sum())
            lines.append((float((ys_ * wt_).sum() / wt_.sum()) + 0.5 - Y_ORIGIN, x + h / 2, x + w - h / 2, float(np.std(spread))))
    lines.sort()
    print("text lines (y, from x, to x, wobble of the centre along the line, px):", [tuple(round(float(q), 2) for q in l) for l in lines])
    with open(out_path, "w", encoding="utf8") as f:
        f.write("// Generated by scripts/trace-operations-paper.py from the last frame of the first application's recording of the empty\n")
        f.write("// Operations screen. PAPER_STROKES: the outline as straight strokes of constant width with round caps (path, width), each\n")
        f.write("// ending inside the fill it meets; PAPER_FILLS: the top curl and the bottom roll; PAPER_LINES: the centre lines of the four\n")
        f.write("// light text lines [y, from x, to x]. All in the picture's own units.\n")
        f.write("export const PAPER_STROKES: ReadonlyArray<readonly [string, number]> = " + json.dumps([[p_, round(w_, 2)] for p_, w_ in strokes]) + ";\n")
        f.write("export const PAPER_FILLS: ReadonlyArray<string> = " + json.dumps(fills) + ";\n")
        f.write("export const PAPER_LINES: ReadonlyArray<readonly [number, number, number]> = " + json.dumps([[round(l[0], 1), round(l[1], 1), round(l[2], 1)] for l in lines]) + ";\n")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    trace(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "src/ui/operations-paper.ts")
