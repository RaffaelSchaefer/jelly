"""Builds `nasal-helmet`: a Norman nasal helmet in polished steel, without the mail. A pointed skull
with a soft ridge from the front over the top to the back, a darker brow band with rivets round its
foot and a nasal that runs from a riveted trefoil on the brow down between the eyes.

The app's camera sits below the head (y 0.1) and looks up at the helmet. A level rim would show the
inside of its back under the front, so the rim rises towards the back. It dips at the temples, in
front of the head's outline, where nothing behind it can show underneath.

    blender blender/cosmetics.blend --background --python blender/build_nasal_helmet.py -- [--save] [--export]

Skull, band and rivets are built round the head's centre on the head taken as a ball and squashed by
the head's depth (`place`), like the crown, so the helmet hugs the oval head. The nasal is an
implicit surface like the Kamina glasses' lens, laid onto the helmet's front. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_DEPTH, HEAD_R, HEAD_Y, HEAD_Z, from_blender, loop_skin, merge, outward, polygon_sd, problems, puff, skin, smooth_union, spow  # noqa: E402

# The skull: a shell `thick` round the head ball that runs into a cone up to the apex (its height
# above the head's centre). `bulge` (degrees, above 0) rounds the cone's sides out. The apex stays
# under the speech bubble at y 1.6 with its ink. Its foot ends `foot` above the rim, inside the band,
# and it closes along the head ball `sink` inside it.
SKULL = {"thick": 0.035, "apex": 0.895, "bulge": 20, "foot": 0.035, "sink": 0.012, "ring": 72, "rows": 22, "cap_rows": 4}
# The soft ridge from the front over the top to the back: how far it swells (share of the radius),
# its width in degrees and the heights over which it grows in, above band and trefoil.
RIDGE = {"rise": 0.035, "width": 8, "from": 0.47, "full": 0.62}
# The rim's height above the head's centre by angle from the front: over the brows at `front`, down
# by `drop` round the face to the temples (`drop_from` to `drop_to` degrees), where it covers the
# head's sides, then up by `back` towards the back (`rise_from` to `rise_to`). Behind the head's
# outline it only rises, so the back stays hidden behind the front. Its ink stays clear of the eyes
# and of the brows, which expressions lift to about y 0.84.
RIM = {"front": 0.245, "drop": 0.2, "drop_from": 15, "drop_to": 84, "back": 0.36, "rise_from": 86, "rise_to": 165}
# The brow band: its height from the rim up, how far it stands out of the skull, how deep it reaches
# into it (past the skull's foot, so it closes it) and how square its section is.
BAND = {"height": 0.1, "proud": 0.025, "sink": 0.07, "power": 3.0, "ring": 120, "section": 12}
# Domed rivets round the band's middle every `step` degrees, none under the nasal.
RIVET = {"step": 30, "radius": 0.022, "half": 0.014, "sink": 0.005}
# The nasal seen from the front: a stem that widens from `half_top` to `half_bottom`, from just above
# the mouth's window up into a trefoil of three lobes (x, y, radius) on the skull, soft where they
# meet. Between the eyes it stays inside |x| 0.065, the eyes' windows start at 0.11 with its ink.
# It lies `gap` in front of skull and band, `half` thick each way, its edge rounded over `edge`;
# below the band it keeps the band's distance in front of the face.
NASAL = {
    "bottom": 0.578, "top": 1.08, "half_bottom": 0.055, "half_top": 0.042, "round": 0.014, "join": 0.018,
    "lobes": [(0.0, 1.135, 0.056), (-0.062, 1.066, 0.053), (0.062, 1.066, 0.053)],
    "gap": 0.004, "half": 0.015, "edge": 0.014,
}
# Surface nets: the box round the nasal and its grid step; Decimate thins it to its budget.
NASAL_GRID = {"low": (-0.13, 0.55, 0.55), "high": (0.13, 1.2, 0.95), "step": 0.005}
NASAL_BUDGET = 1000
# One rivet in each lobe of the trefoil, (x, y).
TREFOIL_RIVETS = [(0.0, 1.142), (-0.066, 1.064), (0.066, 1.064)]
# What the face keeps clear round the windows: the ink and a little air.
ROOM = 0.045

# name -> (hex, glow). Deeper than they show: the app lightens every colour towards pastel and lets
# the lower edge glow. The band is a darker steel than the skull, the rivets a light one.
SWATCH = {
    "Helmstahl": ("#434c63", 0.3),
    "Helmband": ("#262c3a", 0.3),
    "Helmniete": ("#c3cbd8", 0.5),
}

A = HEAD_R + SKULL["thick"]
TIP = SKULL["apex"]
# The cone's sides are an arc from the shell round the ball, which it leaves `BETA` from the axis,
# up to the apex. Its centre lies `ARC` past the axis on the far side.
BETA = math.acos(A / TIP) + math.radians(SKULL["bulge"])
ARC = (TIP**2 - A**2) / (2 * (A - TIP * math.cos(BETA)))


def smoothstep(a, b, x):
    """0 below `a`, 1 above `b`, eased in between; numpy arrays too."""
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def place(mesh_data):
    """Squashes a part built round the ball onto the oval head."""
    verts, faces = mesh_data
    return [Vector((v.x, HEAD_Y + v.y, HEAD_Z + v.z * HEAD_DEPTH)) for v in verts], faces


def around(phi, radius, height):
    """The point at angle `phi` (radians from the front, towards +x) `radius` from the axis."""
    return Vector((radius * math.sin(phi), height, radius * math.cos(phi)))


def skull_radius(h):
    """The skull's radius at height `h` without the ridge: round the ball, then the arc to the apex."""
    h = np.asarray(h, float)
    ball = np.sqrt(np.maximum(A * A - h * h, 0))
    arc = np.sqrt(np.maximum((A + ARC) ** 2 - (h + ARC * math.cos(BETA)) ** 2, 0)) - ARC * math.sin(BETA)
    return np.where(h <= A * math.cos(BETA), ball, np.maximum(arc, 0))


