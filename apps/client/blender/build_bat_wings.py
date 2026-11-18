"""Builds `bat-wings`: a pair of chibi bat wings that peek out from behind the pet's back.

Each wing is a puffy membrane: a rounded polygon (arched arm up to the wrist, round outer edge)
with three round scallops bitten out of its lower edge between little finger points, clipped to
the outside of the pet's silhouette, given a round rim and a gently domed front and meshed by
surface nets. A lighter panel follows the outline a little inside it, scallops and all, and a
little claw curls up and out at the wrist.

    blender blender/cosmetics.blend --background --python blender/build_bat_wings.py -- [--save] [--export]

The app paints cosmetics on top of the pet like a sticker, so the wings exist only outside its 2D
silhouette: the roots tuck a little under the body bell's edge, and they keep a clear gap to the
head, which moves. Modelled for the right side in pet coordinates (Three.js), mirrored to the left.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, catmull, outward, resample, sdf_decal, smooth_union, surface_nets, sweep  # noqa: E402

# The pet's body profile (radius, height) from jellyGeometry.ts. The app draws it as a centripetal
# Catmull-Rom curve sampled at 96 points, so the silhouette here does the same.
BODY_PROFILE = [
    (0.0, -1.05), (0.5, -1.05), (0.7, -1.025), (0.81, -0.95), (0.86, -0.79), (0.86, -0.55),
    (0.83, -0.33), (0.75, -0.14), (0.6, 0.02), (0.4, 0.11), (0.18, 0.15), (0.0, 0.16),
]
BODY_SAMPLES = 96
# How far the roots reach under the body's edge, and the gap kept to the head (bob, tilt, ink edge).
TUCK = 0.015
HEAD_GAP = 0.08
# How soft the clip against the silhouette rounds the corners where wing and body meet.
CLIP_SOFT = 0.03

# The membrane: a convex polygon, clockwise from the root over the arched arm to the wrist, the
# outer tip and the finger points back into the body, rounded by `ROUND`. Root, arm, wrist and tip
# lie on a smooth curve (`ARCH` samples), so the top and the outer edge run as one round arch.
ROOT_TOP, ARM, WRIST = (0.49, 0.05), [(0.64, 0.35), (0.83, 0.54)], (0.99, 0.6)
TIP, POINTS, ROOT_LOW = [(1.19, 0.55), (1.33, 0.35)], [(1.17, 0.02), (0.9, -0.07)], (0.62, -0.14)
ROUND = 0.07
ARCH = 40
# Three scallops between the points (the last one runs into the body): how deep each bites in.
BITES = [0.085, 0.075, 0.06]
BITE_END = (0.68, -0.12)
# How round the little finger points stay.
POINT_SOFT = 0.045

# The cushion: centre plane, round rim (height, width), dome on the front (height, width), back rim.
WING_Z = 0.05
RIM = (0.03, 0.034)
PUFF = (0.018, 0.09)
BACK = 0.022
# The lighter panel: a felt patch on the membrane's front, its outline `inset` inside the edge,
# scallops and all, found by rays from `centre` (which sees all of it). `lift` and `half` as in
# `sdf_decal`.
PANEL = {"inset": 0.06, "centre": (0.95, 0.3), "points": 80, "lift": 0.003, "half": 0.009}
# The patch's profile (scale of the outline, height in halves): the wall dips under the membrane, a
# narrow round edge, then flat.
PANEL_PROFILE = [(1.0, -1.0), (1.0, 0.0), (0.98, 0.7), (0.95, 1.0), (0.7, 1.0), (0.35, 1.0)]
# The claw: a stubby hook from inside the wrist up and out, (x, y) offsets from the wrist with
# (across, deep) half sections, tapering to a round point. Its foot lies inside the membrane.
CLAW_Z = WING_Z + 0.01
CLAW = [(0.0, 0.0), (0.0, 0.065), (0.022, 0.105), (0.055, 0.12)]
CLAW_SECTIONS = [(0.046, 0.03), (0.04, 0.027), (0.028, 0.021), (0.016, 0.015)]

# Surface nets: the box round one wing and its grid step; Decimate thins the membrane to its budget.
GRID = {"low": (0.3, -0.3, WING_Z - 0.07), "high": (1.5, 0.9, WING_Z + 0.1), "step": 0.008}
WING_BUDGET = 1300

# name -> (hex, glow). Deeper than they show: the app lightens every colour towards pastel.
SWATCH = {
    "Fledermauslila": ("#2e1f4a", 0.15),
    "Fledermaushaut": ("#5a3f8e", 0.25),
    "Fledermausknochen": ("#6a4c9e", 0.3),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


# ---------------------------------------------------------------------------------------------
# The pet's silhouette in 2D (camera along -z): head circle and body bell.


def centripetal(points, count):
    """`count` + 1 points on Three.js's centripetal CatmullRomCurve3 through `points`, like getPoints."""
    pts = np.asarray(points, float)
    n, out = len(pts), []
    for i in range(count + 1):
        t = (n - 1) * i / count
        k = min(int(t), n - 2)
        w = t - k
        p0 = pts[k - 1] if k > 0 else 2 * pts[0] - pts[1]
        p1, p2 = pts[k], pts[k + 1]
        p3 = pts[k + 2] if k + 2 < n else 2 * pts[-1] - pts[-2]
        dt0, dt1, dt2 = (np.sum((b - a) ** 2) ** 0.25 for a, b in ((p0, p1), (p1, p2), (p2, p3)))
        dt1 = dt1 if dt1 >= 1e-4 else 1.0
        dt0, dt2 = (dt if dt >= 1e-4 else dt1 for dt in (dt0, dt2))
        t1 = ((p1 - p0) / dt0 - (p2 - p0) / (dt0 + dt1) + (p2 - p1) / dt1) * dt1
        t2 = ((p2 - p1) / dt1 - (p3 - p1) / (dt1 + dt2) + (p3 - p2) / dt2) * dt1
        out.append(p1 + t1 * w + (-3 * p1 + 3 * p2 - 2 * t1 - t2) * w * w + (2 * p1 - 2 * p2 + t1 + t2) * w**3)
    return np.array(out)


