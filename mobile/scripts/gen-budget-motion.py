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
import itertools
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
OUT_FROM, OUT_TO = 20, 111     # frames written out (every one: the note moves fast; the note rests from about frame 108)
REST = 110                     # a frame at rest, used to measure the bulges and the ellipse
STROKE = 23.0
HW = STROKE / 2
TOP = 300                      # the note lives below this row of the recording
# The four bulges, one per edge (long edge A, short edge P1-P2, long edge B, short edge P3-P0): where each sits as a fraction of its
# edge's length, its radius and how far its circle's centre lies inside the stroke's inner side (negative: outside it, a shallower
# arc), measured on the rest frame (frame 110, fits of f, r, h to the green outside the stroke). They start every frame's search.
BULGE_F = (0.97, 0.88, 0.96, 0.88)
BULGE_R = (26.0, 29.0, 26.0, 29.0)
BULGE_H = (-5.0, 1.5, -3.0, 4.5)
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


# ---- two cubics per long edge ---------------------------------------------------------------------
# A long edge is two cubic curves that meet at a joint with a common tangent (C1): the joint's position is free, so an
# edge can bend in two places (the note slows and its edge bends around the ring as it slips through it). The 26 numbers:
#   edge A: P0 C1 C2 J lam C4 P1   (13)      edge B: P2 C1 C2 J lam C4 P3   (13)
# the second curve of an edge is (J, J + lam (J - C2), C4, end). The short edges are straight.
POINTS = [0, 2, 4, 6, 9, 11, 13, 15, 17, 19, 22, 24]   # where the 12 points start in the 26 numbers
LAMS = [8, 21]


def split_cubic(s):
    a, b, c, d = s
    j = (a + 3 * b + 3 * c + d) / 8
    return (a, (a + b) / 2, (a + 2 * b + c) / 4, j), (j, (b + 2 * c + d) / 4, (c + d) / 2, d)


def to_double(p):
    """The 26 numbers of a one-cubic-per-edge line (16 numbers), cut in the middle of each long edge (an exact copy)."""
    A, _, B, _ = edges(p)
    out = []
    for s in (A, B):
        (a, c1, c2, j), (_, _, c4, e) = split_cubic(s)
        out += [*a, *c1, *c2, *j, 1.0, *c4, *e]
    return np.array(out)


def q_edges(q):
    """The four edges of a 26-number line, each a list of cubics."""
    q = np.asarray(q, float)
    edge = lambda o: [
        (q[o:o + 2], q[o + 2:o + 4], q[o + 4:o + 6], q[o + 6:o + 8]),
        (q[o + 6:o + 8], q[o + 6:o + 8] + q[o + 8] * (q[o + 6:o + 8] - q[o + 4:o + 6]), q[o + 9:o + 11], q[o + 11:o + 13]),
    ]
    P1, P2, P3, P0 = q[11:13], q[13:15], q[24:26], q[0:2]
    line = lambda a, b: [(a, a + (b - a) / 3, a + 2 * (b - a) / 3, b)]
    return [edge(0), line(P1, P2), edge(13), line(P3, P0)]


def outer2(q, n=24, corner=5):
    """Points of the outer boundary of the stroke for a 26-number line."""
    es = q_edges(q)
    out, tans, ends, starts = [], [], [], []
    for segs in es:
        first = None
        for s in segs:
            t = np.linspace(0, 1, n)
            d = unit(deriv(s, t))
            out.append(bez(*s, t) - HW * inward(d))
            first = d[0] if first is None else first
            last = d[-1]
        tans.append((first, last))
        ends.append(segs[-1][3])
    for k in range(4):
        a, b, v = tans[k][1], tans[(k + 1) % 4][0], ends[k]
        a0, a1 = np.arctan2(*(-inward(a))[::-1]), np.arctan2(*(-inward(b))[::-1])
        turn = (a1 - a0 + np.pi) % (2 * np.pi) - np.pi
        ang = a0 + turn * np.linspace(0, 1, corner)
        out.append(v + HW * np.stack([np.cos(ang), np.sin(ang)], 1))
    return np.vstack(out)


def fit2(signed, weight, q0, loss="soft_l1", pull=None, strength=0.03):
    """As `fit`, for the 26 numbers; the joint's lam stays between 0.3 and 3."""
    lo = np.full(26, -np.inf)
    hi = np.full(26, np.inf)
    lo[LAMS], hi[LAMS] = 0.3, 3.0
    q0 = np.clip(q0, lo + 1e-6, hi - 1e-6)

    def residual(q):
        pts = outer2(q)
        r = sample(signed, pts) * sample(weight, pts)
        return r if pull is None else np.concatenate([r, strength * (q - pull)])

    r = least_squares(residual, q0, loss=loss, f_scale=2.0, max_nfev=150, bounds=(lo, hi))
    pts = outer2(r.x)
    w = sample(weight, pts)
    return r.x, float(np.sqrt(np.sum((sample(signed, pts) * w) ** 2) / max(w.sum(), 1)))


