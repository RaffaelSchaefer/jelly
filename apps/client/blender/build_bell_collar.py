"""Builds `bell-collar`: a pink frill collar with a big yellow bell under the chin.

The collar is two big, smooth bubblegum-pink lobes that flare from the neck to either side of the
bell, a soft pillow without pleats. The bell is a round butter-yellow ball with a single keyhole: an
oval hole below its middle and a slit from it down round the bottom, in dark maroon. Collar and bell
are tucked under the chin: in the camera's view their tops stop at the line where head and body
meet, because a sticker painted over the pet cannot hide behind the head.

    blender blender/cosmetics.blend --background --python blender/build_bell_collar.py -- [--save] [--export]

Slot Körper: the collar hangs in the jelly's root and stays with the body. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import catmull, dome, merge, outward, skin, smooth_union, surface_nets, surface_z, sweep  # noqa: E402

# The chin in the camera's view: a wide circle (centre y, radius) through the crease where head and
# body meet (y 0.075 at x 0), further out the head's own outline. Collar and bell stop `lift` above.
CHIN = {"crease": (1.143, 1.068), "head": (0.66, 0.62), "lift": 0.012}

# Each lobe is an ellipse (centre, half sizes) cut by the chin, so it meets the head almost square
# instead of in a horn; its lower edge starts at angle `from` (degrees) beside the bell. Behind the
# bell that edge only joins the two lobes, through `middle` (y at x 0).
LOBE = {"centre": (0.3, 0.065), "size": (0.18, 0.135), "middle": -0.04, "from": -125}
# The pillow: cross-sections from end to end, points round each, how far it puffs out of the neck
# per |x| (it rounds off towards the ends at `round` times its half width) and its lift.
COLLAR = {"sections": 64, "ring": 14, "puff": [(0.0, 0.035), (0.2, 0.06), (0.45, 0.05)], "round": 0.9, "lift": 0.006}
# The collar lies on a smooth neck instead of the pet's steep sides: its front depth `z` at height
# `y`, deeper by `curve`·(height - y)² above and below, round in x with half width `half`.
NECK = {"z": 0.455, "y": 0.07, "curve": 6.0, "half": 0.56}

# The bell: radius, how far its centre sits below the chin and how far it stands out of the body
# (shares of the radius), the softness of its cut, how much higher than the collar's top edge it is
# cut (the soft cut rounds it down to meet that edge) and the grid that meshes it.
BELL = {"r": 0.21, "below": 0.3, "out": 0.55, "soft": 0.05, "tuck": 0.022, "step": 0.005, "verts": 1000}
# The keyhole in shares of the bell's radius: the oval hole's centre and half sizes in the camera's
# view, the slit's half width, and where the slit runs (degrees from the bell's front, downwards).
KEYHOLE = {"hole": (0.0, -0.36), "size": (0.25, 0.17), "slit": 0.1, "from": 24, "to": 93}
# Thickness and lift of the keyhole above the bell, in pet units; the slit sinks towards the bottom
# so it does not bump the bell's outline.
KEYHOLE_DEPTH = {"half": 0.007, "lift": 0.004, "bottom_lift": -0.007}

# name -> (hex, glow, fluff). Much deeper than they show: the app lightens every colour towards
# pastel (a red #d81f2a turns light salmon), so this pink ends up bubblegum and the gold butter yellow.
# The keyhole stays near ink, as in the line art.
SWATCH = {
    "Glöckchenrosa": ("#dc3a78", 0.4, 0.4),
    "Glöckchengold": ("#eea412", 0.5, None),
    "Glöckchenschlitz": ("#33100d", 0.1, None),
}

# Windows the app keeps free: mouth, cheeks and eyes as (x, y, half x, half y), mirrored in x.
WINDOWS = [(0.0, 0.4325, 0.12, 0.0875), (0.33, 0.54, 0.075, 0.045), (0.19, 0.66, 0.07, 0.07)]
OUTLINE = 0.035


def mat(name):
    return generator.material(name, *SWATCH[name])


def chin_y(x):
    """Where the chin line runs at `x`, lifted by CHIN["lift"]."""
    arcs = [cy - math.sqrt(r * r - x * x) for cy, r in (CHIN["crease"], CHIN["head"]) if abs(x) < r]
    return max(arcs) + CHIN["lift"]


def sd_below_chin(points, lift):
    """Signed distance in the camera's view to the region below the chin lifted by `lift`: outside
    both circles."""
    return np.maximum.reduce([r - np.hypot(points[:, 0], points[:, 1] - cy - lift) for cy, r in (CHIN["crease"], CHIN["head"])])


def profile(table, x):
    """Linear in |x| between the entries of `table` (|x|, value)."""
    x = abs(x)
    for (x0, a), (x1, b) in zip(table, table[1:]):
        if x <= x1:
            return a + (b - a) * (x - x0) / (x1 - x0)
    return table[-1][1]


def along(points, count):
    """`count` points evenly spaced along the polyline `points`, ends included."""
    lengths = [0.0]
    for a, b in zip(points, points[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    out, k = [], 0
    for i in range(count):
        target = lengths[-1] * i / (count - 1)
        while k < len(points) - 2 and lengths[k + 1] < target:
            k += 1
        span = lengths[k + 1] - lengths[k]
        out.append(points[k].lerp(points[k + 1], (target - lengths[k]) / span if span else 0.0))
    return out


# ---------------------------------------------------------------------------------------------
# The collar.


def neck_z(x, y):
    """The smooth neck the collar lies on: its front depth at (x, y)."""
    n = NECK
    return (n["z"] + n["curve"] * (y - n["y"]) ** 2) * math.sqrt(max(0.0, 1 - (x / n["half"]) ** 2))


def lobe_corner():
    """The angle on the right lobe's ellipse where it runs into the chin."""
    (cx, cy), (rx, ry) = LOBE["centre"], LOBE["size"]
    lo, hi = 0.0, math.pi / 2
    for _ in range(40):
        mid = (lo + hi) / 2
        below = cy + ry * math.sin(mid) < chin_y(cx + rx * math.cos(mid))
        lo, hi = (mid, hi) if below else (lo, mid)
    return lo


