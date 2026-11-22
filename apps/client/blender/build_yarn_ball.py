"""Builds `yarn-ball`: a ball of wool the pet holds in front of its belly, wound in three
directions, with a loose end hanging down in a curl.

The ball is a sphere in a darker shade. The windings are bundles of round threads lying side by
side, in rows round three axes; the windings of each axis lie a little higher than the ones before,
so they cross over them like wound wool and the dark ball shows only in the gaps. Only the arc of a
thread that faces the camera is built, its ends lie hidden behind the ball. The loose end is a
thread that leaves the ball low on the right. Everything is wool, plush without gloss, and takes
the wearer's colour.

    blender blender/cosmetics.blend --background --python blender/build_yarn_ball.py -- [--save] [--export]

Modelled in pet coordinates around the GRIP pose (hands at x ±0.92, y -0.4, z 0.82), which
HandHeld.tsx cancels out at rest, like the golden cup. The ball stays inside the hands' inner
edges (|x| 0.72) and in front of the belly. Three.js coordinates.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import blob, closed_sweep, merge, outward, problems, smooth, sweep  # noqa: E402

# The ball between the hands, in front of the belly (z 0.69 there).
CENTRE = Vector((0.0, -0.45, 1.0))
RADIUS = 0.3
# The windings: per axis rows of bundles round it, at these shares of the radius along the axis. A
# bundle is `strands` threads side by side, `gap` of the radius apart, each a round tube of
# `radius`. The first axis lies `lift` above the ball, each next one `layer` higher. `points` per
# full circle; a thread is kept where it lies in front of `back` of the radius behind the middle:
# that far round, its ends and their ink lie inside the ball's outline.
AXES = [(0.35, 1.0, 0.25), (1.0, -0.3, 0.35), (-0.55, 0.45, 0.7)]
ROWS = (-0.54, -0.18, 0.18, 0.54)
WIND = {"strands": 3, "gap": 0.076, "radius": 0.0115, "lift": 0.012, "layer": 0.011, "points": 34, "ring": 5, "back": -0.62}
# The loose end: from the ball's lower right down and out, curling at its end. Points (x, y, z)
# and the thread's radius.
THREAD = {"points": [(0.2, -0.66, 1.12), (0.36, -0.78, 1.1), (0.5, -0.74, 1.06), (0.5, -0.64, 1.04), (0.43, -0.62, 1.03)], "radius": 0.02}

# name -> (hex, glow, fluff, tint). Wool. The windings take the wearer's colour, the ball under
# them a darker shade of it, so the bands stand out.
SWATCH = {
    "Wollknäuel": ("#b8356b", 0.4, 0.5, 0.72),
    "Wollfaden": ("#e8508f", 0.5, 0.5, 1.0),
}


def strand(axis, share, lift):
    """One thread round `axis`, `share` of the radius along it, `lift` above the ball: the arc that
    faces the camera, one point past each end so the ends hide behind the ball."""
    axis = Vector(axis).normalized()
    side = axis.cross(Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))).normalized()
    reach = RADIUS + lift
    centre, radius = CENTRE + axis * (share * reach), reach * math.sqrt(1 - share * share)
    count = WIND["points"]
    circle = [centre + (side * math.cos(a) + axis.cross(side) * math.sin(a)) * radius for a in (2 * math.pi * k / count for k in range(count))]
    seen = [p.z - CENTRE.z > WIND["back"] * RADIUS for p in circle]
    r = WIND["radius"]
    if all(seen):
        return outward(closed_sweep(circle, r, r, ring_size=WIND["ring"], up=axis))
    # Start right after a hidden point, so the seen arc runs in one piece.
    start = next(k for k in range(count) if not seen[k - 1] and seen[k])
    arc = [k % count for k in range(start - 1, start + count) if seen[k % count] or seen[(k - 1) % count] or seen[(k + 1) % count]]
    arc = arc[: next(i for i in range(1, len(arc)) if not seen[arc[i]]) + 1]
    return outward(sweep([(circle[k], r, r) for k in arc], ring_size=WIND["ring"], cap_rings=2, up=axis))


def windings():
    """Every thread of every bundle, axis by axis, each axis a layer above the one before."""
    half = (WIND["strands"] - 1) / 2
    threads = []
    for layer, axis in enumerate(AXES):
        lift = WIND["lift"] + layer * WIND["layer"]
        for share in ROWS:
            threads.extend(strand(axis, share + (i - half) * WIND["gap"], lift) for i in range(WIND["strands"]))
    return merge(threads)


def thread():
    r = THREAD["radius"]
    return outward(sweep(smooth(THREAD["points"], [(r, r)] * len(THREAD["points"]), 28), ring_size=8, cap_rings=3))


def build(collection):
    """The ball, its windings and the loose end."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    ball = blob(CENTRE, (0, 0, 1), (0, 1, 0), (RADIUS,) * 3, ring=32, stacks=16)
    generator.add_mesh(collection, "yarn_ball", ball, mats["Wollknäuel"])
    threads = merge([windings(), thread()])
    generator.add_mesh(collection, "yarn_ball_thread", threads, mats["Wollfaden"])
    found = problems({"ball": ball, "threads": threads}, 0.05, held=True)
    print("CHECK", found or "ok")
    assert not found, found


generator.run("yarn-ball", "Hände", build, __file__)
