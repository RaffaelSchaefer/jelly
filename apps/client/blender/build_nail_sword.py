"""Builds `nail-sword`: a small sword shaped like a long nail, after the masked knight's weapon. A
straight blade cut in two facets along its ridge, the upper one pale, the lower one darker, with a
few nicks in its old edges, a short guard with two rivets and a ring step towards the blade, and a
short dark grip with a band of wrapping, a ring and a round steel knob. It goes with the hollow
helmet.

    blender blender/cosmetics.blend --background --python blender/build_nail_sword.py -- [--save] [--export]

The pet holds it in its left hand (index 0), lowered and pointing down and out like a knight at
rest. The app hangs the model on that hand (`ON_HANDS` in packages/jelly-scene/src/held.ts,
`HandWorn` in HandHeld.tsx), so it follows the hand but keeps its angle, and the right one stays
free to wave, point and think. It is modelled round the hand's centre along `AXIS`. Cosmetics are
painted over the hands, so the grip is left out where the fist closes round it: the hand shows
there and holds the sword. The parts are implicit surfaces like the kite shield's board, the
rivets domes. Within one paint layer only the outline gets ink, so the details live in their
colours. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import from_blender, merge, outward, polygon_sd, problems, puff, sd_chain  # noqa: E402

# The sword's axis seen from the front, in degrees from straight down towards -x: lowered and
# pointing away from the body. Distances along it count from the hand's centre, towards the tip,
# which stays inside the frame (|x| 1.85, y -1.05) with its ink. The hand is near the camera, so
# the pet window (384 px wide at 100 %) shows the tip further out: it keeps about 20 px to the
# window's edge and is cut off from a size of about 112 %, the kite shield from about 120 %.
AXIS = 48
# The blade: from `start` inside the ring step to the tip at `tip`, `half` wide each way at its foot
# and still `waist` at `taper` of its length, from where it runs to a long point, rounded by
# `round`. Its two facets rise flat from `edge` at the edges to `thick` at the ridge, each way.
BLADE = {"start": 0.245, "tip": 0.95, "half": 0.064, "waist": 0.057, "taper": 0.45, "round": 0.01, "thick": 0.03, "edge": 0.007}
# Nicks the old blade took in its edges: (along, side, radius), side -1 the upper edge, 1 the lower.
NICKS = [(0.46, -1, 0.016), (0.63, -1, 0.011), (0.55, 1, 0.013)]
# The guard, a short bar across, and the ring step in front of it: (from, to, half across), `deep`
# each way, edges rounded by `round`.
GUARD = {"span": (0.15, 0.21, 0.125), "deep": 0.048, "round": 0.015}
STEP_RING = {"span": (0.21, 0.255, 0.088), "deep": 0.052, "round": 0.018}
# Two domed rivets on the guard's face, either side of the blade, sunk a little into it.
RIVET = {"along": 0.18, "across": 0.085, "radius": 0.017, "half": 0.012, "sink": 0.004}
# The grip's end out of the fist as balls (along, radius); the fist covers the rest. Round it a
# band of wrapping (along, tube radius), then the pommel: a ring (along, radius, tube) and a knob.
# More bands would read as a screw thread at this size.
GRIP = [(-0.18, 0.036), (-0.25, 0.038)]
WRAPS = [(-0.214, 0.011)]
POMMEL_RING = (-0.262, 0.042, 0.013)
KNOB = (-0.3, 0.05)
# Where the fist closes round the grip: nothing within `FIST` of the hand's centre, so it shows.
FIST = 0.14
# Surface nets: the grid steps for big and for small parts and the air round each part; Decimate
# thins every part to its budget.
STEP, FINE, AIR = 0.004, 0.0025, 0.03
BUDGET = {"blade": 1100, "facet": 1100, "guard": 500, "ring": 450, "grip": 300, "wraps": 250, "pommel": 300, "knob": 300}
# Where that hand rests while the pet holds something (GRIP in jellyGeometry.ts), for the checks.
HAND_AT = (-0.92, -0.4, 0.82)
# What the face keeps clear round the windows: the ink and a little air.
ROOM = 0.05

# name -> (hex, glow). Deeper than they show: the app lightens every colour towards pastel. Pale
# and darker steel for the blade's facets, dark steel for the guard, a lighter one for ring step and
# pommel ring, light rivets and knob, a dark grip and its wrapping a shade lighter.
SWATCH = {
    "Nagelklinge": ("#c6cddb", 0.5),
    "Nagelfacette": ("#626c86", 0.4),
    "Nagelparier": ("#464f68", 0.3),
    "Nagelkragen": ("#66708b", 0.3),
    "Nagelniete": ("#c3cbd8", 0.5),
    "Nagelgriff": ("#262c3a", 0.3),
    "Nagelwicklung": ("#4a5268", 0.3),
}

ALONG = np.array([-math.sin(math.radians(AXIS)), -math.cos(math.radians(AXIS)), 0.0])
ACROSS = np.array([math.cos(math.radians(AXIS)), -math.sin(math.radians(AXIS)), 0.0])


def local(points):
    """Points in the sword's frame: along the axis, across it and in depth."""
    return points @ ALONG, points @ ACROSS, points[:, 2]