def collar_edges(count):
    """The collar's top (on the chin) and bottom edge from its left end to its right, `count` each."""
    (cx, cy), (rx, ry) = LOBE["centre"], LOBE["size"]
    start, corner = math.radians(LOBE["from"]), lobe_corner()
    arc = [Vector((cx + rx * math.cos(a), cy + ry * math.sin(a), 0)) for a in (start + (corner - start) * k / 12 for k in range(13))]
    left = [Vector((-p.x, p.y, 0)) for p in reversed(arc)]
    bottom = catmull(left + [Vector((0, LOBE["middle"], 0))] + arc, 800)
    end = arc[-1].x
    top = [Vector((x, chin_y(x), 0)) for x in (-end + 2 * end * k / 599 for k in range(600))]
    return along(top, count), along(bottom, count)


def collar_mesh():
    """A pillow between the chin and the lobed lower edge, bent round the neck, pointed at the ends
    where the lobes tuck under the head."""
    c = COLLAR
    top, bottom = collar_edges(c["sections"])
    rings = []
    for t, b in zip(top[1:-1], bottom[1:-1]):
        middle, half = (t + b) / 2, (t - b) / 2
        puff = min(profile(c["puff"], middle.x), c["round"] * half.length)
        ring = []
        for j in range(c["ring"]):
            a = 2 * math.pi * j / c["ring"]
            q = middle + half * math.cos(a)
            ring.append(Vector((q.x, q.y, neck_z(q.x, q.y) + c["lift"] + puff * math.sin(a))))
        rings.append(ring)
    poles = [Vector((p.x, p.y, neck_z(p.x, p.y) + c["lift"])) for p in (top[0], top[-1])]
    return outward(skin(rings, c["ring"], *poles))


