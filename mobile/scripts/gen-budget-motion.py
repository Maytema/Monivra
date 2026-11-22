#!/usr/bin/env python3
"""Generates src/ui/budget-motion.ts: the note of the Budgets empty state, measured on the first application's recording.

Usage:  python3 scripts/gen-budget-motion.py FRAMES_DIR [src/ui/budget-motion.ts] [FITS.json]

FITS.json (optional) keeps the fitted centre lines: it is read when it exists (the fit takes about ten minutes) and
written when it does not.

FRAMES_DIR holds the recording as numbered frames named f_001.png ... (720 x 1600, 30 fps; the note appears at about
frame 16, rests from about frame 108). The recording and the frames are not part of the repository; this script is
the record of how the numbers in budget-motion.ts were made, so they can be made again (or from a better recording).
Needs python3 with numpy, scipy and opencv. RING_FRAMES (the yellow ring) are kept from the existing output file.

What it does (0.3.8; the frame-by-frame facts behind it are in docs/agent/FIX_PLAN_0.3.8.md, P1-2):
  1. Every frame: the green of the note is cut out (colour mask), the ring's yellow is noted as "hidden".
  2. The note is a wavy frame: a stroke (NOTE_STROKE wide, round joins) along a closed centre line made of two cubic
     Bezier long edges (P0 C1 C2 P1 and P2 C3 C4 P3) and two straight short edges (P1-P2, P3-P0). That centre line
     (8 points) is fitted to the outer boundary of the green silhouette by least squares (the boundary is the centre
     line pushed out by half the stroke). The parts of the boundary hidden by the ring are not used. Every frame is
     tried from its neighbours' fits too (a frame cannot get stuck in a bad local minimum).
  3. Frames whose fit is poor, or whose long edge kinks (curvature changes sign twice, or turns on a radius under 50 px),
     are replaced by interpolation between good frames; then every one of the 16 numbers is smoothed over time with a
     Savitzky-Golay filter (7 frames) so the note moves as one body.
  4. What sits on the frame is built from the frame itself, so it bends with it: four half-disc bulges attached to
     the inner side of the stroke (one on each edge; position as the Bezier parameter along the edge and radius measured
     on the rest frame, 180 degree symmetric) and the ellipse in the middle (centre and turn measured against the middle
     line of the note at rest). All of it is written as path strings of a fixed command structure, so the application
     can blend two frames by interpolating the numbers.
"""
import json
import os
import re
import sys

import cv2
import numpy as np
from scipy.optimize import least_squares
from scipy.signal import savgol_filter

FPS = 30.0
FIRST, LAST = 19, 111          # frames fitted
NOTE_START = 16                # the frame at which the note's clock starts (t = 0)
OUT_FROM, OUT_TO = 20, 108     # frames written out (every one: the note moves fast)
REST = 110                     # a frame at rest, used to measure the bulges and the ellipse
STROKE = 23.0
HW = STROKE / 2
TOP = 300                      # the note lives below this row of the recording
BULGE_RADIUS = 25.0            # measured on the rest frame: 23-27 for the four bulges
# Bezier parameter of the bulge on each edge (long edge A, short edge P1-P2, long edge B, short edge P3-P0); the four
# measured values are 0.93, 0.79, 0.93, 0.79 on the rest frame; the shape is symmetric by a half turn, so pairs agree.
BULGE_T = (0.93, 0.79, 0.93, 0.79)
ELLIPSE = (26.4, 36.4)         # half axes measured on the rest frame (minor, major)
K = 0.5523


# ---- geometry ----------------------------------------------------------------------------------
def bez(p0, p1, p2, p3, t):
    t = np.asarray(t, float)[..., None]
    u = 1 - t
    return u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3


def edges(p):
    P0, C1, C2, P1, P2, C3, C4, P3 = np.asarray(p, float).reshape(8, 2)
    return [(P0, C1, C2, P1), (P1, P1 + (P2 - P1) / 3, P1 + 2 * (P2 - P1) / 3, P2), (P2, C3, C4, P3), (P3, P3 + (P0 - P3) / 3, P3 + 2 * (P0 - P3) / 3, P0)]


def deriv(s, t):
    a, b, c, d = s
    t = np.asarray(t, float)[..., None]
    u = 1 - t
    return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c)