def grid(start, end, half, deep, step=STEP):
    """The surface nets box round a part from `start` to `end` along the axis, `half` across."""
    corners = np.array([ALONG * s + ACROSS * c for s in (start, end) for c in (-half, half)])
    low, high = corners.min(axis=0) - AIR, corners.max(axis=0) + AIR
    return {"low": (low[0], low[1], -deep - AIR), "high": (high[0], high[1], deep + AIR), "step": step}


def blade_side():
    """The blade's lower edge from its foot to the tip, as (along, half width) corners."""
    b = BLADE
    waist = b["start"] + (b["tip"] - b["start"]) * b["taper"]
    return [(b["start"], b["half"]), (waist, b["waist"]), (b["tip"] - b["round"], 0.0)]


def blade_sdf(points):
    """The blade: nearly parallel edges, then a long point, with nicks in the edges and two flat
    facets that meet at the ridge."""
    s, c, w = local(points)
    b = BLADE
    side = blade_side()
    outline = polygon_sd(s, c, [*side, *[(a, -h) for a, h in reversed(side[:-1])]]) - b["round"]
    edge_at = np.interp([along for along, _, _ in NICKS], *zip(*side))
    for (along, sign, radius), half in zip(NICKS, edge_at):
        outline = np.maximum(outline, radius - np.hypot(s - along, c - sign * (half + b["round"])))
    inward = np.clip(-outline / b["half"], 0, 1)
    return np.maximum(outline, np.abs(w) - (b["edge"] + (b["thick"] - b["edge"]) * inward))


def upper_facet_sdf(points):
    """The blade's upper facet, towards the light: the half on the upper side of the ridge."""
    return np.maximum(blade_sdf(points), local(points)[1])


def lower_facet_sdf(points):
    """The blade's lower facet, in the shade."""
    return np.maximum(blade_sdf(points), -local(points)[1])


def rounded_box(points, look):
    """A rounded block across the axis: `span` (from, to, half across), `deep` and `round`."""
    s, c, w = local(points)
    start, end, half = look["span"]
    q = np.abs(np.column_stack([s - (start + end) / 2, c, w])) - (np.array([(end - start) / 2, half, look["deep"]]) - look["round"])
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(axis=1), 0) - look["round"]


def ring_sdf(points, along, radius, tube):
    """A ring round the axis at `along`."""
    s, c, w = local(points)
    return np.hypot(np.hypot(c, w) - radius, s - along) - tube


