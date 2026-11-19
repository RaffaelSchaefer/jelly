"""Builds `goose`: a chibi plush goose the pet hugs in front of its belly.

Body, tail, neck and head are one plush piece: an implicit surface of ellipsoids and round cones
with soft seams, meshed by surface nets, so the big round head flows into the short neck without a
crease. The head looks three quarters towards the camera. Two big domed eyes with glints and rosy
cheeks lie on its surface, a small two-part beak smiles below them, a little curl stands on top.
A beige wing with three scallops lies on the side, and two webbed feet with round toes peek out
below the body, soles to the front.

    blender blender/cosmetics.blend --background --python blender/build_goose.py -- [--save] [--export]

Modelled in pet coordinates around the GRIP pose (hands at x ±0.92, y -0.4, z 0.82), which
HandHeld.tsx cancels out at rest, like the golden cup. Body and neck stay inside the hands' inner
edges (|x| 0.72), head and curl left of and below the pet's cheek (x -0.4, y 0.49). Three.js
coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import (  # noqa: E402
    PATCH, badge, blob, catmull, circles_outline, dome, merge, outward, ray_onto, resample, sd_chain, sd_ellipsoid,
    sdf_decal, sdf_gradient, smooth_union, surface_nets, sweep, unit_rows,
)

# The plush piece. The chest is fuller than the rear; the back stays in front of the belly (z 0.69).
CHEST = {"at": (-0.06, -0.53, 0.97), "size": (0.45, 0.33, 0.29)}
REAR = {"at": (0.27, -0.47, 0.96), "size": (0.36, 0.28, 0.25)}
# Tapering tubes as balls (x, y, z, radius): the perky tail and the short neck up into the head. The
# neck is narrowest in the middle, so throat and nape curve in between chest and chin.
TAIL = [(0.42, -0.42, 0.96, 0.15), (0.6, -0.29, 0.96, 0.075), (0.69, -0.165, 0.96, 0.028)]
NECK = [(-0.28, -0.4, 0.97, 0.16), (-0.37, -0.22, 0.97, 0.118), (-0.43, -0.04, 0.975, 0.112)]
# The head: a little wider than tall, like a mochi, on a clear chin.
HEAD = {"at": (-0.49, 0.12, 0.98), "size": (0.3, 0.275, 0.27)}
# How soft the seams are: rear into chest, tail, neck into body and head onto neck.
SEAMS = {"rear": 0.12, "tail": 0.06, "neck": 0.08, "head": 0.06}
# Surface nets: the box round the piece and its grid step. Decimate thins the fine mesh to `verts`.
GRID = {"low": (-0.86, -0.92, 0.6), "high": (0.8, 0.5, 1.34), "step": 0.012, "verts": 3600}
# A little curl on the head's top, leaning towards the beak: points (x, y) from the top with
# sections (across, deep).
CURL = [(0.0, -0.06), (-0.004, 0.03), (-0.03, 0.072), (-0.068, 0.078), (-0.088, 0.05)]
CURL_SECTIONS = [(0.06, 0.055), (0.052, 0.046), (0.042, 0.036), (0.03, 0.026), (0.02, 0.017)]

# Where the face looks: to the left, three quarters towards the camera. Parts on it sit at
# (turn towards the pet, up) in radians from the face's middle.
FACE = (-0.32, 0.0, 0.95)
EYES = {"turn": 0.37, "up": 0.08, "size": (0.056, 0.07), "half": 0.014, "lift": -0.002}
# Glints per eye: offsets (across, up) from its middle and radii. They float above the dome.
GLINTS = [((-0.018, 0.026), 0.021), ((0.019, -0.024), 0.011)]
GLINT = {"half": 0.004, "lift": 0.015}
CHEEKS = {"turn": 0.64, "up": -0.12, "size": (0.058, 0.036), "half": 0.005, "lift": 0.002}
# The beak leans from the face to the left; the lower half shows below the upper one as a smile.
# Half sizes are (across, up, long); `sink` of the upper half lies inside the head.
BEAK = {"up": -0.1, "lean": (-0.35, -0.08, 0.0), "upper": (0.08, 0.046, 0.075), "lower": (0.066, 0.03, 0.062), "sink": 0.03, "drop": 0.032}

# The wing: a teardrop of circles from front to tip, three scallops along its lower back edge.
WING = {
    "centre": (0.17, -0.44), "front": (0.0, -0.45), "tip": (0.46, -0.35), "radii": (0.13, 0.03), "count": 12,
    "scallops": [(0.13, -0.485, 0.075), (0.25, -0.445, 0.06), (0.36, -0.41, 0.045)], "lift": 0.004, "half": 0.022,
}
# Two webbed feet below the body, soles to the front: (x, y, z, roll in degrees), and the foot as
# circles about unit size, heel up, three round toes down.
FEET = [(-0.12, -0.86, 1.18, -12), (0.22, -0.87, 1.14, 8)]
FOOT = {"r": 0.12, "half": 0.03, "tilt": (0, 0.3, 1), "circles": [(0, 0.42, 0.32), (0, 0, 0.5), (-0.5, -0.36, 0.21), (0, -0.5, 0.22), (0.5, -0.36, 0.21)]}

# name -> (hex, glow, fluff, tint). Deeper than they show: the app lightens every colour towards pastel.
# Body, wing and cheeks are plush; beak, feet and eyes keep a little gloss.
SWATCH = {
    "Gänseweiß": ("#fff7ea", 1.0, 0.6, 1.0),
    "Gänseflügel": ("#dfb071", 0.6, 0.6, 0.51),
    "Gänseorange": ("#ff6f00", 0.2, 0.2),
    "Gänseschnabel": ("#e04a0c", 0.2, 0.2),
    "Gänseauge": ("#1d1630", 0.1),
    "Gänseglanz": ("#fffaf0", 1.0),
    "Gänsebäckchen": ("#ff6f9a", 0.6, 0.5),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def unit(vector):
    vector = np.asarray(vector, float)
    return vector / np.linalg.norm(vector)


def ellipse(rx, ry, samples=40):
    return [(rx * math.cos(a), ry * math.sin(a)) for a in (2 * math.pi * k / samples for k in range(samples))]


# ---------------------------------------------------------------------------------------------
# The plush piece.


def goose_sdf(points):
    """Signed distance to body, tail, neck and head, joined by soft seams."""
    body = smooth_union(sd_ellipsoid(points, CHEST["at"], CHEST["size"]), sd_ellipsoid(points, REAR["at"], REAR["size"]), SEAMS["rear"])
    body = smooth_union(body, sd_chain(points, TAIL), SEAMS["tail"])
    body = smooth_union(body, sd_chain(points, NECK), SEAMS["neck"])
    return smooth_union(body, sd_ellipsoid(points, HEAD["at"], HEAD["size"]), SEAMS["head"])


def tube(points, sections, count):
    """Samples (point, up, deep) along a curve, sections curved too, so a tube has no terraces."""
    curve = catmull([Vector(p) for p in points], count)
    return [(p, s.x, s.y) for p, s in zip(curve, catmull([Vector((*s, 0)) for s in sections], count))]


def curl_mesh():
    x, y, z = HEAD["at"]
    top = Vector((x, y + HEAD["size"][1], z))
    return outward(sweep(tube([top + Vector((u, v, 0)) for u, v in CURL], CURL_SECTIONS, 14), ring_size=12, cap_rings=5))


# ---------------------------------------------------------------------------------------------
# The face.


def on_head(turn, up):
    """The point on the head `turn` towards the pet and `up` from the face's middle, and its normal."""
    face = unit(FACE)
    side = unit((face[2], 0, -face[0]))
    rise = np.cross(face, side)
    direction = unit(face + side * math.tan(turn) + rise * math.tan(up))
    point = ray_onto(goose_sdf, [np.asarray(HEAD["at"]) + direction * 0.6], -direction, 0.6)
    return point[0], unit_rows(sdf_gradient(goose_sdf, point))[0]