def skull_at(phi, h):
    """The skull's radius at angle `phi` and height `h`, with the ridge at the front and the back."""
    off = abs(math.asin(math.sin(phi)))  # the angle to the front or the back, whichever is nearer
    swell = RIDGE["rise"] * math.exp(-((off / math.radians(RIDGE["width"])) ** 2)) * smoothstep(RIDGE["from"], RIDGE["full"], h)
    return float(skull_radius(h)) * (1 + swell)


def rim(phi):
    """The rim's height at angle `phi` (radians from the front)."""
    angle = abs(math.degrees(math.atan2(math.sin(phi), math.cos(phi))))
    down = RIM["drop"] * smoothstep(RIM["drop_from"], RIM["drop_to"], angle)
    return float(RIM["front"] - down + RIM["back"] * smoothstep(RIM["rise_from"], RIM["rise_to"], angle))


def frame(h, step=1e-4):
    """The skull's outline at height `h`: (radius, height), unit tangent upwards and outward normal."""
    slope = float(skull_radius(h + step) - skull_radius(h - step)) / (2 * step)
    length = math.hypot(slope, 1)
    return (float(skull_radius(h)), h), (slope / length, 1 / length), (1 / length, -slope / length)


def angles(count):
    """`count` angles evenly round a full turn."""
    return [2 * math.pi * j / count for j in range(count)]


def skull_mesh():
    """The skull as a closed shell: down from the apex to its foot inside the band, then back up
    along the head ball to its top."""
    feet = [(phi, rim(phi) + SKULL["foot"]) for phi in angles(SKULL["ring"])]
    rings = []
    for i in range(1, SKULL["rows"] + 1):
        ring = []
        for phi, foot in feet:
            h = TIP - (TIP - foot) * i / SKULL["rows"]
            ring.append(around(phi, skull_at(phi, h), h))
        rings.append(ring)
    inner = HEAD_R - SKULL["sink"]
    for k in range(SKULL["cap_rows"]):
        ring = []
        for phi, foot in feet:
            theta = math.acos(foot / inner) * (1 - k / SKULL["cap_rows"])
            ring.append(around(phi, inner * math.sin(theta), inner * math.cos(theta)))
        rings.append(ring)
    return outward(skin(rings, SKULL["ring"], Vector((0, TIP, 0)), Vector((0, inner, 0))))


def band_section(phi):
    """The band's rounded section at angle `phi`, round the skull's outline at the band's middle."""
    (r, h), tangent, normal = frame(rim(phi) + BAND["height"] / 2)
    mid, deep = (BAND["proud"] - BAND["sink"]) / 2, (BAND["proud"] + BAND["sink"]) / 2
    ring = []
    for t in angles(BAND["section"]):
        c, s = spow(math.cos(t), 2 / BAND["power"]), spow(math.sin(t), 2 / BAND["power"])
        out, up = mid + deep * c, BAND["height"] / 2 * s
        ring.append(around(phi, r + normal[0] * out + tangent[0] * up, h + normal[1] * out + tangent[1] * up))
    return ring


