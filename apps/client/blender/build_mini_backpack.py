"""Builds `mini-backpack`: a chibi plush frog backpack that peeks out over the pet's right shoulder.

The app paints a cosmetic over the pet like a sticker, so only what shows beside the pet exists:
the frog is one plush implicit surface (a squat gumdrop with two eye bumps on top) cut where the
pet's silhouette begins. Its body tucks a little under the edge of the bell; towards the
head it keeps a clear gap, since the head bobs and dips while the backpack stays with the body. The
frog leans out a little, as if peeking, and looks at the camera: big domed eyes with glints on the
bumps, a small smile and rosy cheeks. Its cream belly is a pocket with a zip and a little pull.

Two dark green padded straps come over the shoulders beside the neck and run down the chest to a
cream buckle, from which a short end of webbing hangs. They hug the pet's front like the hood's
drawstrings; the right one comes out from under the frog.

    blender blender/cosmetics.blend --background --python blender/build_mini_backpack.py -- [--save] [--export]

Modelled in pet coordinates; slot body, so it hangs in the jelly's root. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import (  # noqa: E402
    HEAD_Y, PATCH, badge, circles_outline, closed_sweep, decal_strand, dome, merge, outward, ray_onto, sd_ellipsoid, sd_round_cone,
    sdf_decal, sdf_gradient, smooth_union, surface_nets, surface_z, sweep, unit_rows,
)

# The pet's whole bell as (radius, height), from jellyGeometry.ts, bottom to top.
PET_BODY = np.array([
    (0.5, -1.05), (0.7, -1.025), (0.81, -0.95), (0.86, -0.79), (0.86, -0.55), (0.83, -0.33), (0.75, -0.14),
    (0.6, 0.02), (0.4, 0.11), (0.18, 0.15), (0.0, 0.16),
])

# The frog leans `LEAN` degrees out to +x; its frame (across, up, deep) starts at `ORIGIN`, the
# middle of its head. It is a gumdrop, a round cone from a wide bottom ball (centre, radius) up to
# the head's, `DEPTH` as deep as wide, with two eye bumps on top (centre of the right one and half
# sizes), joined by a soft seam. The bottom tucks behind the shoulder.
LEAN = 16
ORIGIN = (0.78, 0.22, 0.12)
DEPTH = 0.72
GUMDROP = {"bottom": ((0.0, -0.15, 0.0), 0.2), "top": ((0.0, 0.0, 0.0), 0.17)}
EYE_BUMPS = {"at": (0.085, 0.15, 0.02), "size": (0.075, 0.07, 0.068), "seam": 0.035}
# Where the frog is cut: it tucks `tuck` under the bell's edge and keeps `head` from the head's
# centre (radius 0.62, its ink 0.035, our ink 0.035 and a sliver). `soft` rounds the cuts.
CLIP = {"tuck": 0.015, "tuck_soft": 0.012, "head": 0.70, "head_soft": 0.05}
# Surface nets: the box round the frog and its grid step; Decimate thins it to `verts`.
GRID = {"low": (0.36, -0.22, -0.18), "high": (1.02, 0.6, 0.3), "step": 0.0085, "verts": 1300}
# Where the camera looks for the frog's front: from `top` down to `bottom` in z, in `steps`.
FRONT = {"top": 0.9, "bottom": -0.4, "steps": 520}

# The face, in the frog's frame (across, up). Eyes sit on the bumps' fronts. Decals find the
# surface within `REACH`: the bumps are small, a longer ray would find their back.
REACH = 0.05
EYES = {"size": (0.044, 0.052), "half": 0.012, "lift": -0.002, "samples": 28}
GLINTS = [((-0.014, 0.02), 0.015), ((0.015, -0.019), 0.0075)]  # (offset from the eye, radius)
GLINT = {"half": 0.003, "lift": 0.012, "samples": 10}
# The smile: a thin tube, `rest` of its radius above the surface.
SMILE = {"up": 0.0, "half": 0.045, "dip": 0.018, "r": 0.0085, "rest": 0.3, "count": 14}
CHEEKS = {"at": (0.125, 0.0), "size": (0.034, 0.021), "half": 0.005, "lift": 0.002, "samples": 22}
# The cream belly is a felt pocket. Its zip runs straight across, `height` of its half height above
# the middle and `reach` of its half width to each side (an arc would read as a frown), and the pull
# hangs from the zip's right end: a teardrop of circles (x, y, r).
BELLY = {"at": (-0.01, -0.155), "size": (0.1, 0.07), "half": 0.012, "lift": 0.002, "samples": 32}
ZIP = {"height": 0.38, "reach": 0.72, "r": 0.0065, "count": 8}
PULL = {"circles": [(0.0, 0.34, 0.3), (0.0, -0.2, 0.5)], "r": 0.03, "half": 0.006, "drop": 0.026, "lift": 0.004}

# The right strap as points (x, y) on the pet's front with sections (across, deep) per point,
# mirrored to the left: padded from the shoulder beside the neck down the chest, then a short end
# of webbing below the buckle. On the left its round end shows over the shoulder as if it went on
# behind; on the right its first points are `RIGHT_TOP`, from under the frog, which is in front there.
# `lift` keeps the back of each part on the pet; `ring` and `count` are its resolution.
PADDED = {
    "points": [(0.465, 0.12), (0.45, 0.02), (0.46, -0.1), (0.48, -0.21)],
    "sections": [(0.05, 0.02), (0.062, 0.022), (0.064, 0.022), (0.056, 0.02)], "lift": 0.024, "ring": 12, "count": 14,
}
RIGHT_TOP = [(0.56, 0.125), (0.472, 0.04)]
WEBBING = {"points": [(0.48, -0.21), (0.488, -0.29), (0.495, -0.36)], "sections": [(0.03, 0.009)] * 3, "lift": 0.013, "ring": 10, "count": 8}
# The buckle: a rounded frame across the strap where the padding ends, (along, across) half sizes.
BUCKLE = {"size": (0.026, 0.078), "bar": (0.011, 0.008), "loop": 20, "lift": 0.002}

# name -> (hex, glow, fluff). Deeper than they show: the app lightens every colour towards pastel.
SWATCH = {
    "Rucksackgrün": ("#1f7a1d", 0.3, 0.8),
    "Rucksackriemen": ("#1d5e22", 0.25, 0.6),
    "Rucksackcreme": ("#f3dcb4", 0.8, 0.6),
    "Rucksackschnalle": ("#155c22", 0.2, 0.1),
    "Rucksackauge": ("#1d1630", 0.1),
    "Rucksackglanz": ("#fffaf0", 1.0),
    "Rucksackbäckchen": ("#e0306a", 0.5, 0.5),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def ellipse(rx, ry, samples):
    return [(rx * math.cos(a), ry * math.sin(a)) for a in (2 * math.pi * k / samples for k in range(samples))]


def smax(a, b, k):
    """The intersection of two distances with a soft edge `k` wide."""
    return -smooth_union(-a, -b, k)


def frame(normal, up):
    """Unit vectors across and up in the plane facing `normal`, with `up` as near as it gets."""
    across = np.cross(up, normal)
    across /= np.linalg.norm(across)
    return across, np.cross(normal, across)


# ---------------------------------------------------------------------------------------------
# The frog.


def body_2d(r, y):
    """Signed distance to the bell's outline at radius `r` and height `y`, negative inside."""
    edges = list(zip(PET_BODY[:-1], PET_BODY[1:])) + [((0.0, PET_BODY[0, 1]), PET_BODY[0])]
    d = np.full(np.shape(r), np.inf)
    for (ax, ay), (bx, by) in edges:
        dx, dy = bx - ax, by - ay
        t = np.clip(((r - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.minimum(d, np.hypot(r - ax - t * dx, y - ay - t * dy))
    inside = (y > PET_BODY[0, 1]) & (y < PET_BODY[-1, 1]) & (r < np.interp(y, PET_BODY[:, 1], PET_BODY[:, 0]))
    return np.where(inside, -d, d)


def axes():
    """The frog's across and up directions in the picture plane."""
    lean = math.radians(LEAN)
    return np.array((math.cos(lean), -math.sin(lean), 0.0)), np.array((math.sin(lean), math.cos(lean), 0.0))


def frog_sdf(points):
    """Signed distance to the frog, cut where the pet's silhouette begins and clear of the head."""
    points = np.asarray(points)
    across, up = axes()
    q = points - ORIGIN
    local = np.stack([q @ across, q @ up, q[..., 2]], -1)
    (bottom, r_bottom), (top, r_top) = GUMDROP["bottom"], GUMDROP["top"]
    shape = sd_round_cone(local * (1, 1, 1 / DEPTH), bottom, top, r_bottom, r_top)
    a, u, d = EYE_BUMPS["at"]
    for side in (-1, 1):
        shape = smooth_union(shape, sd_ellipsoid(local, (side * a, u, d), EYE_BUMPS["size"]), EYE_BUMPS["seam"])
    x, y = points[..., 0], points[..., 1]
    shape = smax(shape, -(body_2d(np.abs(x), y) + CLIP["tuck"]), CLIP["tuck_soft"])
    return smax(shape, CLIP["head"] - np.hypot(x, y - HEAD_Y), CLIP["head_soft"])


def on_frog(across, up):
    """The frog's front at (across, up) of its frame, as the camera sees it, and the normal there:
    the first step along -z that lands inside, refined. `ray_onto` alone may find a thin part's back."""
    a, u = axes()
    x, y, _ = np.asarray(ORIGIN) + a * across + u * up
    z = np.linspace(FRONT["top"], FRONT["bottom"], FRONT["steps"])
    k = int(np.argmax(frog_sdf(np.stack([np.full(len(z), x), np.full(len(z), y), z], -1)) < 0))
    point = ray_onto(frog_sdf, [(x, y, z[k - 1])], (0, 0, -1), z[k - 1] - z[k])
    return point[0], unit_rows(sdf_gradient(frog_sdf, point))[0]


def face_meshes():
    """Eyes and smile, the glints and the cheeks, laid onto the frog."""
    _, up = axes()
    dark, glints, cheeks = [], [], []
    for side in (-1, 1):
        at, normal = on_frog(side * EYE_BUMPS["at"][0], EYE_BUMPS["at"][1])
        dark.append(sdf_decal(frog_sdf, at, normal, ellipse(*EYES["size"], EYES["samples"]), EYES["lift"], EYES["half"], up=up, reach=REACH))
        across, rise = frame(normal, up)
        for (u, v), r in GLINTS:
            glint = ellipse(r, r, GLINT["samples"])
            glints.append(sdf_decal(frog_sdf, at + across * u + rise * v, normal, glint, GLINT["lift"], GLINT["half"], dome(3), up=up, reach=REACH))
        at, normal = on_frog(side * CHEEKS["at"][0], CHEEKS["at"][1])
        cheek = ellipse(*CHEEKS["size"], CHEEKS["samples"])
        cheeks.append(sdf_decal(frog_sdf, at, normal, cheek, CHEEKS["lift"], CHEEKS["half"], dome(3), up=up, reach=REACH))
    dark.append(smile_mesh())
    return merge(dark), merge(glints), merge(cheeks)


def tube_on_frog(points, r, rest):
    """A thin tube through points (across, up) of the frog's frame, lying on its front."""
    samples = []
    for across, up in points:
        at, normal = on_frog(across, up)
        samples.append((Vector(at + normal * r * rest), r, r))
    return outward(sweep(samples, ring_size=8, cap_rings=4))


def smile_mesh():
    """A small U-shaped smile below the eyes."""
    s = SMILE
    ts = [-1 + 2 * k / (s["count"] - 1) for k in range(s["count"])]
    return tube_on_frog([(t * s["half"], s["up"] - s["dip"] * (1 - t * t)) for t in ts], s["r"], s["rest"])


def pocket_meshes():
    """The belly pocket, its zip along the top and the pull hanging from the zip's right end."""
    _, up = axes()
    (cx, cy), (rx, ry) = BELLY["at"], BELLY["size"]
    at, normal = on_frog(cx, cy)
    pocket = sdf_decal(frog_sdf, at, normal, ellipse(rx, ry, BELLY["samples"]), BELLY["lift"], BELLY["half"], PATCH, up=up, reach=REACH)
    rest = (BELLY["lift"] + BELLY["half"]) / ZIP["r"] + 1
    reach, count = ZIP["reach"] * rx, ZIP["count"]
    line = [(cx - reach + 2 * reach * k / (count - 1), cy + ZIP["height"] * ry) for k in range(count)]
    zip_line = tube_on_frog(line, ZIP["r"], rest)
    hook, normal = on_frog(line[-1][0], line[-1][1] - PULL["drop"])
    centre = hook + normal * (BELLY["lift"] + BELLY["half"] + PULL["lift"])
    pull = badge(circles_outline(PULL["circles"], (0, 0)), centre, Vector(normal), PULL["r"], PULL["half"], ring_size=20, stacks=3, up=Vector(up), passes=2)
    return pocket, zip_line, outward(pull)


# ---------------------------------------------------------------------------------------------
# The straps.


def strap_part(part, points, sections):
    return outward(decal_strand(points, sections, part["lift"], ring_size=part["ring"], count=part["count"]))


def strap_mesh():
    """Both straps: the padded parts, the right one reaching under the frog, and the webbing."""
    parts = []
    for side in (-1, 1):
        points = [(side * x, y) for x, y in PADDED["points"]]
        sections = PADDED["sections"]
        if side > 0:
            points = [*RIGHT_TOP, *points[len(RIGHT_TOP):]]
        parts.append(strap_part(PADDED, points, sections))
        parts.append(strap_part(WEBBING, [(side * x, y) for x, y in WEBBING["points"]], WEBBING["sections"]))
    return merge(parts)


def pet_normal(x, y, step=1e-3):
    """The normal of the pet's soft front at (x, y)."""
    dx = (surface_z(x + step, y) - surface_z(x - step, y)) / (2 * step)
    dy = (surface_z(x, y + step) - surface_z(x, y - step)) / (2 * step)
    normal = np.array((-dx, -dy, 1.0))
    return normal / np.linalg.norm(normal)


def buckle_mesh():
    """A rounded frame lying across the strap where the padding ends."""
    (x0, y0), (x1, y1) = PADDED["points"][-2:]
    normal = pet_normal(x1, y1)
    along = np.array((x1 - x0, y1 - y0, 0.0))
    along -= normal * along.dot(normal)
    along /= np.linalg.norm(along)
    across = np.cross(normal, along)
    top = PADDED["lift"] + PADDED["sections"][-1][1] + BUCKLE["bar"][1] + BUCKLE["lift"]
    middle = np.array((x1, y1, surface_z(x1, y1))) + np.array((0, 0, top))
    a, b = BUCKLE["size"]
    loop = []
    for j in range(BUCKLE["loop"]):
        phi = 2 * math.pi * j / BUCKLE["loop"]
        c, s = math.cos(phi), math.sin(phi)
        # A squircle, so the frame has straight bars and round corners.
        loop.append(Vector(middle + along * (a * math.copysign(abs(c) ** 0.5, c)) + across * (b * math.copysign(abs(s) ** 0.5, s))))
    return outward(closed_sweep(loop, *BUCKLE["bar"], ring_size=6, up=Vector(normal)))


def build(collection):
    """The frog with its face and pocket, both straps and their buckles."""
    verts, faces = surface_nets(frog_sdf, GRID["low"], GRID["high"], GRID["step"])
    frog = generator.add_mesh(collection, "backpack_frog", outward((verts, faces)), mat("Rucksackgrün"))
    frog.modifiers.new("Vereinfachen", "DECIMATE").ratio = min(1.0, GRID["verts"] / len(verts))
    dark, glints, cheeks = face_meshes()
    generator.add_mesh(collection, "backpack_eyes", dark, mat("Rucksackauge"))
    generator.add_mesh(collection, "backpack_glints", glints, mat("Rucksackglanz"))
    generator.add_mesh(collection, "backpack_cheeks", cheeks, mat("Rucksackbäckchen"))
    pocket, zip_line, pull = pocket_meshes()
    generator.add_mesh(collection, "backpack_pocket", pocket, mat("Rucksackcreme"))
    generator.add_mesh(collection, "backpack_zip", zip_line, mat("Rucksackschnalle"))
    generator.add_mesh(collection, "backpack_pull", pull, mat("Rucksackschnalle"))
    generator.add_mesh(collection, "backpack_straps", strap_mesh(), mat("Rucksackriemen"))
    generator.add_mesh(collection, "backpack_buckles", buckle_mesh(), mat("Rucksackcreme"), mirror=True)


generator.run("mini-backpack", "Körper", build, __file__)
