"""Builds `cat-whiskers`: three short white whiskers on each cheek and a small pink nose with a
glint between them.

The whiskers are short tubes that taper from a plump root to a round tip. They start far out on the
cheek, beyond the blush, fan wide past the head's edge and curl up a little at their ends. The nose
is a cushion on the face, a triangle with round corners standing on its tip, above the mouth and
below the eyes, and a small white glint sits on its upper left.

The app draws this cosmetic with a thinner ink edge (`COSMETIC_LOOKS` in cosmetic.ts): the whiskers
are barely thicker than the usual one.

    blender blender/cosmetics.blend --background --python blender/build_cat_whiskers.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import blob, decal_badge, merge, mirror_x, on_pet, outward, problems, smooth, surface_z, sweep  # noqa: E402

# The +x cheek's whiskers: each starts `lift` in front of the face at `root`, passes `bend` and ends
# at `tip` (x, y, z), out past the head's edge and a little to the front. The roots lie outside the
# cheek's window (|x| < 0.405) with their ink, far from the mouth, and the fan opens wide.
WHISKERS = [
    {"root": (0.455, 0.505), "bend": (0.615, 0.585, 0.47), "tip": (0.77, 0.69, 0.42)},
    {"root": (0.47, 0.43), "bend": (0.66, 0.425, 0.44), "tip": (0.845, 0.455, 0.4)},
    {"root": (0.455, 0.355), "bend": (0.615, 0.275, 0.47), "tip": (0.775, 0.235, 0.42)},
]
# Radius at the root, the bend and the tip: plump at the cheek, slimmer to the round tip.
THICK = (0.0175, 0.014, 0.0095)
LIFT = 0.004
# The app's ink for this cosmetic and a little air: what keeps the face's windows clear.
ROOM = 0.014 + 0.006
# The nose: its outline round its centre, the corners rounded by smoothing, a cushion `half` high.
NOSE = {"at": (0.0, 0.572), "outline": [(-0.052, 0.024), (0.052, 0.024), (0.0, -0.032)], "half": 0.018, "lift": 0.012}
# The glint on the nose: offset (x, y) from its centre, radius and depth.
GLINT = {"offset": (-0.017, 0.009), "radius": 0.0095, "deep": 0.004}

# name -> (hex, glow). White whiskers, a pink nose deeper than it shows: the app lightens colours.
SWATCH = {
    "Schnurrweiß": ("#ffffff", 1.0),
    "Nasenrosa": ("#ff6f9c", 0.6),
    "Nasenglanz": ("#ffffff", 1.0),
}


def whisker(root, bend, tip):
    """One whisker of the +x cheek."""
    points = [on_pet(*root, LIFT), Vector(bend), Vector(tip)]
    return outward(sweep(smooth(points, [(r, r) for r in THICK], 18), ring_size=8, cap_rings=3))


def nose():
    cx, cy = NOSE["at"]
    outline = [(cx + x, cy + y) for x, y in NOSE["outline"]]
    return outward(decal_badge(outline, NOSE["at"], NOSE["lift"], NOSE["half"], ring_size=32, stacks=4, passes=4))


def glint():
    """The small white glint on the nose's upper left, on its cushion."""
    (cx, cy), (dx, dy) = NOSE["at"], GLINT["offset"]
    x, y = cx + dx, cy + dy
    r = GLINT["radius"]
    return blob((x, y, surface_z(x, y) + NOSE["lift"] + NOSE["half"] * 0.85), (0, 0, 1), (0, 1, 0), (r, r, GLINT["deep"]), ring=12, stacks=6)


def build(collection):
    """The whiskers of both cheeks, the nose and its glint."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    right = merge([whisker(**w) for w in WHISKERS])
    generator.add_mesh(collection, "cat_whiskers", right, mats["Schnurrweiß"], mirror=True)
    generator.add_mesh(collection, "cat_whiskers_nose", nose(), mats["Nasenrosa"])
    generator.add_mesh(collection, "cat_whiskers_glint", glint(), mats["Nasenglanz"])
    found = problems({"whiskers": mirror_x(right), "nose": nose(), "glint": glint()}, ROOM)
    print("CHECK", found or "ok")
    assert not found, found


generator.run("cat-whiskers", "Gesicht", build, __file__)
