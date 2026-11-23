"""Builds `kite-shield`: a Norman kite shield as on the Bayeux Tapestry, chubby and round enough to be
kawaii. A rounded top that tapers to a point below, curved round the body, painted red with a gold
cross, an iron boss where the arms cross and an iron rim with rivets all round. It goes with the
nasal helmet.

    blender blender/cosmetics.blend --background --python blender/build_kite_shield.py -- [--save] [--export]

The pet holds it in its left hand (index 0), like the paws round the origin: the app hangs the
model on that hand (`ON_HANDS` in packages/jelly-scene/src/held.ts, `HandWorn` in HandHeld.tsx), so
it follows the hand, and the right one stays free to wave, point and think. It is drawn below in a
frame of its own, as if held in front of the belly, and moved round the hand by `GRIP_AT` at the
end. The board and the paint are implicit surfaces like the Kamina glasses' lens, laid onto the
board's curved middle; rim, boss and rivets are tubes and domes. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import closed_sweep, from_blender, merge, outward, polygon_sd, problems, puff, ray_outline, sd_ellipsoid, smooth_union  # noqa: E402

# The outline seen from the front: the top half of an ellipse (half sizes `a` and `b` round
# `centre`) with straight sides down to the tip, rounded by `round`. Taller than wide like a kite
# shield, chubbier than one. The frame has the hand at its resting height (y -0.4), so the tip stays
# above the frame's bottom (y -1.05).
KITE = {"a": 0.53, "b": 0.44, "centre": -0.18, "tip": -1.02, "round": 0.08}
# The board's middle bends back towards its sides like a real one round the body (`across`) and a
# little towards top and tip (`along`), from `front` at the centre; it is `half` thick each way.
BOARD = {"front": 0.98, "across": 0.36, "along": 0.08, "half": 0.03}
# Surface nets: the box round the board and its grid step; Decimate thins it to its budget.
BOARD_GRID = {"low": (-0.58, -1.04, 0.78), "high": (0.58, 0.3, 1.04), "step": 0.007}
BOARD_BUDGET = 1600
# The iron rim: a round tube along the edge, its middle `inset` inside the outline.
RIM = {"radius": 0.046, "inset": 0.03, "points": 144, "ring": 12}
# The painted cross: arms `half` wide each way with round ends, crossing at the boss. It lies `lift`
# on the board's face, `thick` each way.
CROSS = {"half": 0.07, "reach": 0.38, "top": 0.14, "bottom": -0.8, "lift": 0.003, "thick": 0.008}
CROSS_GRID = {"low": (-0.56, -0.9, 0.85), "high": (0.56, 0.24, 1.05), "step": 0.005}
CROSS_BUDGET = 900
# The boss over the crossing and the rivets round the rim, every `step` of its points: the points
# are a multiple of it, so the rivets space evenly.
BOSS = {"radius": 0.13, "half": 0.085}
RIVET = {"step": 12, "radius": 0.027, "half": 0.017}
# Where the left hand grips, in the shield's frame: behind the board's middle below the boss, like
# the straps of a real one. The model is moved so this point is its origin. The board's back stays in
# front of the hand, whose thumb reaches `THUMB` from its centre; the shield hides it.
GRIP_AT = (0.0, -0.4, 0.66)
THUMB = 0.26
# Where that hand rests while the pet holds something (GRIP in jellyGeometry.ts), for the checks.
HAND_AT = (-0.92, -0.4, 0.82)
# What the face keeps clear round the windows: the ink and a little air.
ROOM = 0.05

# name -> (hex, glow, fluff, tint). Deeper than they show: the app lightens every colour towards
# pastel. Red and gold as the crown's, the iron like the nasal helmet's steel. The field takes the
# wearer's colour.
SWATCH = {
    "Schildrot": ("#c81e3a", 0.15, None, 1),
    "Schildgold": ("#ffb400", 0.3),
    "Schildeisen": ("#3a4256", 0.3),
    "Schildbuckel": ("#4b556e", 0.3),
    "Schildniete": ("#c3cbd8", 0.5),
}


def kite_corners(shrink):
    """Where the straight sides leave the ellipse, and the tip, for the outline shrunk by `shrink`:
    the sides move in by `shrink`, so the tip moves up by `shrink` over the sine of its half angle."""

    def touch(a, b, tip):
        # The sides are tangents from the tip to the ellipse; they touch where sin t = -b / height.
        t = math.asin(-b / (KITE["centre"] - tip))
        return a * math.cos(t), KITE["centre"] + b * math.sin(t)

    x, y = touch(KITE["a"], KITE["b"], KITE["tip"])
    tip = KITE["tip"] + shrink / math.sin(math.atan2(x, y - KITE["tip"]))
    return touch(KITE["a"] - shrink, KITE["b"] - shrink, tip), (0.0, tip)


def kite_sd(points):
    """Signed 2D distance to the outline (negative inside), from x and y of `points`."""
    r = KITE["round"]
    (x, y), tip = kite_corners(r)
    top = sd_ellipsoid(np.column_stack([points[:, 0], points[:, 1], np.zeros(len(points))]), (0, KITE["centre"], 0), (KITE["a"] - r, KITE["b"] - r, 1))
    sides = polygon_sd(points[:, 0], points[:, 1], [(x, y), (-x, y), tip])
    return np.minimum(top, sides) - r


def middle(x, y):
    """The board's middle surface: z at x and y."""
    return BOARD["front"] - BOARD["across"] * x * x - BOARD["along"] * (y - KITE["centre"]) ** 2


