"""Builds `golden-cup`: the golden trophy the pet holds up by its handles in front of its belly.

A round bowl with a thick rolled lip and a sunken darker-gold inside, a strawberry ribbon band with
a cream star and a painted glint, two big loop handles, a short stem with a round knot and a
stepped foot with a cream name plate. An award, only the app shows it (slot Hände).

    blender blender/cosmetics.blend --background --python blender/build_golden_cup.py -- [--save] [--export]

Modelled in pet coordinates around the GRIP pose (hands at x ±0.92, y -0.4, z 0.82), which
HandHeld.tsx cancels out at rest. All geometry is in Three.js coordinates.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import badge, catmull, closed_sweep, puff, skin, smooth, squircle_outline, star_outline, sweep  # noqa: E402

# The cup's axis stands at the depth of the gripping hands.
AXIS_Z = 0.8

# Material name -> (hex, glow). Warmer than plain yellow: the app's ACES tone mapping and lower
# glow pale #ffc93c to butter, this one still reads as gold.
SWATCH = {
    "Pokalgold": ("#ffb52e", 0.6),
    "Pokalgold dunkel": ("#d98a14", 0.5),
    "Pokalschleife": ("#e8364e", 0.4),
    "Pokalstern": ("#fff0d6", 1.0),
    "Pokalglanz": ("#fff4c8", 1.0),
}

# Outer profile of the bowl as (radius, y), from the bottom pole over the rim to the top pole.
BOWL = [(0.0, -0.62), (0.17, -0.605), (0.32, -0.54), (0.42, -0.42), (0.465, -0.25), (0.47, -0.08), (0.455, 0.06), (0.435, 0.125), (0.3, 0.105), (0.0, 0.09)]
BOWL_SAMPLES, RING = 26, 40
# The lip's top with its outline stays at y 0.23, well below the mouth (0.345).
LIP = {"y": 0.128, "r": 0.445, "tube": 0.07}
# The camera sits at rim height and sees no inside, a raised one sees this sunken disc under the lip.
INSIDE = {"y": 0.115, "r": 0.4, "half": 0.02}
BAND = {"y": -0.1, "gap": 0.01, "radial": 0.024, "height": 0.08}
STAR = {"r": 0.18, "half": 0.03, "lift": 0.012}
# A painted highlight on the bowl's left, below the band: (angle, y) along it, (half width, half depth).
GLINT = {"path": [(-0.63, -0.2), (-0.61, -0.32), (-0.55, -0.44)], "sections": [(0.018, 0.01), (0.034, 0.014), (0.018, 0.01)], "lift": 0.006}

# Right handle in the cup's plane, both ends sunk into the bowl. Its outer bar runs along the palm
# and stops at the hand's inner edge (|x| 0.79): the sticker would paint over the hand beyond it.
HANDLE = [(0.33, 0.02), (0.48, 0.06), (0.6, 0.06), (0.69, -0.02), (0.725, -0.16), (0.732, -0.32), (0.722, -0.46), (0.675, -0.56), (0.57, -0.615), (0.43, -0.6), (0.2, -0.52)]
HANDLE_SECTIONS = [(0.08, 0.07), (0.068, 0.06), (0.064, 0.058), (0.062, 0.058), (0.062, 0.058), (0.062, 0.058), (0.062, 0.058), (0.062, 0.058), (0.064, 0.058), (0.07, 0.062), (0.08, 0.07)]

# Stem as (radius, y) from inside the foot up into the bowl, with a round knot on it.
STEM = [(0.0, -0.96), (0.21, -0.94), (0.13, -0.88), (0.09, -0.82), (0.09, -0.66), (0.16, -0.6), (0.0, -0.56)]
KNOT = {"y": -0.74, "r": 0.145, "half": 0.115}
# The stepped foot as (y, radius, half, power, swatch), top step first; they overlap by 0.01.
FOOT = [(-0.95, 0.27, 0.065, 3.0, "Pokalgold"), (-1.09, 0.39, 0.085, 3.5, "Pokalgold dunkel")]
PLAQUE = {"y": -1.09, "r": 0.15, "aspect": 0.32, "half": 0.022, "lift": 0.004}


def add(collection, part, mesh_data, swatch, mirror=False):
    """One part of the cup in the swatch material `swatch`."""
    hex_color, glow = SWATCH[swatch]
    generator.add_mesh(collection, f"golden_cup_{part}", mesh_data, generator.material(swatch, hex_color, glow), mirror)


def around(radius, y, angle):
    """The point at `angle` on the circle of `radius` around the axis at height `y`, 0 in front."""
    return Vector((radius * math.sin(angle), y, AXIS_Z + radius * math.cos(angle)))


def lathe(profile, samples, ring_size):
    """A closed surface of revolution through `profile` (radius, y), bottom pole to top pole."""
    points = catmull([Vector((r, h, 0)) for r, h in profile], samples)
    rings = [[around(p.x, p.y, 2 * math.pi * j / ring_size) for j in range(ring_size)] for p in points[1:-1]]
    return skin(rings, ring_size, Vector((0, points[0].y, AXIS_Z)), Vector((0, points[-1].y, AXIS_Z)))


def bowl_radius(y):
    """The bowl's outer radius at height `y`, below the rim."""
    points = catmull([Vector((r, h, 0)) for r, h in BOWL], 200)
    wall = points[: max(range(len(points)), key=lambda i: points[i].y)]
    return min(wall, key=lambda p: abs(p.y - y)).x


