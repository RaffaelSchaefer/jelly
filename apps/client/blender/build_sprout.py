"""Builds `sprout`: a little seedling growing out of the top of the head, a gently bowed stem with
two plump leaves that reach up and out towards the viewer.

    blender blender/cosmetics.blend --background --python blender/build_sprout.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_DEPTH, HEAD_R, HEAD_Y, HEAD_Z, polygon, resample, skin, smooth, sweep  # noqa: E402

# Degrees towards the front from the top of the head. Like the party hat it sits a little forward:
# the app's camera looks up at the head and would otherwise see the stem's foot from below.
SEAT = 12
SINK = 0.03  # the stem starts this far inside the head
# The stem as (forward, up) offsets from the seat with its (h, w) half sections: it bows forward
# and thins towards the leaves.
STEM = [(0.0, -SINK), (0.012, 0.04), (0.018, 0.08), (0.012, 0.11)]
STEM_SECTIONS = [(0.04, 0.04), (0.034, 0.034), (0.03, 0.03), (0.028, 0.028)]

# One leaf on the +x side; the mirror adds the other. `rise` lifts it above the horizontal, `toward`
# turns it to the front, `face` tips its face from the front up to the sky.
LEAF = {"length": 0.29, "width": 0.1, "half": 0.022, "rise": 21, "toward": 14, "face": 30}
# The outline's half width over its length: a rounded base, broadest before the middle, a soft tip.
LEAF_SHAPE = {"base": 0.6, "tip": 0.9, "samples": 48}
# Puffy like the crown's slabs; `cup` lifts the rims to the front by that share of the width,
# `arch` bows the middle out by that much.
LEAF_BEND = {"cup": 0.35, "arch": 0.03, "power": 2.6, "stacks": 5, "ring": 40}
# The leaves start this far inside the stem and above its end, so they cover its round cap.
LEAF_ROOT = {"inside": 0.012, "above": 0.02}

# Deeper than they show: the app's gloss and lower glow lighten every colour towards pastel.
STEM_GREEN, LEAF_GREEN = "#2f7a35", "#3fa83a"
GLOW = 0.35


def seat():
    """Where the stem meets the head: on the head's oval, SEAT degrees forward of its top."""
    a = math.radians(SEAT)
    d = Vector((0, math.cos(a), math.sin(a)))
    reach = 1 / math.sqrt((d.y / HEAD_R) ** 2 + (d.z / (HEAD_R * HEAD_DEPTH)) ** 2)
    return Vector((0, HEAD_Y, HEAD_Z)) + d * reach


SEAT_AT = seat()
STEM_POINTS = [SEAT_AT + Vector((0, up, forward)) for forward, up in STEM]
TOP = STEM_POINTS[-1]


def stem_mesh():
    """A round tube from inside the head up to where the leaves start."""
    return sweep(smooth(STEM_POINTS, STEM_SECTIONS, 12), ring_size=16, cap_rings=4)


def leaf_outline():
    """The leaf flat, base at x 0 and tip at x 1, counter-clockwise, about unit length."""
    a, b, count = LEAF_SHAPE["base"], LEAF_SHAPE["tip"], LEAF_SHAPE["samples"]
    peak = (a / (a + b)) ** a * (b / (a + b)) ** b
    half = [LEAF["width"] / LEAF["length"] * x**a * (1 - x) ** b / peak for x in (k / count for k in range(count + 1))]
    lower = [(k / count, -h) for k, h in enumerate(half)]
    upper = [(k / count, h) for k, h in reversed(list(enumerate(half)))][1:-1]
    return polygon(lower + upper, 4)


def leaf_frame():
    """(along, across, face) of the +x leaf: along points to its tip, face is its front."""
    rise, toward, tip = (math.radians(LEAF[k]) for k in ("rise", "toward", "face"))
    along = Vector((math.cos(rise) * math.cos(toward), math.sin(rise), math.cos(rise) * math.sin(toward)))
    face = Vector((0, math.sin(tip), math.cos(tip)))
    face = (face - along * face.dot(along)).normalized()
    return along, face.cross(along), face


def leaf_mesh():
    """A plump leaf from the stem's top: a pillow from the outline, cupped and arched to the front."""
    boundary = resample(leaf_outline(), LEAF_BEND["ring"], 4)
    center_x, power, stacks = 0.42, LEAF_BEND["power"], LEAF_BEND["stacks"]
    along, across, face = leaf_frame()
    root = TOP + Vector((0, LEAF_ROOT["above"], 0)) - along * LEAF_ROOT["inside"]
    length, width = LEAF["length"], LEAF["width"] / LEAF["length"]

    def place(x, y, z):
        lift = LEAF_BEND["cup"] * (y / width) ** 2 * LEAF["width"] + LEAF_BEND["arch"] * 4 * x * (1 - x)
        return root + along * (x * length) + across * (y * length) + face * (z + lift)

    rings = []
    for i in range(-stacks + 1, stacks):
        t = i / stacks * math.pi / 2
        c, s = math.cos(t), math.sin(t)
        scale = abs(c) ** (2 / power)
        z = LEAF["half"] * math.copysign(abs(s) ** (2 / power), s)
        rings.append([place(center_x + (x - center_x) * scale, y * scale, z) for x, y in boundary])
    return skin(rings, len(boundary), place(center_x, 0, -LEAF["half"]), place(center_x, 0, LEAF["half"]))


def build(collection):
    """Stem and leaf, one material each; the mirror grows the second leaf."""
    generator.add_mesh(collection, "sprout_stem", stem_mesh(), generator.material("Stielgrün", STEM_GREEN, GLOW))
    generator.add_mesh(collection, "sprout_leaf", leaf_mesh(), generator.material("Blattgrün", LEAF_GREEN, GLOW), mirror=True)


generator.run("sprout", "Kopf", build, __file__)
