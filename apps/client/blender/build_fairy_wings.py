"""Builds `fairy-wings`: a pair of chibi fairy wings that peek out from behind the pet's back.

Each wing has two lobes, a big round teardrop up and out and a small one down and out, joined at
a root hidden behind the body. The wing is a puffy cushion: a 2D outline (two chains of balls with
a soft seam) clipped to the outside of the pet's silhouette, then given a round rim and a gently
domed front, meshed by surface nets. A lighter felt patch per lobe follows the outline a little
inside it, and a few sparkle stars and glitter dots lie on the patches.

    blender blender/cosmetics.blend --background --python blender/build_fairy_wings.py -- [--save] [--export]

The app paints cosmetics on top of the pet like a sticker, so the wings exist only outside its 2D
silhouette: the roots tuck a little under the body bell's edge, and they keep a clear gap to the
head, which moves. Modelled for the right side in pet coordinates (Three.js), mirrored to the left.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, dome, merge, outward, resample, sd_chain, sdf_decal, smooth_union, surface_nets  # noqa: E402

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

# The lobes as chains of balls (x, y, radius) from a root inside the body out to a round end. The
# spines bow, so the lobes swell like petals instead of running straight like paddles.
UPPER = [(0.56, 0.0, 0.1), (0.8, 0.28, 0.21), (1.08, 0.49, 0.3)]
LOWER = [(0.56, 0.03, 0.07), (0.76, 0.02, 0.115), (0.94, -0.025, 0.125)]
LOBE_SEAM = 0.035

# The cushion: centre plane, round rim (height, width), dome on the front (height, width), back rim.
WING_Z = 0.05
RIM = (0.032, 0.036)
PUFF = (0.02, 0.2)
BACK = 0.025
# The panels: one felt patch per lobe on the wing's front, their outlines `inset` inside the wing's
# edge and `split` either side of where the lobes meet, so a line of the wing runs between them
# from the notch to the root. Each outline is found by rays from its centre (which sees all of
# it) with `points` points. `lift` and `half` as in `sdf_decal`.
PANEL = {"inset": 0.06, "split": 0.018, "soft": 0.02, "lift": 0.003, "half": 0.009}
PANELS = [{"side": 1, "centre": (1.0, 0.42), "points": 64}, {"side": -1, "centre": (0.85, 0.0), "points": 40}]
# The patch's profile (scale of the outline, height in halves): the wall dips under the wing, a
# narrow round edge, then flat.
PANEL_PROFILE = [(1.0, -1.0), (1.0, 0.0), (0.98, 0.7), (0.95, 1.0), (0.7, 1.0), (0.35, 1.0)]

# Surface nets: the box round one wing and its grid step; Decimate thins the wing to its budget.
GRID = {"low": (0.3, -0.3, WING_Z - 0.07), "high": (1.5, 0.92, WING_Z + 0.1), "step": 0.008}
WING_BUDGET = 980

# Sparkles on the panel: four-point stars (x, y, radius, roll in degrees) and dots (x, y, radius).
STARS = [(1.09, 0.5, 0.095, 0), (0.83, 0.27, 0.06, 12), (0.93, -0.02, 0.05, -10)]
STAR = {"pinch": 2.8, "points": 22, "half": 0.008, "lift": 0.003}
DOTS = [(1.0, 0.62, 0.024), (1.2, 0.4, 0.024), (0.74, 0.35, 0.02)]
DOT = {"points": 10, "half": 0.007, "lift": 0.002}
# A felt patch with few rings, like the panel's.
STAR_PROFILE = [(1.0, -1.0), (1.0, 0.0), (0.92, 0.9), (0.5, 1.0)]

# name -> (hex, glow, fluff, tint). Deeper than they show: the app lightens every colour towards pastel.
SWATCH = {
    "Feenflügellila": ("#8a5ad6", 0.7, None, 1),
    "Feenflügelhell": ("#c2a2f0", 0.8, None, 1.32),
    "Feenflügelglitzer": ("#f59a0a", 0.4),
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


def lobes_sd(points):
    """Signed 2D distances to the upper and the lower lobe."""
    flat = points * np.array([1.0, 1.0, 0.0])
    return [sd_chain(flat, [(x, y, 0, r) for x, y, r in lobe]) for lobe in (UPPER, LOWER)]


def outline_sd(points):
    """Signed 2D distance to one wing's outline, clipped to the outside of the pet's silhouette."""
    wing = smooth_union(*lobes_sd(points), LOBE_SEAM)
    x, y = points[:, 0], points[:, 1]
    covered = np.minimum(body_sd(x, y) + TUCK, np.hypot(x, y - HEAD_Y) - HEAD_R - HEAD_GAP)
    return smax(wing, -covered, CLIP_SOFT)


# ---------------------------------------------------------------------------------------------
# The cushion and its panels.


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
    """Below the wing's front as a height field: the panel is laid onto it."""
    return points[:, 2] - WING_Z - front(np.maximum(-outline_sd(points), 0))


def panel_front(points):
    """Below the panel's flat top: the sparkles are laid onto it."""
    return wing_front(points) - PANEL["lift"] - PANEL["half"]


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


def panel_sd(points, side):
    """Signed 2D distance to the upper (`side` 1) or the lower (-1) panel."""
    upper, lower = lobes_sd(points)
    return smax(outline_sd(points) + PANEL["inset"], side * (upper - lower) + PANEL["split"], PANEL["soft"])


def panel_mesh():
    panels = []
    for panel in PANELS:
        centre = panel["centre"]
        outline = ray_outline(lambda p: panel_sd(p, panel["side"]), centre, panel["points"])
        panels.append(sdf_decal(wing_front, (*centre, WING_Z), (0, 0, 1), outline, PANEL["lift"], PANEL["half"], PANEL_PROFILE))
    return merge(panels)


# ---------------------------------------------------------------------------------------------
# Sparkles.


def sparkle_outline(radius, roll, pinch, count):
    """A four-point sparkle with curved sides: a superellipse with exponent `pinch`."""
    c, s = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    raw = []
    for k in range(400):
        a = 2 * math.pi * k / 400
        x = math.copysign(abs(math.cos(a)) ** pinch, math.cos(a)) * radius
        y = math.copysign(abs(math.sin(a)) ** pinch, math.sin(a)) * radius
        raw.append((x * c - y * s, x * s + y * c))
    return resample(raw, count, 2)


def circle(radius, count):
    return [(radius * math.cos(a), radius * math.sin(a)) for a in (2 * math.pi * k / count for k in range(count))]


def sparkles():
    stars = [sdf_decal(panel_front, (x, y, WING_Z), (0, 0, 1), sparkle_outline(r, roll, STAR["pinch"], STAR["points"]), STAR["lift"], STAR["half"], STAR_PROFILE) for x, y, r, roll in STARS]
    dots = [sdf_decal(panel_front, (x, y, WING_Z), (0, 0, 1), circle(r, DOT["points"]), DOT["lift"], DOT["half"], dome(2)) for x, y, r in DOTS]
    return merge(stars + dots)


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
    """Per side the wing, its panels and the sparkles on them."""
    add_wing_mesh(collection, "fairy_wing", outward(surface_nets(wing_sdf, GRID["low"], GRID["high"], GRID["step"])), mat("Feenflügellila"), WING_BUDGET)
    add_wing_mesh(collection, "fairy_panel", panel_mesh(), mat("Feenflügelhell"))
    add_wing_mesh(collection, "fairy_sparkles", sparkles(), mat("Feenflügelglitzer"))


generator.run("fairy-wings", "Körper", build, __file__)