def grip_sdf(points):
    """The grip's end out of the fist, into the pommel."""
    return sd_chain(points, [(*(ALONG * along), r) for along, r in [*GRIP, (KNOB[0], GRIP[-1][1])]])


def wraps_sdf(points):
    """The wrapping round the grip."""
    return np.minimum.reduce([ring_sdf(points, along, GRIP[0][1], tube) for along, tube in WRAPS])


def pommel_sdf(points):
    """The ring between grip and knob."""
    return ring_sdf(points, *POMMEL_RING)


def knob_sdf(points):
    """The round knob at the grip's end."""
    return np.linalg.norm(points - ALONG * KNOB[0], axis=1) - KNOB[1]


def rivets():
    """Both rivets, domes on the guard's face."""
    r = RIVET
    domes = [puff(ALONG * r["along"] + ACROSS * side + np.array([0, 0, GUARD["deep"] - r["sink"]]), (0, 0, 1), r["radius"], r["half"], ring_size=12, stacks=6) for side in (-r["across"], r["across"])]
    return outward(merge(domes))


def hand_problems(parts):
    """Vertices inside the fist, where the hand should show."""
    found = []
    for name, (verts, _) in parts.items():
        reach = np.hypot(*np.array(verts, float)[:, :2].T)
        if reach.min() < FIST:
            found.append(f"{name} {reach.min():.3f} from the hand's centre")
    return found


WRAP_OUT = GRIP[0][1] + WRAPS[0][1]
PARTS = {
    "blade": (upper_facet_sdf, "Nagelklinge", grid(BLADE["start"], BLADE["tip"], BLADE["half"], BLADE["thick"])),
    "facet": (lower_facet_sdf, "Nagelfacette", grid(BLADE["start"], BLADE["tip"], BLADE["half"], BLADE["thick"])),
    "guard": (lambda p: rounded_box(p, GUARD), "Nagelparier", grid(*GUARD["span"], GUARD["deep"])),
    "ring": (lambda p: rounded_box(p, STEP_RING), "Nagelkragen", grid(*STEP_RING["span"], STEP_RING["deep"])),
    "grip": (grip_sdf, "Nagelgriff", grid(KNOB[0], GRIP[0][0] + GRIP[0][1], GRIP[-1][1], GRIP[-1][1])),
    "wraps": (wraps_sdf, "Nagelwicklung", grid(WRAPS[-1][0] - WRAPS[-1][1], WRAPS[0][0] + WRAPS[0][1], WRAP_OUT, WRAP_OUT, FINE)),
    "pommel": (pommel_sdf, "Nagelkragen", grid(POMMEL_RING[0] - POMMEL_RING[2], POMMEL_RING[0] + POMMEL_RING[2], POMMEL_RING[1] + POMMEL_RING[2], POMMEL_RING[1] + POMMEL_RING[2], FINE)),
    "knob": (knob_sdf, "Nagelniete", grid(KNOB[0] - KNOB[1], KNOB[0] + KNOB[1], KNOB[1], KNOB[1])),
}


def build(collection):
    """Every part in its own material round the left hand, the rivets in the knob's steel."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    parts = {}
    for name, (sdf, mat, box) in PARTS.items():
        obj = generator.add_implicit(collection, f"nail_sword_{name}", sdf, box, mats[mat], BUDGET[name])
        parts[name] = ([from_blender(v.co) for v in obj.data.vertices], [])
    parts["rivets"] = rivets()
    generator.add_mesh(collection, "nail_sword_rivets", parts["rivets"], mats["Nagelniete"])
    # At rest in the pet's frame: the hand's place plus the model round it.
    resting = {name: ([Vector(v) + Vector(HAND_AT) for v in verts], faces) for name, (verts, faces) in parts.items()}
    found = problems(resting, ROOM) + hand_problems(parts)
    print("CHECK", found or "ok", {name: len(verts) for name, (verts, _) in parts.items()})
    assert not found, found


generator.run("nail-sword", "Hände", build, __file__)