def second(s, t):
    a, b, c, d = s
    t = np.asarray(t, float)[..., None]
    return 6 * (1 - t) * (c - 2 * b + a) + 6 * t * (d - 2 * c + b)


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def inward(tangent):
    # The note's outline runs clockwise on the screen (y down), so the inside is to the right of the direction of travel.
    return np.stack([-tangent[..., 1], tangent[..., 0]], -1)


def outer_samples(p, n=40, corner=5):
    """Points of the outer boundary of the stroke: the centre line pushed out by half the stroke, and the round
    corners (arcs of radius HW about the four corner points)."""
    segs = edges(p)
    out, tans = [], []
    for s in segs:
        t = np.linspace(0, 1, n)
        d = unit(deriv(s, t))
        out.append(bez(*s, t) - HW * inward(d))
        tans.append(d)
    for k in range(4):
        a, b, v = tans[k][-1], tans[(k + 1) % 4][0], segs[k][3]
        a0 = np.arctan2(*(-inward(a))[::-1])
        a1 = np.arctan2(*(-inward(b))[::-1])
        turn = (a1 - a0 + np.pi) % (2 * np.pi) - np.pi
        ang = a0 + turn * np.linspace(0, 1, corner)
        out.append(v + HW * np.stack([np.cos(ang), np.sin(ang)], 1))
    return np.vstack(out)


def long_edge_defect(p):
    """True when a long edge kinks: its curvature changes sign twice, or it turns on a radius under 50 px (the measured
    edges of the recording never go under about 70; a kink is where the ring hides the edge and the fit has run wild)."""
    for s in (edges(p)[0], edges(p)[2]):
        t = np.linspace(0.02, 0.98, 60)
        d, dd = deriv(s, t), second(s, t)
        curvature = (d[:, 0] * dd[:, 1] - d[:, 1] * dd[:, 0]) / np.maximum(np.linalg.norm(d, axis=1) ** 3, 1e-9)
        signs = np.sign(curvature[np.abs(curvature) > 1e-4])
        if np.sum(signs[1:] != signs[:-1]) >= 2 or np.max(np.abs(curvature)) > 1 / 50:
            return True
    return False


# ---- measuring ---------------------------------------------------------------------------------
def masks(path):
    im = cv2.imread(path)
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    green = ((hsv[..., 0] > 60) & (hsv[..., 0] < 95) & (hsv[..., 1] > 120) & (hsv[..., 2] > 100)).astype(np.uint8)
    yellow = ((hsv[..., 0] > 12) & (hsv[..., 0] < 34) & (hsv[..., 1] > 120) & (hsv[..., 2] > 180)).astype(np.uint8)
    for m in (green, yellow):
        m[:TOP] = 0
    return green, yellow