# ---------------------------------------------------------------------------------------------
# The bell.


def bell_centre():
    r = BELL["r"]
    y = chin_y(0) - BELL["below"] * r
    return Vector((0, y, surface_z(0, y) + BELL["out"] * r))


def bell_mesh(centre):
    """A ball cut by the chin with a soft edge, meshed on a fine grid; Decimate thins it later."""
    b, c = BELL, np.asarray(centre)

    def sdf(points):
        ball = np.linalg.norm(points - c, axis=-1) - b["r"]
        return -smooth_union(-ball, -sd_below_chin(points, CHIN["lift"] + b["tuck"]), b["soft"])

    reach = b["r"] + 2 * b["step"]
    return surface_nets(sdf, c - reach, c + reach, b["step"])


def on_bell(centre, u, v, lift):
    """The point on the bell's front at (u, v) from its centre in the camera's view, `lift` above it."""
    reach = BELL["r"] + lift
    return Vector((centre.x + u, centre.y + v, centre.z + math.sqrt(max(reach * reach - u * u - v * v, 0.0))))


def keyhole_mesh(centre):
    """The oval hole as a cushion bent onto the bell, and the slit from it down round the bottom."""
    r, k, d = BELL["r"], KEYHOLE, KEYHOLE_DEPTH
    hx, hy = k["hole"][0] * r, k["hole"][1] * r
    a, b = k["size"][0] * r, k["size"][1] * r
    ring = 32
    rings = []
    for scale, height in dome(3):
        angles = (2 * math.pi * j / ring for j in range(ring))
        rings.append([on_bell(centre, hx + scale * a * math.cos(t), hy + scale * b * math.sin(t), d["lift"] + d["half"] * height) for t in angles])
    hole = outward(skin(rings, ring, on_bell(centre, hx, hy, d["lift"] - d["half"]), on_bell(centre, hx, hy, d["lift"] + d["half"])))
    samples, count = [], 14
    for i in range(count):
        u = i / (count - 1)
        angle = math.radians(k["from"] + (k["to"] - k["from"]) * u)
        reach = r + d["lift"] + (d["bottom_lift"] - d["lift"]) * u * u
        point = Vector((centre.x, centre.y - reach * math.sin(angle), centre.z + reach * math.cos(angle)))
        samples.append((point, d["half"], k["slit"] * r))
    slit = outward(sweep(samples, ring_size=10, cap_rings=4, up=Vector((1, 0, 0))))
    return merge([hole, slit])


# ---------------------------------------------------------------------------------------------
# The check and the build.


def check(meshes):
    """Fails the build if a vertex, outline included, reaches a face window or leaves the bounds."""
    for name, (verts, _) in meshes.items():
        for v in verts:
            x, y = abs(v[0]), v[1]
            assert x + OUTLINE < 1.85 and y + OUTLINE < 1.6, f"{name} out of bounds at {tuple(v)}"
            for wx, wy, hx, hy in WINDOWS:
                inside = abs(x - wx) < hx + OUTLINE and abs(y - wy) < hy + OUTLINE
                assert not inside, f"{name} covers a face window at {tuple(v)}"


def build(collection):
    """Collar, bell and keyhole."""
    centre = bell_centre()
    meshes = {"collar": collar_mesh(), "bell": outward(bell_mesh(centre)), "keyhole": keyhole_mesh(centre)}
    check(meshes)
    swatches = {"collar": "Glöckchenrosa", "bell": "Glöckchengold", "keyhole": "Glöckchenschlitz"}
    for part, mesh_data in meshes.items():
        obj = generator.add_mesh(collection, f"bell_collar_{part}", mesh_data, mat(swatches[part]))
        if part == "bell":
            obj.modifiers.new("Vereinfachen", "DECIMATE").ratio = min(1.0, BELL["verts"] / len(mesh_data[0]))


generator.run("bell-collar", "Körper", build, __file__)
