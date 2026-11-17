"""Builds `hood`: a cozy green hoodie hood that frames the face. A thick soft shell with a little peak
hangs down past the cheeks, a gathered rolled rim runs around the face and swells into a collar under
the chin, and two cream drawstrings with chunky green tips hang onto the belly.

The app paints a cosmetic over the pet like a sticker, so the hood is a frame seen from the front:
nothing sits behind the face opening, and the shell stops where its inside would show through it.

    blender blender/cosmetics.blend --background --python blender/build_hood.py -- [--save] [--export]
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_DEPTH, HEAD_R, HEAD_Y, HEAD_Z, head_normal, loop_skin, puff, ring_at, smooth, sweep  # noqa: E402

# Deeper than it shows: the app's gloss, lower glow and tone mapping lighten every colour, a light
# green ends up mint. The glow is dampened for the same reason.
GREEN, ROLL, CORD = "#18b04f", "#0f8a3c", "#fff3dc"
GLOW = 0.3
# The rim's centre line on the head, seen from the front: an oval whose inner edge, outline included,
# clears the brows, eyes, blush and mouth.
OPENING = {"y": 0.585, "half": 0.495, "top": 0.38, "bottom": 0.365, "power": 2.0}
# How far back the shell reaches (degrees from the head's front axis) per elevation around the face
# (degrees, 90 is the top). Over the top it covers what the stage sees from above, but stops before
# its inside would peek out under the rim's top in the app, whose camera looks up at the head.
BACK = {-90: 60, -60: 76, -30: 78, 0: 74, 45: 112, 90: 132}
# The outer face lies on this envelope around the head centre: a gumdrop, round on top and squarer
# below, so the sides hang down past the cheeks instead of hugging the jaw like a helmet.
ENVELOPE = {"x": 0.76, "top": 0.78, "bottom": 0.62, "z": 0.62, "power": 3.2}
# A soft point where the hood peaks, leaning back from the top.
PEAK = {"height": 0.07, "sharp": 12, "tilt": 8}
# The rim's half sizes (across, deep) per elevation: fat under the chin, where it is the collar.
RIM = {-90: (0.125, 0.1), -45: (0.1, 0.08), 0: (0.074, 0.062), 90: (0.066, 0.056)}
# Shell thickness under the rim and at the far back edge, where it thins from `taper` degrees on so
# its edge hugs the head; `lift` keeps its inside off the head.
SHELL = {"front": 0.07, "back": 0.035, "lift": 0.006, "taper": 105, "rings": 64}
# Past `from` degrees the head turns away from a three-quarter view, and an inside hugging it would
# face that camera through the face opening: at the sides it slants off by `rate` (per radian²), but
# leaves the shell at least `lip` thick.
FLARE = {"from": 54, "until": 80, "rate": 0.6, "lip": 0.05}
SECTION = {"inner": 6, "cap": 4, "outer": 16}  # points per cross-section: inside, each lip, outside
RIM_SAMPLES, RIM_RING = 108, 14
# The drawstring gathers the rim into soft puffs: (count, depth).
GATHER = (12, 0.05)
# Drawstrings from under the collar onto the belly, one a little longer: points (x, y, z) per side.
CORDS = {
    "right": [(0.18, 0.13, 0.6), (0.205, 0.0, 0.565), (0.232, -0.13, 0.61)],
    "left": [(-0.18, 0.13, 0.6), (-0.196, -0.02, 0.56), (-0.207, -0.19, 0.64)],
}
CORD_R = 0.04
TIP_SIZE = {"radius": 0.064, "half": 0.09}


def smoothstep(a, b, x):
    """0 below `a`, 1 above `b`, eased in between."""
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def head_point(psi, phi, offset):
    """The point `offset` above the head, `psi` from its front axis and `phi` around that axis."""
    scale = HEAD_R + offset
    across, depth = scale * math.sin(psi), scale * HEAD_DEPTH * math.cos(psi)
    return Vector((across * math.cos(phi), HEAD_Y + across * math.sin(phi), HEAD_Z + depth))


def opening_psi(phi):
    """Where the rim's centre line crosses direction `phi`, as an angle from the head's front axis."""
    o = OPENING
    lo, hi = 0.0, HEAD_R
    for _ in range(32):
        rho = (lo + hi) / 2
        x, y = rho * math.cos(phi), HEAD_Y + rho * math.sin(phi) - o["y"]
        b = o["top"] if y > 0 else o["bottom"]
        if (abs(x) / o["half"]) ** o["power"] + (abs(y) / b) ** o["power"] < 1:
            lo = rho
        else:
            hi = rho
    return math.asin(lo / HEAD_R)


def by_elevation(table, phi):
    """Eases between the entries of `table` at direction `phi`; both halves of the hood match."""
    keys = sorted(table)
    elevation = math.degrees(math.asin(max(-1.0, min(1.0, math.sin(phi)))))
    k = sum(1 for key in keys[1:-1] if key <= elevation)
    u = smoothstep(keys[k], keys[k + 1], elevation)
    a, b = table[keys[k]], table[keys[k + 1]]
    if isinstance(a, tuple):
        return tuple(x + (y - x) * u for x, y in zip(a, b))
    return a + (b - a) * u


def envelope(psi, phi):
    """How far the envelope stands above the head towards (psi, phi)."""
    e = ENVELOPE
    v = (math.sin(psi) * math.cos(phi), math.sin(psi) * math.sin(phi), HEAD_DEPTH * math.cos(psi))
    power = 2 + (e["power"] - 2) * smoothstep(0, -0.6, v[1])
    axes = (e["x"], e["top"] if v[1] > 0 else e["bottom"], e["z"])
    reach = sum((abs(c) / a) ** power for c, a in zip(v, axes)) ** (-1 / power)
    tilt = math.radians(PEAK["tilt"])
    toward = (v[1] * math.cos(tilt) - v[2] * math.sin(tilt)) / math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
    return reach - HEAD_R + PEAK["height"] * max(0.0, toward) ** PEAK["sharp"]


def thickness(psi, phi, front, back):
    """The shell's outer offset: rising from the rim to the envelope, thinner where it reaches far back."""
    s = SHELL
    d = s["front"] + (envelope(psi, phi) - s["front"]) * smoothstep(0, 0.4, (psi - front) / (back - front))
    taper = math.radians(s["taper"])
    return d + (s["back"] - d) * smoothstep(taper, back, psi) if back > taper else d


