"""Builds `piercings`: a punk set of silver spikes and rings, laid out in clear groups.

Every spike points away from the centre it stands round. A row of spikes runs along the right edge
of the head (+x), tallest in the middle. Across from it the left side carries three spikes over the
eye and three rings evenly down the edge. Below the mouth sit snake bites, a spike under each corner
pointing down and out. White streaks along the spikes and dots on the beads make them read as
polished metal.

    blender blender/cosmetics.blend --background --python blender/build_piercings.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, blob, closed_sweep, merge, on_pet, outward, puff, sweep  # noqa: E402

EYE = (-0.19, 0.66)
# Over the left eye: spikes standing on a circle round the eye's centre at `reach`, above the pet's
# brow (0.13 over the eye) and clear of its pupil, at angles (0 is +x) with (length, base radius).
# Like every spike here they point away from the centre they stand round, leaning `lean` to the front.
BROW = {"reach": 0.2, "spikes": ((62, 0.06, 0.024), (92, 0.075, 0.029), (122, 0.06, 0.024)), "lift": 0.008, "lean": 0.1}
# The row along the right edge of the head, round the head's centre, tallest in the middle. The
# spikes stand `inset` inside the outline.
EDGE = {"spikes": ((-22, 0.08, 0.034), (-4, 0.105, 0.042), (14, 0.125, 0.048), (32, 0.105, 0.042), (50, 0.08, 0.034)), "inset": 0.035, "lean": 0.15}
# Snake bites: a stud left and right of the mouth's window (|x| < 0.12, 0.345 < y < 0.52), each
# spike pointing down and out (x, y share) and leaning towards the front.
BITES = {"at": (0.16, 0.41), "point": (0.4, -0.92), "lean": 0.1, "spike": (0.08, 0.027), "lift": 0.006}
# Rings through the left edge, evenly spaced: angles round the head's centre with (ring radius,
# tube), centred on the outline so half of each ring hangs outside it.
RINGS = {"rings": ((164, 0.052, 0.016), (184, 0.052, 0.016), (204, 0.052, 0.016)), "out": 0.0, "bead": 0.022}
# The spike's tip radius, how deep its ends round off (a flat foot, not a ball under the cone), its
# collar (share of the base radius across and deep) and how far up its flank the glint runs.
SPIKE = {"tip": 0.004, "cap": 0.007, "collar": (1.2, 0.3), "glint": (0.15, 0.6), "glint_angle": 40}
# White glints up and to the left on each ball: (share of the radius across, up) and their size.
GLINT = {"offset": (-0.35, 0.35), "size": 0.36, "half": 0.003}

# name -> (hex, glow). The app lightens every colour towards pastel: the silver is a mid blue-grey
# that reads as metal next to the white glints, the collars a darker steel so each spike stands on
# its own base.
SWATCH = {
    "Piercingsilber": ("#7d8799", 0.5),
    "Piercingstahl": ("#4a5163", 0.4),
    "Piercingglanz": ("#ffffff", 1.0),
}

FRONT = Vector((0, 0, 1))


def mat(name):
    return generator.material(name, *SWATCH[name])


def spike(base, axis, length, radius, count=6):
    """A cone from `base` along `axis`, rounded off at both ends so the outline stays whole: its
    mesh, its collar and the glint on its flank."""
    axis = Vector(axis).normalized()
    samples = []
    for i in range(count):
        t = i / (count - 1)
        r = max(radius * (1 - t) ** 1.15, SPIKE["tip"])
        samples.append((base + axis * (length * t), r, r))
    up = FRONT if abs(axis.dot(FRONT)) < 0.9 else Vector((0, 1, 0))
    cone = outward(sweep(samples, ring_size=10, cap_rings=3, cap=SPIKE["cap"], up=up))
    across, deep = SPIKE["collar"]
    collar = outward(puff(base, axis, radius * across, radius * deep, ring_size=12, stacks=5))
    return cone, collar, spike_glint(base, axis, length, radius)


def spike_glint(base, axis, length, radius):
    """A thin white streak along the spike's flank that faces the front, turned up and to the left."""
    toward = (FRONT - axis * FRONT.dot(axis)).normalized()
    side = axis.cross(toward)
    if side.dot(Vector((-1, 1, 0))) < 0:
        side = -side
    a = math.radians(SPIKE["glint_angle"])
    out = toward * math.cos(a) + side * math.sin(a)
    start, end = SPIKE["glint"]
    points = []
    for i in range(4):
        t = start + (end - start) * i / 3
        r = radius * (1 - t) ** 1.15
        points.append((base + axis * (length * t) + out * (r + 0.002), 0.22 * r + 0.002, 0.002))
    return outward(sweep(points, ring_size=6, cap_rings=2, up=out))


