"""Builds `chicken`: a chubby chibi plush hen the pet hugs in front of its belly.

Body, tail and head are one plush piece: an implicit surface of ellipsoids and round cones with
soft seams, meshed by surface nets. The big round head sits right on the egg-shaped body, with no
neck, and looks three quarters towards the camera. Two big domed eyes with glints and rosy cheeks
lie on its surface, a short beak with a little wattle sits between them, three plump bumps of comb
stand on top. A darker wing with scallops lies on the side, a cream patch on the breast and three
cream speckles on the back, three rounded tail feathers fan up at the back, and two feet with round
toes peek out below. The thinned plush and comb keep the implicit surface's own normals.

    blender blender/cosmetics.blend --background --python blender/build_chicken.py -- [--save] [--export]

Modelled in pet coordinates around the GRIP pose (hands at x ±0.92, y -0.4, z 0.82), which
HandHeld.tsx cancels out at rest, like the goose. Body and tail stay inside the hands' inner edges
(|x| 0.72), head and comb below the pet's mouth and cheeks. Three.js coordinates.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import (  # noqa: E402
    PATCH, badge, blob, circles_outline, dome, merge, outward, ray_onto, resample, sd_chain, sd_ellipsoid, sd_round_cone,
    from_blender, sdf_decal, sdf_gradient, smooth_union, surface_nets, surface_z, sweep, to_blender, unit_rows,
)

# The plush piece: an egg of a fuller breast and a rounder rear; the back stays in front of the
# belly (z 0.69).
BREAST = {"at": (-0.1, -0.58, 0.99), "size": (0.37, 0.3, 0.29)}
REAR = {"at": (0.19, -0.53, 0.96), "size": (0.3, 0.27, 0.26)}
# Three tail feathers fanned up from the rear: from a ball (x, y, radius) out at angles in degrees,
# lengths and tip radii, flattened in depth to `flat` round the plane z.
TAIL = {"base": (0.38, -0.42, 0.11), "angles": (110, 72, 34), "lengths": (0.22, 0.25, 0.22), "tips": (0.082, 0.082, 0.076), "z": 0.955, "flat": 0.65}
# The head: as big as the body is tall, a little wider than tall, like a mochi.
HEAD = {"at": (-0.32, -0.07, 1.01), "size": (0.36, 0.33, 0.31)}
# How soft the seams are: rear into breast, tail into body and head onto body (a soft chin).
SEAMS = {"rear": 0.12, "tail": 0.06, "head": 0.06, "comb": 0.035}
# Surface nets: the box round the piece and its grid step. Decimate thins the fine mesh to `verts`.
GRID = {"low": (-0.72, -1.0, 0.6), "high": (0.78, 0.36, 1.38), "step": 0.012, "verts": 3000}

# Where the face looks: to the left, three quarters towards the camera. Parts on it sit at
# (turn towards the pet, up) in radians from the face's middle.
FACE = (-0.32, 0.0, 0.95)
EYES = {"turn": 0.4, "up": 0.0, "size": (0.074, 0.092), "half": 0.015, "lift": -0.002}
# Glints per eye: offsets (across, up) from its middle and radii. They float above the dome.
GLINTS = [((-0.024, 0.034), 0.027), ((0.025, -0.032), 0.013)]
GLINT = {"half": 0.004, "lift": 0.015}
CHEEKS = {"turn": 0.72, "up": -0.17, "size": (0.06, 0.038), "half": 0.005, "lift": 0.002}
# The beak leans from the face to the left and a little down: two short rounded cones, the lower
# one below the upper, each from (out, up) to (out, up) off the face with sections (across, up).
BEAK = {
    "up": -0.11, "lean": (-0.12, -0.1, 0.0),
    "upper": {"from": (-0.02, 0.0), "to": (0.055, -0.016), "sections": ((0.055, 0.036), (0.018, 0.014))},
    "lower": {"from": (-0.02, -0.032), "to": (0.038, -0.046), "sections": ((0.04, 0.022), (0.014, 0.01))},
}
# The wattle hangs below the beak as a drop: offsets (down, out) from the beak's base, half sizes.
WATTLE = {"down": 0.075, "out": 0.022, "size": (0.028, 0.038, 0.026)}
# The comb: three bumps across the head's top, front (left) to back, as (x, z) offsets from the
# head's middle, radius and how far their middle stands out of the head. Each grows from a narrower
# root (`root` of its radius) inside the head; `step` is the grid it is meshed on, `verts` its budget.
COMB = {"bumps": [((-0.14, 0.03), 0.07, 0.75), ((-0.025, 0.0), 0.08, 0.8), ((0.07, -0.03), 0.066, 0.72)], "root": 0.8, "sink": 0.4, "step": 0.0075, "verts": 640}

# The wing: a teardrop of circles from front to tip, three scallops along its lower back edge.
WING = {
    "centre": (0.23, -0.55), "front": (0.09, -0.54), "tip": (0.41, -0.49), "radii": (0.12, 0.05), "count": 12,
    "scallops": [(0.16, -0.62, 0.064), (0.27, -0.615, 0.06), (0.37, -0.57, 0.052)], "lift": 0.004, "half": 0.022,
}
# The cream breast below the chin: an oval, a little wider at the bottom, of half sizes (across, up)
# and taper.
BREAST_PATCH = {"centre": (-0.19, -0.62), "egg": (0.14, 0.18, 0.08), "lift": 0.002, "half": 0.016}
# Three little cream speckles on the back: (x, y, radius).
SPECKLES = {"dots": [(0.1, -0.35, 0.02), (0.155, -0.315, 0.015), (0.16, -0.38, 0.013)], "lift": 0.002, "half": 0.006}
# Two feet below the body, soles to the front: (x, y, z, roll in degrees), and the foot as circles
# about unit size, heel up, three round toes down.
FEET = [(-0.14, -0.88, 1.16, -10), (0.18, -0.89, 1.12, 8)]
FOOT = {"r": 0.11, "half": 0.03, "tilt": (0, 0.3, 1), "circles": [(0, 0.38, 0.28), (0, 0.02, 0.34), (-0.5, -0.42, 0.22), (0, -0.58, 0.23), (0.5, -0.42, 0.22)]}

# name -> (hex, glow, fluff). Deeper than they show: the app lightens every colour towards pastel.
# Body, wing, comb and cheeks are plush; beak, feet and eyes keep a little gloss. The wattle is too
# small for a plush rim and its own glow, both wash it out to pink. The lower half of the beak
# shares the feet's deeper orange.
SWATCH = {
    "Huhnbraun": ("#6a2e0c", 0.3, 0.6),
    "Huhnflügel": ("#451a04", 0.2, 0.6),
    "Huhnbauch": ("#e9b878", 0.8, 0.6),
    "Huhnkamm": ("#a00a18", 0.3, 0.4),
    "Huhnlappen": ("#a00a18", 0.1, 0.15),
    "Huhnschnabel": ("#ffa600", 0.3, 0.2),
    "Huhnorange": ("#f06a00", 0.25, 0.2),
    "Huhnauge": ("#1d1630", 0.1),
    "Huhnglanz": ("#fffaf0", 1.0),
    "Huhnbäckchen": ("#ff6f9a", 0.6, 0.5),
}

# What the app keeps clear, as (x low, x high, y low, y high): the pet's mouth, both cheeks and both
# eyes. Grown by the outline and a little room, as the plush is nearer the camera than the face.
WINDOWS = [(-0.12, 0.12, 0.345, 0.52), (0.255, 0.405, 0.495, 0.585), (-0.405, -0.255, 0.495, 0.585), (0.11, 0.27, 0.58, 0.74), (-0.27, -0.11, 0.58, 0.74)]
OUTLINE, ROOM = 0.035, 0.015
# Inside the hands at their height, the band (y low, y high) and the reach.
HANDS = {"band": (-0.6, -0.2), "reach": 0.72}


def mat(name):
    return generator.material(name, *SWATCH[name])


def unit(vector):
    vector = np.asarray(vector, float)
    return vector / np.linalg.norm(vector)


def ellipse(rx, ry, samples=40):
    return [(rx * math.cos(a), ry * math.sin(a)) for a in (2 * math.pi * k / samples for k in range(samples))]


# ---------------------------------------------------------------------------------------------
# The plush piece.


def tail_sdf(points):
    """The three feathers, met hard so they stay three lobes, flattened in depth like a fan."""
    x, y, r = TAIL["base"]
    z = TAIL["z"]
    flat = np.array(points, float)
    flat[..., 2] = z + (flat[..., 2] - z) / TAIL["flat"]
    feathers = []
    for angle, length, tip in zip(TAIL["angles"], TAIL["lengths"], TAIL["tips"]):
        a = math.radians(angle)
        feathers.append(sd_chain(flat, [(x, y, z, r), (x + length * math.cos(a), y + length * math.sin(a), z, tip)]))
    return np.minimum.reduce(feathers)


def chicken_sdf(points):
    """Signed distance to body, tail and head, joined by soft seams."""
    body = smooth_union(sd_ellipsoid(points, BREAST["at"], BREAST["size"]), sd_ellipsoid(points, REAR["at"], REAR["size"]), SEAMS["rear"])
    body = smooth_union(body, tail_sdf(points), SEAMS["tail"])
    return smooth_union(body, sd_ellipsoid(points, HEAD["at"], HEAD["size"]), SEAMS["head"])


# ---------------------------------------------------------------------------------------------
# The face and the comb.


def on_head(turn, up):
    """The point on the head `turn` towards the pet and `up` from the face's middle, and its normal."""
    face = unit(FACE)
    side = unit((face[2], 0, -face[0]))
    rise = np.cross(face, side)
    direction = unit(face + side * math.tan(turn) + rise * math.tan(up))
    point = ray_onto(chicken_sdf, [np.asarray(HEAD["at"]) + direction * 0.6], -direction, 0.6)
    return point[0], unit_rows(sdf_gradient(chicken_sdf, point))[0]


