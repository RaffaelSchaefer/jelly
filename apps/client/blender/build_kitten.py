"""Builds `kitten`: a chibi plush kitten the pet hugs in front of its belly, sitting and looking
straight at the camera, with a pink collar and a little golden bell.

Body, head, ears, cheek fluff, front paws and tail are one plush piece: an implicit surface of
ellipsoids and round cones with soft seams, meshed by surface nets, like the plush chicken. The head
is as big as the body, tufts of fluff stand out at its cheeks, and the tail swings out and curls up
beside it. Two big domed eyes with a lighter iris below and glints, rosy cheeks, a small pink nose
and an ω mouth lie on its face, three tabby stripes on its forehead and two round its tail, pink
felt in its ears and a scalloped bib of pale fluff on its chest. The fur takes the wearer's colour,
the stripes a darker and bib and tail tip a pale shade of it.

    blender blender/cosmetics.blend --background --python blender/build_kitten.py -- [--save] [--export]

Modelled in pet coordinates around the GRIP pose (hands at x ±0.92, y -0.4, z 0.82), which
HandHeld.tsx cancels out at rest, like the golden cup. The kitten stays inside the hands' inner
edges (|x| 0.72) and its ears below the pet's mouth. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import (  # noqa: E402
    PATCH, blob, catmull, circles_outline, closed_sweep, dome, frames_along, from_blender, merge, outward, polygon, problems,
    ray_onto, resample, sd_chain, sd_ellipsoid, sdf_decal, sdf_gradient, smooth, smooth_union, sweep, unit_rows,
)

# The plush piece: a small sitting body and a head as big as it, a little wider than tall, like a
# mochi. The back stays in front of the belly (z 0.69).
BODY = {"at": (0.0, -0.7, 0.99), "size": (0.29, 0.25, 0.26)}
HEAD = {"at": (0.0, -0.3, 1.03), "size": (0.39, 0.33, 0.31)}
# The +x ear, mirrored: a cone from a ball inside the head to its tip, as (x, y, z, radius),
# `flat` as deep as wide. The tips stay below the pet's mouth.
EAR = {"balls": [(0.2, -0.1, 1.0, 0.125), (0.29, 0.085, 0.98, 0.05)], "flat": 0.6}
# The +x cheek fluff, mirrored: tufts from inside the head out past its lower sides.
CHEEK_FLUFF = [[(0.29, -0.35, 1.01, 0.06), (0.455, -0.4, 1.0, 0.013)], [(0.27, -0.43, 1.0, 0.055), (0.41, -0.5, 0.99, 0.012)]]
# Two front paws peeking out below the chin.
PAWS = {"at": (0.11, -0.88, 1.19), "size": (0.085, 0.07, 0.085)}
# The tail: a curve from the right hip, out and up beside the head, curling in at the tip, and
# its radius along the way; `samples` balls along it.
TAIL = {
    "points": [(0.15, -0.85, 0.95), (0.36, -0.9, 0.96), (0.54, -0.81, 0.97), (0.63, -0.64, 0.98), (0.64, -0.48, 0.99), (0.59, -0.37, 1.0)],
    "radii": [0.062, 0.057, 0.052, 0.05, 0.053, 0.056],
    "samples": 16,
}
# How soft the seams are.
SEAMS = {"head": 0.06, "ear": 0.04, "cheek": 0.03, "paw": 0.03, "tail": 0.04}
# Surface nets: the box round the piece and its grid step; Decimate thins it to its budget.
GRID = {"low": (-0.62, -1.02, 0.6), "high": (0.74, 0.28, 1.44), "step": 0.011}
BUDGET = 2300

# The face looks straight at the camera. Parts on it sit at (turn to the side, up) in radians from
# the face's middle.
FACE = (0.0, 0.0, 1.0)
EYES = {"turn": 0.43, "up": -0.04, "size": (0.074, 0.092), "half": 0.015, "lift": -0.002}
# The lighter iris in the lower half of each eye, as an offset (across, up) from its middle and half
# sizes; it lies on the eye's dome.
IRIS = {"offset": (0.0, -0.04), "size": (0.052, 0.035), "half": 0.003, "lift": 0.013}
# Glints per eye: offsets (across, up) from its middle and radii. They float above the dome.
GLINTS = [((-0.024, 0.036), 0.029), ((0.026, -0.034), 0.013), ((0.034, 0.012), 0.007)]
GLINT = {"half": 0.004, "lift": 0.016}
CHEEKS = {"turn": 0.74, "up": -0.24, "size": (0.062, 0.038), "half": 0.005, "lift": 0.002}
# The nose: a small triangle with round corners standing on its tip, between and below the eyes.
NOSE = {"up": -0.165, "outline": [(-0.032, 0.015), (0.032, 0.015), (0.0, -0.023)], "half": 0.012, "lift": 0.002}
# The ω mouth below the nose: points as (turn, up) for its right half, mirrored to the left. The line
# is a flat ribbon on the face, `width` wide and `thick` deep, like a drawn stroke.
MOUTH = {"points": [(0.0, -0.24), (0.0, -0.3), (0.075, -0.352), (0.15, -0.335), (0.19, -0.3)], "width": 0.0078, "thick": 0.0022, "lift": 0.0012}
# Tabby stripes on the forehead: (turn, up, half sizes across and up).
STRIPES = {"marks": [(0.0, 0.5, (0.02, 0.07)), (-0.2, 0.46, (0.017, 0.052)), (0.2, 0.46, (0.017, 0.052))], "half": 0.003, "lift": 0.001}
# Stripes round the tail at shares of its length, `half` wide along it and `high` above its fur.
TAIL_STRIPES = {"at": (0.42, 0.62), "half": 0.024, "high": 0.003, "lift": 0.0015}
# The tail's pale tip: the last share of its length, a hair thicker so it covers the fur under it.
TAIL_TIP = {"share": 0.2, "swell": 0.004}
# The pink felt in each ear: a rounded triangle pointing to the ear's tip, centre (x, y), leaning
# out with the ear by `lean` degrees.
INNER_EAR = {"centre": (0.245, -0.022), "corners": [(-0.062, -0.056), (0.062, -0.056), (0.0, 0.088)], "lean": 26, "lift": 0.003, "half": 0.008}
# The bib: a round patch of pale fluff with a scalloped lower edge, circles (x, y, radius) round its
# centre.
BIB = {
    "centre": (0.0, -0.71),
    "circles": [(0.0, -0.7, 0.1), *((0.09 * math.cos(math.radians(a)), -0.7 + 0.09 * math.sin(math.radians(a)), 0.036) for a in (200, 235, 270, 305, 340))],
    "lift": 0.002,
    "half": 0.014,
}
# The collar under the chin: an arc of points (x, y) laid on the front, its radius (high, deep).
COLLAR = {"points": [(x, -0.578 - 0.026 * math.cos(math.pi * x / 0.5)) for x in np.linspace(-0.25, 0.25, 9)], "size": (0.021, 0.026), "lift": 0.012}
# The jingle bell hanging from the collar's middle: its radius and how far it hangs; the raised band
# round its middle (thickness, half width); the slot across its lower front, at a share of the
# radius below the middle, with round holes at both ends; the ring on top that holds it.
BELL = {
    "radius": 0.047,
    "drop": 0.054,
    "band": (0.0045, 0.0065),
    "slot": {"at": -0.42, "half": 0.026, "thick": 0.0048, "hole": 0.0095, "sink": 0.0016},
    "ring": {"radius": 0.014, "thick": 0.0055},
}

# name -> (hex, glow, fluff, tint). Plush all over, only eyes, collar and bell keep their gloss. The
# fur takes the wearer's colour, the stripes a darker, bib and tail tip a pale shade of it.
SWATCH = {
    "Kätzchenfell": ("#f2a04e", 0.5, 0.6, 1.0),
    "Kätzchenstreifen": ("#c9742a", 0.4, 0.6, 0.72),
    "Kätzchenbauch": ("#fff1dc", 1.0, 0.8, 1.75),
    "Kätzchenrosa": ("#ff7fa6", 0.6, 0.5),
    "Kätzchenauge": ("#1d1630", 0.1),
    "Kätzchenblick": ("#5f6ad8", 0.4),
    "Kätzchenglanz": ("#fffaf0", 1.0),
    "Kätzchenmund": ("#2a1626", 0.1, 0.7),
    "Halsbandrosa": ("#ff4f86", 0.6, 0.15),
    "Glöckchengold": ("#f0a414", 0.35),
    "Glöckchenrand": ("#c4730c", 0.3),
    "Glöckchenschlitz": ("#3a2206", 0.1, 0.6),
}


def unit(vector):
    vector = np.asarray(vector, float)
    return vector / np.linalg.norm(vector)


def ellipse(rx, ry, samples=40, lean=0.0):
    """An ellipse round (0, 0), turned clockwise by `lean` degrees."""
    c, s = math.cos(math.radians(lean)), math.sin(math.radians(lean))
    points = ((rx * math.cos(a), ry * math.sin(a)) for a in (2 * math.pi * k / samples for k in range(samples)))
    return [(x * c + y * s, y * c - x * s) for x, y in points]


# ---------------------------------------------------------------------------------------------
# The plush piece.


def mirrored(points):
    """The points with x folded to the right: what is built at +x also stands at -x."""
    folded = np.array(points, float)
    folded[..., 0] = np.abs(folded[..., 0])
    return folded


def tail_line():
    """Points, radii and frames (tangent, normal, binormal) along the tail."""
    points = catmull([Vector(p) for p in TAIL["points"]], TAIL["samples"])
    radii = np.interp(np.linspace(0, 1, TAIL["samples"]), np.linspace(0, 1, len(TAIL["radii"])), TAIL["radii"])
    return points, radii, frames_along(points, Vector((0, 0, 1)))


TAIL_POINTS, TAIL_RADII, TAIL_FRAMES = tail_line()
TAIL_BALLS = [(*p, r) for p, r in zip(TAIL_POINTS, TAIL_RADII)]


def ear_sdf(points):
    """Both ears, flattened in depth."""
    z = EAR["balls"][0][2]
    flat = mirrored(points)
    flat[..., 2] = z + (flat[..., 2] - z) / EAR["flat"]
    return sd_chain(flat, EAR["balls"])


def kitten_sdf(points):
    """Signed distance to body, head, ears, cheek fluff, paws and tail, joined by soft seams."""
    out = smooth_union(sd_ellipsoid(points, BODY["at"], BODY["size"]), sd_ellipsoid(points, HEAD["at"], HEAD["size"]), SEAMS["head"])
    out = smooth_union(out, ear_sdf(points), SEAMS["ear"])
    for tuft in CHEEK_FLUFF:
        out = smooth_union(out, sd_chain(mirrored(points), tuft), SEAMS["cheek"])
    out = smooth_union(out, sd_ellipsoid(mirrored(points), PAWS["at"], PAWS["size"]), SEAMS["paw"])
    return smooth_union(out, sd_chain(points, TAIL_BALLS), SEAMS["tail"])


def tip_sdf(points):
    """The tail's last share, a hair thicker, cut off flat where it starts."""
    first = round(len(TAIL_BALLS) * (1 - TAIL_TIP["share"]))
    start, tangent = np.asarray(TAIL_POINTS[first]), np.asarray(TAIL_FRAMES[first][0])
    return np.maximum(sd_chain(points, TAIL_BALLS[first:]) - TAIL_TIP["swell"], (start - points) @ tangent)


