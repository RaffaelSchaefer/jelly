"""Builds `party-hat`: a stubby sunny cone perched jauntily on the head, wound with raised teal
candy stripes, a fluffy pink pompom on the tip and a scalloped cream ruffle where it meets the head.

    blender blender/cosmetics.blend --background --python blender/build_party_hat.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_DEPTH, HEAD_R, HEAD_Y, HEAD_Z, head_normal, loop_skin, skin  # noqa: E402

# Seat on the head and lean of the cone as (degrees towards +x, degrees towards the front).
# Seated forward of the crown, the foot rises towards the back: the app's camera looks up at the
# hat (~12 deg), so it sees over the foot instead of under it, and nothing behind shows below it.
SEAT = (14, 31)
LEAN = (27, 12)
FOOT_R = 0.25  # the foot's radius around the cone's axis
HEIGHT = 0.285  # from the seat to the tip along the axis
BULGE = 0.85  # the radius falls as (1 - s) ** BULGE: below 1 the sides bulge like a gumdrop
SINK = 0.012  # the foot and the cap under it sit this far inside the head
CONE_RING, CONE_ROWS, CAP_ROWS = 48, 18, 2

# Candy stripes in the cone's (s, angle) frame: s runs from the foot (0) to the tip (1).
STRIPES = 3
# The ends narrow to a quarter over `fade` (hidden under ruffle and pompom); `taper` thins them towards the tip.
STRIPE = {"phase": 0.5, "half": 0.45, "twist": 2.4, "from": 0.03, "to": 0.9, "fade": 0.05, "lift": 0.003, "rise": 0.016, "taper": 0.6}
STRIPE_RING, STRIPE_ROWS = 12, 26

# The ruffle lies on the head around the foot: from `tuck` under the cone out to `reach`, scalloped.
RUFFLE = {"tuck": 0.05, "reach": 0.08, "scallop": 0.5, "lobes": 12, "lift": 0.006, "thick": 0.032, "puff": 0.35, "samples": 120}
# Centred on the tip, which ends inside it: `lumps` round domes of about `cap` degrees.
POMPOM = {"radius": 0.145, "lumps": 36, "cap": 19, "vary": 0.15, "depth": 0.085}

# Deeper than they show: the app's gloss, lower glow and tone mapping lighten every colour towards
# pastel. The glow is dampened for the same reason.
YELLOW, TEAL, PINK, CREAM = "#ffbf1f", "#0f8f86", "#f0457f", "#fff3dc"
GLOW = 0.35


def tilt(aside, forward):
    """Up, tipped `aside` degrees towards +x and `forward` degrees towards the front."""
    a, f = math.radians(aside), math.radians(forward)
    return Vector((math.sin(a), math.cos(a) * math.cos(f), math.cos(a) * math.sin(f)))


def inside(p):
    """Negative inside the head's ellipsoid, positive outside."""
    return (p.x / HEAD_R) ** 2 + ((p.y - HEAD_Y) / HEAD_R) ** 2 + ((p.z - HEAD_Z) / (HEAD_R * HEAD_DEPTH)) ** 2 - 1


def land(p, direction, sink=SINK):
    """Where the line through `p` along `direction` leaves the head, moved `sink` back inside."""
    low, high = -0.6, 0.6
    for _ in range(40):
        mid = (low + high) / 2
        low, high = (mid, high) if inside(p + direction * mid) < 0 else (low, mid)
    return p + direction * (low - sink)


AXIS = tilt(*LEAN)
SEAT_AT = land(Vector((0, HEAD_Y, HEAD_Z)) + tilt(*SEAT) * HEAD_R, tilt(*SEAT))
TIP = SEAT_AT + AXIS * HEIGHT
SIDE = AXIS.cross(Vector((0, 0, 1))).normalized()
FRONT = SIDE.cross(AXIS)


def radial(phi):
    """The direction away from the cone's axis at angle `phi` (0 towards +x, pi/2 to the front)."""
    return SIDE * math.cos(phi) + FRONT * math.sin(phi)


def foot(phi):
    """The foot at angle `phi`: FOOT_R from the axis, landed on the head along the axis."""
    return land(SEAT_AT + radial(phi) * FOOT_R, AXIS)


def cone_at(s, phi):
    """The cone's surface at height `s` (0 at the foot, 1 at the tip) and angle `phi`."""
    down = foot(phi) - TIP
    axial = AXIS * down.dot(AXIS)
    return TIP + axial * (1 - s) + (down - axial) * (1 - s) ** BULGE


def cone_normal(s, phi, step=1e-3):
    """The cone's outward normal at (s, phi)."""
    along = cone_at(s + step, phi) - cone_at(s - step, phi)
    return along.cross(cone_at(s, phi + step) - cone_at(s, phi - step)).normalized()


