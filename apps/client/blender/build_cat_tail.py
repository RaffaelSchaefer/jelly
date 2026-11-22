"""Builds `cat-tail`: a thick, fluffy cat tail that comes out from behind the body's lower right
edge, swings out and up and curls in at its plump pale tip, with three tabby stripes.

The tail is a tube along a curve, thickest towards its tip and a little flatter front to back, its
rings spaced evenly from end to end. Tufts of fur stand out of it where it turns away from the
camera, so its outline is fluffy and its front stays smooth. The rings are then cut into stripes:
fur, the darker tabby stripes and the tip share their boundary rings, so no gap opens between them,
and each kind is one object, so the light lower edge the app adds runs over the whole tail. The fur
takes the wearer's colour, the stripes a darker and the tip a pale shade of it.

The app draws the tail behind the pet (`behind` in `COSMETIC_LOOKS`, cosmetic.ts): the body and the
hands cover it, so its root needs no cut.

    blender blender/cosmetics.blend --background --python blender/build_cat_tail.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import catmull, frames_along, fur, outward, problems, ring_at, skin, vertex_normals  # noqa: E402

# The tail's centre line (x, y) from inside the body to its tip: it leaves low on the right behind
# the body, swings out, rises and curls in at the top. The tip stays clear of the head, which bobs.
LINE = [(0.5, -0.72), (0.8, -0.86), (1.1, -0.84), (1.33, -0.66), (1.43, -0.4), (1.42, -0.13), (1.31, 0.06), (1.13, 0.12), (1.02, 0.05)]
# Its radius along the way (share of the length, radius): slim at the root, plump at the tip.
RADIUS = [(0.0, 0.085), (0.3, 0.1), (0.6, 0.108), (0.84, 0.118), (1.0, 0.1)]
# The tail lies a little behind the pet's middle and is a little flatter than wide.
Z = -0.02
FLAT = 0.85
# Rings along the tail and points per ring; the rings that round off its tip.
RINGS = {"along": 96, "around": 22, "cap": 6}
# Fur: tufts on a grid of `cell`, each up to `reach` wide and `height` high (see `shapes.fur`).
TUFTS = {"cell": 0.07, "reach": 0.065, "height": 0.032, "sharp": 1.4, "edge": (0.3, 0.75), "seed": "katzenschwanz"}
# The tabby stripes as shares of the length (from, to). The tip starts at a share of the length; the
# ring there is pushed back and forth along the tail into `teeth` locks round it, up to `zigzag`,
# its neighbours less, so the pale fur meets the rest in a soft zigzag.
STRIPES = [(0.3, 0.355), (0.43, 0.485), (0.56, 0.615)]
TIP = {"from": 0.81, "teeth": 5, "zigzag": 0.04, "falloff": 3}
# name -> (hex, glow, fluff, tint). Plush. The fur takes the wearer's colour, the stripes a darker
# shade of it, the tip is nearly white with a breath of it.
SWATCH = {
    "Schwanzfell": ("#f2a04e", 0.5, 0.7, 1.0),
    "Schwanzstreifen": ("#b0682c", 0.4, 0.7, 0.72),
    "Schwanzspitze": ("#fff1dc", 1.0, 1.0, 1.75),
}


def centre_line():
    """Points, frames (tangent, normal, binormal) and radii along the tail."""
    points = catmull([Vector((x, y, Z)) for x, y in LINE], RINGS["along"])
    shares = np.linspace(0, 1, RINGS["along"])
    radii = np.interp(shares, *zip(*RADIUS))
    return points, frames_along(points, Vector((0, 0, 1))), radii


def tube():
    """The tail as one mesh: its rings, a pole closing the root and round rings closing the tip."""
    points, frames, radii = centre_line()
    rings = [ring_at(p, n, b, r, r * FLAT, RINGS["around"]) for p, (_, n, b), r in zip(points, frames, radii)]
    # The zigzag where the tip starts.
    edge = round(TIP["from"] * (RINGS["along"] - 1))
    for k in range(edge - TIP["falloff"] + 1, edge + TIP["falloff"]):
        weight = 1 - abs(k - edge) / TIP["falloff"]
        tangent = frames[k][0]
        rings[k] = [v + tangent * (TIP["zigzag"] * weight * math.cos(2 * math.pi * TIP["teeth"] * j / RINGS["around"])) for j, v in enumerate(rings[k])]
    (t, n, b), p, r = frames[-1], points[-1], radii[-1]
    for k in range(1, RINGS["cap"]):
        phi = k / RINGS["cap"] * math.pi / 2
        rings.append(ring_at(p + t * (r * math.sin(phi)), n, b, r * math.cos(phi), r * FLAT * math.cos(phi), RINGS["around"]))
    return outward(skin(rings, RINGS["around"], points[0], p + t * r))


def kind(band):
    """Which part the faces between ring `band` and the next belong to."""
    share = band / (RINGS["along"] - 1)
    if share >= TIP["from"]:
        return "tip"
    return "stripes" if any(low <= share < high for low, high in STRIPES) else "fur"


def split(mesh_data, normals):
    """The tube's faces sorted into fur, stripes and tip, each part with its own copy of the
    vertices it uses and their normals: boundary rings are the same points in both parts."""
    verts, faces = mesh_data
    parts = {"fur": [], "stripes": [], "tip": []}
    for face in faces:
        # A pole's faces count with their ring: the root's with the first, the tip's with the cap.
        band = min(i // RINGS["around"] for i in face)
        parts[kind(min(band, RINGS["along"] - 1))].append(face)
    out = {}
    for name, picked in parts.items():
        used = sorted({i for face in picked for i in face})
        index = {old: new for new, old in enumerate(used)}
        out[name] = ([verts[i] for i in used], [tuple(index[i] for i in face) for face in picked]), [normals[i] for i in used]
    return out


def build(collection):
    """The fluffy tail cut into fur, stripes and tip."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    tail = fur(tube(), TUFTS)
    parts = split(tail, vertex_normals(*tail))
    for name, material in (("fur", "Schwanzfell"), ("stripes", "Schwanzstreifen"), ("tip", "Schwanzspitze")):
        mesh, normals = parts[name]
        generator.add_mesh(collection, f"cat_tail_{name}" if name != "fur" else "cat_tail", mesh, mats[material], normals=normals)
    found = problems({name: mesh for name, (mesh, _) in parts.items()}, 0.05)
    print("CHECK", found or "ok")
    assert not found, found


generator.run("cat-tail", "Körper", build, __file__)
