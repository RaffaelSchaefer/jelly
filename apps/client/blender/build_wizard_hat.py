"""Builds `wizard-hat`: Funkelbart's hat as a cosmetic, the one the server lends to one jelly per LAN.

    blender blender/cosmetics.blend --background --python blender/build_wizard_hat.py -- [--save] [--export]

The geometry and materials are the wizard's own (`build_hat` in `build_wizard.py`: felt cone, brim,
hem, embroidery, patch, band, clasp and tip star), reshaped around his hat's pivot to fit a
cosmetic: his hat reaches y 2, above the speech bubble at y 1.6. Cone and brim grow wider, so it
reads as a big wizard's hat, and the height shrinks to fit. The wizard's paint layers (trim over felt) merge into one: a cosmetic has one layer.
See README.md for the modelling rules.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True  # no __pycache__ next to the .blend

import build_wizard  # noqa: E402
import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, from_blender, to_blender  # noqa: E402

PIVOT = Vector((0.0, 0.99, 0.2))  # HAT_PIVOT in packages/jelly-scene/src/wizard.ts, at the brim
CONE_WIDE = 1.18  # x and z of everything but the brim, around the pivot: wider than the wizard's, it reads as a hat
BRIM_WIDE = 1.08  # x and z of brim and hem, a little narrower than the cone so the raised hands stay clear
BRIM = ("hat_brim", "hat_hem")
TALL = 0.62  # y above the pivot
DROP = -0.06  # moves the whole hat down; the brim's front then rests on the forehead


def fit(p, wide=CONE_WIDE):
    """A point of the wizard's hat, moved onto the pet as the cosmetic."""
    d = p - PIVOT
    return PIVOT + Vector((d.x * wide, d.y * TALL + DROP, d.z * wide))


def crown_margins():
    """The gap between the cone's sides and the head's sides per height, from the cone's foot up
    to the head's top: negative where the head would show beside the cone. Up to about y 1.15 it
    may be, by up to 0.08: brim and band cover that from the app's camera and from the stage's."""
    margins = {}
    for p, h, _ in build_wizard.CONE:
        left, right = fit(p - Vector((h, 0, 0))), fit(p + Vector((h, 0, 0)))
        if left.y > HEAD_Y + HEAD_R:
            break
        head = math.sqrt(max(0.0, HEAD_R**2 - (left.y - HEAD_Y) ** 2))
        margins[round(left.y, 3)] = round(min(-left.x - head, right.x - head), 3)
    return margins


def build(collection):
    """The wizard's hat parts, each vertex moved by `fit`."""
    build_wizard.build_hat(collection)
    for obj in collection.objects:
        del obj["part"]  # one cosmetic, not split into the wizard's parts
        name = obj.name.split(".")[0]
        obj.name = obj.data.name = "wizard_" + name  # beside the wizard's own `hat_*`
        wide = BRIM_WIDE if name in BRIM else CONE_WIDE
        for vertex in obj.data.vertices:
            vertex.co = to_blender(fit(from_blender(vertex.co), wide))
        obj.data.update()
    points = [from_blender(v.co) for obj in collection.objects for v in obj.data.vertices]
    low = [round(min(getattr(p, axis) for p in points), 3) for axis in "xyz"]
    high = [round(max(getattr(p, axis) for p in points), 3) for axis in "xyz"]
    print("BOUNDS", low, high, "CROWN", crown_margins())


generator.run("wizard-hat", "Kopf", build, __file__)