def board_sdf(points):
    """The board: the outline, `half` thick round its curved middle."""
    return np.maximum(kite_sd(points), np.abs(points[:, 2] - middle(points[:, 0], points[:, 1])) - BOARD["half"])


def cross_sd(x, y):
    """Signed 2D distance to the cross: two capsules through the boss."""
    centre = KITE["centre"]
    across = np.hypot(np.maximum(np.abs(x) - CROSS["reach"], 0), y - centre)
    along = np.hypot(x, np.maximum(np.maximum(y - CROSS["top"], CROSS["bottom"] - y), 0))
    return smooth_union(across, along, 0.03) - CROSS["half"]


def cross_sdf(points):
    """The paint of the cross, a thin layer on the board's face with soft edges."""
    x, y, z = points[:, 0], points[:, 1], points[:, 2]
    face = middle(x, y) + BOARD["half"] + CROSS["lift"] + CROSS["thick"]
    return np.maximum(cross_sd(x, y), np.abs(z - face) - CROSS["thick"])


def on_board(x, y, lift):
    """The point `lift` in front of the board's face at x and y, and the face's normal there."""
    step = 1e-3
    normal = Vector((-(middle(x + step, y) - middle(x - step, y)) / (2 * step), -(middle(x, y + step) - middle(x, y - step)) / (2 * step), 1)).normalized()
    return Vector((x, y, middle(x, y) + BOARD["half"] + lift)), normal


def rim_loop():
    """The rim's middle line: the outline `inset` inside, on the board's middle."""
    loop = ray_outline(lambda p: kite_sd(p) + RIM["inset"], (0.0, KITE["centre"]), RIM["points"], reach=1.2)
    return [Vector((x, y + KITE["centre"], middle(x, y + KITE["centre"]))) for x, y in loop]


def rivets(loop):
    """Domes on the rim's front, every few points round it, starting at the top."""
    out = []
    top = max(range(len(loop)), key=lambda i: loop[i].y)
    for i in range(top, top + len(loop), RIVET["step"]):
        p = loop[i % len(loop)]
        _, normal = on_board(p.x, p.y, 0)
        out.append(puff(p + normal * (RIM["radius"] * 0.92), normal, RIVET["radius"], RIVET["half"], ring_size=10, stacks=5))
    return merge(out)


def to_hand(mesh_data):
    """A part from the shield's frame round the gripping hand."""
    verts, faces = mesh_data
    return [Vector(v) - Vector(GRIP_AT) for v in verts], faces


def implicit_at_hand(collection, name, sdf, grid, mat, budget):
    """An implicit part from the shield's frame, meshed round the gripping hand."""
    grip = np.array(GRIP_AT)
    box = {"low": tuple(np.array(grid["low"]) - grip), "high": tuple(np.array(grid["high"]) - grip), "step": grid["step"]}
    obj = generator.add_implicit(collection, name, lambda points: sdf(points + grip), box, mat, budget)
    return [from_blender(v.co) for v in obj.data.vertices], []


def hand_problems():
    """Where the board's back comes closer to the hand than its thumb reaches."""
    x, y = np.meshgrid(np.linspace(-THUMB, THUMB, 27) + GRIP_AT[0], np.linspace(-THUMB, THUMB, 27) + GRIP_AT[1])
    x, y = x.ravel(), y.ravel()
    near = (np.hypot(x - GRIP_AT[0], y - GRIP_AT[1]) < THUMB) & (kite_sd(np.column_stack([x, y, np.zeros_like(x)])) < 0)
    gap = middle(x[near], y[near]) - BOARD["half"] - GRIP_AT[2]
    return [f"board's back {gap.min():.3f} in front of the hand"] if gap.min() < THUMB else []


def build(collection):
    """Board, cross, rim, boss and rivets, one material each, round the left hand."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    parts = {
        "board": implicit_at_hand(collection, "kite_shield_board", board_sdf, BOARD_GRID, mats["Schildrot"], BOARD_BUDGET),
        "cross": implicit_at_hand(collection, "kite_shield_cross", cross_sdf, CROSS_GRID, mats["Schildgold"], CROSS_BUDGET),
    }
    loop = rim_loop()
    centre, normal = on_board(0.0, KITE["centre"], CROSS["lift"])
    for name, mesh, mat in (
        ("rim", outward(closed_sweep(loop, RIM["radius"], RIM["radius"], RIM["ring"], up=Vector((0, 0, 1)))), "Schildeisen"),
        ("boss", puff(centre, normal, BOSS["radius"], BOSS["half"], ring_size=32, stacks=12), "Schildbuckel"),
        ("rivets", outward(rivets(loop)), "Schildniete"),
    ):
        parts[name] = to_hand(mesh)
        generator.add_mesh(collection, f"kite_shield_{name}", parts[name], mats[mat])
    # At rest in the pet's frame: the hand's place plus the model round it.
    resting = {name: ([v + Vector(HAND_AT) for v in verts], faces) for name, (verts, faces) in parts.items()}
    found = problems(resting, ROOM) + hand_problems()
    print("CHECK", found or "ok", {name: len(verts) for name, (verts, _) in parts.items()})
    assert not found, found


generator.run("kite-shield", "Hände", build, __file__)
