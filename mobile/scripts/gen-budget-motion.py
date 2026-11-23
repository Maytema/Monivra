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
OUT_FROM, OUT_TO = 20, 108     # frames written out (every one: the note moves fast)
REST = 110                     # a frame at rest, used to measure the bulges and the ellipse
STROKE = 23.0
HW = STROKE / 2
TOP = 300                      # the note lives below this row of the recording
BULGE_RADIUS = 25.0            # measured on the rest frame: 23-27 for the four bulges
# Where the bulge sits on each edge (long edge A, short edge P1-P2, long edge B, short edge P3-P0) as a fraction of the
# edge's length, measured on the rest frame; the shape is symmetric by a half turn, so the pairs agree.
BULGE_F = (0.93, 0.79, 0.93, 0.79)
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


RING_STROKE = 25.0
SPIKE = 2.5                    # times the median acceleration of the outline numbers: above it a frame is replaced
MIN_HIDDEN = 8                 # degrees: a shorter hidden stretch is not a split


def ring_labels(row, q, yellow):
    """For each whole degree of the ring's middle circle: 0 = outside the note, 1 = inside the note's reach and hidden by it
    (the recording shows no ring paint there: the ring is behind the note), 2 = visible with its middle on the note (ring in front).
    Inside: the ring's band touches the note's silhouette (its filled outline and half the stroke)."""
    r = max(1.0, row[3] - RING_STROKE / 2)
    ang = np.radians(np.arange(360))
    centre = np.stack([row[1] + r * np.cos(ang), row[2] + r * np.sin(ang)], 1)
    poly = silhouette_parts(q).astype(np.float32)
    reach = HW + RING_STROKE / 2
    depth = np.array([cv2.pointPolygonTest(poly.reshape(-1, 1, 2), (float(x), float(y)), True) for x, y in centre])
    inside = depth > -reach
    # The ring's middle is on the note itself (its outline or its inside) only from -HW outwards; between that and the reach
    # only the edge of the ring's band touches the note, and a ring behind the note shows what the recording shows there.
    on_note = depth > -HW
    labels = np.zeros(360, int)
    for k in range(360):
        if not inside[k]:
            continue
        seen = 0
        for off in range(-6, 7):
            x, y = row[1] + (r + off) * np.cos(ang[k]), row[2] + (r + off) * np.sin(ang[k])
            xi, yi = int(round(x)), int(round(y))
            if 0 <= yi < yellow.shape[0] and 0 <= xi < yellow.shape[1] and yellow[yi, xi]:
                seen += 1
        if seen > 6:
            labels[k] = 2 if on_note[k] else 0       # visible with its middle off the note: nothing to put in front
        else:
            labels[k] = 1
    # A hidden stretch of a few degrees is the ring crossing the note's edge, not the ring going behind it: the arcs' ends
    # overlap by a couple of degrees, so a split that short would leave a notch in the ring.
    n = len(labels)
    k = 0
    while k < n:
        if labels[k] == 1 and labels[k - 1] != 1:
            end = k
            while labels[(end + 1) % n] == 1 and end - k < n:
                end += 1
            if end - k + 1 < MIN_HIDDEN:
                for j in range(k, end + 1):
                    labels[j % n] = 2
            k = end + 1
        else:
            k += 1
    return labels


def ring_split(labels):
    """The back arc as (start, end, range of the start, range of the end, clean) in unwrapped degrees, or None when no
    angle is hidden. The back arc is the smallest arc holding every hidden angle; each end sits in the middle of the free
    run (label 0) next to it, never on the note. `clean` is False when an end has no free run next to it, or when an
    angle that is visible inside the note lies within the arc."""
    hidden = np.flatnonzero(labels == 1)
    if len(hidden) == 0:
        return None
    gaps = np.diff(np.concatenate([hidden, [hidden[0] + 360]]))
    k = int(np.argmax(gaps))                       # the longest stretch without a hidden angle is left out of the arc
    first = int(hidden[(k + 1) % len(hidden)])
    last = int(hidden[k])
    if last < first:
        last += 360
    free = lambda start, step: next((n for n in range(360) if labels[(start + step * (n + 1)) % 360] != 0), 359)
    n_lo, n_hi = free(first, -1), free(last, +1)
    g0 = first - (n_lo + 1) / 2 if n_lo else first - 0.5
    g1 = last + (n_hi + 1) / 2 if n_hi else last + 0.5
    r0 = (first - n_lo, first - 1) if n_lo else (g0, g0)
    r1 = (last + 1, last + n_hi) if n_hi else (g1, g1)
    visible_inside = any(labels[a % 360] == 2 for a in range(first, last + 1))
    return g0, g1, r0, r1, bool(n_lo and n_hi and not visible_inside), bool(n_lo), bool(n_hi)