def band_rivets():
    """The rivets on the band's middle, domes sunk into its face."""
    rivets = []
    for k in range(1, 360 // RIVET["step"]):
        phi = math.radians(k * RIVET["step"])
        (r, h), _, normal = frame(rim(phi) + BAND["height"] / 2)
        lift = BAND["proud"] - RIVET["sink"]
        centre = around(phi, r + normal[0] * lift, h + normal[1] * lift)
        rivets.append(puff(centre, around(phi, normal[0], normal[1]), RIVET["radius"], RIVET["half"], ring_size=10, stacks=5))
    return merge(rivets)


def nasal_outline(x, y):
    """Signed 2D distance to the nasal's outline seen from the front (negative inside)."""
    r = NASAL["round"]
    stem = [(-NASAL["half_bottom"] + r, NASAL["bottom"] + r), (NASAL["half_bottom"] - r, NASAL["bottom"] + r), (NASAL["half_top"] - r, NASAL["top"]), (-NASAL["half_top"] + r, NASAL["top"])]
    d = polygon_sd(x, y, stem) - r
    for cx, cy, radius in NASAL["lobes"]:
        d = smooth_union(d, np.hypot(x - cx, y - cy) - radius, NASAL["join"])
    return d


def nasal_middle(x, y):
    """The nasal's middle plane: on the skull above the band, on the band and below it as far in
    front of the face."""
    h = np.asarray(y, float) - HEAD_Y
    skull = np.sqrt(np.maximum(skull_radius(h) ** 2 - x * x, 0))
    band = np.sqrt(np.maximum((A + BAND["proud"]) ** 2 - x * x - h * h, 0))
    top = rim(0) + BAND["height"]
    w = smoothstep(top - 0.02, top + 0.02, h)
    return HEAD_Z + HEAD_DEPTH * (skull * w + band * (1 - w)) + NASAL["gap"] + NASAL["half"]


def nasal_sdf(points):
    """The nasal plate: its outline from the front, a flat face and a round edge."""
    x, y, z = points[:, 0], points[:, 1], points[:, 2]
    d = nasal_outline(x, y)
    u = np.clip(np.maximum(-d, 0) / NASAL["edge"], 0, 1)
    return np.maximum(d, np.abs(z - nasal_middle(x, y)) - NASAL["half"] * np.sqrt(1 - (1 - u) ** 2))


def trefoil_rivets():
    """The trefoil's rivets, domes on the nasal's face facing out of it."""
    rivets = []
    for x, y in TREFOIL_RIVETS:
        step = 1e-3
        dx = (nasal_middle(x + step, y) - nasal_middle(x - step, y)) / (2 * step)
        dy = (nasal_middle(x, y + step) - nasal_middle(x, y - step)) / (2 * step)
        centre = Vector((x, y, float(nasal_middle(x, y)) + NASAL["half"] - RIVET["sink"]))
        rivets.append(puff(centre, Vector((-float(dx), -float(dy), 1)), RIVET["radius"], RIVET["half"], ring_size=10, stacks=5))
    return merge(rivets)


def build(collection):
    """Skull and nasal in steel, the band darker, the rivets light."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    parts = {
        "skull": place(skull_mesh()),
        "band": place(loop_skin([band_section(phi) for phi in angles(BAND["ring"])])),
        "band_rivets": place(band_rivets()),
        "trefoil_rivets": trefoil_rivets(),
    }
    generator.add_mesh(collection, "nasal_helmet_skull", parts["skull"], mats["Helmstahl"])
    generator.add_mesh(collection, "nasal_helmet_band", outward(parts["band"]), mats["Helmband"])
    generator.add_mesh(collection, "nasal_helmet_rivets", merge([outward(parts["band_rivets"]), outward(parts["trefoil_rivets"])]), mats["Helmniete"])
    nasal = generator.add_implicit(collection, "nasal_helmet_nasal", nasal_sdf, NASAL_GRID, mats["Helmstahl"], NASAL_BUDGET)
    parts["nasal"] = ([from_blender(v.co) for v in nasal.data.vertices], [])
    found = problems(parts, ROOM)
    print("CHECK", found or "ok", {name: len(verts) for name, (verts, _) in parts.items()})
    assert not found, found


generator.run("nasal-helmet", "Kopf", build, __file__)