def ball_glint(centre, radius):
    """A small white dot on the front of a ball of `radius` round `centre`, up and to the left."""
    across, up = GLINT["offset"]
    spot = Vector((across * radius, up * radius, 0))
    out = spot + Vector((0, 0, math.sqrt(max(radius**2 - spot.length_squared, 0))))
    return outward(puff(centre + out, out, GLINT["size"] * radius, GLINT["half"], ring_size=12, stacks=4))


def brow_meshes():
    """The spikes standing round the left eye."""
    cx, cy = EYE
    spikes = []
    for angle, length, radius in BROW["spikes"]:
        a = math.radians(angle)
        out = Vector((math.cos(a), math.sin(a), 0))
        base = on_pet(cx + BROW["reach"] * out.x, cy + BROW["reach"] * out.y, BROW["lift"])
        spikes.append(spike(base, out + FRONT * BROW["lean"], length, radius))
    return spikes


def edge_meshes():
    """The row of spikes standing out of the right edge of the head."""
    spikes = []
    for angle, length, radius in EDGE["spikes"]:
        a = math.radians(angle)
        out = Vector((math.cos(a), math.sin(a), 0))
        reach = HEAD_R - EDGE["inset"]
        base = on_pet(reach * out.x, HEAD_Y + reach * out.y, 0)
        spikes.append(spike(base, out + FRONT * EDGE["lean"], length, radius))
    return spikes


def bite_meshes():
    """A spike under each corner of the mouth, pointing down and out."""
    x, y = BITES["at"]
    px, py = BITES["point"]
    length, radius = BITES["spike"]
    return [spike(on_pet(side * x, y, BITES["lift"]), Vector((side * px, py, BITES["lean"])), length, radius) for side in (-1, 1)]


def ring_meshes():
    """Rings hugging the left edge of the head, each with a bead at its bottom, and the beads' glints."""
    rings, beads, glints = [], [], []
    for angle, radius, tube in RINGS["rings"]:
        a = math.radians(angle)
        reach = HEAD_R + RINGS["out"]
        centre = on_pet(reach * math.cos(a), HEAD_Y + reach * math.sin(a), 0)
        centre.z = max(centre.z, 0.3)
        points = [centre + Vector((radius * math.cos(t), radius * math.sin(t), 0)) for t in (2 * math.pi * k / 24 for k in range(24))]
        rings.append(outward(closed_sweep(points, tube, tube, ring_size=10, up=FRONT)))
        at = centre + Vector((0, -radius, 0.004))
        beads.append(outward(blob(at, FRONT, (0, 1, 0), (RINGS["bead"],) * 3, ring=12, stacks=6)))
        glints.append(ball_glint(at, RINGS["bead"]))
    return rings, beads, glints


def build(collection):
    """Each group is its own object, the app lights each from its own lower edge. Spikes and rings
    in silver, the collars and beads in steel, the glints in white."""
    brow = brow_meshes()
    edge = edge_meshes()
    bites = bite_meshes()
    rings, beads, ring_glints = ring_meshes()
    silver, steel = mat("Piercingsilber"), mat("Piercingstahl")
    groups = {"brow": brow, "edge": edge, "bites": bites}
    for name, spikes in groups.items():
        cones = [cone for cone, _, _ in spikes]
        generator.add_mesh(collection, f"piercing_{name}", merge(cones), silver)
        generator.add_mesh(collection, f"piercing_{name}_collars", merge([collar for _, collar, _ in spikes]), steel)
    generator.add_mesh(collection, "piercing_rings", merge(rings), silver)
    generator.add_mesh(collection, "piercing_beads", merge(beads), steel)
    glints = [glint for spikes in groups.values() for _, _, glint in spikes] + ring_glints
    generator.add_mesh(collection, "piercing_glints", merge(glints), mat("Piercingglanz"))


generator.run("piercings", "Gesicht", build, __file__)
