"""Builds `crown`: a small, chunky golden crown for the LAN's royalty, worn for one LAN only.

A puffy gold band with a big ruby heart and two teal gems, five rounded points in a deeper gold
with pearls on their tips and a red velvet cushion inside. It sits askew, tipped forward and to
one side.

    blender blender/cosmetics.blend --background --python blender/build_crown.py -- [--save] [--export]

Every part is built upright around the head's centre, on the head taken as a ball, then tilted and
squashed by the head's depth (`place`), so the crown hugs the oval head. Three.js coordinates.
"""
import math
import os
import sys

from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_DEPTH, HEAD_R, HEAD_Y, HEAD_Z, polygon, puff, resample, skin  # noqa: E402

# Forward: the app camera sits below the head top; tipped forward, it sees the band from above, so
# the back of the ring stays behind the front band instead of showing under it. Side: charm, +x down.
TILT = {"forward": math.radians(13), "side": math.radians(8)}
# Heights run along the crown's axis from the head's centre; the head is a ball of radius 0.62.
# The band's section is a rounded square (`power`), so its front shows gold, not only gloss; it
# dips 0.015 into the ball, so the band hugs the head.
BAND = {"radius": 0.38, "height": 0.573, "radial": 0.055, "half": 0.085, "power": 2.8}
# The points rise from the band's inner half and flare outwards like a classic crown. They touch
# at the band's top edge (`valley`), so together they read as one zigzag.
POINT = {"radius": 0.335, "base": 0.53, "valley": 0.655, "width": 0.41, "half": 0.042, "bulge": 0.06, "round": 128, "flare": 0.2}
# (angle from the front in degrees, height of the pearl). Seen from the front, the two back points
# show between the three in front, like the crown emoji; the sides sit a little forward of 72
# degrees so they show their face, not their edge. The tilt lifts the back and the -x side, so
# those are shorter: the speech bubble starts at y 1.6.
POINTS = [(0, 0.95), (66, 0.85), (-66, 0.85), (147, 0.78), (-147, 0.78)]
PEARL = 0.05
HEART = {"size": 0.078, "half": 0.034, "sink": 0.006}
GEMS = {"angles": (-33, 33), "radius": 0.047, "half": 0.03, "sink": 0.009}
# The velvet cap fills the ring: its underside lies on the head ball, its rim hides in the band and
# its cushion swells into the gaps between the points.
CAP = {"radius": 0.345, "dome": 0.25, "power": 3.5}
# name -> (hex, glow). The pet's canvas tone-maps with ACES filmic: a bright yellow such as #ffc93c
# turns to butter there and its white lower edge to beige. Gold reads as gold with an orange base,
# no blue and a low glow: the band shows about #e8c23b, the points #df9d1c.
SWATCH = {
    "Kronengold": ("#ffb400", 0.3),
    "Kronenzacken": ("#e08a00", 0.4),
    "Kronenperle": ("#fff3dc", 1.0),
    "Kronenrubin": ("#e8264a", 0.3),
    "Kronentürkis": ("#0fa59b", 0.35),
    "Kronensamt": ("#b0103a", 0.25),
}


def place(mesh_data):
    """Tilts an upright part around the head's centre and squashes it onto the oval head."""
    verts, faces = mesh_data
    turn = Matrix.Rotation(TILT["forward"], 3, "X") @ Matrix.Rotation(-TILT["side"], 3, "Z")
    placed = []
    for v in verts:
        p = turn @ Vector(v)
        placed.append(Vector((p.x, HEAD_Y + p.y, HEAD_Z + p.z * HEAD_DEPTH)))
    return placed, faces


def around(angle, radius, height):
    """The point at `angle` (degrees from the front, towards +x) on a circle round the axis."""
    a = math.radians(angle)
    return Vector((radius * math.sin(a), height, radius * math.cos(a)))


def squircle(t, power):
    """(cos, sin) of angle `t` on a superellipse: power 2 is a circle, higher gets squarer."""
    c, s = math.cos(t), math.sin(t)
    return math.copysign(abs(c) ** (2 / power), c), math.copysign(abs(s) ** (2 / power), s)


def bend(mesh_data, angle, radius, height, flare=0.0):
    """Wraps a flat part (x along the crown, y up, z out) round the axis at `angle`, leaning out by `flare`."""
    verts, faces = mesh_data
    return [around(angle + math.degrees(v.x / radius), radius + v.z + flare * v.y, height + v.y) for v in verts], faces