def face_meshes():
    """Eyes with their glints and the cheeks, laid onto the head."""
    eyes, glints, cheeks = [], [], []
    for side in (-1, 1):
        at, normal = on_head(side * EYES["turn"], EYES["up"])
        eyes.append(sdf_decal(chicken_sdf, at, normal, ellipse(*EYES["size"], 32), EYES["lift"], EYES["half"]))
        across = unit(np.cross((0, 1, 0), normal))
        rise = np.cross(normal, across)
        for (u, v), r in GLINTS:
            glints.append(sdf_decal(chicken_sdf, at + across * u + rise * v, normal, ellipse(r, r, 16), GLINT["lift"], GLINT["half"], dome(3)))
        at, normal = on_head(side * CHEEKS["turn"], CHEEKS["up"])
        cheeks.append(sdf_decal(chicken_sdf, at, normal, ellipse(*CHEEKS["size"], 32), CHEEKS["lift"], CHEEKS["half"], dome(3)))
    return merge(eyes), merge(glints), merge(cheeks)


def beak_meshes():
    """The upper half of the beak, the lower one below it and the wattle under both."""
    base, normal = on_head(0, BEAK["up"])
    axis = unit(normal + np.asarray(BEAK["lean"]))
    up = unit(np.array((0, 1, 0)) - axis * axis[1])
    wattle = base - up * WATTLE["down"] + axis * WATTLE["out"]
    return cone(base, axis, up, BEAK["upper"]), cone(base, axis, up, BEAK["lower"]), blob(wattle, axis, up, WATTLE["size"], ring=16, stacks=8)