# ---------------------------------------------------------------------------------------------
# What lies on the plush.


def on_head(turn, up):
    """The point on the head `turn` to the side and `up` from the face's middle, and its normal."""
    face = unit(FACE)
    side = unit((face[2], 0, -face[0]))
    rise = np.cross(face, side)
    direction = unit(face + side * math.tan(turn) + rise * math.tan(up))
    point = ray_onto(kitten_sdf, [np.asarray(HEAD["at"]) + direction * 0.6], -direction, 0.6)
    return point[0], unit_rows(sdf_gradient(kitten_sdf, point))[0]


def from_front(x, y):
    """The point on the plush's front at (x, y). The ray ends at z 1, inside even the thin ears."""
    return ray_onto(kitten_sdf, [(x, y, 2.0)], (0, 0, -1), 1.0)[0]


def eye_meshes():
    """Per eye the dark dome, the lighter iris below and the glints."""
    eyes, irises, glints = [], [], []
    for side in (-1, 1):
        at, normal = on_head(side * EYES["turn"], EYES["up"])
        eyes.append(sdf_decal(kitten_sdf, at, normal, ellipse(*EYES["size"], 28), EYES["lift"], EYES["half"]))
        across = unit(np.cross((0, 1, 0), normal))
        rise = np.cross(normal, across)
        (u, v) = IRIS["offset"]
        irises.append(sdf_decal(kitten_sdf, at + across * u + rise * v, normal, ellipse(*IRIS["size"], 28), IRIS["lift"], IRIS["half"], dome(2)))
        for (u, v), r in GLINTS:
            glints.append(sdf_decal(kitten_sdf, at + across * u + rise * v, normal, ellipse(r, r, 16), GLINT["lift"], GLINT["half"], dome(3)))
    return merge(eyes), merge(irises), merge(glints)