def target(path):
    """The signed distance to the green silhouette's boundary (positive outside) and the weight of a place on it
    (0 near the ring, which hides the boundary there), both as images."""
    green, yellow = masks(path)
    opened = cv2.morphologyEx(green, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(opened)
    # Every piece of the note, not only the largest: the ring cuts the note in two where it lies across it.
    cv2.drawContours(filled, [c for c in contours if cv2.contourArea(c) >= 150], -1, 1, -1)
    signed = (cv2.distanceTransform(1 - filled, cv2.DIST_L2, 5) - cv2.distanceTransform(filled, cv2.DIST_L2, 5)).astype(np.float32)
    away = cv2.distanceTransform((1 - cv2.dilate(yellow, np.ones((3, 3), np.uint8))).astype(np.uint8), cv2.DIST_L2, 5)
    return signed, np.clip((away - 6) / 4, 0, 1).astype(np.float32), green, filled


def sample(image, q):
    q = q.astype(np.float32)
    return cv2.remap(image, q[:, 0:1].copy(), q[:, 1:2].copy(), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)[:, 0].astype(float)


def fit(signed, weight, p0, loss="soft_l1", pull=None, strength=0.1):
    """Least-squares fit of the centre line to the visible boundary. `pull` (a centre line) holds the parts of the line
    that are hidden by the ring, which no boundary point constrains, near where the neighbouring frame had them."""
    def residual(p):
        q = outer_samples(p)
        r = sample(signed, q) * sample(weight, q)
        return r if pull is None else np.concatenate([r, strength * (p - pull)])

    r = least_squares(residual, p0, loss=loss, f_scale=2.0, max_nfev=200)
    w = sample(weight, outer_samples(r.x))
    data = sample(signed, outer_samples(r.x)) * w
    return r.x, float(np.sqrt(np.sum(data ** 2) / max(w.sum(), 1)))


def moved(p, angle, shift):
    """The centre line turned by `angle` about its middle and shifted."""
    pts = np.asarray(p, float).reshape(8, 2)
    c = pts[[0, 3, 4, 7]].mean(0)
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    return ((pts - c) @ rot.T + c + shift).ravel()


def align(signed, weight, p):
    """The neighbour's centre line moved as a rigid body (turn and shift: three numbers) onto this frame's silhouette:
    the note travels far between some frames and a free fit started from the old place gets stuck."""
    best = None
    for start in (0.0, -0.25, 0.25):
        r = least_squares(lambda v: sample(signed, outer_samples(moved(p, v[0], v[1:3]))) * sample(weight, outer_samples(moved(p, v[0], v[1:3]))), [start, 0, 0], loss="soft_l1", f_scale=3.0)
        if best is None or r.cost < best.cost:
            best = r
    return moved(p, best.x[0], best.x[1:3])


def first_guesses(filled):
    """Centre lines for the rest frame to start from: the silhouette's smallest rectangle (shrunk by half the stroke)
    with its long edges bent into S curves of several sizes and both ways (a straight start gets stuck)."""
    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    rect = cv2.minAreaRect(np.vstack(contours))
    box = cv2.boxPoints((rect[0], (rect[1][0] - STROKE, rect[1][1] - STROKE), rect[2]))
    centre = box.mean(0)
    order = sorted(range(4), key=lambda i: np.arctan2(box[i][1] - centre[1], box[i][0] - centre[0]))  # clockwise on screen
    box = box[order]
    box = np.roll(box, -int(np.argmin(box[:, 0])), axis=0)
    if np.linalg.norm(box[1] - box[0]) < np.linalg.norm(box[2] - box[1]):
        box = np.roll(box, -1, axis=0)  # the first edge must be a long one
    P0, P1, P2, P3 = box
    side = inward(unit(P1 - P0))
    out = []
    for bend in (-45, -30, -15, 0, 15, 30, 45):
        off = side * bend
        out.append(np.concatenate([P0, P0 + (P1 - P0) / 3 + off, P0 + 2 * (P1 - P0) / 3 - off, P1, P2, P2 + (P3 - P2) / 3 - off, P2 + 2 * (P3 - P2) / 3 + off, P3]))
    return out


def pose(p):
    """(middle of the four corners, turn of the long edges, the eight points in the note's own axes)."""
    pts = np.asarray(p, float).reshape(8, 2)
    c = pts[[0, 3, 4, 7]].mean(0)
    d = (pts[3] - pts[0]) + (pts[4] - pts[7])
    angle = float(np.arctan2(d[1], d[0]))
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    return c, angle, (pts - c) @ rot


def unpose(c, angle, local):
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    return (local @ rot.T + c).ravel()


# ---- the frame's own parts ----------------------------------------------------------------------
def inner_point(s, t):
    d = unit(deriv(s, t))
    return bez(*s, t) + HW * inward(d)


def bulge(s, t, r):
    """Path of a half disc attached to the inner side of the stroke at parameter t of edge s: flat side along the
    stroke, round side into the note. Its two ends are points of the edge itself, so it follows the bending."""
    dt = r / np.linalg.norm(deriv(s, t))
    a, b = inner_point(s, max(0.0, t - dt)), inner_point(s, min(1.0, t + dt))
    return f"M{a[0]:.1f} {a[1]:.1f}A{r:.1f} {r:.1f} 0 0 0 {b[0]:.1f} {b[1]:.1f}Z"


def ellipse_path(c, phi):
    """The ellipse about centre c, its short half axis pointing along angle phi, as four Bezier curves."""
    a = ELLIPSE[0] * np.array([np.cos(phi), np.sin(phi)])
    b = ELLIPSE[1] * np.array([-np.sin(phi), np.cos(phi)])
    pts = lambda th: c + a * np.cos(th) + b * np.sin(th)
    vel = lambda th: -a * np.sin(th) + b * np.cos(th)
    d = f"M{pts(0)[0]:.1f} {pts(0)[1]:.1f}"
    for k in range(4):
        t0, t1 = k * np.pi / 2, (k + 1) * np.pi / 2
        c1, c2, e = pts(t0) + K * vel(t0), pts(t1) - K * vel(t1), pts(t1)
        d += f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {e[0]:.1f} {e[1]:.1f}"
    return d + "Z"


def middle(p):
    """Centre and direction of the note's middle line at its middle (long edge A against long edge B run backwards)."""
    A, _, B, _ = edges(p)
    c = (bez(*A, 0.5) + bez(*B, 0.5)) / 2
    d = (deriv(A, 0.5) - deriv(B, 0.5)) / 2
    return c, np.arctan2(d[1], d[0])


def outline_path(p):
    P0, C1, C2, P1, P2, C3, C4, P3 = np.asarray(p, float).reshape(8, 2)
    f = lambda v: f"{v[0]:.1f} {v[1]:.1f}"
    return f"M{f(P0)}C{f(C1)} {f(C2)} {f(P1)}L{f(P2)}C{f(C3)} {f(C4)} {f(P3)}Z"


def main():
    folder = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "src/ui/budget-motion.ts"
    path = lambda i: f"{folder}/f_{i:03d}.png"
    frames = list(range(FIRST, LAST + 1))
    data = {i: target(path(i)) for i in frames}

    cache = sys.argv[3] if len(sys.argv) > 3 else None
    params, error = {}, {}
    if cache and os.path.exists(cache):
        saved = json.load(open(cache))
        params = {int(i): np.array(v[0]) for i, v in saved.items()}
        error = {int(i): v[1] for i, v in saved.items()}
    else:
        # -- 2. the fit: the rest frame from a rectangle, then every frame from its neighbours' fits, a few rounds
        params[REST], error[REST] = min((fit(data[REST][0], data[REST][1], g) for g in first_guesses(data[REST][3])), key=lambda r: r[1])
        # A free fit started in the old place gets stuck in a local minimum where the note changes its shape fast, and a
        # fit started from a rectangle does where the ring hides the boundary; each frame is therefore tried from both
        # (the neighbour moved onto it, and the rectangle with S curves) and the better one is kept. The score is the
        # distance to the visible boundary plus a little for how far the line is from the neighbour's.
        score = lambda q, rms, ref: rms + 0.03 * float(np.sqrt(np.mean((q - ref) ** 2)))
        for order in (range(REST + 1, LAST + 1), range(REST - 1, FIRST - 1, -1)):
            for i in order:
                prev = params[i - 1] if i > REST else params[i + 1]
                start = align(data[i][0], data[i][1], prev)
                held, _ = fit(data[i][0], data[i][1], start, pull=start)  # first held to the neighbour, then free
                tries = [fit(data[i][0], data[i][1], held)] + [fit(data[i][0], data[i][1], g) for g in first_guesses(data[i][3])]
                params[i], error[i] = min(tries, key=lambda r: score(r[0], r[1], prev))
        for round_ in range(3):
            changed = 0
            for i in frames:
                for j in (i - 1, i + 1, i - 2, i + 2):
                    if j not in params:
                        continue
                    q, rms = fit(data[i][0], data[i][1], fit(data[i][0], data[i][1], params[j], pull=params[j])[0], "linear")
                    if score(q, rms, params[j]) < score(params[i], error[i], params[j]) - 0.05:
                        params[i], error[i], changed = q, rms, changed + 1
            print(f"fit round {round_}: {changed} frames improved, mean error {np.mean(list(error.values())):.2f} px")
            if not changed:
                break

        if cache:
            json.dump({str(i): [params[i].tolist(), error[i]] for i in frames}, open(cache, "w"))

    # -- 3. repair the bad frames, smooth in time. The note travels and turns a lot while it bends, so a frame is split into
    # its pose (middle and turn) and its shape (the eight points in the note's own axes); both are interpolated and smoothed
    # on their own, which keeps the shape of a repaired frame instead of blending two shapes at different angles.
    median = np.median(list(error.values()))
    bad = [i for i in frames if error[i] > max(3.2, 1.8 * median) or long_edge_defect(params[i])]
    print(f"repaired frames: {bad}")
    good = [i for i in frames if i not in bad]
    poses = {i: pose(params[i]) for i in frames}
    angles = np.unwrap([poses[i][1] for i in frames])
    table = np.array([np.concatenate([poses[i][0], [angles[k]], poses[i][2].ravel()]) for k, i in enumerate(frames)])
    for k in range(table.shape[1]):
        table[:, k] = np.interp(frames, good, [table[frames.index(i), k] for i in good])
    smooth = savgol_filter(table, 7, 2, axis=0)
    smooth = {i: unpose(smooth[k][:2], smooth[k][2], smooth[k][3:].reshape(8, 2)) for k, i in enumerate(frames)}
    still_bad = [i for i in frames if long_edge_defect(smooth[i])]
    print(f"kinked after smoothing: {still_bad}")

    # -- 4. the parts of the frame, measured at rest
    rest = smooth[REST]
    c0, angle0 = middle(rest)
    green, _ = masks(path(REST))
    window = np.zeros(green.shape, np.uint8)
    cv2.fillPoly(window, [np.round(np.vstack([bez(*s, np.linspace(0, 1, 60)) for s in edges(rest)])).astype(np.int32)], 1)
    window = cv2.erode(window, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(HW) + 1,) * 2))
    middle_blob = cv2.connectedComponentsWithStats((green & window).astype(np.uint8))
    sizes = middle_blob[2][1:, 4]
    k = int(np.argmax(sizes)) + 1
    contours, _ = cv2.findContours((middle_blob[1] == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    (ex, ey), axes, deg = cv2.fitEllipse(contours[0])
    centre_at_rest = np.array([ex, ey])
    if axes[0] > axes[1]:  # OpenCV may name the long axis first
        axes, deg = (axes[1], axes[0]), deg + 90
    phi_at_rest = np.radians(deg)
    # the ellipse's place in the note's own frame (along / across its middle line)
    rel = centre_at_rest - c0
    along, across = rel @ np.array([np.cos(angle0), np.sin(angle0)]), rel @ np.array([-np.sin(angle0), np.cos(angle0)])
    turn = phi_at_rest - angle0
    print(f"ellipse at rest: centre ({ex:.1f}, {ey:.1f}), axes {axes[0] / 2:.1f} x {axes[1] / 2:.1f} (used {ELLIPSE}), offset along {along:.1f} across {across:.1f}")

    outlines, marks, times = [], [], []
    for i in range(OUT_FROM, OUT_TO + 1):
        p = smooth[i]
        segs = edges(p)
        c, angle = middle(p)
        centre = c + along * np.array([np.cos(angle), np.sin(angle)]) + across * np.array([-np.sin(angle), np.cos(angle)])
        marks.append("".join(bulge(segs[e], BULGE_T[e], BULGE_RADIUS) for e in range(4)) + ellipse_path(centre, angle + turn))
        outlines.append(outline_path(p))
        times.append(int(round((i - NOTE_START) * 1000 / FPS)))

    try:
        old = open(out_path, encoding="utf8").read()
        ring = re.search(r"(// RING:.*?\nexport const RING_FRAMES[^\n]*)", old, re.S).group(1)
    except (OSError, AttributeError):
        sys.exit("the existing output file with RING_FRAMES is needed (the ring is not measured here)")
    with open(out_path, "w", encoding="utf8") as f:
        f.write("// Generated by scripts/gen-budget-motion.py from the frame-by-frame measurement of the first application's recording of the\n")
        f.write("// Budgets empty state (30 fps, 720 px wide). Times are ms from the note's first frame; coordinates are the recording's pixels.\n")
        f.write("// The note: a stroke of NOTE_STROKE along a closed centre line (two cubic long edges and two straight short edges), and\n")
        f.write("// what sits on its frame (four half-disc bulges attached to the inner side of the edges, the ellipse), all built from\n")
        f.write("// the frame's own edges. Every string of one list has the same command structure, so two of them blend by number.\n")
        f.write(f"export const NOTE_STROKE = {STROKE:g};\n")
        f.write(f"export const NOTE_TIMES: ReadonlyArray<number> = {json.dumps(times)};\n")
        f.write(f"export const NOTE_OUTLINE: ReadonlyArray<string> = {json.dumps(outlines)};\n")
        f.write(f"export const NOTE_MARKS: ReadonlyArray<string> = {json.dumps(marks)};\n")
        f.write(ring + "\n")
    print(f"wrote {out_path}: {len(times)} frames")


if __name__ == "__main__":
    main()