# Only the upper bell matters next to the wings; there the profile rises steadily.
BODY_LINE = centripetal(BODY_PROFILE, BODY_SAMPLES)
BODY_LINE = BODY_LINE[BODY_LINE[:, 1] > -0.7]


def body_sd(x, y):
    """Signed 2D distance to the body bell (negative inside)."""
    x = np.abs(x)
    dist = np.full(x.shape, np.inf)
    for a, b in zip(BODY_LINE, BODY_LINE[1:]):
        e = b - a
        t = np.clip(((x - a[0]) * e[0] + (y - a[1]) * e[1]) / (e @ e), 0, 1)
        dist = np.minimum(dist, np.hypot(x - a[0] - t * e[0], y - a[1] - t * e[1]))
    inside = (y < BODY_LINE[-1, 1]) & (x < np.interp(y, BODY_LINE[:, 1], BODY_LINE[:, 0]))
    return np.where(inside, -dist, dist)


def smax(a, b, k):
    return -smooth_union(-a, -b, k)


# ---------------------------------------------------------------------------------------------
# The membrane's outline in 2D.


def polygon_sd(x, y, corners):
    """Signed 2D distance to a closed polygon (negative inside)."""
    v = np.asarray(corners, float)
    dist = (x - v[0, 0]) ** 2 + (y - v[0, 1]) ** 2
    sign = np.ones_like(x)
    for i in range(len(v)):
        a, e = v[i], v[i - 1] - v[i]
        wx, wy = x - a[0], y - a[1]
        t = np.clip((wx * e[0] + wy * e[1]) / (e @ e), 0, 1)
        dist = np.minimum(dist, (wx - e[0] * t) ** 2 + (wy - e[1] * t) ** 2)
        above, below, left = y >= a[1], y < v[i - 1, 1], e[0] * wy > e[1] * wx
        sign = np.where((above & below & left) | (~above & ~below & ~left), -sign, sign)
    return sign * np.sqrt(dist)


def bite(a, b, depth):
    """The circle (x, y, r) through `a` and `b` that bites `depth` into the wing above the chord."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    chord = np.linalg.norm(b - a)
    radius = (chord * chord / 4 + depth * depth) / (2 * depth)
    # The polygon runs clockwise, so outside lies to the left of a -> b.
    out = np.array([-(b - a)[1], (b - a)[0]]) / chord
    centre = (a + b) / 2 + out * (radius - depth)
    return centre[0], centre[1], radius


CORNERS = [*(tuple(p[:2]) for p in catmull([Vector((*c, 0)) for c in (ROOT_TOP, *ARM, WRIST, *TIP)], ARCH)), *POINTS, ROOT_LOW]
SCALLOPS = [bite(a, b, depth) for (a, b), depth in zip(zip([TIP[-1], *POINTS], [*POINTS, BITE_END]), BITES)]


def membrane_sd(x, y):
    """Signed 2D distance to one wing's outline: the rounded polygon with the scallops bitten out."""
    bites = np.min([np.hypot(x - cx, y - cy) - r for cx, cy, r in SCALLOPS], axis=0)
    return smax(polygon_sd(x, y, CORNERS) - ROUND, -bites, POINT_SOFT)


