"""Builds `cat-ears`: two round, puffy plush cat ears, cupped like real ones, with a pink lining and
a full tuft of pale fluff in each.

Each ear is a plump pillow with softly bulging sides and a round tip, an implicit surface: the
signed distance of its outline, rounded at the rim, with a bowl carved into its front. The pink
lining is a thin shell on the bowl's floor that stops short of the rim, so a soft lip of fur runs
round it. The tuft is made of locks, tapering chains of balls along curves: they rise from the
bowl's inner corner, fan out over the lining and their tips come forward out of the bowl. The fur
takes the wearer's colour, the fluff a pale shade of it, the lining stays pink.

The app draws the ears behind the pet (`behind` in `COSMETIC_LOOKS`, cosmetic.ts): the head and
its ink edge cover the ears' feet, so they grow out from behind the head like drawn cat ears. The
feet reach into the head and need no cut, but everything near the head's edge stays behind the
plane where its ink lies (z 0.2).

    blender blender/cosmetics.blend --background --python blender/build_cat_ears.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, catmull, polygon_sd, sd_chain, sd_ellipsoid, smooth_union  # noqa: E402

# The +x ear's frame: its foot lies on the head's outline `rise` degrees above the head's middle,
# its height runs along `lean` degrees (90 is straight up). `across` points out and down from it.
SEAT = {"rise": 50, "lean": 62}
FOOT = (HEAD_R * math.cos(math.radians(SEAT["rise"])), HEAD_Y + HEAD_R * math.sin(math.radians(SEAT["rise"])))
UP = (math.cos(math.radians(SEAT["lean"])), math.sin(math.radians(SEAT["lean"])))
ACROSS = (UP[1], -UP[0])
# The ear's outline: a closed curve through these points as (across, up) from the foot, `per`
# samples between two of them, softened by `round`. A wide foot inside the head, sides that bulge a
# little and a round tip, which stays under the speech bubble (y < 1.6). The head and its ink cover
# the ear up to about `up` 0.04.
EAR = {
    "points": [(0.225, -0.18), (0.22, 0.06), (0.17, 0.27), (0.075, 0.415), (0.0, 0.445), (-0.075, 0.39), (-0.155, 0.23), (-0.205, 0.04), (-0.215, -0.18), (0.0, -0.26)],
    "per": 10,
    "round": 0.02,
}
# The pillow's centre plane, half its thickness and the width over which its rim rounds up to it.
Z = 0.1
PILLOW = (0.065, 0.075)
# The bowl carved into the front: an ellipsoid in the ear's frame, centre (across, up, depth in
# front of the plane) and half sizes, and how soft its lip is.
BOWL = {"at": (0.01, 0.2, 0.1), "size": (0.118, 0.19, 0.075), "lip": 0.022}
# The lining: a shell this thick on the bowl's floor, ending `margin` below the pillow's surface.
LINING = {"half": 0.006, "margin": 0.014, "soft": 0.008}
# The tuft: locks as (across, up, depth in front of the plane, radius) along a curve, root first.
# Short plump locks fan out of the bowl's inner corner like a little cloud, their round tips come
# forward over the lining. Near the head they stay deep, behind its ink. `flat` squeezes them in
# depth; `soft` melts them into one clump.
TUFT = {
    "locks": [
        [(-0.08, 0.07, 0.03, 0.05), (-0.1, 0.16, 0.06, 0.034), (-0.09, 0.245, 0.085, 0.013)],
        [(-0.06, 0.07, 0.03, 0.05), (-0.05, 0.17, 0.065, 0.036), (-0.02, 0.26, 0.09, 0.013)],
        [(-0.05, 0.07, 0.03, 0.048), (0.0, 0.145, 0.065, 0.034), (0.055, 0.205, 0.09, 0.013)],
        [(-0.04, 0.06, 0.035, 0.046), (0.025, 0.095, 0.07, 0.032), (0.09, 0.12, 0.09, 0.013)],
        [(-0.06, 0.06, 0.05, 0.04), (-0.005, 0.06, 0.08, 0.03), (0.05, 0.06, 0.095, 0.013)],
        [(-0.09, 0.08, 0.04, 0.04), (-0.13, 0.155, 0.07, 0.028), (-0.15, 0.21, 0.09, 0.013)],
        [(-0.07, 0.1, 0.05, 0.04), (-0.06, 0.175, 0.085, 0.03), (-0.04, 0.215, 0.1, 0.013)],
    ],
    "samples": 8,
    "flat": 0.72,
    "soft": 0.022,
}
# Surface nets: the box round the +x ear and its grid step; each part is thinned to its budget.
GRID = {"low": (0.02, 0.74, Z - 0.09), "high": (0.8, 1.6, Z + 0.17), "step": 0.0065}
BUDGET = {"ear": 1300, "lining": 550, "tuft": 1100}

# name -> (hex, glow, fluff, tint). Plush all over. The fur takes the wearer's colour, the fluff is
# nearly white with a breath of it. The lining stays pink and glows little, so the bowl reads deep.
SWATCH = {
    "Katzenfell": ("#f2a04e", 0.5, 0.6, 1.0),
    "Katzenrosa": ("#ff8fb1", 0.35, 0.5),
    "Katzenflaum": ("#fff1dc", 1.0, 1.0, 1.75),
}


def local(points):
    """The points in the ear's frame as columns (across, up, depth in front of its plane)."""
    dx, dy = points[:, 0] - FOOT[0], points[:, 1] - FOOT[1]
    return np.column_stack([dx * ACROSS[0] + dy * ACROSS[1], dx * UP[0] + dy * UP[1], points[:, 2] - Z])