def pillow(outline, half, power=3.0, ring_size=40, stacks=5, passes=16):
    """A puffy slab from a closed outline: flat faces and rims as round as it is thick."""
    boundary = resample(outline, ring_size, passes)
    rings = []
    for i in range(-stacks + 1, stacks):
        scale, z = squircle(i / stacks * math.pi / 2, power)
        rings.append([Vector((x * scale, y * scale, half * z)) for x, y in boundary])
    return skin(rings, ring_size, Vector((0, 0, -half)), Vector((0, 0, half)))


def band_mesh(count=64, ring_size=18):
    """The band: a closed tube round the head with a rounded-square section."""
    section = [squircle(2 * math.pi * j / ring_size, BAND["power"]) for j in range(ring_size)]
    verts = [around(360 * k / count, BAND["radius"] + BAND["radial"] * c, BAND["height"] + BAND["half"] * s) for k in range(count) for c, s in section]
    faces = []
    for k in range(count):
        n = (k + 1) % count
        for j in range(ring_size):
            m = (j + 1) % ring_size
            faces.append((k * ring_size + j, n * ring_size + j, n * ring_size + m, k * ring_size + m))
    return verts, faces


def point_mesh(angle, pearl_at):
    """A house-shaped point: its foot hidden in the band, above it a gumdrop up into its pearl."""
    w = POINT["width"] / 2
    low = POINT["base"] - POINT["valley"]
    tip = pearl_at - POINT["valley"] - 0.3 * PEARL  # the tip ends inside the pearl
    side = w * (0.5 + POINT["bulge"])
    corners = [(-w, low), (w, low), (w, 0.0), (side, tip / 2), (0.0, tip), (-side, tip / 2), (-w, 0.0)]
    # Evenly spaced first, so the smoothing rounds every corner alike.
    outline = resample(resample(polygon(corners, 120), 240, 0), 240, POINT["round"])
    slab = pillow(outline, POINT["half"], power=3.5, ring_size=48, stacks=4, passes=0)
    return bend(slab, angle, POINT["radius"], POINT["valley"], POINT["flare"])


def cap_mesh(ring_size=28):
    """The velvet cap: rings out along the head ball to its rim, then up its dome to the top."""
    seat = math.sqrt(HEAD_R**2 - CAP["radius"] ** 2)
    under = [(r, math.sqrt(HEAD_R**2 - r**2)) for r in (CAP["radius"] * k / 4 for k in range(1, 4))]
    dome = [(CAP["radius"] * c, seat + CAP["dome"] * s) for c, s in (squircle(math.pi / 2 * k / 8, CAP["power"]) for k in range(8))]
    rings = [[around(360 * j / ring_size, r, y) for j in range(ring_size)] for r, y in under + dome]
    return skin(rings, ring_size, Vector((0, HEAD_R, 0)), Vector((0, seat + CAP["dome"], 0)))


def heart_outline(size, samples=96):
    """A heart `size` wide on each side, counter-clockwise, centred on its middle."""
    out = []
    for k in range(samples):
        t = -2 * math.pi * k / samples
        y = (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 16
        out.append((size * math.sin(t) ** 3, size * (y + 0.15)))
    return out


def build(collection):
    """Cap, band, points with their pearls, heart and gems: one object and one material each."""
    mats = {name: generator.material(name, hex_color, glow) for name, (hex_color, glow) in SWATCH.items()}
    generator.add_mesh(collection, "crown_cap", place(cap_mesh()), mats["Kronensamt"])
    generator.add_mesh(collection, "crown_band", place(band_mesh()), mats["Kronengold"])
    for k, (angle, pearl_at) in enumerate(POINTS):
        generator.add_mesh(collection, f"crown_point_{k}", place(point_mesh(angle, pearl_at)), mats["Kronenzacken"])
        flared = POINT["radius"] + POINT["flare"] * (pearl_at - POINT["valley"])
        pearl = puff(around(angle, flared, pearl_at), (0, 1, 0), PEARL, PEARL, ring_size=16, stacks=10)
        generator.add_mesh(collection, f"crown_pearl_{k}", place(pearl), mats["Kronenperle"])
    front = BAND["radius"] + BAND["radial"]
    heart = pillow(heart_outline(HEART["size"]), HEART["half"], power=2.6, passes=20)
    generator.add_mesh(collection, "crown_heart", place(bend(heart, 0, front - HEART["sink"], BAND["height"])), mats["Kronenrubin"])
    for k, angle in enumerate(GEMS["angles"]):
        gem = puff(around(angle, front - GEMS["sink"], BAND["height"]), around(angle, 1, 0), GEMS["radius"], GEMS["half"], power=2.2, ring_size=16, stacks=8)
        generator.add_mesh(collection, f"crown_gem_{k}", place(gem), mats["Kronentürkis"])


generator.run("crown", "Kopf", build, __file__)