def pink_mesh():
    """Cheeks, nose and the felt in the ears."""
    pink = []
    for side in (-1, 1):
        at, normal = on_head(side * CHEEKS["turn"], CHEEKS["up"])
        pink.append(sdf_decal(kitten_sdf, at, normal, ellipse(*CHEEKS["size"], 24), CHEEKS["lift"], CHEEKS["half"], dome(3)))
        x, y = INNER_EAR["centre"]
        c, s = math.cos(math.radians(side * INNER_EAR["lean"])), math.sin(math.radians(side * INNER_EAR["lean"]))
        felt = resample(polygon([(px * c + py * s, py * c - px * s) for px, py in INNER_EAR["corners"]], 12), 30, 8)
        pink.append(sdf_decal(kitten_sdf, from_front(side * x, y), (0, 0, 1), felt, INNER_EAR["lift"], INNER_EAR["half"], PATCH, reach=0.2))
    at, normal = on_head(0, NOSE["up"])
    pink.append(sdf_decal(kitten_sdf, at, normal, resample(polygon(NOSE["outline"], 8), 24, 3), NOSE["lift"], NOSE["half"], dome(3)))
    return merge(pink)


def mouth_mesh():
    """The ω mouth: a flat stroke from the nose down, curving out to both sides."""
    right = MOUTH["points"]
    path = [(-t, u) for t, u in reversed(right[2:])] + right[1:]
    section = (MOUTH["width"], MOUTH["thick"])

    def laid(turn, up):
        at, normal = on_head(turn, up)
        return Vector(at + normal * MOUTH["lift"])

    # Flat towards the camera: `sweep` lays the depth along `up`.
    line = outward(sweep(smooth([laid(*p) for p in path], [section] * len(path), 24), ring_size=8, cap_rings=2))
    stem = outward(sweep([(laid(*p), *section) for p in right[:2]], ring_size=8, cap_rings=2))
    return merge([line, stem])