def inside(psi, phi, outer):
    """The inner face's offset: on the head, slanting off it towards the back edge at the sides."""
    f = FLARE
    beyond = min(psi, math.radians(f["until"])) - math.radians(f["from"])
    slant = smoothstep(0.5, 0.87, abs(math.cos(phi))) * f["rate"] * max(0.0, beyond) ** 2
    return max(SHELL["lift"], min(SHELL["lift"] + slant, outer - f["lip"]))


def lip(psi, bottom, top, sign):
    """A round end at `psi`: a half circle from `bottom` up to `top` (sign 1) or back down (-1)."""
    radius = (top - bottom) / 2
    out = []
    for k in range(1, SECTION["cap"] + 1):
        theta = math.pi * k / (SECTION["cap"] + 1)
        reach = radius * math.sin(theta) / (HEAD_R + bottom + radius)
        out.append((psi + sign * reach, bottom + radius - sign * radius * math.cos(theta)))
    return out


def section(phi):
    """The shell's closed cross-section towards `phi`: inner face on the head, lip, outer face, edge."""
    front, back = opening_psi(phi), math.radians(by_elevation(BACK, phi))
    n = SECTION
    profile = []
    for k in range(n["inner"]):
        psi = front + (back - front) * k / (n["inner"] - 1)
        profile.append((psi, inside(psi, phi, thickness(psi, phi, front, back))))
    outer = thickness(back, phi, front, back)
    profile += lip(back, inside(back, phi, outer), outer, 1)
    for k in range(n["outer"]):
        psi = back - (back - front) * k / (n["outer"] - 1)
        profile.append((psi, thickness(psi, phi, front, back)))
    outer = thickness(front, phi, front, back)
    profile += lip(front, inside(front, phi, outer), outer, -1)
    return [head_point(psi, phi, d) for psi, d in profile]


def shell():
    """The hood's shell, swept clockwise around the face so its normals face out."""
    count = SHELL["rings"]
    return loop_skin([section(-2 * math.pi * i / count) for i in range(count)])


def rim():
    """The rolled rim: a closed tube around the face that swells into a collar under the chin."""
    count = RIM_SAMPLES
    samples = []
    for i in range(count):
        phi = 2 * math.pi * i / count
        h, w = by_elevation(RIM, phi)
        puffy = 1 + GATHER[1] * math.cos(GATHER[0] * (phi - math.pi / 2))
        h, w = h * puffy, w * puffy
        samples.append((head_point(opening_psi(phi), phi, SHELL["lift"] + w), h, w))
    rings = []
    for i, (center, h, w) in enumerate(samples):
        tangent = (samples[(i + 1) % count][0] - samples[i - 1][0]).normalized()
        normal = head_normal(center)
        b = (normal - tangent * normal.dot(tangent)).normalized()
        rings.append(ring_at(center, b.cross(tangent), b, h, w, RIM_RING))
    return loop_skin(rings)


def cord(points):
    """A drawstring along `points`, with its chunky tip continuing the way it hangs."""
    samples = smooth(points, [(CORD_R, CORD_R)] * len(points), 14)
    end = samples[-1][0]
    direction = (end - samples[-2][0]).normalized()
    center = end + direction * TIP_SIZE["half"] * 0.85
    tip = puff(center, direction, TIP_SIZE["radius"], TIP_SIZE["half"], power=2.8, ring_size=16, stacks=10)
    return sweep(samples, ring_size=10, cap_rings=4, up=Vector((0, 0, 1))), tip


def build(collection):
    """Shell, rim with collar, and both drawstrings with their tips."""
    generator.add_mesh(collection, "hood_shell", shell(), generator.material("Kapuzengrün", GREEN, glow=GLOW))
    roll, string = generator.material("Kapuzensaum", ROLL, glow=GLOW), generator.material("Kordel", CORD)
    generator.add_mesh(collection, "hood_rim", rim(), roll)
    for side, points in CORDS.items():
        mesh, aglet = cord(points)
        generator.add_mesh(collection, f"hood_cord_{side}", mesh, string)
        generator.add_mesh(collection, f"hood_tip_{side}", aglet, roll)


generator.run("hood", "Kopf", build, __file__)