def angles(count):
    """`count` angles evenly around a full turn."""
    return [2 * math.pi * j / count for j in range(count)]


def cone_mesh():
    """The cone from just below the tip down to its foot, closed by a cap that lies on the head."""
    feet = [foot(phi) for phi in angles(CONE_RING)]
    rings = [[cone_at(1 - i / CONE_ROWS, phi) for phi in angles(CONE_RING)] for i in range(1, CONE_ROWS + 1)]
    for k in range(1, CAP_ROWS + 1):
        shrink = 1 - k / (CAP_ROWS + 1)
        rings.append([land(SEAT_AT + (f - SEAT_AT) * shrink, AXIS) for f in feet])
    return skin(rings, CONE_RING, TIP, land(SEAT_AT, AXIS))


def stripe_mesh(phase):
    """A raised candy stripe winding up the cone; its rings bend onto the cone like a decal."""
    s0, s1 = STRIPE["from"], STRIPE["to"]
    step = (s1 - s0) / (STRIPE_ROWS - 1)

    def lifted(s, width, height):
        phi = phase + STRIPE["twist"] * s + width
        return cone_at(s, phi) + cone_normal(s, phi) * (STRIPE["lift"] + height)

    rings = []
    for s in (s0 + step * i for i in range(STRIPE_ROWS)):
        fade = min(1.0, 0.25 + min(s - s0, s1 - s) / STRIPE["fade"])
        rise = STRIPE["rise"] * fade * (1 - STRIPE["taper"] * s)
        rings.append([lifted(s, STRIPE["half"] * fade * math.cos(a), rise * math.sin(a)) for a in angles(STRIPE_RING)])
    return skin(rings, STRIPE_RING, lifted(s0 - step, 0, 0), lifted(s1 + step, 0, 0))


def ruffle_mesh(ring_size=10):
    """A scalloped collar that lies on the head around the foot, its inner edge tucked under the cone."""
    rings = []
    for phi in angles(RUFFLE["samples"]):
        at = foot(phi)
        up = head_normal(at)
        out = (radial(phi) - up * radial(phi).dot(up)).normalized()
        # |cos| makes round lobes with notches between them; a lobe sits at the front (phi = pi/2).
        wave = abs(math.cos(RUFFLE["lobes"] * phi / 2)) ** 0.7
        reach = RUFFLE["reach"] * (1 - RUFFLE["scallop"] * (1 - wave))
        mid, half = (reach - RUFFLE["tuck"]) / 2, (reach + RUFFLE["tuck"]) / 2
        thick = RUFFLE["thick"] * (1 - RUFFLE["puff"] * (1 - wave))  # puffy lobes, thin notches
        ring = []
        for a in angles(ring_size):
            p = land(at + out * (mid + half * math.cos(a)), up, 0.0)
            ring.append(p + head_normal(p) * (RUFFLE["lift"] + thick * math.sin(a)))
        rings.append(ring)
    return loop_skin(rings)


def pompom_mesh():
    """A yarn pompom on the tip: an icosphere swollen by round domes around a spread of lumps."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)  # Blender counts from 1: 642 vertices
    bm.verts.index_update()
    directions = [v.co.copy() for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    golden, count = math.pi * (3 - math.sqrt(5)), POMPOM["lumps"]
    lumps = []
    for k in range(count):
        y = 1 - 2 * (k + 0.5) / count
        at = Vector((math.cos(golden * k) * math.sqrt(1 - y * y), y, math.sin(golden * k) * math.sqrt(1 - y * y)))
        lumps.append((at, math.radians(POMPOM["cap"]) * (1 + POMPOM["vary"] * math.sin(2.4 * k))))
    verts = []
    for d in directions:
        # The highest dome over d wins: round knobs with creases between them, like the beanie's pompom.
        dome = math.sqrt(max(0.0, *(1 - (d.angle(at) / cap) ** 2 for at, cap in lumps)))
        verts.append(TIP + d * POMPOM["radius"] * (1 + POMPOM["depth"] * (2 * dome - 1)))
    return verts, faces


def build(collection):
    """Cone, stripes, ruffle and pompom, one material each."""
    add = generator.add_mesh
    add(collection, "party_hat_cone", cone_mesh(), generator.material("Partygelb", YELLOW, GLOW, tint=1))
    teal = generator.material("Partytürkis", TEAL, GLOW)
    for k in range(STRIPES):
        add(collection, f"party_hat_stripe_{k}", stripe_mesh(STRIPE["phase"] + 2 * math.pi * k / STRIPES), teal)
    add(collection, "party_hat_ruffle", ruffle_mesh(), generator.material("Rüschencreme", CREAM))
    add(collection, "party_hat_pompom", pompom_mesh(), generator.material("Bommelrosa", PINK, GLOW))


generator.run("party-hat", "Kopf", build, __file__)