def stripes_mesh():
    """The forehead stripes and the rings round the tail."""
    marks = []
    for turn, up, size in STRIPES["marks"]:
        at, normal = on_head(turn, up)
        marks.append(sdf_decal(kitten_sdf, at, normal, ellipse(*size, 20), STRIPES["lift"], STRIPES["half"], dome(2)))
    for share in TAIL_STRIPES["at"]:
        k = round(share * (TAIL["samples"] - 1))
        (t, n, b), p, r = TAIL_FRAMES[k], TAIL_POINTS[k], TAIL_RADII[k] + TAIL_STRIPES["lift"]
        loop = [p + (n * math.cos(a) + b * math.sin(a)) * r for a in (2 * math.pi * j / 24 for j in range(24))]
        marks.append(outward(closed_sweep(loop, TAIL_STRIPES["high"], TAIL_STRIPES["half"], ring_size=8, up=t)))
    return merge(marks)


def bib_mesh():
    """The scalloped bib of pale fluff on the chest, a felt patch."""
    cx, cy = BIB["centre"]
    outline = resample([(x - cx, y - cy) for x, y in circles_outline(BIB["circles"], BIB["centre"])], 40, 2)
    return sdf_decal(kitten_sdf, from_front(cx, cy), (0, 0, 1), outline, BIB["lift"], BIB["half"], PATCH, reach=0.35)