def cone(base, axis, up, part, count=8):
    """A short rounded cone off the face at `base`, along `axis` and `up`."""
    (o0, u0), (o1, u1) = part["from"], part["to"]
    (h0, w0), (h1, w1) = part["sections"]
    samples = []
    for k in range(count):
        t = k / (count - 1)
        point = base + axis * (o0 + (o1 - o0) * t) + up * (u0 + (u1 - u0) * t)
        samples.append((Vector(point), h0 + (h1 - h0) * t, w0 + (w1 - w0) * t))
    return outward(sweep(samples, ring_size=16, cap_rings=4, up=Vector(up)))


def comb_balls():
    """Per bump its root inside the head and its round top: (root, top, radius)."""
    x, y, z = HEAD["at"]
    balls = []
    for (dx, dz), r, stand in COMB["bumps"]:
        at = ray_onto(chicken_sdf, [(x + dx, y + 1.0, z + dz)], (0, -1, 0), 1.0)
        normal = unit_rows(sdf_gradient(chicken_sdf, at))[0]
        balls.append((at[0] - normal * r * COMB["sink"], at[0] + normal * r * stand, r))
    return balls


def comb_mesh():
    """Three plump bumps standing out of the head's top, soft valleys between them, and their
    signed distance."""
    balls = comb_balls()

    def comb_sdf(points):
        bumps = [sd_round_cone(points, root, top, r * COMB["root"], r) for root, top, r in balls]
        out = bumps[0]
        for bump in bumps[1:]:
            out = smooth_union(out, bump, SEAMS["comb"])
        return out

    reach = max(r for _, _, r in balls) + 4 * COMB["step"]
    ends = np.array([p for root, top, _ in balls for p in (root, top)])
    verts, faces = surface_nets(comb_sdf, ends.min(0) - reach, ends.max(0) + reach, COMB["step"])
    return outward((verts, faces)), comb_sdf


