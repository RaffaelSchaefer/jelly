"""Builds `octopus`: a small chibi octopus that sits on the upper side of the pet's head, tilted,
and pulses. A big round head, glossy with a painted glint, and under its chin six short, chubby
tentacles that fan out like a drawn one's and curl up at their tips. Its face sits low on
the head: round eyes with glints set wide apart, rosy cheeks and a small smile.

It is built upright on the head's top and then turned round the head's front-back axis by `TILT`
towards +x, so it leans like a hat worn askew.

Head and tentacles are one piece, an implicit surface of an ellipsoid and round cones with soft
seams, like the plush kitten, but glossy like the pet. The face lies on it as cushions. Its motion
is not in the model: in `COSMETIC_LOOKS` (cosmetic.ts) `pulse` squashes, stretches and rocks it
round its seat like jelly and `wave` lets the tentacles sway from the rim of its head on, while the
pet moves. Both name points of this model, turned, and `pulse` its lean: after a change to `TILT`
or `MANTLE` they move too.

    blender blender/cosmetics.blend --background --python blender/build_octopus.py -- [--save] [--export]

Modelled on the reference pet in pet coordinates; head cosmetics bob with the head. The tentacles
lie in one plane facing the camera: the app draws it over the head like a sticker, and ones behind
would show through. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import (  # noqa: E402
    HEAD_Y, dome, from_blender, head_z, merge, outward, problems, ray_onto, sd_chain,
    sd_ellipsoid, sdf_decal, sdf_gradient, smooth, smooth_union, sweep, unit_rows,
)

# How far the upright octopus is turned to the side, in degrees towards +x. Its seat, where the
# head's top ends up, is the point of its `pulse` in `COSMETIC_LOOKS` (cosmetic.ts).
TILT = 35
# The rest is upright, on the head's top: the octopus's round head, its foot just sunk into the
# pet's head. Round seen from the front, so turning leaves it as it is.
MANTLE = {"at": (0.0, 1.45, 0.36), "size": (0.195, 0.195, 0.19)}
# The tentacles fan out from `root` under its chin in its own plane, like a drawn one's: those at
# +x, mirrored. Each leaves at `angle` (degrees from straight down, towards +x), bends outwards by
# `bend` degrees over its `length`, its radius from start to end, then curls up by `turn` of a full
# turn on a circle of radius `curl`, thinning to `tip`. Where one would dip into the pet's head it
# moves to the front, `gap` above it. Turned, they stay outside the windows of the pet's eyes and
# cheeks.
TENTACLES = [
    {"angle": 20, "bend": 8, "length": 0.2, "radius": (0.058, 0.036), "curl": 0.042, "turn": 0.55, "tip": 0.018},
    {"angle": 60, "bend": 12, "length": 0.24, "radius": (0.058, 0.036), "curl": 0.046, "turn": 0.6, "tip": 0.018},
    {"angle": 100, "bend": 14, "length": 0.26, "radius": (0.058, 0.034), "curl": 0.05, "turn": 0.65, "tip": 0.017},
]
TENTACLE = {"root": (0.0, 1.27, 0.38), "gap": 0.008, "path": 7, "curl_points": 10}
# How soft the seam is where the tentacles melt into the head and into each other.
SEAM = 0.02
# Surface nets: the box round the turned piece and its grid step; Decimate thins it to its budget.
GRID = {"low": (-0.12, 0.8, 0.0), "high": (0.98, 1.52, 0.9), "step": 0.006}
BUDGET = 3200

# The face looks down at the camera a little. Parts on it sit at (turn to the side, up) in radians
# from the face's middle, cast onto the dome from its centre.
FACE = (0.0, -0.18, 1.0)
EYES = {"turn": 0.4, "up": -0.05, "size": (0.063, 0.074), "half": 0.016, "lift": -0.002}
# The lighter iris in the lower half of each eye, as an offset (across, up) from its middle and half
# sizes; it lies on the eye's dome and makes it look deep and wet.
IRIS = {"offset": (0.0, -0.03), "size": (0.045, 0.03), "half": 0.003, "lift": 0.013}
# Glints per eye: offsets (across, up) from its middle and radii, floating above it. A big one up
# to the side, a small one opposite and a tiny third.
GLINTS = [((-0.021, 0.028), 0.026), ((0.024, -0.03), 0.012), ((0.031, 0.008), 0.006)]
GLINT = {"half": 0.004, "lift": 0.017}
CHEEKS = {"turn": 0.56, "up": -0.4, "size": (0.042, 0.026), "half": 0.005, "lift": 0.003}
# The smile: points as (turn, up) for its right half, mirrored, a flat stroke on the head.
MOUTH = {"points": [(0.0, -0.25), (0.035, -0.243), (0.066, -0.222)], "width": 0.009, "thick": 0.003, "lift": 0.0015}
# The painted glint high on the head's left, as on a drawn one: (turn, up), half sizes (across, up)
# and how far it leans, in degrees.
SHINES = [((-0.5, 0.62), (0.055, 0.03), 35), ((-0.78, 0.36), (0.017, 0.014), 0)]
SHINE = {"half": 0.003, "lift": 0.002}
# What the face keeps clear round the windows: the ink and a little air.
ROOM = 0.05

# name -> (hex, glow, fluff, tint). Deeper than they show: the app lightens every colour towards
# pastel. The body takes the wearer's colour, the iris the one opposite to it.
SWATCH = {
    "Krakenrosa": ("#ff5f86", 0.35, None, 1),
    "Krakenauge": ("#1d1630", 0.1),
    "Krakenblick": ("#a14bd6", 0.4, None, -1),
    "Krakenglanz": ("#fffaf0", 1.0),
    "Krakenwange": ("#ff1452", 0.25),
    "Krakenmund": ("#2a1626", 0.1),
}

def unit(vector):
    vector = np.asarray(vector, float)
    return vector / np.linalg.norm(vector)


def ellipse(rx, ry, samples=32, lean=0.0):
    """An ellipse round (0, 0), turned clockwise by `lean` degrees."""
    c, s = math.cos(math.radians(lean)), math.sin(math.radians(lean))
    points = ((rx * math.cos(a), ry * math.sin(a)) for a in (2 * math.pi * k / samples for k in range(samples)))
    return [(x * c + y * s, y * c - x * s) for x, y in points]


def turned(points, degrees=TILT):
    """Points (numpy, last axis x y z) turned round the head's front-back axis towards +x."""
    p = np.array(points, float)
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    x, y = p[..., 0].copy(), p[..., 1] - HEAD_Y
    p[..., 0], p[..., 1] = x * c + y * s, HEAD_Y - x * s + y * c
    return p


