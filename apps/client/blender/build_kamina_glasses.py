"""Builds `kamina-glasses`: pointed shades whose halves sweep up and out past the head like wings,
after Kamina's. One flat lens plate with a round rim, like the acrylic of the real ones: a V dips
above the bridge and a notch below it leaves the mouth free. The lens is tinted glass, the eyes
show through it. White glints cross each half.

The plate is an implicit surface like the bat wings: its outline's signed distance with a round rim
and a flat front, meshed by surface nets and thinned by Decimate. The glints are flat sheets just in
front of it. The lens takes the wearer's colour, the glints stay white.

    blender blender/cosmetics.blend --background --python blender/build_kamina_glasses.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import merge, outward, polygon_sd, ray_outline, surface_nets  # noqa: E402

# The outline's right half, mirrored to the left: the V above the bridge, the tip up and out past
# the head, the outer corner under the cheek, where the nose notch starts and its apex. The eyes
# (±0.19, 0.66, pupils 0.058 × 0.084 plus gaze) and the cheeks (±0.33, 0.54) lie under the lens;
# with its ink edge it stays out of the mouth's window (|x| < 0.12, y < 0.52).
TOP, TIP, OUTER, NOSE, BRIDGE = (0.0, 0.76), (0.9, 1.2), (0.4, 0.48), (0.15, 0.56), (0.0, 0.62)
CORNERS = [TOP, TIP, OUTER, NOSE, BRIDGE, *((-x, y) for x, y in (NOSE, OUTER, TIP))]
# How round the corners are: the tips stay pointed, but the ink edge runs round them unbroken.
ROUND = 0.012
# The plate's centre plane, in front of the face and the eyes on it.
Z = 0.8
# Half the plate's thickness and the width over which the rim rounds up to it.
RIM = (0.022, 0.022)
# Surface nets: the box round the plate and its grid step; Decimate thins it to its budget. Its
# symmetry option tears holes into the flat plate, so it stays off.
GRID = {"low": (-0.96, 0.44, Z - 0.04), "high": (0.96, 1.24, Z + 0.04), "step": 0.008}
BUDGET = 2400
# The glints on the right half, mirrored: a wide and a thin bar across the wing, out past the eye.
# Each is a band through `at` running at `angle` degrees (0 is +x) with half width `half`, cut off
# `inset` inside the lens's edge.
GLINTS = [{"at": (0.5, 0.84), "angle": 125, "half": 0.034}, {"at": (0.6, 0.91), "angle": 125, "half": 0.013}]
# A glint is a sheet `lift` in front of the lens, without back or edge: the app draws the outline
# after the glass, and the edge of a solid glint would stand in front of the lens and get inked.
GLINT = {"inset": 0.035, "points": 40, "lift": 0.003}

# name -> (hex, glow, fluff, tint, glass). Deeper than it shows: the app lightens every colour
# towards pastel, and the lens lights up from its lower edge. A third of what lies behind it shows
# through the lens.
SWATCH = {
    "Kaminarot": ("#d42c14", 0.3, None, 1.0, 0.35),
    "Kaminaglanz": ("#ffffff", 1.0, None, None, None),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def outline_sd(x, y):
    """Signed 2D distance to the lens's outline (negative inside)."""
    return polygon_sd(x, y, CORNERS) - ROUND


def rise(s):
    """The front's height above the centre, `s` inside the edge: a quarter ellipse, then flat."""
    height, width = RIM
    u = np.clip(s / width, 0, 1)
    return height * np.sqrt(1 - (1 - u) ** 2)


def lens_sdf(points):
    x, y, z = points[:, 0], points[:, 1], points[:, 2]
    d = outline_sd(x, y)
    return np.maximum(d, np.abs(z - Z) - rise(np.maximum(-d, 0)))


def glint_mesh(at, angle, half):
    """One glint: the band across the lens, cut off inside its edge, as a sheet facing the front."""
    a = math.radians(angle)
    across = np.array([-math.sin(a), math.cos(a)])

    def band(points):
        x, y = points[:, 0], points[:, 1]
        return np.maximum(np.abs((points[:, :2] - at) @ across) - half, outline_sd(x, y) + GLINT["inset"])

    outline = ray_outline(band, at, GLINT["points"])
    z = Z + RIM[0] + GLINT["lift"]
    verts = [Vector((*at, z)), *(Vector((at[0] + x, at[1] + y, z)) for x, y in outline)]
    # A fan from the centre: the outline runs counter-clockwise, so every face looks to the front.
    count = len(outline)
    return verts, [(0, 1 + i, 1 + (i + 1) % count) for i in range(count)]


def build(collection):
    """The lens in the wearer's colour and the white glints."""
    lens = generator.add_mesh(collection, "kamina_lens", outward(surface_nets(lens_sdf, GRID["low"], GRID["high"], GRID["step"])), mat("Kaminarot"))
    thin = lens.modifiers.new("Vereinfachen", "DECIMATE")
    thin.ratio = min(1.0, BUDGET / len(lens.data.vertices))
    generator.add_mesh(collection, "kamina_glints", merge([glint_mesh(**glint) for glint in GLINTS]), mat("Kaminaglanz"), mirror=True)


generator.run("kamina-glasses", "Gesicht", build, __file__)