def thin(obj, budget, sdf):
    """Decimates `obj` to about `budget` vertices and gives every vertex the implicit surface's own
    normal: the long triangles Decimate leaves would otherwise shade in bands."""
    obj.modifiers.new("Vereinfachen", "DECIMATE").ratio = min(1.0, budget / len(obj.data.vertices))
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    old, obj.data = obj.data, mesh
    obj.modifiers.clear()
    bpy.data.meshes.remove(old)
    mesh.name = obj.name
    points = np.array([from_blender(v.co) for v in mesh.vertices])
    mesh.normals_split_custom_set_from_vertices([to_blender(n) for n in unit_rows(sdf_gradient(sdf, points))])


# ---------------------------------------------------------------------------------------------
# Wing, breast and feet.


def wing_mesh():
    (cx, cy), (fx, fy), (tx, ty) = WING["centre"], WING["front"], WING["tip"]
    big, small = WING["radii"]
    circles = []
    for k in range(WING["count"]):
        t = k / (WING["count"] - 1)
        # The teardrop's spine bows up a little between front and tip.
        circles.append((fx + (tx - fx) * t, fy + (ty - fy) * t + 0.03 * math.sin(math.pi * t), big + (small - big) * t**0.8))
    outline = [(x - cx, y - cy) for x, y in resample(circles_outline(circles + WING["scallops"], (cx, cy)), 60, 2)]
    at = ray_onto(chicken_sdf, [(cx, cy, 2.0)], (0, 0, -1), 1.5)[0]
    return sdf_decal(chicken_sdf, at, (0, 0, 1), outline, WING["lift"], WING["half"], PATCH, reach=0.35)


def breast_mesh():
    """The cream oval on the breast, a felt patch like the wing."""
    cx, cy = BREAST_PATCH["centre"]
    at = ray_onto(chicken_sdf, [(cx, cy, 2.0)], (0, 0, -1), 1.5)[0]
    rx, ry, taper = BREAST_PATCH["egg"]
    outline = [(rx * math.cos(a) * (1 + taper * -math.sin(a)), ry * math.sin(a)) for a in (2 * math.pi * k / 48 for k in range(48))]
    return sdf_decal(chicken_sdf, at, (0, 0, 1), outline, BREAST_PATCH["lift"], BREAST_PATCH["half"], PATCH, reach=0.35)


def speckles_mesh():
    """Little domed dots, each laid onto the body where it faces."""
    dots = []
    for x, y, r in SPECKLES["dots"]:
        at = ray_onto(chicken_sdf, [(x, y, 2.0)], (0, 0, -1), 1.5)[0]
        normal = unit_rows(sdf_gradient(chicken_sdf, at[None]))[0]
        dots.append(sdf_decal(chicken_sdf, at, normal, ellipse(r, r, 12), SPECKLES["lift"], SPECKLES["half"], dome(2)))
    return merge(dots)