def collar_meshes():
    """The collar along the front under the chin and the bell hanging from it."""
    high, deep = COLLAR["size"]
    points = [Vector(from_front(x, y)) + Vector((0, 0, COLLAR["lift"])) for x, y in COLLAR["points"]]
    collar = outward(sweep(smooth(points, [(high, deep)] * len(points), 25), ring_size=10, cap_rings=3, up=Vector((0, 1, 0))))
    middle = points[len(points) // 2]
    centre = middle + Vector((0, -BELL["drop"], deep + BELL["radius"] * 0.4))
    return (collar, *bell_meshes(centre))


def on_bell(centre, x, y, lift=0.0):
    """The point on the bell's front at (x, y) from its centre, `lift` out of it, and the normal."""
    r = BELL["radius"]
    out = Vector((x, y, math.sqrt(max(r * r - x * x - y * y, 0.0)))).normalized()
    return centre + out * (r + lift), out


def bell_meshes(centre):
    """The bell in gold with its ring on top, the deeper gold band and the dark slot with its holes."""
    r = BELL["radius"]
    up, front = Vector((0, 1, 0)), Vector((0, 0, 1))
    body = blob(centre, front, up, (r, r * 0.96, r), ring=18, stacks=12)
    ring = BELL["ring"]
    top = centre + up * (r * 0.96 + ring["radius"] * 0.75)
    loop = [top + Vector((math.cos(a), math.sin(a), 0)) * ring["radius"] for a in (2 * math.pi * k / 16 for k in range(16))]
    holder = outward(closed_sweep(loop, ring["thick"], ring["thick"], ring_size=8, up=front))
    thick, wide = BELL["band"]
    rim = [centre + Vector((math.cos(a), 0, math.sin(a))) * (r * 0.985) for a in (2 * math.pi * k / 28 for k in range(28))]
    band = outward(closed_sweep(rim, thick, wide, ring_size=8, up=up))
    slot = BELL["slot"]
    y = slot["at"] * r
    # Sunk into the bell, so it reads as a slot rather than a bar on it.
    line = [(on_bell(centre, x, y, -slot["thick"] * 0.45)[0], slot["thick"], slot["thick"]) for x in np.linspace(-slot["half"], slot["half"], 6)]
    holes = []
    for x in (-slot["half"], slot["half"]):
        at, normal = on_bell(centre, x, y, -slot["sink"])
        holes.append(blob(at, normal, up, (slot["hole"], slot["hole"], slot["sink"] + 0.001), ring=12, stacks=6))
    dark = merge([outward(sweep(line, ring_size=6, cap_rings=2, up=up)), *holes])
    return merge([body, holder]), band, dark


# ---------------------------------------------------------------------------------------------


def build(collection):
    """The plush piece and everything on it: stripes, bib, tail tip, pink, eyes, mouth, collar."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    body = generator.add_implicit(collection, "kitten_body", kitten_sdf, GRID, mats["Kätzchenfell"], BUDGET)
    tip = generator.add_implicit(collection, "kitten_tip", tip_sdf, GRID, mats["Kätzchenbauch"], 400)
    eyes, irises, glints = eye_meshes()
    collar, bell, band, slot = collar_meshes()
    parts = {
        "kitten_stripes": (stripes_mesh(), "Kätzchenstreifen"),
        "kitten_bib": (bib_mesh(), "Kätzchenbauch"),
        "kitten_pink": (pink_mesh(), "Kätzchenrosa"),
        "kitten_eyes": (eyes, "Kätzchenauge"),
        "kitten_irises": (irises, "Kätzchenblick"),
        "kitten_glints": (glints, "Kätzchenglanz"),
        "kitten_mouth": (mouth_mesh(), "Kätzchenmund"),
        "kitten_collar": (collar, "Halsbandrosa"),
        "kitten_bell": (bell, "Glöckchengold"),
        "kitten_bell_band": (band, "Glöckchenrand"),
        "kitten_bell_slot": (slot, "Glöckchenschlitz"),
    }
    for name, (mesh_data, material) in parts.items():
        generator.add_mesh(collection, name, mesh_data, mats[material])
    plush = {obj.name: ([tuple(from_blender(v.co)) for v in obj.data.vertices], []) for obj in (body, tip)}
    found = problems({**plush, **{name: part[0] for name, part in parts.items()}}, 0.05, held=True)
    print("CHECK", found or "ok")
    assert not found, found


generator.run("kitten", "Hände", build, __file__)
