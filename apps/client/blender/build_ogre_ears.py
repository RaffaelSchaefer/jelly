"""Builds `ogre-ears`: two chunky, trumpet-shaped green ogre ears on the flanks of the head. A short
stalk leaves the head sideways, waists a little and flares into a round bell with a thick rolled
lip; the bell turns outwards, a little up and to the front, so the camera looks into its darker
opening.

Each ear is one surface of revolution around a gently bending spine: the profile runs from a pole
inside the head along the outside, over the lip and down the inside to a pole at the bottom of the
bell. It is cut in two at the lip's inner edge, green outside and darker inside, sharing that ring,
so the opening reads by its colour with no seam. The mirror makes the left ear.

The app paints head cosmetics over the pet like a sticker: only the root's round base reaches a
little over the head's edge, so the ear reads as attached and stays clear of the face.

    blender blender/cosmetics.blend --background --python blender/build_ogre_ears.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, HEAD_Z, catmull, outward, skin  # noqa: E402

# The +x ear's root: on the head's flank `rise` degrees above its middle, `sink` inside the head
# along its normal. The stalk leaves along that normal, so its round base lies in the head's tangent
# plane and follows its outline; the bell faces outwards, a little up and more to the front, so the
# camera, which looks up at the head, sees into it. The spine turns from one to the other between
# the two arc lengths of BEND.
SEAT = {"rise": 10, "sink": 0.015}
BELL_DIR = Vector((1.0, 0.5, 0.85))
BEND = (0.04, 0.18)
SPINE_STEP = 0.002
ROOT_DIR = Vector((math.cos(math.radians(SEAT["rise"])), math.sin(math.radians(SEAT["rise"])), 0))
ROOT = Vector((0, HEAD_Y, HEAD_Z)) + ROOT_DIR * (HEAD_R - SEAT["sink"])

# The closed profile as (arc length along the spine, radius): from the pole inside the head a soft
# dome, widest where the stalk meets the head, a slight waist, the trumpet flare, the rolled lip,
# then down the inside to the bell's bottom. The rim is about 1.7 times the stalk's waist.
PROFILE = [
    (-0.03, 0.0),
    (-0.03, 0.055),
    (-0.018, 0.1),
    (0.0, 0.12),
    (0.04, 0.113),
    (0.085, 0.1),
    (0.13, 0.102),
    (0.17, 0.115),
    (0.21, 0.136),
    (0.245, 0.158),
    (0.272, 0.17),
    (0.295, 0.162),
    (0.303, 0.142),
    (0.292, 0.122),
    (0.265, 0.11),
    (0.225, 0.08),
    (0.2, 0.04),
    (0.2, 0.0),
]
OPENING = 13  # the lip's inner edge: the darker inside starts here
# Rings along the outside and the inside, and points per ring.
RINGS = {"outside": 36, "inside": 11, "around": 26}
DENSE = 40  # curve samples per profile segment before the rings are spaced
TURN = 0.02  # ring spacing counts each radian the profile turns like this much length: a round lip

# Deeper than they show: the app lightens every colour towards pastel. Skin, a little soft. The
# inside glows less, so the opening stays a dark hole down to its lower edge.
SWATCH = {"Ogergrün": ("#3a6e10", 0.3, 0.2, 1.0), "Ogerinnen": ("#1e3e08", 0.15, 0.2, 0.31)}


def smoothstep(a, b, x):
    """0 below `a`, 1 above `b`, eased in between."""
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def direction(s):
    """The spine's direction at arc length `s`."""
    return ROOT_DIR.lerp(BELL_DIR.normalized(), smoothstep(*BEND, s)).normalized()


def spine(s):
    """The spine's point at arc length `s`, integrated from ROOT; straight behind it."""
    if s <= 0:
        return ROOT + ROOT_DIR * s
    steps = max(1, round(s / SPINE_STEP))
    h = s / steps
    return ROOT + sum((direction((k + 0.5) * h) * h for k in range(steps)), Vector())


def ring(s, r):
    """The circle of radius `r` round the spine at `s`; (n, b, d) right-handed."""
    d = direction(s)
    b = (Vector((0, 1, 0)) - d * d.y).normalized()
    n = b.cross(d)
    centre = spine(s)
    return [centre + (n * math.cos(a) + b * math.sin(a)) * r for a in (2 * math.pi * j / RINGS["around"] for j in range(RINGS["around"]))]


def even(points, count):
    """`count` points along the polyline `points`, ends included, closer where it turns (TURN)."""
    lengths = [0.0]
    for k in range(1, len(points)):
        step = points[k] - points[k - 1]
        turn = step.angle(points[k - 1] - points[k - 2], 0.0) if k > 1 else 0.0
        lengths.append(lengths[-1] + step.length + TURN * turn)
    out, k = [], 0
    for i in range(count):
        target = lengths[-1] * i / (count - 1)
        while k < len(points) - 2 and lengths[k + 1] < target:
            k += 1
        u = (target - lengths[k]) / max(lengths[k + 1] - lengths[k], 1e-12)
        out.append(points[k].lerp(points[k + 1], u))
    return out


def ear():
    """The +x ear as (outside, inside) meshes that share the ring at the lip's inner edge."""
    dense = catmull([Vector((s, r, 0)) for s, r in PROFILE], (len(PROFILE) - 1) * DENSE + 1)
    cut = OPENING * DENSE
    outside = even(dense[: cut + 1], RINGS["outside"] + 1)
    inside = even(dense[cut:], RINGS["inside"] + 1)
    # The first and last points lie on the axis: they are the poles.
    rings_out = [ring(p.x, p.y) for p in outside[1:]]
    rings_in = [ring(p.x, p.y) for p in inside[:-1]]
    root_pole, bottom_pole = spine(outside[0].x), spine(inside[-1].x)
    # Orient both halves like the closed ear, so its normals face out of the solid.
    whole = skin(rings_out + rings_in[1:], RINGS["around"], root_pole, bottom_pole)
    flip = outward(whole)[1][0] != whole[1][0]
    halves = skin(rings_out, RINGS["around"], root_pole), skin(rings_in, RINGS["around"], None, bottom_pole)
    return [(verts, [tuple(reversed(f)) for f in faces] if flip else faces) for verts, faces in halves]


def build(collection):
    """Both ears, green outside and darker inside; the mirror makes the left one."""
    outside, inside = ear()
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    generator.add_mesh(collection, "ogre_ears", outside, mats["Ogergrün"], mirror=True)
    generator.add_mesh(collection, "ogre_ears_inside", inside, mats["Ogerinnen"], mirror=True)


generator.run("ogre-ears", "Kopf", build, __file__)