def visible_reference(q, filled, weight):
    """The visible outer boundary of the reference silhouette (the pieces inside the note's own outline left out), as points."""
    contours, _ = cv2.findContours(filled, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    ref = np.vstack([c[:, 0, :] for c in contours]).astype(float)
    ref = ref[sample(weight, ref) > 0.99]
    if len(ref):
        # The bulges and the ellipse are green pieces inside the note's own outline: only what lies on or outside the centre
        # line is the note's boundary (its outer edge is a half stroke outside it, the pieces a half stroke or more inside).
        poly = silhouette_parts(q).astype(np.float32).reshape(-1, 1, 2)
        ref = ref[[cv2.pointPolygonTest(poly, (float(x), float(y)), True) < 2.0 for x, y in ref]]
    return ref


def refine2(signed, weight, filled, q0):
    """As fit2, plus the other direction: every visible boundary point of the reference must be near our outer boundary. The
    plain fit only asks our boundary to lie on the reference's, so where the ring hides the line it can cut a visible corner."""
    ref = visible_reference(q0, filled, weight)
    if len(ref) < 20:
        return q0
    ref = ref[:: max(1, len(ref) // 150)]
    lo = np.full(26, -np.inf)
    hi = np.full(26, np.inf)
    lo[LAMS], hi[LAMS] = 0.3, 3.0
    q0 = np.clip(q0, lo + 1e-6, hi - 1e-6)

    def residual(q):
        pts = outer2(q)
        forward = sample(signed, pts) * sample(weight, pts)
        back = np.min(np.linalg.norm(ref[:, None, :] - outer2(q, n=60, corner=24)[None, ::2, :], axis=2), axis=1)
        return np.concatenate([forward, 0.7 * back, 0.03 * (q - q0)])

    return least_squares(residual, q0, loss="soft_l1", f_scale=2.0, max_nfev=120, bounds=(lo, hi)).x


def dense(segs, n=80):
    return np.vstack([bez(*s, np.linspace(0, 1, n))[(1 if k else 0):] for k, s in enumerate(segs)])


def edge_at(segs, f):
    """Point and unit direction at the fraction f of an edge's length."""
    pts = dense(segs)
    length = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    x = f * length[-1]
    p = np.array([np.interp(x, length, pts[:, 0]), np.interp(x, length, pts[:, 1])])
    k = min(max(int(np.searchsorted(length, x)), 1), len(pts) - 1)
    return p, unit(pts[k] - pts[k - 1]), length[-1]


def pose2(q):
    """(middle of the corners, turn of the long edges, the twelve points in the note's own axes, the two lams)."""
    q = np.asarray(q, float)
    pts = np.array([q[o:o + 2] for o in POINTS])
    c = pts[[0, 5, 6, 11]].mean(0)
    d = (pts[5] - pts[0]) + (pts[6] - pts[11])
    angle = float(np.arctan2(d[1], d[0]))
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    return c, angle, (pts - c) @ rot, q[LAMS]


def unpose2(c, angle, local, lams):
    rot = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    pts = local @ rot.T + c
    q = np.zeros(26)
    for k, o in enumerate(POINTS):
        q[o:o + 2] = pts[k]
    q[LAMS] = lams
    return q


# ---- the frame's own parts ----------------------------------------------------------------------
def bulge(segs, f, r):
    """Path of a half disc attached to the inner side of the stroke at the fraction f of an edge: its round side goes
    into the note, its flat side (the chord) lies on the stroke's inner side, and a band runs from the chord out to the
    stroke's centre line, so the sliver that a straight chord leaves on a curved edge is always covered by paint.
    Its corners are points of the edge itself, so it follows the bending."""
    _, _, length = edge_at(segs, f)
    pa, da, _ = edge_at(segs, max(0.0, f - r / length))
    pb, db, _ = edge_at(segs, min(1.0, f + r / length))
    a, b = pa + HW * inward(da), pb + HW * inward(db)
    return f"M{pa[0]:.1f} {pa[1]:.1f}L{a[0]:.1f} {a[1]:.1f}A{r:.1f} {r:.1f} 0 0 0 {b[0]:.1f} {b[1]:.1f}L{pb[0]:.1f} {pb[1]:.1f}Z"


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


def middle(q):
    """Centre and direction of the note's middle line at its middle (long edge A against long edge B run backwards)."""
    es = q_edges(q)
    pa, da, _ = edge_at(es[0], 0.5)
    pb, db, _ = edge_at(es[2], 0.5)
    d = da - db
    return (pa + pb) / 2, float(np.arctan2(d[1], d[0]))


def outline_path(q):
    q = np.asarray(q, float)
    f = lambda v: f"{v[0]:.1f} {v[1]:.1f}"
    (a1, a2), _, (b1, b2), _ = q_edges(q)
    return (f"M{f(a1[0])}C{f(a1[1])} {f(a1[2])} {f(a1[3])}C{f(a2[1])} {f(a2[2])} {f(a2[3])}"
            f"L{f(b1[0])}C{f(b1[1])} {f(b1[2])} {f(b1[3])}C{f(b2[1])} {f(b2[2])} {f(b2[3])}Z")


def silhouette_parts(q):
    """The fitted note's centre line as a closed polyline (it fills to the note's inside)."""
    return np.vstack([dense(segs, 60) for segs in q_edges(q)])


def boundary_error(q, filled, weight):
    """Distance from the visible boundary of the reference silhouette to our rendered outer boundary: (mean, p95)."""
    ref = visible_reference(q, filled, weight)
    if len(ref) < 20:
        return None
    ours = outer2(q, n=120, corner=24)
    d = np.min(np.linalg.norm(ref[:, None, :] - ours[None, ::2, :], axis=2), axis=1)
    return float(d.mean()), float(np.percentile(d, 95))


# ---- 0.3.14: dense tracking of the note ------------------------------------------------------------------
# The note is tracked as two long edges of N_EDGE points each (same arc-length fractions in every frame) and two straight short
# edges. Every frame starts from its own two-cubic fit and each point is moved along the edge's normal to where the
# recording's stroke is: the outer boundary of the green stroke (a stroke is 23 wide in every frame, measured: median 23.0-23.2)
# and, where the inner boundary is clean (no bulge, no ring), the inner one too. Points the ring or a bulge hides are filled
# from their neighbours along the edge and in time; then every coordinate is smoothed over time (Savitzky-Golay, 5 frames).

N_EDGE = 41     # points per long edge (40 segments)
STROKE_W = 23.0
HWD = STROKE_W / 2

def resample(pts, n):
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    d = np.concatenate([[0], np.cumsum(seg)])
    u = np.linspace(0, d[-1], n)
    return np.stack([np.interp(u, d, pts[:, 0]), np.interp(u, d, pts[:, 1])], 1)

def tangents(pts):
    t = np.gradient(pts, axis=0)
    return t / np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)

def outward_of(t):
    # g.inward(t) = (-ty, tx) points into the note for the clockwise outline; outward is its negative (edge B runs the same way round)
    return np.stack([t[:, 1], -t[:, 0]], 1)

def alpha_image(im):
    return np.clip((255 - im[..., 2].astype(np.float32)) / 239, 0, 1)

def yellow_image(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    y = ((hsv[..., 0] > 12) & (hsv[..., 0] < 34) & (hsv[..., 1] > 120) & (hsv[..., 2] > 180)).astype(np.uint8)
    return y

def profiles(img, pts, nrm, half=24.0, step=0.5):
    s = np.arange(-half, half + 1e-6, step)
    P = pts[:, None, :] + s[None, :, None] * nrm[:, None, :]
    v = cv2.remap(img, P[..., 0].astype(np.float32).reshape(-1, 1).copy(), P[..., 1].astype(np.float32).reshape(-1, 1).copy(), cv2.INTER_LINEAR)
    return s, v.reshape(len(pts), len(s))

def measure(alpha, yel_d, pts, nrm):
    """Per point: offset of the stroke's centre along the outward normal (nan when unknown)."""
    s, V = profiles(alpha, pts, nrm)
    _, Y = profiles(yel_d, pts, nrm)
    out = np.full(len(pts), np.nan)
    step = s[1] - s[0]
    for k in range(len(pts)):
        v, y = V[k], Y[k]
        plateau = np.percentile(v[(s > -9) & (s < 9)], 90) if np.any(v[(s > -9) & (s < 9)] > 0.2) else 0
        if plateau < 0.4:
            continue
        lvl = 0.5 * plateau
        sel = np.where((s >= -7) & (s <= 17) & (v >= lvl))[0]
        if len(sel) == 0:
            continue
        jo = sel.max()
        if jo + 1 >= len(s) or v[jo + 1] >= lvl or v[min(len(s) - 1, jo + 10)] > 0.25 * plateau:
            continue
        so = s[jo] + (v[jo] - lvl) / (v[jo] - v[jo + 1]) * step
        # inner crossing
        si = None
        for j in range(jo, 0, -1):
            if v[j] >= lvl and v[j - 1] < lvl and s[j] < so - 14:
                si = s[j] - (v[j] - lvl) / (v[j] - v[j - 1]) * step
                break
        near = (s >= so - 11) & (s <= so + 11)
        ycov_out = np.any(y[near])
        co = so - HWD
        if si is not None and so - si < 30:
            ci = si + HWD
            if abs((so - si) - STROKE_W) <= 1.5:
                out[k] = (co + ci) / 2
                continue
            near_i = (s >= si - 11) & (s <= si + 11)
            if not np.any(y[near_i]) and np.all(v[(s > si + 2) & (s < si + 18)] > 0.5 * plateau):
                out[k] = ci
                continue
        if not ycov_out:
            out[k] = co
    return out





def line_intersection(p, d, q, e):
    """Where the line p + s d meets q + u e (None when they are parallel)."""
    m = np.array([[d[0], -e[0]], [d[1], -e[1]]])
    if abs(np.linalg.det(m)) < 1e-6:
        return None
    s_, _ = np.linalg.solve(m, q - p)
    return p + s_ * d


def initial_edges(q):
    es = q_edges(q)
    return resample(dense(es[0], 80), N_EDGE), resample(dense(es[2], 80), N_EDGE)


def short_line(alpha, yel, X, Y):
    """A short edge (straight, from X to Y) moved onto the recording's stroke: its endpoints shifted along its normal by the
    measured offset at both ends (a line fitted to the offsets of nine points between them); X and Y when too little is measured."""
    u = (Y - X) / max(np.linalg.norm(Y - X), 1e-9)
    n = np.array([u[1], -u[0]])                     # outward: the short edges run on the same turn as the long ones
    fr = np.linspace(0.2, 0.8, 9)
    pts = X[None, :] + fr[:, None] * (Y - X)[None, :]
    d = measure(alpha, yel, pts, np.repeat(n[None, :], len(fr), 0))
    ok = ~np.isnan(d)
    if ok.sum() < 4:
        return X, Y, False
    b_, a_ = np.polyfit(fr[ok], d[ok], 1)
    return X + a_ * n, Y + (a_ + b_) * n, True


def end_direction(E, at_end):
    seg = E[-6:] if at_end else E[:6]
    c = seg.mean(0)
    _, _, vt = np.linalg.svd(seg - c)
    d = vt[0]
    return c, d / np.linalg.norm(d)


def track_frame(im, A, B, iters=4):
    """One frame's two long edges moved onto the recording's stroke (and the corners onto the short edges' lines); also which
    points were measured (not filled)."""
    alpha = alpha_image(im)
    yel = cv2.dilate(yellow_image(im), np.ones((3, 3), np.uint8)).astype(np.float32)
    valid = {}
    edge = {"A": A, "B": B}

    def long_edges():
        for name in ("A", "B"):
            E = edge[name]
            t = tangents(E)
            n = outward_of(t)
            d = measure(alpha, yel, E, n)
            ok = ~np.isnan(d)
            valid[name] = ok
            if ok.sum() >= 4:
                dd = np.interp(np.arange(len(E)), np.flatnonzero(ok), d[ok])
                edge[name] = resample(E + 0.9 * dd[:, None] * n, N_EDGE)

    def corners():
        A, B = edge["A"], edge["B"]
        # S1 runs from A's end to B's start, S2 from B's end to A's start
        for ends in (("A", True, "B", False), ("B", True, "A", False)):
            e1, end1, e2, end2 = ends
            X, Y, found = short_line(alpha, yel, edge[e1][-1], edge[e2][0])
            for name, at_end, P in ((e1, True, X), (e2, False, Y)):
                corner_ok[(name, at_end)] = found
                E = edge[name]
                c, d = end_direction(E, at_end)
                u = (Y - X) / max(np.linalg.norm(Y - X), 1e-9)
                hit = line_intersection(c, d, X, u)
                if hit is None or np.linalg.norm(hit - (E[-1] if at_end else E[0])) > 25:
                    hit = P
                E = E.copy()
                E[-1 if at_end else 0] = hit
                edge[name] = resample(E, N_EDGE)

    corner_ok = {}
    long_edges()
    for _ in range(iters - 1):
        corners()
        long_edges()
    corners()
    # a corner is "measured" only when its short edge was
    for (name, at_end), found in corner_ok.items():
        valid[name][-1 if at_end else 0] = found
    return edge["A"], edge["B"], valid["A"], valid["B"]



def bulge_polygon(edge, f, r, h=0.0, n=40):
    """The bulge as a polygon (for measuring: the same construction as `poly_bulge`)."""
    half = float(np.sqrt(max(r * r - h * h, 1.0)))
    _, _, length = poly_at(edge, f)
    pa, da, _ = poly_at(edge, max(0.0, f - half / length))
    pb, db, _ = poly_at(edge, min(1.0, f + half / length))
    a, b = pa + HW * inward(da), pb + HW * inward(db)
    mid, chord = (a + b) / 2, float(np.linalg.norm(b - a))
    nrm = inward((b - a) / max(chord, 1e-9))
    # the circle through a and b with radius r (as an SVG arc takes it; the chord is shorter than 2 sqrt(r^2 - h^2) when the bulge
    # is cut by the end of its edge): its centre lies sqrt(r^2 - (chord/2)^2) from the chord's middle, on h's side
    hh = float(np.sign(h) if h else 1.0) * float(np.sqrt(max(r * r - (chord / 2) ** 2, 0.0)))
    c = mid + nrm * hh
    a0, a1, apex = np.arctan2(*(a - c)[::-1]), np.arctan2(*(b - c)[::-1]), np.arctan2(*nrm[::-1])
    d1 = (apex - a0 + np.pi) % (2 * np.pi) - np.pi
    d2 = (a1 - apex + np.pi) % (2 * np.pi) - np.pi
    th = np.concatenate([a0 + d1 * np.linspace(0, 1, n // 2), apex + d2 * np.linspace(0, 1, n // 2)])
    return np.vstack([pa, a, c + r * np.stack([np.cos(th), np.sin(th)], 1), b, pb])


def track_marks(im, A, B, last):
    """The ellipse (centre, turn) and the four bulges (position on the edge, radius) of one frame as the recording shows them
    (None where the ring or the note's gaps hide them); `last` is the previous frame's values, which the search starts from."""
    green = (masks_of(im)[0] > 0).astype(np.uint8)
    yel = cv2.dilate(yellow_image(im), np.ones((9, 9), np.uint8))
    H, W = green.shape
    poly = np.round(np.vstack([A, B])).astype(np.int32)
    band = np.zeros((H, W), np.uint8)
    cv2.polylines(band, [np.vstack([poly, poly[:1]])], False, 1, int(STROKE))
    inner = (green & (1 - band)).astype(np.uint8)
    es = poly_marks_edges(A, B)
    # ellipse: the largest piece well inside the note
    window = np.zeros((H, W), np.uint8)
    cv2.fillPoly(window, [poly], 1)
    window = cv2.erode(window, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(HW) + 9,) * 2))
    blob = cv2.connectedComponentsWithStats((inner & window).astype(np.uint8))
    ellipse = None
    if blob[0] > 1:
        k = int(np.argmax(blob[2][1:, 4])) + 1
        area = blob[2][k, 4]
        mask = (blob[1] == k).astype(np.uint8)
        if 0.85 * np.pi * ELLIPSE[0] * ELLIPSE[1] < area < 1.15 * np.pi * ELLIPSE[0] * ELLIPSE[1] and not (mask & yel).any():
            cnt, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            (ex, ey), axes, deg = cv2.fitEllipse(cnt[0])
            if axes[0] > axes[1]:
                deg += 90
            ellipse = (ex, ey, np.radians(deg))
    bulges = []
    for e in range(4):
        f0, r0 = last["bulges"][e]
        best = None
        for f in np.arange(max(0.6, f0 - 0.1), min(0.995, f0 + 0.06), 0.01):
            for r in np.arange(max(14.0, r0 - 6), r0 + 6.1, 1.0):
                shape = bulge_polygon(es[e], f, r, BULGE_H[e])
                c = shape.mean(0)
                x0, y0 = int(c[0]) - 60, int(c[1]) - 60
                if x0 < 0 or y0 < 0 or x0 + 120 > W or y0 + 120 > H:
                    continue
                m = np.zeros((120, 120), np.uint8)
                cv2.fillPoly(m, [np.round(shape - [x0, y0]).astype(np.int32)], 1)
                m &= 1 - band[y0:y0 + 120, x0:x0 + 120]
                ref = inner[y0:y0 + 120, x0:x0 + 120]
                near = np.zeros((120, 120), np.uint8)
                cv2.circle(near, (60, 60), int(r + 14), 1, -1)
                a_, b_ = (m & near) > 0, (ref & near) > 0
                iou = (a_ & b_).sum() / max(1, (a_ | b_).sum())
                if best is None or iou > best[0]:
                    best = (iou, f, r, bool(yel[y0:y0 + 120, x0:x0 + 120][near > 0].any()))
        bulges.append(None if best is None or best[0] < 0.7 or best[3] else (best[1], best[2]))
    return ellipse, bulges


def masks_of(im):
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    green = ((hsv[..., 0] > 60) & (hsv[..., 0] < 95) & (hsv[..., 1] > 120) & (hsv[..., 2] > 100)).astype(np.uint8)
    green[:TOP] = 0
    return green, None



def fill_in_time(X, ok, max_gap=14):
    """X: frames x points x 2, ok: frames x points. A point that was not measured in a frame takes its place from the frames
    where it was (linear in time) when the gap is at most max_gap frames; longer gaps keep the along-the-edge fill."""
    X = X.copy()
    F, n = ok.shape
    for k in range(n):
        good = np.flatnonzero(ok[:, k])
        if len(good) < 2:
            continue
        bad = np.flatnonzero(~ok[:, k])
        for f in bad:
            lo = good[good < f]
            hi = good[good > f]
            if len(lo) and len(hi) and hi[0] - lo[-1] <= max_gap + 1:
                w = (f - lo[-1]) / (hi[0] - lo[-1])
                X[f, k] = (1 - w) * X[lo[-1], k] + w * X[hi[0], k]
    return X


def poly_at(pts, f):
    """Point, unit direction and length of a polyline at the fraction f of its length."""
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    d = np.concatenate([[0], np.cumsum(seg)])
    x = f * d[-1]
    p = np.array([np.interp(x, d, pts[:, 0]), np.interp(x, d, pts[:, 1])])
    k = min(max(int(np.searchsorted(d, x)), 1), len(pts) - 1)
    return p, unit(pts[k] - pts[k - 1]), d[-1]


def poly_bulge(pts, f, r, h=0.0):
    """The bulge on a polyline edge: a circle of radius r whose centre lies h inside the stroke's inner side (h = 0: a half disc),
    cut by that inner side. Its chord ends are points of the edge, so it follows the bending; a band runs from the chord out to the
    stroke's centre line so that no sliver is left on a curved edge. The arc flag is fixed by the sign of h (a circle with its
    centre inside gives more than half a disc), the same in every frame."""
    half = float(np.sqrt(max(r * r - h * h, 1.0)))
    _, _, length = poly_at(pts, f)
    pa, da, _ = poly_at(pts, max(0.0, f - half / length))
    pb, db, _ = poly_at(pts, min(1.0, f + half / length))
    a, b = pa + HW * inward(da), pb + HW * inward(db)
    large = 1 if h > 0 else 0
    return f"M{pa[0]:.1f} {pa[1]:.1f}L{a[0]:.1f} {a[1]:.1f}A{r:.1f} {r:.1f} 0 {large} 0 {b[0]:.1f} {b[1]:.1f}L{pb[0]:.1f} {pb[1]:.1f}Z"


def poly_marks_edges(A, B):
    """The four edges as polylines in the order of `q_edges` (long A, short, long B, short)."""
    return [A, np.array([A[-1], B[0]]), B, np.array([B[-1], A[0]])]


def poly_outline(A, B):
    f = lambda v: f"{v[0]:.1f} {v[1]:.1f}"
    return "M" + f(A[0]) + "".join("L" + f(v) for v in A[1:]) + "L" + f(B[0]) + "".join("L" + f(v) for v in B[1:]) + "Z"


def poly_polygon(A, B):
    return np.vstack([A, B])


def poly_middle(A, B):
    pa, da, _ = poly_at(A, 0.5)
    pb, db, _ = poly_at(B, 0.5)
    d = da - db
    return (pa + pb) / 2, float(np.arctan2(d[1], d[0]))


# ---- the ring: thickness from the recording, split from the note's own outline ---------------------------------
def ring_measure(im, row, poly, thick_guess=40.0):
    """The ring of one frame, measured on the recording: (centre x, centre y, outer radius, thickness, rays used), or None when
    too few rays are clear of the note. Rays from the given centre, every 2 degrees, that do not meet the note (its stroke and a
    margin); on each the inner and the outer edge of the ring are the half-level crossings of its yellowness (blue channel against
    the ring's own plateau, only where the red channel is high: the note's green has a low red). A circle with a common centre
    and two radii is then fitted to the edge points, which also corrects the given centre and radius."""
    blue, red = im[..., 0].astype(np.float32), im[..., 2]
    sure = (red > 230) & (blue < 120) & (im[..., 1] > 150)
    if sure.sum() < 200:
        return None
    plateau = float(np.median(blue[sure]))
    alpha = np.clip((255 - blue) / (255 - plateau), 0, 1) * (red > 200)
    cx, cy, R = row[1], row[2], row[3]
    ang = np.radians(np.arange(0, 360, 2.0))
    s = np.arange(max(0.0, R - 60), R + 14, 0.5)
    pts = np.stack([cx + np.outer(np.cos(ang), s), cy + np.outer(np.sin(ang), s)], -1)
    v = cv2.remap(alpha, pts[..., 0].astype(np.float32), pts[..., 1].astype(np.float32), cv2.INTER_LINEAR)
    poly32 = poly.astype(np.float32).reshape(-1, 1, 2)
    inner_pts, outer_pts = [], []
    for k in range(len(ang)):
        band = pts[k][(s > R - 1.1 * thick_guess - 3) & (s < R + 8)]   # the ring's own band, with a margin
        if any(cv2.pointPolygonTest(poly32, (float(x), float(y)), True) > -(HW + 6) for x, y in band[::3]):
            continue
        row_v = v[k]
        up = [j for j in range(len(s) - 1) if row_v[j] < 0.5 <= row_v[j + 1]]
        down = [j for j in range(len(s) - 1) if row_v[j] >= 0.5 > row_v[j + 1]]
        if not up or not down:
            continue
        j0, j1 = up[0], down[-1]
        s_in = s[j0] + (0.5 - row_v[j0]) / (row_v[j0 + 1] - row_v[j0]) * 0.5
        s_out = s[j1] + (row_v[j1] - 0.5) / (row_v[j1] - row_v[j1 + 1]) * 0.5
        if s_out - s_in < 3:
            continue
        inner_pts.append((cx + s_in * np.cos(ang[k]), cy + s_in * np.sin(ang[k])))
        outer_pts.append((cx + s_out * np.cos(ang[k]), cy + s_out * np.sin(ang[k])))
    if len(outer_pts) < 12:
        return None
    ip, op = np.array(inner_pts), np.array(outer_pts)

    def residual(x):
        return np.concatenate([np.hypot(op[:, 0] - x[0], op[:, 1] - x[1]) - x[2], np.hypot(ip[:, 0] - x[0], ip[:, 1] - x[1]) - x[3]])

    fit_ = least_squares(residual, [cx, cy, R, R - 20], loss="soft_l1", f_scale=1.0)
    x = fit_.x
    return float(x[0]), float(x[1]), float(x[2]), float(x[2] - x[3]), len(outer_pts)


def inside_note(poly, cx, cy, r, step=0.5):
    """Signed distance (positive inside, in px) of the ring's middle circle to the note's centre line, every `step` degrees."""
    ang = np.radians(np.arange(0, 360, step))
    poly32 = poly.astype(np.float32).reshape(-1, 1, 2)
    return np.array([cv2.pointPolygonTest(poly32, (float(cx + r * np.cos(a)), float(cy + r * np.sin(a))), True) for a in ang])


def ring_runs(poly, cx, cy, r, step=0.5):
    """The circular runs of the ring's middle circle that lie on the note (in its filled outline or within half the stroke of its
    centre line), as lists of sample indices, and the signed distances (positive inside) of every sample."""
    sd = inside_note(poly, cx, cy, r, step)
    n = len(sd)
    inside = sd > -HW
    if not inside.any() or inside.all():
        return [], sd, inside
    start = int(np.flatnonzero(~inside)[0])
    runs, cur = [], []
    for k in range(n):
        j = (start + k) % n
        if inside[j]:
            cur.append(j)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs, sd, inside


def ring_split_own(poly, cx, cy, r, step=0.5, thick=0.0):
    """From the note's own outline only. Returns (behind, front) as lists of (start, end) angles in degrees (0 = 3 o'clock, 90 =
    down, ends unwrapped so that end > start): a run of the circle on the note whose middle lies in 270..360 (the upper right) is
    behind the note, every other run is in front of it."""
    runs, sd, _ = ring_runs(poly, cx, cy, r, step)
    behind, front = [], []
    for run in runs:
        a0, a1 = run[0] * step, run[-1] * step
        if a1 < a0:
            a1 += 360
        mid = ((a0 + a1) / 2) % 360
        (behind if 270 <= mid < 360 else front).append((a0, a1))
    # A front run is drawn over the note with flat ends cut across the ring, while the note's edge crosses the ring at a slant: the
    # ring's own half width (and the note's half stroke) reaches past the place where its centre leaves the note, and a run that
    # stops there leaves a yellow wedge on the green and a green notch next to it (frames 44-52). Each end is therefore extended
    # by that reach, never further than half the free gap to the next run of the circle (behind or front): where the ring is not
    # over the note the extension is the same yellow as the whole circle under the note and cannot be seen.
    reach = np.degrees((thick / 2 + HW) / max(r, 1.0))
    every = sorted([(a, b, True) for a, b in front] + [(a, b, False) for a, b in behind])
    grown = []
    for k, (a, b, is_front) in enumerate(every):
        if not is_front:
            continue
        nxt = every[(k + 1) % len(every)]
        prv = every[k - 1]
        gap_after = (nxt[0] - b) % 360 if len(every) > 1 else 360.0
        gap_before = (a - prv[1]) % 360 if len(every) > 1 else 360.0
        grown.append((a - min(reach, gap_before / 2), b + min(reach, gap_after / 2)))
    front = grown
    return behind, front


def ring_paths(row, thick, behind, front):
    """The ring as two layers with the same commands in every frame. The back layer is the whole circle (two arcs of 180 degrees):
    it lies under the opaque note, which hides it wherever it runs behind the note, so no end of an arc is ever visible next to
    the note. The front layer holds only the runs that are in front of the note (four arcs of at most 180 degrees: up to two runs of
    two arcs; zero length when unused), drawn over the note."""
    r = max(1.0, row[3] - row[4] / 2)
    at = lambda deg: f"{row[1] + r * np.cos(np.radians(deg)):.1f} {row[2] + r * np.sin(np.radians(deg)):.1f}"

    def arcs(a, b, count):
        d = f"M{at(a)}"
        for k in range(1, count + 1):
            d += f"A{r:.1f} {r:.1f} 0 0 1 {at(a + (b - a) * k / count)}"
        return d

    runs = sorted(front, key=lambda ab: -(ab[1] - ab[0]))[:2]
    runs += [(runs[0][0], runs[0][0]) if runs else (270.0, 270.0)] * (2 - len(runs))
    d = "".join(arcs(a, b, 2) for a, b in runs)
    return arcs(270, 630, 2), d


def main():
    folder = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "src/ui/budget-motion.ts"
    path = lambda i: f"{folder}/f_{i:03d}.png"
    frames = list(range(FIRST, LAST + 1))
    data = {i: target(path(i)) for i in frames}

    cache = sys.argv[3] if len(sys.argv) > 3 else None
    saved = json.load(open(cache)) if cache and os.path.exists(cache) else {}
    if saved and "single" not in saved:      # a cache of the first version holds the one-cubic fits at its top level
        saved = {"single": saved}
    # -- 2. first pass: one cubic per long edge (16 numbers): the rest frame from a rectangle, then every frame from its
    # neighbours' fits, a few rounds
    params, error = {}, {}
    if "single" in saved:
        params = {int(i): np.array(v[0]) for i, v in saved["single"].items()}
        error = {int(i): v[1] for i, v in saved["single"].items()}
    else:
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
        saved["single"] = {str(i): [params[i].tolist(), error[i]] for i in frames}
        if cache:
            json.dump(saved, open(cache, "w"))

    # -- 3. second pass: two cubics per long edge (26 numbers), started from the first pass cut in the middle and from the
    # neighbours; the score is the distance to the visible boundary and a little for the distance from the neighbour
    q2, e2 = {}, {}
    if "double" in saved:
        q2 = {int(i): np.array(v[0]) for i, v in saved["double"].items()}
        e2 = {int(i): v[1] for i, v in saved["double"].items()}
    else:
        score2 = lambda q, rms, ref: rms + 0.02 * float(np.sqrt(np.mean((q - ref) ** 2)))
        for order in (range(REST, LAST + 1), range(REST - 1, FIRST - 1, -1)):
            for i in order:
                tries = [fit2(data[i][0], data[i][1], to_double(params[i]), "linear")]
                if (i - 1 if i > REST else i + 1) in q2:
                    ref = q2[i - 1 if i > REST else i + 1]
                    tries.append(fit2(data[i][0], data[i][1], fit2(data[i][0], data[i][1], ref, pull=ref)[0], "linear"))
                ref = tries[-1][0] if len(tries) == 1 else q2[i - 1 if i > REST else i + 1]
                q2[i], e2[i] = min(tries, key=lambda r: score2(r[0], r[1], ref))
        for round_ in range(3):
            changed = 0
            for i in frames:
                for j in (i - 1, i + 1, i - 2, i + 2):
                    if j not in q2:
                        continue
                    q, rms = fit2(data[i][0], data[i][1], fit2(data[i][0], data[i][1], q2[j], pull=q2[j])[0], "linear")
                    if score2(q, rms, q2[j]) < score2(q2[i], e2[i], q2[j]) - 0.03:
                        q2[i], e2[i], changed = q, rms, changed + 1
            print(f"two-cubic round {round_}: {changed} frames improved, mean error {np.mean(list(e2.values())):.2f} px")
            if not changed:
                break
        saved["double"] = {str(i): [q2[i].tolist(), e2[i]] for i in frames}
        if cache:
            json.dump(saved, open(cache, "w"))

    # -- 3b. frames whose visible boundary is not matched both ways get a refit with the reverse term
    refined = []
    for i in frames:
        m = boundary_error(q2[i], data[i][3], data[i][1])
        if m is not None and (m[0] > 1.2 or m[1] > 2.6):
            q = refine2(data[i][0], data[i][1], data[i][3], q2[i])
            m2 = boundary_error(q, data[i][3], data[i][1])
            if m2 is not None and m2[0] + m2[1] / 2 < m[0] + m[1] / 2:
                q2[i] = q
                refined.append(i)
    # a frame the refit could not mend is tried again from its refitted neighbours' lines
    for i in frames:
        m = boundary_error(q2[i], data[i][3], data[i][1])
        if m is None or (m[0] <= 1.2 and m[1] <= 2.6):
            continue
        for j in (i - 1, i + 1):
            if j in q2 and j in refined:
                q = refine2(data[i][0], data[i][1], data[i][3], q2[j])
                m2 = boundary_error(q, data[i][3], data[i][1])
                if m2 is not None and m2[0] + m2[1] / 2 < m[0] + m[1] / 2:
                    q2[i], m = q, m2
                    refined.append(i)
    print(f"frames refitted against the visible boundary both ways: {sorted(set(refined))}")

    # -- 4. dense tracking: every frame's two long edges moved onto the recording's stroke (see the notes above `track_frame`)
    imgs = {i: cv2.imread(path(i)) for i in frames}
    dense_cache = (cache + ".dense.npz") if cache else None       # the tracking takes a minute: kept next to the fits
    if dense_cache and os.path.exists(dense_cache):
        z = np.load(dense_cache)
        XA, XB, OA, OB = z["XA"], z["XB"], z["OA"].astype(bool), z["OB"].astype(bool)
    else:
        tracked = {}
        for i in frames:
            A0, B0 = initial_edges(q2[i])
            tracked[i] = track_frame(imgs[i], A0, B0)
        XA = np.array([tracked[i][0] for i in frames])
        XB = np.array([tracked[i][1] for i in frames])
        OA = np.array([tracked[i][2] for i in frames])
        OB = np.array([tracked[i][3] for i in frames])
        if dense_cache:
            np.savez(dense_cache, XA=XA, XB=XB, OA=OA, OB=OB)
    print(f"points measured (not filled): edge A {OA.mean():.0%}, edge B {OB.mean():.0%}")
    XA, XB = fill_in_time(XA, OA), fill_in_time(XB, OB)
    # A measurement that jumps away from the same point's neighbours in time (the median of five frames) by more than 2.5 px is a
    # mistake of the measurement (a ring edge taken for the stroke): it is dropped and filled again from the other frames.
    from scipy.ndimage import median_filter
    for X, O in ((XA, OA), (XB, OB)):
        away = np.linalg.norm(X - median_filter(X, size=(5, 1, 1), mode="nearest"), axis=2) > 2.5
        O &= ~away
        print(f"measurements dropped as jumps: {int(away.sum())}")
    XA, XB = fill_in_time(XA, OA), fill_in_time(XB, OB)
    # Smoothing: along each edge (a Gaussian of SPATIAL points, the two ends held) and then in time (Savitzky-Golay, TEMPORAL frames,
    # order 2): the measurement is good to about a third of a pixel per point and frame, which as an acceleration is a lot more than
    # the note's own.
    from scipy.ndimage import gaussian_filter1d
    SPATIAL, TEMPORAL = float(os.environ.get("BM_SPATIAL", "1.5")), int(os.environ.get("BM_TEMPORAL", "7"))

    def smooth_edge(X):
        out = gaussian_filter1d(X, SPATIAL, axis=1, mode="nearest") if SPATIAL > 0 else X.copy()
        w = np.clip(np.arange(X.shape[1]) / 3.0, 0, 1) * np.clip((X.shape[1] - 1 - np.arange(X.shape[1])) / 3.0, 0, 1)   # ends stay put
        return X + (out - X) * w[None, :, None]

    XA, XB = smooth_edge(XA), smooth_edge(XB)
    XA = savgol_filter(XA, TEMPORAL, 2, axis=0)
    XB = savgol_filter(XB, TEMPORAL, 2, axis=0)
    # (coordinates so far are pixel indices, a pixel's centre being its index; the drawing's coordinates put the pixel's corner at
    # its index, so everything written out is moved by half a pixel)
    line = {i: (XA[k], XB[k]) for k, i in enumerate(frames)}

    # -- 4b. the marks (ellipse and bulges) frame by frame, from the tracked outline: where the ring hides them, the frames
    # around fill in; then smoothed over time (Savitzky-Golay, 5 frames)
    state = {"bulges": list(zip(BULGE_F, BULGE_R))}
    ell_raw, bul_raw = {}, {}
    marks_cache = (cache + f".marks.{SPATIAL}.{TEMPORAL}.json") if cache else None
    if marks_cache and os.path.exists(marks_cache):
        saved_marks = json.load(open(marks_cache))
        ell_raw = {int(i): (tuple(v[0]) if v[0] else None) for i, v in saved_marks.items()}
        bul_raw = {int(i): [tuple(b_) if b_ else None for b_ in v[1]] for i, v in saved_marks.items()}
    else:
        for i in [REST] + [j for j in frames if j != REST]:
            ell, bul = track_marks(imgs[i], *line[i], state)
            ell_raw[i], bul_raw[i] = ell, bul
            state = {"bulges": [b_ if b_ is not None else state["bulges"][e] for e, b_ in enumerate(bul)]}
        if marks_cache:
            json.dump({str(i): [list(ell_raw[i]) if ell_raw[i] else None, [list(b_) if b_ else None for b_ in bul_raw[i]]] for i in frames}, open(marks_cache, "w"))
    print(f"marks measured: ellipse in {sum(v is not None for v in ell_raw.values())} of {len(frames)} frames, bulges "
          + ", ".join(f"{sum(bul_raw[i][e] is not None for i in frames)}" for e in range(4)))

    def series(values, width):
        """Frames x width array from a dict of tuples/None: gaps filled linearly in time, then smoothed."""
        ok = [i for i in frames if values[i] is not None]
        arr = np.array([np.interp(frames, ok, [values[j][c] for j in ok]) for c in range(width)]).T
        return savgol_filter(arr, 5, 2, axis=0) if len(frames) > 5 else arr

    ell_phi = {i: (ell_raw[i] if ell_raw[i] is None else (ell_raw[i][0], ell_raw[i][1], ell_raw[i][2])) for i in frames}
    ok_e = [i for i in frames if ell_phi[i] is not None]
    phis = np.unwrap([ell_phi[i][2] * 2 for i in ok_e]) / 2            # an ellipse repeats after half a turn
    for i, ph in zip(ok_e, phis):
        ell_phi[i] = (ell_phi[i][0], ell_phi[i][1], ph)
    ell_series = series(ell_phi, 3)
    bul_series = [series({i: bul_raw[i][e] for i in frames}, 2) for e in range(4)]
    marks_of = {i: (ell_series[k], [bul_series[e][k] for e in range(4)]) for k, i in enumerate(frames)}

    # -- 5. acceleration of every outline point over the written frames: the largest against its own median
    out_frames = list(range(OUT_FROM, OUT_TO + 1))
    P = np.array([np.vstack(line[i]) for i in out_frames])
    acc = np.linalg.norm(P[:-2] - 2 * P[1:-1] + P[2:], axis=2)          # frames x points
    med = np.median(acc, axis=0)
    ratio = acc.max(axis=0) / np.maximum(med, 0.05)
    worst_points = np.argsort(-ratio)[:6]
    print("acceleration, largest per point against its median (point index: ratio, frame of the maximum, median px/frame^2):")
    print("; ".join(f"{k}: {ratio[k]:.1f}x at frame {out_frames[1 + int(np.argmax(acc[:, k]))]}, median {med[k]:.2f}" for k in worst_points))
    print(f"outline points over 3x their median: {int((ratio > 3).sum())} of {len(ratio)}; worst frame by the sum: {out_frames[1 + int(np.argmax(acc.sum(axis=1)))]}")

    # -- 6. the parts of the frame, measured at rest
    rest_A, rest_B = line[REST]
    c0, angle0 = poly_middle(rest_A, rest_B)
    green, _ = masks(path(REST))
    window = np.zeros(green.shape, np.uint8)
    cv2.fillPoly(window, [np.round(poly_polygon(rest_A, rest_B)).astype(np.int32)], 1)
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
    rel = centre_at_rest - c0
    along, across = rel @ np.array([np.cos(angle0), np.sin(angle0)]), rel @ np.array([-np.sin(angle0), np.cos(angle0)])
    turn = phi_at_rest - angle0
    print(f"ellipse at rest: centre ({ex:.1f}, {ey:.1f}), axes {axes[0] / 2:.1f} x {axes[1] / 2:.1f} (used {ELLIPSE}), offset along {along:.1f} across {across:.1f}")

    outlines, marks, times = [], [], []
    for i in out_frames:
        A, B = line[i][0] + 0.5, line[i][1] + 0.5
        es = poly_marks_edges(A, B)
        (ex_, ey_, phi_), bul = marks_of[i]
        marks.append("".join(poly_bulge(es[e], float(bul[e][0]), float(bul[e][1]), BULGE_H[e]) for e in range(4)) + ellipse_path(np.array([ex_ + 0.5, ey_ + 0.5]), float(phi_)))
        outlines.append(poly_outline(A, B))
        times.append(int(round((i - NOTE_START) * 1000 / FPS)))

    try:
        old = open(out_path, encoding="utf8").read()
        ring_rows = json.loads(re.search(r"RING_FRAMES[^=]*= (\[\[.*?\]\]);", old).group(1))
    except (OSError, AttributeError):
        sys.exit("the existing output file with RING_FRAMES is needed (the ring's centre and radius are not measured here)")
    ring_rows = [row[:4] for row in ring_rows]
    row_frame = lambda row: min(LAST, max(FIRST, int(round(NOTE_START + row[0] * FPS / 1000))))

    # -- 7. the ring on every row: centre, outer radius and thickness measured on the recording (rays clear of the note), the
    # corrections to the given centre and radius and the thickness smoothed over time (Savitzky-Golay, 7 rows); a row with too few
    # clear rays takes the neighbours' corrections and thickness
    meas = [None] * len(ring_rows)
    guess = np.full(len(ring_rows), 40.0)
    for round_ in range(2):          # the first round with a wide band finds the rows that are clear; the second uses their thickness
        for k, row in enumerate(ring_rows):
            i = row_frame(row)
            meas[k] = ring_measure(imgs[i], row, poly_polygon(*line[i]), float(guess[k]))
        have = [k for k, m in enumerate(meas) if m is not None]
        guess = np.interp(range(len(ring_rows)), have, [meas[k][3] for k in have])
    good = [k for k, m in enumerate(meas) if m is not None]
    quantity = lambda f: np.interp(range(len(ring_rows)), good, [f(meas[k], ring_rows[k]) for k in good])
    cx_m, cy_m, R_m, thick_raw = (quantity(lambda m, r, c=c: m[c]) for c in range(4))
    cx_s, cy_s, R_s, thick = (savgol_filter(v_, 7, 2) for v_ in (cx_m, cy_m, R_m, thick_raw))
    print("ring per row: t, frame, clear rays, centre x, y (pixel indices), outer radius, measured and smoothed thickness")
    for k, row in enumerate(ring_rows):
        print(f"  t={row[0]:5.0f} frame {row_frame(row):3d}  rays {(meas[k][4] if meas[k] else 0):3d}  ({cx_s[k]:.1f}, {cy_s[k]:.1f})  R {R_s[k]:.1f} (was {row[3]:.1f})  thickness {('%.1f' % meas[k][3]) if meas[k] else '  - '} -> {thick[k]:.1f}")
    # (the +0.5: pixel indices to the drawing's coordinates, as for the note)
    ring_rows = [[row[0], round(float(cx_s[k]) + 0.5, 1), round(float(cy_s[k]) + 0.5, 1), round(float(R_s[k]), 1), round(float(thick[k]), 1)] for k, row in enumerate(ring_rows)]

    # -- 8. the ring's split, from the note's own outline only (never from the recording's visibility)
    paths, kinds = [], []
    for k, row in enumerate(ring_rows):
        i = row_frame(row)
        r = max(1.0, row[3] - row[4] / 2)
        behind, front = ring_split_own(poly_polygon(*line[i]) + 0.5, row[1], row[2], r, thick=row[4])
        if len(front) > 2:
            print(f"ring row t={row[0]:.0f} (frame {i}): {len(front)} runs in front of the note, the two longest drawn")
        paths.append(ring_paths(row, row[4], behind, front))
        kinds.append((len(behind), len(front)))
    print(f"ring frames: {len(ring_rows)}; with a run behind the note: {sum(1 for b_, f_ in kinds if b_)}; with a run in front: {sum(1 for b_, f_ in kinds if f_)}")

    with open(out_path, "w", encoding="utf8") as f:
        f.write("// Generated by scripts/gen-budget-motion.py from the frame-by-frame measurement of the first application's recording of the\n")
        f.write("// Budgets empty state (30 fps, 720 px wide). Times are ms from the note's first frame; coordinates are the recording's pixels.\n")
        f.write("// The note: a stroke of NOTE_STROKE along a closed centre line (two long edges of 41 tracked points each, and two straight\n")
        f.write("// short edges), and what sits on its frame (four half-disc bulges attached to the inner side of the edges, the ellipse), all\n")
        f.write("// built from the frame's own edges. Every string of one list has the same command structure, so two of them blend by number.\n")
        f.write(f"export const NOTE_STROKE = {STROKE:g};\n")
        f.write(f"export const NOTE_TIMES: ReadonlyArray<number> = {json.dumps(times)};\n")
        f.write(f"export const NOTE_OUTLINE: ReadonlyArray<string> = {json.dumps(outlines)};\n")
        f.write(f"export const NOTE_MARKS: ReadonlyArray<string> = {json.dumps(marks)};\n")
        f.write("// RING: [t, centre x, centre y, outer radius, thickness]\n")
        f.write(f"export const RING_FRAMES: ReadonlyArray<ReadonlyArray<number>> = {json.dumps(ring_rows)};\n")
        f.write("// The ring split per frame (ring_split_own in the generator, from the note's own outline): the part behind the note and the part in\n// front of it, drawn on the centre radius (outer radius minus half the thickness): the back one two arcs, the front one four arcs of at\n// most 180 degrees with the same commands in every frame, one entry per RING_FRAMES row.\n")
        f.write(f"export const RING_BACK: ReadonlyArray<string> = {json.dumps([p_[0] for p_ in paths])};\n")
        f.write(f"export const RING_FRONT: ReadonlyArray<string> = {json.dumps([p_[1] for p_ in paths])};\n")
    print(f"wrote {out_path}: {len(times)} frames")


if __name__ == "__main__":
    main()