def covered_sd(x, y):
    """Signed 2D distance to what the pet covers: the body less the tuck, the head plus the gap."""
    return np.minimum(body_sd(x, y) + TUCK, np.hypot(x, y - HEAD_Y) - HEAD_R - HEAD_GAP)


def outline_sd(points):
    """Signed 2D distance to one wing's outline, clipped to the outside of the pet's silhouette."""
    x, y = points[:, 0], points[:, 1]
    return smax(membrane_sd(x, y), -covered_sd(x, y), CLIP_SOFT)


# ---------------------------------------------------------------------------------------------
# The cushion and its panel.


def rise(s, height, width):
    """A quarter ellipse over `width`: 0 at the edge, `height` from `width` inwards."""
    u = np.clip(s / width, 0, 1)
    return height * np.sqrt(1 - (1 - u) ** 2)


def ease(s, width):
    u = np.clip(s / width, 0, 1)
    return u * u * (3 - 2 * u)


def front(s):
    """Height of the wing's front above its centre plane, `s` inside the edge."""
    return rise(s, *RIM) + PUFF[0] * ease(s, PUFF[1])


def wing_sdf(points):
    d = outline_sd(points)
    s = np.maximum(-d, 0)
    z = points[:, 2] - WING_Z
    return np.maximum(d, np.maximum(z - front(s), -z - rise(s, BACK, RIM[1])))


def wing_front(points):
    """Below the membrane's front as a height field: the panel is laid onto it."""
    return points[:, 2] - WING_Z - front(np.maximum(-outline_sd(points), 0))


def ray_outline(sd2, centre, count, reach=1.0, samples=300, rays=720):
    """`count` evenly spaced points round `centre` where rays from it leave the region `sd2` < 0.
    Every ray must leave it once: `centre` sees all of the outline."""
    angles = np.linspace(0, 2 * math.pi, rays, endpoint=False)
    ways = np.stack([np.cos(angles), np.sin(angles), np.zeros(rays)], 1)

    def outside(t):
        points = np.array([*centre, 0.0]) + t[..., None] * (ways if t.ndim == 1 else ways[:, None])
        return sd2(points.reshape(-1, 3)).reshape(t.shape) >= 0

    steps = np.linspace(0, reach, samples)
    found = outside(np.tile(steps, (rays, 1)))
    assert not found[:, 0].any() and (np.diff(found.astype(int), axis=1) != 0).sum(1).max() == 1, "centre must see the whole outline"
    first = np.argmax(found, axis=1)
    near, far = steps[first - 1], steps[first]
    for _ in range(24):
        mid = (near + far) / 2
        out = outside(mid)
        far, near = np.where(out, mid, far), np.where(out, near, mid)
    return resample([(t * math.cos(a), t * math.sin(a)) for t, a in zip(far, angles)], count, 1)


def panel_mesh():
    centre = PANEL["centre"]
    outline = ray_outline(lambda p: outline_sd(p) + PANEL["inset"], centre, PANEL["points"])
    return sdf_decal(wing_front, (*centre, WING_Z), (0, 0, 1), outline, PANEL["lift"], PANEL["half"], PANEL_PROFILE)


def claw_mesh():
    wx, wy = WRIST
    points = catmull([Vector((wx + dx, wy + dy, CLAW_Z)) for dx, dy in CLAW], 8)
    sections = catmull([Vector((h, w, 0)) for h, w in CLAW_SECTIONS], 8)
    return outward(sweep([(p, s.x, s.y) for p, s in zip(points, sections)], ring_size=10, cap_rings=3))


# ---------------------------------------------------------------------------------------------


def add_wing_mesh(collection, name, mesh_data, material, budget=None):
    """One wing's mesh, thinned to `budget` vertices, then mirrored to the left."""
    obj = generator.add_mesh(collection, name, mesh_data, material)
    if budget:
        obj.modifiers.new("Vereinfachen", "DECIMATE").ratio = min(1.0, budget / len(mesh_data[0]))
    mirror = obj.modifiers.new("Spiegel", "MIRROR")
    mirror.use_axis[0] = True
    mirror.use_mirror_merge = False
    return obj


def build(collection):
    """Per side the membrane, its panel and the claw."""
    add_wing_mesh(collection, "bat_wing", outward(surface_nets(wing_sdf, GRID["low"], GRID["high"], GRID["step"])), mat("Fledermauslila"), WING_BUDGET)
    add_wing_mesh(collection, "bat_panel", panel_mesh(), mat("Fledermaushaut"))
    add_wing_mesh(collection, "bat_claw", claw_mesh(), mat("Fledermausknochen"))


generator.run("bat-wings", "Körper", build, __file__)
