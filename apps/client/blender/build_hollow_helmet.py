"""Builds `hollow-helmet`: a smooth shell of pale porcelain round the head with two horns, after the
masked knight of a cave kingdom far below. A dome over the top and the sides, an oval face opening
whose guards run down the cheeks and curl in at the jaw, and from the shell's upper sides two thick
horns that flare out and curl back in at their blunt tips, like round brackets.

    blender blender/cosmetics.blend --background --python blender/build_hollow_helmet.py -- [--save] [--export]

Shell and horns are one implicit surface like the octopus, so the horns grow out of the shell
without a seam. The shell lies round the head ball squashed by the head's depth, like the nasal
helmet's. The app paints the helmet over the pet like a sticker, so its inside would show through
the face opening, and a back reaching as low as the front would peek out under it. Both cuts are
therefore drawn in the view of the app's camera (`CAMERA`): every point is projected onto the face's
plane first, so nothing behind the opening and nothing below the front edge is ever seen. Three.js
coordinates.
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_DEPTH, HEAD_R, HEAD_Y, HEAD_Z, from_blender, polygon_sd, problems, sd_chain, smooth_union  # noqa: E402

# The app's camera (`PetScene.tsx`) and the plane the cuts are drawn in, at the front of the face.
CAMERA = {"y": 0.1, "z": 5.8, "plane": 0.75}
# The shell round the head ball, as offsets from its radius: its inside just sunk into the head.
SHELL = {"inner": -0.012, "outer": 0.045}
# The face opening seen by the camera: an oval round `centre` of the power `power`, `half` wide
# each way, reaching up to the brow by `top` and down by `bottom`. Its ink stays clear of the eyes
# and of the brows, which expressions lift to about y 0.84, and of cheeks and mouth below. The
# guards round it end at `BOTTOM`, above the neck, where the head bobs over the body; there they
# curl in under the cheeks like the jaw of a mask.
OPENING = {"centre": 0.6, "half": 0.5, "top": 0.31, "bottom": 0.36, "power": 2.4, "points": 96}
BOTTOM = 0.33
# How round the cut rims are, and the guards' ends at the jaw.
EDGE, JAW = 0.016, 0.07
# The horn at +x, mirrored: an arc round `centre` (x, y) of `radius` from `start` to `end` degrees
# (counter-clockwise from +x) in the plane z `z`, its root sunk into the shell, flaring outwards
# and curling back in like a round bracket. It thins from `thick` to `tip`; the blunt tip stays
# under the speech bubble at y 1.6 with its ink. It leans back round its root by `lean` degrees:
# the stage looks down at 50 degrees and would see an upright horn shortened to a round ear.
HORN = {"centre": (0.4, 1.26), "radius": 0.25, "start": -62, "end": 70, "z": 0.2, "lean": 25, "thick": 0.125, "tip": 0.07, "balls": 12}
# How soft the seam is where the horns grow out of the shell.
SEAM = 0.05
# Surface nets: the box round the helmet and its grid step; Decimate thins it to its budget.
GRID = {"low": (-0.82, 0.27, -0.46), "high": (0.82, 1.6, 0.86), "step": 0.009}
BUDGET = 3600
# What the face keeps clear round the windows: the ink and a little air.
ROOM = 0.045

# name -> (hex, glow). Deeper than it shows: the app lightens every colour towards pastel and lets
# the lower edge glow, so a pure white would lose its shading.
SWATCH = {"Hohlschale": ("#dce1ea", 0.35)}


def smooth_max(a, b, k):
    """The intersection of two distances with a round edge of about `k`."""
    return -smooth_union(-a, -b, k)


def on_plane(points):
    """Where the app's camera sees `points`, as x and y on the face's plane."""
    scale = (CAMERA["z"] - CAMERA["plane"]) / (CAMERA["z"] - points[:, 2])
    return points[:, 0] * scale, CAMERA["y"] + (points[:, 1] - CAMERA["y"]) * scale


def opening_corners():
    """The face opening's outline as a polygon: the upper half of the oval reaches up by `top`,
    the lower one down by `bottom`."""
    o = OPENING
    out = []
    for t in np.linspace(0, 2 * np.pi, o["points"], endpoint=False):
        c, s = np.cos(t), np.sin(t)
        reach = o["top"] if s > 0 else o["bottom"]
        out.append((o["half"] * np.sign(c) * abs(c) ** (2 / o["power"]), o["centre"] + reach * np.sign(s) * abs(s) ** (2 / o["power"])))
    return out


def horn_balls():
    """The horn at +x as balls (x, y, z, radius) along its arc, thinning towards the tip and
    leaning back round its root."""
    h = HORN
    lean = np.radians(h["lean"])
    out = []
    for t in np.linspace(0, 1, h["balls"]):
        angle = np.radians(h["start"] + (h["end"] - h["start"]) * t)
        x, y = h["centre"][0] + h["radius"] * np.cos(angle), h["centre"][1] + h["radius"] * np.sin(angle)
        rise = y - out[0][1] if out else 0.0
        root = out[0][1] if out else y
        out.append((x, root + rise * np.cos(lean), h["z"] - rise * np.sin(lean), h["thick"] + (h["tip"] - h["thick"]) * t))
    return out


CORNERS = opening_corners()
HORN_BALLS = horn_balls()


def shell_sdf(points):
    """The shell round the head ball, negative inside it."""
    q = points - np.array([0.0, HEAD_Y, HEAD_Z])
    rho = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2 + (q[:, 2] / HEAD_DEPTH) ** 2)
    return np.maximum(rho - HEAD_R - SHELL["outer"], HEAD_R + SHELL["inner"] - rho)


def keep_sdf(points):
    """Where the shell stays, negative inside: outside the face opening and above the guards' end,
    both as the app's camera sees them."""
    x, y = on_plane(points)
    return smooth_max(-polygon_sd(x, y, CORNERS), BOTTOM - y, JAW)


def horns_sdf(points):
    """Both horns, the one at -x mirrored."""
    return sd_chain(np.column_stack([np.abs(points[:, 0]), points[:, 1], points[:, 2]]), HORN_BALLS)


def helmet_sdf(points):
    """Shell and horns as one surface. Only near the shell does the cut matter."""
    d = shell_sdf(points)
    near = d < 3 * EDGE
    d[near] = smooth_max(d[near], keep_sdf(points[near]), EDGE)
    return smooth_union(d, horns_sdf(points), SEAM)


def build(collection):
    """The helmet in one piece and one material."""
    mat = generator.material("Hohlschale", *SWATCH["Hohlschale"])
    obj = generator.add_implicit(collection, "hollow_helmet", helmet_sdf, GRID, mat, BUDGET)
    parts = {"helmet": ([from_blender(v.co) for v in obj.data.vertices], [])}
    found = problems(parts, ROOM)
    print("CHECK", found or "ok", {name: len(verts) for name, (verts, _) in parts.items()})
    assert not found, found


generator.run("hollow-helmet", "Kopf", build, __file__)