def feet_mesh():
    outline = circles_outline(FOOT["circles"], (0, 0))
    feet = []
    for x, y, z, roll in FEET:
        foot = badge(outline, (x, y, z), Vector(FOOT["tilt"]), FOOT["r"], FOOT["half"], ring_size=40, stacks=3, passes=2, roll=math.radians(roll))
        feet.append(outward(foot))
    return merge(feet)


# ---------------------------------------------------------------------------------------------
# The rules the app needs.


def problems(parts):
    """Every rule a part's vertices break: the pet's face windows with the outline, the hands, the
    bounds and the belly behind the plush."""
    found = []
    grow = OUTLINE + ROOM
    low, high = HANDS["band"]
    for name, (verts, _) in parts.items():
        x, y, z = np.array(verts, float).T
        for x0, x1, y0, y1 in WINDOWS:
            if ((x > x0 - grow) & (x < x1 + grow) & (y > y0 - grow) & (y < y1 + grow)).any():
                found.append(f"{name} in the window {(x0, x1, y0, y1)}")
        wide = (y > low) & (y < high) & (np.abs(x) > HANDS["reach"])
        if wide.any():
            found.append(f"{name} beyond |x| {HANDS['reach']} at the hands, up to {np.abs(x[wide]).max():.3f}")
        if (np.abs(x) + OUTLINE).max() >= 1.85 or (y + OUTLINE).max() >= 1.6 or y.min() < -1.05:
            found.append(f"{name} out of bounds: |x| {np.abs(x).max():.3f}, y {y.min():.3f} to {y.max():.3f}")
        behind = z < np.array([surface_z(a, b) for a, b in zip(x, y)])
        if behind.any():
            found.append(f"{name} behind the pet's front, down to z {z[behind].min():.3f}")
    return found


def build(collection):
    """The plush piece, the comb and wattle, the wing and breast, the face, the beak and the feet."""
    plush = surface_nets(chicken_sdf, GRID["low"], GRID["high"], GRID["step"])
    inner = np.asarray(GRID["low"]) + 3 * GRID["step"], np.asarray(GRID["high"]) - 3 * GRID["step"]
    assert ((np.asarray(plush[0]) > inner[0]) & (np.asarray(plush[0]) < inner[1])).all(), "the plush touches the edge of the grid"
    upper, lower, wattle = beak_meshes()
    eyes, glints, cheeks = face_meshes()
    comb, comb_sdf = comb_mesh()
    # name -> (mesh, material, (vertices after Decimate, signed distance) or None).
    parts = {
        "chicken_body": (outward(plush), "Huhnbraun", (GRID["verts"], chicken_sdf)),
        # Comb and wattle apart: each part lights up from its own lower edge.
        "chicken_comb": (comb, "Huhnkamm", (COMB["verts"], comb_sdf)),
        "chicken_wattle": (wattle, "Huhnlappen", None),
        "chicken_wing": (wing_mesh(), "Huhnflügel", None),
        "chicken_breast": (breast_mesh(), "Huhnbauch", None),
        "chicken_speckles": (speckles_mesh(), "Huhnbauch", None),
        "chicken_eyes": (eyes, "Huhnauge", None),
        "chicken_glints": (glints, "Huhnglanz", None),
        "chicken_cheeks": (cheeks, "Huhnbäckchen", None),
        "chicken_beak": (upper, "Huhnschnabel", None),
        "chicken_orange": (merge([lower, feet_mesh()]), "Huhnorange", None),
    }
    for name, (mesh_data, material, implicit) in parts.items():
        obj = generator.add_mesh(collection, name, mesh_data, mat(material))
        if implicit:
            thin(obj, *implicit)
    found = problems({name: part[0] for name, part in parts.items()})
    print("CHECK", found or "ok")
    assert not found, found


generator.run("chicken", "Hände", build, __file__)