def turned_way(direction):
    """A direction turned like the octopus."""
    return turned(np.asarray(direction, float) + (0, HEAD_Y, 0)) - (0, HEAD_Y, 0)


def tentacle_balls(spec, side):
    """Balls (x, y, z, radius) along one tentacle on `side` (1 or -1), turned and in front of the pet."""
    root = np.array(TENTACLE["root"])
    count = TENTACLE["path"]
    flat = []  # (x, y) from the root, upright, and the radius there
    for i in range(count):
        t = i / (count - 1)
        angle = math.radians(spec["angle"] + spec["bend"] * t * 0.5)
        reach = spec["length"] * t
        flat.append((reach * math.sin(angle), -reach * math.cos(angle), spec["radius"][0] + (spec["radius"][1] - spec["radius"][0]) * t))
    # The curl: on a circle that touches the end, centred on its upper side, shrinking as it goes.
    (px, py, _), (ex, ey, _) = flat[-2], flat[-1]
    along = unit((ex - px, ey - py))
    up = np.array((along[1], -along[0]))
    centre = np.array((ex, ey)) + up * spec["curl"]
    for k in range(1, TENTACLE["curl_points"] + 1):
        u = k / TENTACLE["curl_points"]
        angle = 2 * math.pi * spec["turn"] * u
        x, y = centre + (-up * math.cos(angle) + along * math.sin(angle)) * spec["curl"] * (1 - 0.35 * u)
        flat.append((x, y, spec["radius"][1] + (spec["tip"] - spec["radius"][1]) * u))
    balls = []
    for x, y, radius in flat:
        point = turned(root + (side * x, y, 0.0))
        point[2] = max(point[2], head_z(point[0], point[1]) + radius + TENTACLE["gap"])
        balls.append((*point, radius))
    return balls


TENTACLE_BALLS = [tentacle_balls(spec, side) for spec in TENTACLES for side in (1, -1)]
# The octopus's own up, for the face's parts.
UP = tuple(turned_way((0.0, 1.0, 0.0)))


