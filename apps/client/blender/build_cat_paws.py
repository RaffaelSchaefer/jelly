"""Builds `cat-paws`: a plush paw the pet wears over each hand like a mitten, palm to the front, with
four round toes and pink toe beans.

The paw is one plush piece, an implicit surface: a ball for the palm and four smaller ones for the
toes in an arc along its top, melted together with soft seams, so the toes show in its outline. The
beans lie on its front as puffy cushions, a big pad with three lobes below and one oval bean on
each toe. The fur takes the wearer's colour, the beans stay pink.

    blender blender/cosmetics.blend --background --python blender/build_cat_paws.py -- [--save] [--export]

Unlike what the pet holds, this is one paw round the origin: the app draws it on each hand and
lets it follow that hand (`onHands` in src/pet/cosmetics.ts, `HandWorn` in HandHeld.tsx), so it
stays on while the pet waves. It covers the hand (radius 0.2) with its ink edge and has to look
right on both hands, so it is symmetric. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import (  # noqa: E402
    circles_outline, dome, merge, ray_onto, resample, sd_ellipsoid, sdf_decal, sdf_gradient, smooth_union, unit_rows,
)

# The palm round the hand's centre: centre and half sizes (across, up, deep). With its ink it covers
# the whole hand, whose thumb reaches 0.26 from its centre and points up while the pet holds.
PALM = {"at": (0.0, -0.02, 0.0), "size": (0.268, 0.258, 0.205)}
# The toes in an arc round the palm's centre: per toe its angle in degrees (90 is straight up), its
# distance from the centre, its radius and how far it sits to the front. They melt in by `soft`.
TOES = [(36, 0.222, 0.074, 0.05), (72, 0.225, 0.082, 0.06), (108, 0.225, 0.082, 0.06), (144, 0.222, 0.074, 0.05)]
SOFT = 0.03
# The big pad: a union of circles (x, y, radius) round its centre, a round top and three lobes
# below. The toe beans: ovals of half sizes (across, up) on each toe's front, a little below its top.
PAD = {"centre": (0.0, -0.115), "circles": [(0.0, -0.082, 0.078), (-0.063, -0.135, 0.051), (0.0, -0.148, 0.055), (0.063, -0.135, 0.051)]}
BEAN = {"size": (0.036, 0.043), "drop": 0.014}
# Every bean is a cushion `half` high, `lift` above the fur.
CUSHION = {"half": 0.015, "lift": 0.001}
# Surface nets: the box round the paw and its grid step; each part is thinned to its budget.
GRID = {"low": (-0.34, -0.33, -0.26), "high": (0.34, 0.36, 0.31), "step": 0.0065}
BUDGET = 1800

# name -> (hex, glow, fluff, tint). Plush fur in the wearer's colour, pink beans with a little gloss
# left, like soft rubber.
SWATCH = {
    "Pfotenfell": ("#f2a04e", 0.5, 0.7, 1.0),
    "Pfotenrosa": ("#ff7fa6", 0.7, 0.3),
}

CENTRE = np.array(PALM["at"][:2])


def toe(angle, reach, radius, depth):
    """A toe's centre (x, y, z) and radius."""
    a = math.radians(angle)
    return (*(CENTRE + reach * np.array([math.cos(a), math.sin(a)])), depth), radius


def paw_sdf(points):
    """Palm and toes with soft seams."""
    out = sd_ellipsoid(points, PALM["at"], PALM["size"])
    for spec in TOES:
        centre, radius = toe(*spec)
        out = smooth_union(out, np.linalg.norm(points - centre, axis=-1) - radius, SOFT)
    return out


def front(x, y):
    """The point on the paw's front at (x, y) and the normal there."""
    point = ray_onto(paw_sdf, [(x, y, 0.6)], (0, 0, -1), 0.6)
    return point[0], unit_rows(sdf_gradient(paw_sdf, point))[0]


def ellipse(rx, ry, samples=28):
    return [(rx * math.cos(t), ry * math.sin(t)) for t in (2 * math.pi * k / samples for k in range(samples))]


def beans():
    """The big pad and one bean on each toe, as puffy cushions."""
    cx, cy = PAD["centre"]
    outline = resample([(x - cx, y - cy) for x, y in circles_outline(PAD["circles"], PAD["centre"])], 48, 2)
    at, _ = front(cx, cy)
    made = [sdf_decal(paw_sdf, at, (0, 0, 1), outline, CUSHION["lift"], CUSHION["half"], dome(3), reach=0.3)]
    for spec in TOES:
        (x, y, _), radius = toe(*spec)
        at, normal = front(x, y - BEAN["drop"])
        made.append(sdf_decal(paw_sdf, at, normal, ellipse(*BEAN["size"]), CUSHION["lift"], CUSHION["half"] * 0.8, dome(3), reach=0.15))
    return merge(made)


def build(collection):
    """The paw and its beans."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    generator.add_implicit(collection, "cat_paws", paw_sdf, GRID, mats["Pfotenfell"], BUDGET)
    generator.add_mesh(collection, "cat_paws_beans", beans(), mats["Pfotenrosa"])


generator.run("cat-paws", "Hände", build, __file__)