def hoop(radius, y, count=RING):
    """A horizontal circle around the axis, running so closed_sweep's normals face out."""
    return [Vector((radius * math.cos(a), y, AXIS_Z + radius * math.sin(a))) for a in (2 * math.pi * k / count for k in range(count))]


def wrap(mesh_data, radius):
    """Bends a flat decal facing +z around the axis, so it hugs a wall of `radius`."""
    verts, faces = mesh_data
    return [around(v.z - AXIS_Z, v.y, v.x / radius) for v in verts], faces


def build_bowl(collection):
    """The bowl, its rolled lip and the inside."""
    add(collection, "bowl", lathe(BOWL, BOWL_SAMPLES, RING), "Pokalgold")
    add(collection, "lip", closed_sweep(hoop(LIP["r"], LIP["y"]), LIP["tube"], LIP["tube"], ring_size=10), "Pokalgold")
    add(collection, "inside", puff((0, INSIDE["y"], AXIS_Z), (0, 1, 0), INSIDE["r"], INSIDE["half"], power=2.5, ring_size=RING, stacks=6), "Pokalgold dunkel")


def build_trim(collection):
    """The ribbon band with its star and the glint, bent onto the bowl."""
    band_r = bowl_radius(BAND["y"]) + BAND["gap"]
    add(collection, "band", closed_sweep(hoop(band_r, BAND["y"]), BAND["radial"], BAND["height"], ring_size=8), "Pokalschleife")
    star_r = band_r + BAND["radial"] + STAR["lift"]
    star = badge(star_outline(5, 0.5), (0, BAND["y"], AXIS_Z + star_r), (0, 0, 1), STAR["r"], STAR["half"], ring_size=RING)
    add(collection, "star", wrap(star, star_r), "Pokalstern")
    path = [around(bowl_radius(y) + GLINT["lift"], y, a) for a, y in GLINT["path"]]
    # The flat side faces out of the bowl: sweep's w runs along `up`.
    outward = Vector((math.sin(GLINT["path"][1][0]), 0, math.cos(GLINT["path"][1][0])))
    add(collection, "glint", sweep(smooth(path, GLINT["sections"], 12), ring_size=8, cap_rings=4, up=outward), "Pokalglanz")


def build_base(collection):
    """Stem, knot, the stepped foot and its name plate."""
    add(collection, "stem", lathe(STEM, 12, 24), "Pokalgold dunkel")
    add(collection, "knot", puff((0, KNOT["y"], AXIS_Z), (0, 1, 0), KNOT["r"], KNOT["half"], ring_size=24, stacks=9), "Pokalgold")
    for k, (y, radius, half, power, swatch) in enumerate(FOOT):
        add(collection, f"foot_{k}", puff((0, y, AXIS_Z), (0, 1, 0), radius, half, power=power, ring_size=RING, stacks=8), swatch)
    plate_r = FOOT[-1][1] + PLAQUE["lift"]
    plate = badge(squircle_outline(1.0, PLAQUE["aspect"]), (0, PLAQUE["y"], AXIS_Z + plate_r), (0, 0, 1), PLAQUE["r"], PLAQUE["half"], ring_size=RING)
    add(collection, "plaque", wrap(plate, plate_r), "Pokalstern")


def build(collection):
    """All parts of the cup into `collection`."""
    build_bowl(collection)
    build_trim(collection)
    handle = smooth([(x, y, AXIS_Z) for x, y in HANDLE], HANDLE_SECTIONS, 30)
    add(collection, "handle", sweep(handle, ring_size=12, cap_rings=4), "Pokalgold", mirror=True)
    build_base(collection)


generator.run("golden-cup", "Hände", build, __file__)
