"""Builds `schnoerbi-mask`: a golden face plate with a round, split beak and a bushy brow over each eye.

The plate is two puffy gold loops round the eyes that merge between them, with a rosy cheek below
each eye. Below the middle sits a little round beak, an upper and a lower half, over the mouth. On
top of each loop a small tuft of plump locks curls up and out.

    blender blender/cosmetics.blend --background --python blender/build_schnoerbi_mask.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import head_z, loop_skin, puff, strand  # noqa: E402

EYE = (0.19, 0.66)
# The hole keeps clear of the pupil (0.058 by 0.084) wherever it looks (±0.035, ±0.022).
HOLE = {"rx": 0.12, "ry": 0.13}
# The plate's outer edge round each eye: it reaches past the middle, so both loops merge into one
# plate, and is shorter below, so the corners of the mouth stay free.
OUTER = {"rx": 0.235, "up": 0.215, "down": 0.19}
# A pillow across the band (`power` 2 is round, higher gets flatter on top), `lid` thickens it over
# the eye.
PLATE = {"half": 0.028, "lid": 0.012, "lift": 0.012, "power": 2.6, "loop": 56, "ring": 12}
# The beak is a ball split across: the upper half arches over a slightly smaller lower half that
# sits a little back. It covers the mouth like a mask's beak would; the pet still talks behind it.
BEAK = {"up": 0.515, "forward": 0.04, "across": 0.102, "high": 0.096, "deep": 0.085, "split": 0.51}
LOWER_SCALE, LOWER_BACK = 0.95, 0.012
FLAT = 0.18  # how far the cut side of each half still bulges, as a share of its height
# The brow over the +x eye; the mirror adds the other: a small fluffy tuft of a few plump locks that
# curl outwards. A lock is (root on the loop in degrees round the eye from +x, distance of the root
# from the eye's centre, lean out from straight up in degrees, length). The locks lie on the plate
# (`lift`) and end round: thin points catch the app's gloss and turn silver.
BROW = [(112, 0.2, -12, 0.075), (98, 0.205, 4, 0.1), (84, 0.205, 20, 0.11), (70, 0.2, 36, 0.095), (57, 0.19, 52, 0.07)]
BROW_SECTIONS = [(0.05, 0.02), (0.046, 0.019), (0.036, 0.015), (0.024, 0.011)]  # (across, deep)
BROW_LIFT = 0.05
CURL = 0.7  # how far a lock bends further out towards its tip, in radians
# A rosy cheek on the plate below the outer corner of each eye: (angle round the eye, distance,
# half width, half height).
BLUSH = (-42, 0.165, 0.044, 0.03)

# name -> (hex, glow). The app lightens every colour towards pastel: the gold and the beak are
# deeper than they show, like the crown's.
SWATCH = {
    "Maskengold": ("#f5a300", 0.3),
    "Schnabeloben": ("#ff7a00", 0.25),
    "Schnabelunten": ("#f05200", 0.25),
    "Buschcreme": ("#fff1d6", 1.0),
    "Bäckchen": ("#ff6f9c", 0.6),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def spow(value, exponent):
    return math.copysign(abs(value) ** exponent, value)


def outward(mesh_data):
    """Flips the faces if they point inwards: the outline pushes the mesh out along its normals."""
    verts, faces = mesh_data
    volume = sum(Vector(verts[f[0]]).dot(Vector(verts[f[i]]).cross(Vector(verts[f[i + 1]]))) for f in faces for i in range(1, len(f) - 1))
    return (verts, faces) if volume > 0 else (verts, [tuple(reversed(f)) for f in faces])


def plate_mesh():
    """The +x loop: across the band a pillow from the hole to the outer edge, laid onto the head."""
    ex, ey = EYE
    rings = []
    for i in range(PLATE["loop"]):
        t = 2 * math.pi * i / PLATE["loop"]
        c, s = math.cos(t), math.sin(t)
        inner = Vector((ex + HOLE["rx"] * c, ey + HOLE["ry"] * s))
        outer = Vector((ex + OUTER["rx"] * c, ey + (OUTER["up"] if s > 0 else OUTER["down"]) * s))
        half = PLATE["half"] + PLATE["lid"] * max(s, 0) ** 2
        ring = []
        for j in range(PLATE["ring"]):
            a = 2 * math.pi * j / PLATE["ring"]
            across = (spow(math.cos(a), 2 / PLATE["power"]) + 1) / 2
            p = inner.lerp(outer, across)
            ring.append(Vector((p.x, p.y, head_z(p.x, p.y) + PLATE["lift"] + half * spow(math.sin(a), 2 / PLATE["power"]))))
        rings.append(ring)
    return outward(loop_skin(rings))


def beak_mesh(upper):
    """One half of the beak ball; the other side of the cut is pressed flat."""
    scale = 1 if upper else LOWER_SCALE
    centre = Vector((0, BEAK["up"], head_z(0, BEAK["up"]) + BEAK["forward"] - (0 if upper else LOWER_BACK)))
    verts, faces = puff(centre, (0, -0.2, 1), BEAK["across"] * scale, BEAK["deep"] * scale, power=2.2, radius2=BEAK["high"] * scale)
    cut, sign = BEAK["split"], 1 if upper else -1
    pressed = [Vector((v.x, cut + (v.y - cut) * FLAT, v.z)) if (v.y - cut) * sign < 0 else v for v in map(Vector, verts)]
    return pressed, faces


def brow_strand(angle, reach, lean, length):
    """One strand of the brow: from the loop up and out along the head, bending further out."""
    a = math.radians(angle)
    root = (EYE[0] + reach * math.cos(a), EYE[1] + reach * math.sin(a))
    points = []
    for t in (0, 0.35, 0.7, 1):
        turn = math.radians(lean) + CURL * t
        points.append((root[0] + math.sin(turn) * length * t, root[1] + math.cos(turn) * length * t))
    return strand(points, BROW_SECTIONS, BROW_LIFT, ring_size=8, count=8)


def blush_mesh():
    """A flat rosy oval lying on the plate."""
    angle, reach, wide, high = BLUSH
    x, y = EYE[0] + reach * math.cos(math.radians(angle)), EYE[1] + reach * math.sin(math.radians(angle))
    top = head_z(x, y) + PLATE["lift"] + PLATE["half"]
    return puff((x, y, top), (x * 0.5, y - 0.66, 1), wide, 0.006, power=2.5, radius2=high)


def merge(meshes):
    verts, faces = [], []
    for mesh_verts, mesh_faces in meshes:
        offset = len(verts)
        verts.extend(mesh_verts)
        faces.extend(tuple(i + offset for i in face) for face in mesh_faces)
    return verts, faces


def build(collection):
    """Plate, the two halves of the beak and the brows, one material each; the mirror adds the left side."""
    generator.add_mesh(collection, "mask_plate", plate_mesh(), mat("Maskengold"), mirror=True)
    generator.add_mesh(collection, "mask_beak_lower", beak_mesh(False), mat("Schnabelunten"))
    generator.add_mesh(collection, "mask_beak_upper", beak_mesh(True), mat("Schnabeloben"))
    brow = merge(brow_strand(*hair) for hair in BROW)
    generator.add_mesh(collection, "mask_brow", brow, mat("Buschcreme"), mirror=True)
    generator.add_mesh(collection, "mask_blush", blush_mesh(), mat("Bäckchen"), mirror=True)


generator.run("schnoerbi-mask", "Gesicht", build, __file__)