def face_meshes():
    """Eyes with their glints and the cheeks, laid onto the head."""
    eyes, glints, cheeks = [], [], []
    for side in (-1, 1):
        at, normal = on_head(side * EYES["turn"], EYES["up"])
        eyes.append(sdf_decal(goose_sdf, at, normal, ellipse(*EYES["size"]), EYES["lift"], EYES["half"]))
        across = unit(np.cross((0, 1, 0), normal))
        rise = np.cross(normal, across)
        for (u, v), r in GLINTS:
            glints.append(sdf_decal(goose_sdf, at + across * u + rise * v, normal, ellipse(r, r, 16), GLINT["lift"], GLINT["half"], dome(3)))
        at, normal = on_head(side * CHEEKS["turn"], CHEEKS["up"])
        cheeks.append(sdf_decal(goose_sdf, at, normal, ellipse(*CHEEKS["size"], 32), CHEEKS["lift"], CHEEKS["half"], dome(3)))
    return merge(eyes), merge(glints), merge(cheeks)


def beak_meshes():
    """The upper half of the beak and the lower one below it."""
    base, normal = on_head(0, BEAK["up"])
    axis = unit(normal + np.asarray(BEAK["lean"]))
    up = unit(np.array((0, 1, 0)) - axis * axis[1])
    upper = base + axis * (BEAK["upper"][2] - BEAK["sink"])
    lower = upper - up * BEAK["drop"] - axis * 0.01
    return (
        blob(upper, axis, up, BEAK["upper"], power=2.3, ring=28, stacks=12),
        blob(lower, axis, up, BEAK["lower"], power=2.3, ring=24, stacks=10),
    )