def smooth_splits(raw):
    """Moving median over five frames of the split angles; a smoothed angle is used only while it stays inside its own
    frame's free run, else the middle of the run is kept."""
    out = []
    for i, item in enumerate(raw):
        if item is None:
            out.append(None)
            continue
        window = [raw[j] for j in range(max(0, i - 2), min(len(raw), i + 3)) if raw[j] is not None]
        near = lambda a, base: base + ((a - base + 180) % 360) - 180      # the neighbour's angle next to this frame's
        g0 = float(np.median([near(w[0], item[0]) for w in window]))
        g1 = float(np.median([near(w[1], item[1]) for w in window]))
        g1 += 360 if g1 < g0 else 0
        out.append((g0 if item[2][0] <= g0 <= item[2][1] else item[0], g1 if item[3][0] <= g1 <= item[3][1] else item[1], item[5], item[6]))
    return out


def ring_paths(row, split):
    """The back and the front arc of one ring frame, each as two arcs of at most 180 degrees (same commands in every frame)."""
    r = max(1.0, row[3] - RING_STROKE / 2)
    at = lambda deg: f"{row[1] + r * np.cos(np.radians(deg)):.1f} {row[2] + r * np.sin(np.radians(deg)):.1f}"
    two = lambda a, b: f"M{at(a)}A{r:.1f} {r:.1f} 0 0 1 {at((a + b) / 2)}A{r:.1f} {r:.1f} 0 0 1 {at(b)}"
    if split is None:
        return two(270, 270), two(270, 630)
    g0, g1, lo_free, hi_free = split
    # The front arc overlaps the back arc by two degrees where the ends sit in a free run (no seam); an end that sits on the
    # note itself meets the other arc exactly, so that no ring is painted over the note's hidden part.
    front_from, front_to = g1 - (2 if hi_free else 0), g0 + 360 + (2 if lo_free else 0)
    if front_to - front_from > 360:
        front_to = front_from + 360
    return two(g0, g1), two(front_from, front_to)


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

    # -- 4. repair the bad frames (visible-boundary error over 2.5 px), smooth in time. The note travels and turns a lot
    # while it bends, so a frame is split into its pose (middle and turn) and its shape (the twelve points in the note's
    # own axes); both are interpolated and smoothed on their own, which keeps the shape of a repaired frame instead of
    # blending two shapes at different angles.
    bad = [i for i in frames if e2[i] > 2.5]
    print(f"repaired frames (visible-boundary error over 2.5 px): {bad}")
    good = [i for i in frames if i not in bad]
    poses = {i: pose2(q2[i]) for i in frames}
    angles = np.unwrap([poses[i][1] for i in frames])
    table = np.array([np.concatenate([poses[i][0], [angles[k]], poses[i][2].ravel(), poses[i][3]]) for k, i in enumerate(frames)])
    for k in range(table.shape[1]):
        table[:, k] = np.interp(frames, good, [table[frames.index(i), k] for i in good])
    unsmoothed = {i: unpose2(table[k][:2], table[k][2], table[k][3:27].reshape(12, 2), np.clip(table[k][27:29], 0.3, 3.0)) for k, i in enumerate(frames)}
    table = savgol_filter(table, 5, 2, axis=0)
    smooth = {i: unpose2(table[k][:2], table[k][2], table[k][3:27].reshape(12, 2), np.clip(table[k][27:29], 0.3, 3.0)) for k, i in enumerate(frames)}

    # -- 5. acceptance: on the visible boundary of the reference silhouette, our rendered outer boundary
    print("frame  fit-rms  mean-dist  p95-dist   (px of the recording, visible boundary only, smoothed lines)")
    worst, fallback = [], []
    for i in range(OUT_FROM, OUT_TO + 1):
        m = boundary_error(smooth[i], data[i][3], data[i][1])
        if m is not None and (m[0] > 1.5 or m[1] > 3):
            # Smoothing moved this frame off the visible boundary (the note turns fast there): the frame's own fit is used when
            # it is closer (its error is the fit's, the price is a little jitter between neighbours).
            alt = boundary_error(unsmoothed[i], data[i][3], data[i][1])
            if alt is not None and alt[0] + alt[1] / 2 < m[0] + m[1] / 2:
                smooth[i], m = unsmoothed[i], alt
                fallback.append(i)
        if m is None:
            print(f"{i:5d}  {e2[i]:7.2f}  (no visible boundary)")
            continue
        worst.append((i, *m))
        print(f"{i:5d}  {e2[i]:7.2f}  {m[0]:9.2f}  {m[1]:8.2f}{'  ***' if m[0] > 1.5 or m[1] > 3 else ''}")
    print(f"frames that use their own fit instead of the smoothed one: {fallback}")
    print(f"frames over the limits (mean 1.5, p95 3): {[w[0] for w in worst if w[1] > 1.5 or w[2] > 3]}")

    # -- 5b. jerks: the recording is smooth (the note's centre accelerates by about 0.4 px per frame squared everywhere), so a
    # frame whose 28 outline numbers accelerate by more than SPIKE times the median is a fit artefact. It is replaced by the
    # mean of its neighbours (pose and shape separately, as in step 4), when that keeps the visible-boundary limits.
    numbers = lambda q: np.array([float(v) for v in re.findall(r"-?\d+\.?\d*", outline_path(q))])
    def acceleration():
        X = np.array([numbers(smooth[i]) for i in range(OUT_FROM, OUT_TO + 1)])
        return np.linalg.norm(X[:-2] - 2 * X[1:-1] + X[2:], axis=1), np.linalg.norm(X[1:] - X[:-1], axis=1)
    def report(title):
        acc, speed = acceleration()
        med = float(np.median(acc))
        top = sorted(range(len(acc)), key=lambda k: -acc[k])[:8]
        print(f"{title}: median acceleration {med:.1f}; largest (frame: acceleration, ratio, speed in/out): " + "; ".join(f"{OUT_FROM + k + 1}: {acc[k]:.0f}, {acc[k] / med:.1f}x, {speed[k]:.0f}/{speed[k + 1]:.0f}" for k in top))
        return acc, med
    acc, med = report("outline acceleration before the repair")
    replaced = []
    for _ in range(3):
        acc, med = acceleration()[0], float(np.median(acceleration()[0]))
        spikes = [OUT_FROM + k + 1 for k in range(len(acc)) if acc[k] > SPIKE * med]
        if not spikes:
            break
        for i in sorted(spikes, key=lambda f: -acc[f - OUT_FROM - 1]):
            a, b = pose2(smooth[i - 1]), pose2(smooth[i + 1])
            ang = a[1] + ((b[1] - a[1] + np.pi) % (2 * np.pi) - np.pi) / 2
            mid = (a[0] + b[0]) / 2, ang, (a[2] + b[2]) / 2, (a[3] + b[3]) / 2
            own = pose2(smooth[i])
            dang = (own[1] - ang + np.pi) % (2 * np.pi) - np.pi
            best = None
            for w in (1.0, 0.85, 0.7, 0.55, 0.4, 0.25):   # share of the way from the frame's own pose to the neighbours' mean
                cand = unpose2(own[0] + w * (mid[0] - own[0]), own[1] - w * dang, own[2] + w * (mid[2] - own[2]), own[3] + w * (mid[3] - own[3]))
                m = boundary_error(cand, data[i][3], data[i][1])
                if m is not None and m[0] <= 1.5 and m[1] <= 3:
                    best = (w, cand)
                    break
            if best:
                smooth[i] = best[1]
                replaced.append(i)
                print(f"  frame {i}: pulled {best[0]:.2f} of the way to its neighbours")
            else:
                print(f"  frame {i}: no pull keeps the boundary limits, left as fitted")
    print(f"frames replaced by the mean of their neighbours: {sorted(set(replaced))}")
    acc, med = report("outline acceleration after the repair")
    still = [OUT_FROM + k + 1 for k in range(len(acc)) if acc[k] > SPIKE * med]
    print(f"frames still above {SPIKE}x the median: {still}")

    # -- 6. the parts of the frame, measured at rest
    rest = smooth[REST]
    c0, angle0 = middle(rest)
    green, _ = masks(path(REST))
    window = np.zeros(green.shape, np.uint8)
    cv2.fillPoly(window, [np.round(silhouette_parts(rest)).astype(np.int32)], 1)
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
        q = smooth[i]
        es = q_edges(q)
        c, angle = middle(q)
        centre = c + along * np.array([np.cos(angle), np.sin(angle)]) + across * np.array([-np.sin(angle), np.cos(angle)])
        marks.append("".join(bulge(es[e], BULGE_F[e], BULGE_RADIUS) for e in range(4)) + ellipse_path(centre, angle + turn))
        outlines.append(outline_path(q))
        times.append(int(round((i - NOTE_START) * 1000 / FPS)))

    try:
        old = open(out_path, encoding="utf8").read()
        ring = re.search(r"(// RING:.*?\nexport const RING_FRAMES[^\n]*)", old, re.S).group(1)
        ring_rows = json.loads(re.search(r"RING_FRAMES[^=]*= (\[\[.*?\]\]);", old).group(1))
    except (OSError, AttributeError):
        sys.exit("the existing output file with RING_FRAMES is needed (the ring is not measured here)")
    # -- 7. where the ring goes behind the note, frame by frame, from what the recording itself shows
    raw = []
    for row in ring_rows:
        i = min(OUT_TO, max(OUT_FROM, int(round(NOTE_START + row[0] * FPS / 1000))))
        _, yellow = masks(path(i))
        labels = ring_labels(row, smooth[i], yellow)
        split = ring_split(labels)
        if split is not None and not split[4]:
            runs = [(int(k), len(list(grp))) for k, grp in itertools.groupby(labels)]
            print(f"ring row t={row[0]:.0f} (frame {i}): no clean split (an end touches the note, or the ring is visible inside the back arc); runs of labels from 0 deg: {runs}")
        raw.append(split)
    splits = smooth_splits(raw)
    paths = [ring_paths(row, sp) for row, sp in zip(ring_rows, splits)]
    print(f"ring frames: {len(ring_rows)}, with a part behind the note: {sum(1 for sp in splits if sp)}")

    with open(out_path, "w", encoding="utf8") as f:
        f.write("// Generated by scripts/gen-budget-motion.py from the frame-by-frame measurement of the first application's recording of the\n")
        f.write("// Budgets empty state (30 fps, 720 px wide). Times are ms from the note's first frame; coordinates are the recording's pixels.\n")
        f.write("// The note: a stroke of NOTE_STROKE along a closed centre line (two long edges of two cubics each, and two straight short\n")
        f.write("// edges), and what sits on its frame (four half-disc bulges attached to the inner side of the edges, the ellipse), all built\n")
        f.write("// from the frame's own edges. Every string of one list has the same command structure, so two of them blend by number.\n")
        f.write(f"export const NOTE_STROKE = {STROKE:g};\n")
        f.write(f"export const NOTE_TIMES: ReadonlyArray<number> = {json.dumps(times)};\n")
        f.write(f"export const NOTE_OUTLINE: ReadonlyArray<string> = {json.dumps(outlines)};\n")
        f.write(f"export const NOTE_MARKS: ReadonlyArray<string> = {json.dumps(marks)};\n")
        f.write(ring + "\n")
        f.write("// The ring split per frame (ring_split in the generator): the part behind the note (hidden by it in the recording) and the\n// part in front of it, each two arcs of at most 180 degrees with the same commands in every frame, one entry per RING_FRAMES row.\n")
        f.write(f"export const RING_BACK: ReadonlyArray<string> = {json.dumps([p[0] for p in paths])};\n")
        f.write(f"export const RING_FRONT: ReadonlyArray<string> = {json.dumps([p[1] for p in paths])};\n")
    print(f"wrote {out_path}: {len(times)} frames")


if __name__ == "__main__":
    main()
