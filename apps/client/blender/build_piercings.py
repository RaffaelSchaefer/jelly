"""Builds `piercings`: a cute little set of silver face piercings.

A curved barbell follows the brow line above the pet's right eye (+x), a ball on each end. A chunky
hoop with a pink bead at the bottom hangs at the left corner of the mouth (-x), and a small pink
heart stud sits on the right cheek below the blush. White glints make the balls read as polished
metal and gem.

    blender blender/cosmetics.blend --background --python blender/build_piercings.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import badge, blob, closed_sweep, head_normal, merge, on_pet, outward, polygon, puff, sweep  # noqa: E402

EYE = (0.19, 0.66)
# The barbell: an arc round the eye's centre at `reach`, from `start` to `end` degrees (0 is +x). The
# pupil reaches about 0.113 from the eye's centre where it can wander; `reach` minus the ball's
# radius and the 0.035 ink keeps clear of it.
BROW = {"reach": 0.2, "start": 108, "end": 56, "bar": 0.018, "ball": 0.034, "lift": 0.016, "count": 14}
# The hoop: a ring of `radius` round `centre` with a fat `tube`, so it reads as a silver donut round
# a dot of ink at small size; an open ring would need a hole wider than twice the ink. Its fill ends
# just left of x -0.12, where the speaking mouth starts (|x| < 0.12, 0.345 < y < 0.52), so the ink
# just touches the smile's corner (-0.087, 0.495), and stays below the left pupil's reach. The bead
# sits on it at `angle` degrees.
HOOP = {"centre": (-0.179, 0.452), "radius": 0.035, "tube": 0.022, "lift": 0.016, "count": 32}
BEAD = {"angle": -90, "radius": 0.025, "lift": 0.032}
# The heart stud: below the right cheek's blush (0.33, 0.54; 0.075 by 0.045), its ink clear of it,
# tilted a little. Its glint sits on the left lobe at `glint` (across, up, size) in shares of its radius.
HEART = {"at": (0.29, 0.415), "radius": 0.05, "half": 0.018, "lift": 0.02, "roll": -14, "glint": (-0.42, 0.42, 0.26)}
# White glints up and to the left on each ball: (share of the radius across, up) and their size.
GLINT = {"offset": (-0.35, 0.35), "size": 0.36, "half": 0.003}

# name -> (hex, glow). The app lightens every colour towards pastel: the silver is a mid blue-grey
# that reads as metal next to the white glints, the gem deeper than it shows.
SWATCH = {
    "Piercingsilber": ("#7d8799", 0.5),
    "Piercingstein": ("#d42a6e", 0.5),
    "Piercingglanz": ("#ffffff", 1.0),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def ball(x, y, radius, lift):
    """A sphere resting `lift` in front of the head at (x, y): its centre and mesh."""
    centre = on_pet(x, y, lift)
    return centre, outward(blob(centre, (0, 0, 1), (0, 1, 0), (radius, radius, radius), ring=16, stacks=8))


def glint(centre, radius):
    """A small white dot on the front of a ball of `radius` round `centre`, up and to the left."""
    across, up = GLINT["offset"]
    spot = Vector((across * radius, up * radius, 0))
    out = spot + Vector((0, 0, math.sqrt(max(radius**2 - spot.length_squared, 0))))
    return outward(puff(centre + out, out, GLINT["size"] * radius, GLINT["half"], ring_size=12, stacks=4))


def arc(centre, radius, start, end, count, lift):
    """Points on the head along a circle round `centre` (x, y), from `start` to `end` degrees."""
    cx, cy = centre
    out = []
    for i in range(count):
        a = math.radians(start + (end - start) * i / (count - 1))
        out.append(on_pet(cx + radius * math.cos(a), cy + radius * math.sin(a), lift))
    return out


def brow_meshes():
    """The curved bar, its two balls and their glints."""
    points = arc(EYE, BROW["reach"], BROW["start"], BROW["end"], BROW["count"], BROW["lift"])
    bar = outward(sweep([(p, BROW["bar"], BROW["bar"]) for p in points], ring_size=12, cap_rings=3))
    balls, glints = [bar], []
    for p in (points[0], points[-1]):
        centre, mesh = ball(p.x, p.y, BROW["ball"], BROW["lift"])
        balls.append(mesh)
        glints.append(glint(centre, BROW["ball"]))
    return merge(balls), glints


def hoop_meshes():
    """The hoop, its bead and the bead's glint."""
    # The last point would repeat the first one: the loop closes by itself.
    points = arc(HOOP["centre"], HOOP["radius"], 0, 360, HOOP["count"] + 1, HOOP["lift"])[:-1]
    hoop = outward(closed_sweep(points, HOOP["tube"], HOOP["tube"], ring_size=12, up=Vector((0, 0, 1))))
    a = math.radians(BEAD["angle"])
    cx, cy = HOOP["centre"]
    centre, bead = ball(cx + HOOP["radius"] * math.cos(a), cy + HOOP["radius"] * math.sin(a), BEAD["radius"], BEAD["lift"])
    return hoop, bead, glint(centre, BEAD["radius"])


def heart_outline(samples=48, lift=0.1):
    """A plump heart about unit size, its point down; `lift` centres its mass round (0, 0)."""
    out = []
    for k in range(samples):
        t = 2 * math.pi * k / samples
        out.append((math.sin(t) ** 3, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 16 + lift))
    return out


def heart_meshes():
    """The heart stud facing out of the cheek, and its glint."""
    x, y = HEART["at"]
    centre = on_pet(x, y, HEART["lift"])
    normal = head_normal(centre)
    heart = badge(polygon(heart_outline(), 2), centre, normal, HEART["radius"], HEART["half"], ring_size=40, passes=2, roll=math.radians(HEART["roll"]))
    # In the heart's own plane, like `badge` lays it out, and just in front of its face.
    side = Vector((0, 1, 0)).cross(normal).normalized()
    rise = normal.cross(side)
    across, up, size = HEART["glint"]
    at = centre + (side * across + rise * up) * HEART["radius"] + normal * (HEART["half"] + GLINT["half"])
    return outward(heart), outward(puff(at, normal, size * HEART["radius"], GLINT["half"], ring_size=12, stacks=4))


def build(collection):
    """Barbell and hoop in silver, bead and heart in pink, the glints in white.

    Barbell and hoop stay two objects: the app lights each part from its own lower edge.
    """
    brow, brow_glints = brow_meshes()
    hoop, bead, bead_glint = hoop_meshes()
    heart, heart_glint = heart_meshes()
    silver = mat("Piercingsilber")
    generator.add_mesh(collection, "piercing_brow", brow, silver)
    generator.add_mesh(collection, "piercing_hoop", hoop, silver)
    generator.add_mesh(collection, "piercing_gems", merge([bead, heart]), mat("Piercingstein"))
    generator.add_mesh(collection, "piercing_glints", merge([*brow_glints, bead_glint, heart_glint]), mat("Piercingglanz"))


generator.run("piercings", "Gesicht", build, __file__)