# ---------------------------------------------------------------------------------------------
# Wing and feet.


def wing_mesh():
    (cx, cy), (fx, fy), (tx, ty) = WING["centre"], WING["front"], WING["tip"]
    big, small = WING["radii"]
    circles = []
    for k in range(WING["count"]):
        t = k / (WING["count"] - 1)
        # The teardrop's spine bows up a little between front and tip.
        circles.append((fx + (tx - fx) * t, fy + (ty - fy) * t + 0.03 * math.sin(math.pi * t), big + (small - big) * t**0.8))
    outline = [(x - cx, y - cy) for x, y in resample(circles_outline(circles + WING["scallops"], (cx, cy)), 80, 2)]
    at = ray_onto(goose_sdf, [(cx, cy, 2.0)], (0, 0, -1), 1.5)[0]
    return sdf_decal(goose_sdf, at, (0, 0, 1), outline, WING["lift"], WING["half"], PATCH, reach=0.35)


def feet_mesh():
    outline = circles_outline(FOOT["circles"], (0, 0))
    feet = []
    for x, y, z, roll in FEET:
        foot = badge(outline, (x, y, z), Vector(FOOT["tilt"]), FOOT["r"], FOOT["half"], ring_size=48, stacks=4, passes=2, roll=math.radians(roll))
        feet.append(outward(foot))
    return merge(feet)


def build(collection):
    """The plush piece and its curl, the wing, the face, the beak and the feet."""
    white = mat("Gänseweiß")
    verts, faces = surface_nets(goose_sdf, GRID["low"], GRID["high"], GRID["step"])
    body = generator.add_mesh(collection, "goose_body", outward((verts, faces)), white)
    body.modifiers.new("Vereinfachen", "DECIMATE").ratio = min(1.0, GRID["verts"] / len(verts))
    generator.add_mesh(collection, "goose_curl", curl_mesh(), white)
    generator.add_mesh(collection, "goose_wing", wing_mesh(), mat("Gänseflügel"))
    eyes, glints, cheeks = face_meshes()
    generator.add_mesh(collection, "goose_eyes", eyes, mat("Gänseauge"))
    generator.add_mesh(collection, "goose_glints", glints, mat("Gänseglanz"))
    generator.add_mesh(collection, "goose_cheeks", cheeks, mat("Gänsebäckchen"))
    upper, lower = beak_meshes()
    generator.add_mesh(collection, "goose_orange", merge([upper, feet_mesh()]), mat("Gänseorange"))
    generator.add_mesh(collection, "goose_beak_lower", lower, mat("Gänseschnabel"))


generator.run("goose", "Hände", build, __file__)