def octopus_sdf(points):
    """Signed distance to the turned octopus: head and tentacles."""
    out = sd_ellipsoid(points, turned(MANTLE["at"]), MANTLE["size"])
    for balls in TENTACLE_BALLS:
        out = smooth_union(out, sd_chain(points, balls), SEAM)
    return out


def on_face(turn, up):
    """The point on the head `turn` to the side and `up` from the face's middle, and its normal."""
    face = unit(FACE)
    side = unit((face[2], 0, -face[0]))
    rise = np.cross(face, side)
    direction = unit(face + side * math.tan(turn) + rise * math.tan(up))
    start = turned(np.asarray(MANTLE["at"]) + direction * 0.6)
    point = ray_onto(octopus_sdf, [start], turned_way(-direction), 0.6)
    return point[0], unit_rows(sdf_gradient(octopus_sdf, point))[0]


def eye_meshes():
    """Per eye the dark dome, the lighter iris below and its glints."""
    eyes, irises, glints = [], [], []
    for side in (-1, 1):
        at, normal = on_face(side * EYES["turn"], EYES["up"])
        eyes.append(sdf_decal(octopus_sdf, at, normal, ellipse(*EYES["size"]), EYES["lift"], EYES["half"], up=UP))
        across = unit(np.cross(UP, normal))
        rise = np.cross(normal, across)
        (u, v) = IRIS["offset"]
        irises.append(sdf_decal(octopus_sdf, at + across * u + rise * v, normal, ellipse(*IRIS["size"], 24), IRIS["lift"], IRIS["half"], dome(2), up=UP))
        for (u, v), r in GLINTS:
            glints.append(sdf_decal(octopus_sdf, at + across * u + rise * v, normal, ellipse(r, r, 16), GLINT["lift"], GLINT["half"], dome(3), up=UP))
    return merge(eyes), merge(irises), merge(glints)


def cheek_mesh():
    """The rosy cheeks below and outside the eyes. They go onto the head along the face's own way:
    along the head's normal, which points down there, they would land on the tentacles below."""
    cheeks = []
    for side in (-1, 1):
        at, _ = on_face(side * CHEEKS["turn"], CHEEKS["up"])
        cheeks.append(sdf_decal(octopus_sdf, at, turned_way(unit(FACE)), ellipse(*CHEEKS["size"], 24), CHEEKS["lift"], CHEEKS["half"], dome(3), up=UP, reach=0.07))
    return merge(cheeks)


def mouth_mesh():
    """The smile: a flat stroke across the head between the cheeks."""
    right = MOUTH["points"]
    path = [(-t, u) for t, u in reversed(right[1:])] + right
    section = (MOUTH["width"], MOUTH["thick"])

    def laid(turn, up):
        at, normal = on_face(turn, up)
        return Vector(at + normal * MOUTH["lift"])

    # Flat towards the camera: `sweep` lays the depth along `up`.
    return outward(sweep(smooth([laid(*p) for p in path], [section] * len(path), 16), ring_size=8, cap_rings=2))


def shine_mesh():
    """The painted glints high on the head."""
    shines = []
    for (turn, up), size, lean in SHINES:
        at, normal = on_face(turn, up)
        shines.append(sdf_decal(octopus_sdf, at, normal, ellipse(*size, 24, lean), SHINE["lift"], SHINE["half"], dome(3), up=UP))
    return merge(shines)


def build(collection):
    """The octopus and its face."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    body = generator.add_implicit(collection, "octopus", octopus_sdf, GRID, mats["Krakenrosa"], BUDGET)
    eyes, irises, glints = eye_meshes()
    parts = {
        "octopus_eyes": (eyes, "Krakenauge"),
        "octopus_irises": (irises, "Krakenblick"),
        "octopus_glints": (merge([glints, shine_mesh()]), "Krakenglanz"),
        "octopus_cheeks": (cheek_mesh(), "Krakenwange"),
        "octopus_mouth": (mouth_mesh(), "Krakenmund"),
    }
    for name, (mesh_data, material) in parts.items():
        generator.add_mesh(collection, name, mesh_data, mats[material])
    found = problems({"octopus": ([from_blender(v.co) for v in body.data.vertices], []), **{name: part[0] for name, part in parts.items()}}, ROOM)
    print("CHECK", found or "ok", len(body.data.vertices))
    assert not found, found


generator.run("octopus", "Kopf", build, __file__)