def world(across, up, depth):
    """A point of the ear's frame in pet coordinates."""
    return Vector((FOOT[0] + across * ACROSS[0] + up * UP[0], FOOT[1] + across * ACROSS[1] + up * UP[1], Z + depth))


def smax(a, b, k):
    """The intersection of two distances with a soft seam."""
    return -smooth_union(-a, -b, k)


def closed_curve(points, per):
    """`per` samples between each two of `points` on a closed Catmull-Rom curve through them."""
    out, count = [], len(points)
    for i in range(count):
        p0, p1, p2, p3 = (Vector((*points[(i + k - 1) % count], 0)) for k in range(4))
        for j in range(per):
            u = j / per
            v = 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u**2 + (3 * p1 - p0 - 3 * p2 + p3) * u**3)
            out.append((v.x, v.y))
    return out


OUTLINE = closed_curve(EAR["points"], EAR["per"])


def rise(s, height, width):
    """A front's height above its centre, `s` inside the edge: a quarter ellipse, then flat."""
    u = np.clip(s / width, 0, 1)
    return height * np.sqrt(1 - (1 - u) ** 2)


def pillow_sdf(points):
    q = local(points)
    d = polygon_sd(q[:, 0], q[:, 1], OUTLINE) - EAR["round"]
    return np.maximum(d, np.abs(q[:, 2]) - rise(np.maximum(-d, 0), *PILLOW))


def bowl_sdf(points):
    return sd_ellipsoid(local(points), BOWL["at"], BOWL["size"])


def ear_sdf(points):
    """The pillow with the bowl carved into its front."""
    return smax(pillow_sdf(points), -bowl_sdf(points), BOWL["lip"])


def lining_sdf(points):
    """A thin shell on the bowl's floor, short of the pillow's surface."""
    return smax(np.abs(bowl_sdf(points)) - LINING["half"], pillow_sdf(points) + LINING["margin"], LINING["soft"])


LOCKS = [
    [(*world(a, u, d), r) for (a, u, d), r in zip(catmull([Vector(p[:3]) for p in lock], TUFT["samples"]), np.interp(np.linspace(0, len(lock) - 1, TUFT["samples"]), range(len(lock)), [p[3] for p in lock]))]
    for lock in TUFT["locks"]
]


def tuft_sdf(points):
    """The locks melted into one clump, squeezed in depth round the pillow's plane."""
    flat = np.column_stack([points[:, 0], points[:, 1], Z + (points[:, 2] - Z) / TUFT["flat"]])
    balls = [[(x, y, Z + (z - Z) / TUFT["flat"], r) for x, y, z, r in lock] for lock in LOCKS]
    out = sd_chain(flat, balls[0])
    for lock in balls[1:]:
        out = smooth_union(out, sd_chain(flat, lock), TUFT["soft"])
    return out


def build(collection):
    """Per side the cupped ear, its pink lining and its tuft."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    generator.add_implicit(collection, "cat_ears", ear_sdf, GRID, mats["Katzenfell"], BUDGET["ear"], mirror=True)
    generator.add_implicit(collection, "cat_ears_lining", lining_sdf, GRID, mats["Katzenrosa"], BUDGET["lining"], mirror=True)
    generator.add_implicit(collection, "cat_ears_tuft", tuft_sdf, GRID, mats["Katzenflaum"], BUDGET["tuft"], mirror=True)


generator.run("cat-ears", "Kopf", build, __file__)
