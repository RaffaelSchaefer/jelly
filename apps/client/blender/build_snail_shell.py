"""Builds `snail-shell`: a chibi snail shell the pet wears on its back, peeking out above its right
shoulder (a joke about lag; the look stays cute).

The shell is one implicit surface: a dome over an elliptic disk that sits mostly behind the pet. Its
front rises round the eye of a logarithmic spiral and dips along it, so the whorls bulge like
cushions. Only the part beside the pet exists: the disk is clipped to the outside of the pet's
silhouette as the app's camera sees it, the corners rounded, and meshed by surface nets. A cream
cord lies in the spiral's groove, from a round bead at the eye out over the whorls, and tapers off
where the shell goes behind the head. Three fine growth lines cross the big outer whorl.

    blender blender/cosmetics.blend --background --python blender/build_snail_shell.py -- [--save] [--export]

The app paints cosmetics on top of the pet like a sticker, so the shell exists only outside the
pet's 2D silhouette: its root reaches a little under the body bell's edge, and it keeps a clear gap
to the head, which moves. Modelled in pet coordinates (Three.js).
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import blob, merge, outward, sdf_gradient, smooth_union, surface_nets, sweep, unit_rows  # noqa: E402

# The pet window's camera (PetScene.tsx): the clip uses the silhouette it sees, projected onto z = 0.
CAMERA = (0.0, 0.1, 5.8)
# The pet from jellyGeometry.ts: head ellipsoid and the body's lathe profile (radius, height), which
# the app draws as a centripetal Catmull-Rom curve of 96 points. Only the upper bell matters here.
HEAD = {"at": (0.0, 0.66, 0.2), "r": 0.62, "depth": 0.9}
BODY_PROFILE = [
    (0.0, -1.05), (0.5, -1.05), (0.7, -1.025), (0.81, -0.95), (0.86, -0.79), (0.86, -0.55),
    (0.83, -0.33), (0.75, -0.14), (0.6, 0.02), (0.4, 0.11), (0.18, 0.15), (0.0, 0.16),
]
BODY = {"depth": 0.8, "samples": 96, "above": -0.6}
# The root reaches `tuck` under the bell's edge. The gap to the head holds the pet's ink, a clear
# sliver and the shell's ink (0.035 each), and covers the head's bob and tilt. `soft` rounds the cut.
CLIP = {"tuck": 0.014, "head_gap": 0.08, "soft": 0.02}

# The shell's outline: an elliptic disk (centre, half sizes) mostly behind the pet, its round right
# part showing. The corners where it meets the head's outline are rounded over `corner`.
DISK = {"at": (0.7, 0.35), "size": (0.345, 0.37), "corner": 0.1}
# Its dome over the centre plane `z`: height of the front and of the back at the disk's middle.
DOME = {"z": -0.05, "front": 0.2, "back": 0.06}
# The spire: how far the whorls round the spiral's eye rise above the dome, and over what radius.
SPIRE = {"height": 0.07, "width": 0.15}
# The logarithmic spiral of the groove and the cord: eye (x, y), radius at its outer end, turns,
# growth per turn, direction of the outer end in degrees and sense (1: counter-clockwise outwards).
SPIRAL = {"eye": (0.8, 0.34), "outer": 0.25, "turns": 2.5, "growth": 2.1, "end": 165.0, "sense": 1}
# The groove: depth at the outer end (it shrinks with the spiral). Groove and spire fade out over
# the outer `fade` of the dome's height, so the outline stays round.
RELIEF = {"groove": 0.045, "fade": 0.5}
# Surface nets: box and grid step; Decimate thins the mesh to `verts`.
GRID = {"low": (0.36, -0.1, -0.14), "high": (1.08, 0.8, 0.26), "step": 0.008, "verts": 2400}
# The cord: radius at the eye and at the outer end, how far it sinks into the groove (in radii),
# samples per turn, ring size and cap rings. Within `taper` of the cut it thins to `tip` and ends.
CORD = {"inner": 0.014, "outer": 0.027, "sink": 0.35, "per_turn": 32, "ring": 10, "caps": 5, "taper": 0.08, "tip": 0.006}
# The bead at the spiral's start: radius, how far it stands out of the shell (in radii), resolution.
BEAD = {"r": 0.026, "lift": 0.2, "ring": 16, "stacks": 8}
# Growth lines across the outer whorl: directions from the eye in degrees; each stroke keeps `gap`
# to the cord and `margin` to the rim, bends by `bend` degrees, is at most `r` thick and at least
# `shortest` long, and sinks `sink` radii into the shell (more than 1: a low ridge). A stroke swells
# from `ends` (as sin(pi ends) ** fullness of `r`) to full in its middle. The rim is searched over
# `search` (length, samples) along the ray from the eye.
GROWTH = {
    "angles": (228, 258, 288), "gap": 0.018, "margin": 0.04, "bend": 14.0, "r": 0.008, "shortest": 0.05, "sink": 1.3,
    "ends": 0.1, "fullness": 0.6, "samples": 9, "ring": 8, "caps": 3, "search": (0.5, 201),
}

# name -> (hex, glow, fluff, tint). Much deeper than they show: the app lightens them towards pastel (a bandana's
# #d81f2a came out light salmon).
SWATCH = {
    "Schneckenkaramell": ("#a8481a", 0.3, None, 1),
    "Schneckenspirale": ("#f3dcb4", 0.6),
    "Schneckenrille": ("#6e2e0c", 0.3, None, 0.41),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


# ---------------------------------------------------------------------------------------------
# The pet's silhouette, as the camera sees it on the plane z = 0.


def centripetal(points, count):
    """`count` + 1 points on Three.js's centripetal CatmullRomCurve3 through `points` (getPoints)."""
    pts = np.asarray(points, float)
    n, out = len(pts), []
    for i in range(count + 1):
        t = (n - 1) * i / count
        k = min(int(t), n - 2)
        w = t - k
        p0 = pts[k - 1] if k > 0 else 2 * pts[0] - pts[1]
        p1, p2 = pts[k], pts[k + 1]
        p3 = pts[k + 2] if k + 2 < n else 2 * pts[-1] - pts[-2]
        dt0, dt1, dt2 = (max(np.sum((b - a) ** 2) ** 0.25, 1e-4) for a, b in ((p0, p1), (p1, p2), (p2, p3)))
        t1 = ((p1 - p0) / dt0 - (p2 - p0) / (dt0 + dt1) + (p2 - p1) / dt1) * dt1
        t2 = ((p2 - p1) / dt1 - (p3 - p1) / (dt1 + dt2) + (p3 - p2) / dt2) * dt1
        out.append(p1 + t1 * w + (-3 * p1 + 3 * p2 - 2 * t1 - t2) * w * w + (2 * p1 - 2 * p2 + t1 + t2) * w**3)
    return np.array(out)


def silhouette():
    """The head's outline (centre, radius) and the bell's right edge, both projected onto z = 0."""
    cx, cy, cz = CAMERA
    x, y, z = HEAD["at"]
    deep = HEAD["r"] * HEAD["depth"]
    head = ((x, cy + (y - cy) * cz / (cz - z)), HEAD["r"] * cz / math.sqrt((cz - z) ** 2 - deep**2))
    line = centripetal(BODY_PROFILE, BODY["samples"])
    # A lathe of depth 0.8 r looks a little wider than r from the camera.
    line[:, 0] *= cz / np.sqrt(cz**2 - (BODY["depth"] * line[:, 0]) ** 2)
    return head, line[line[:, 1] > BODY["above"]]


(HEAD_CENTRE, HEAD_SIL), BODY_LINE = silhouette()


def project(points):
    """(x, y) where the camera sees `points` on the plane z = 0."""
    cx, cy, cz = CAMERA
    f = cz / (cz - points[:, 2])
    return cx + (points[:, 0] - cx) * f, cy + (points[:, 1] - cy) * f


def body_sd(x, y):
    """Signed 2D distance to the body bell (negative inside)."""
    x = np.abs(x)
    dist = np.full(x.shape, np.inf)
    for a, b in zip(BODY_LINE, BODY_LINE[1:]):
        e = b - a
        t = np.clip(((x - a[0]) * e[0] + (y - a[1]) * e[1]) / (e @ e), 0, 1)
        dist = np.minimum(dist, np.hypot(x - a[0] - t * e[0], y - a[1] - t * e[1]))
    inside = (y < BODY_LINE[-1, 1]) & (x < np.interp(y, BODY_LINE[:, 1], BODY_LINE[:, 0]))
    return np.where(inside, -dist, dist)


def room_parts(points):
    """Signed distances to where the shell may be: outside the bell less the tuck, and clear of the head."""
    x, y = project(points)
    return body_sd(x, y) + CLIP["tuck"], np.hypot(x - HEAD_CENTRE[0], y - HEAD_CENTRE[1]) - HEAD_SIL - CLIP["head_gap"]


def room(points):
    return np.minimum(*room_parts(points))


# ---------------------------------------------------------------------------------------------
# The spiral.


def spiral_shape():
    """Growth rate b of rho = rho0 e^(b phi), rho0 at the eye, the angle where phi = 0 and phi's end."""
    s = SPIRAL
    b = math.log(s["growth"]) / (2 * math.pi)
    total = 2 * math.pi * s["turns"]
    return b, s["outer"] * math.exp(-b * total), math.radians(s["end"]) - s["sense"] * total, total


def spiral_point(phi):
    b, rho0, start, _ = spiral_shape()
    rho, angle = rho0 * math.exp(b * phi), start + SPIRAL["sense"] * phi
    return SPIRAL["eye"][0] + rho * math.cos(angle), SPIRAL["eye"][1] + rho * math.sin(angle), rho


def spiral_distance(x, y):
    """Radial distance to the nearest turn of the spiral and that turn's radius (its scale)."""
    b, rho0, start, total = spiral_shape()
    dx, dy = x - SPIRAL["eye"][0], y - SPIRAL["eye"][1]
    r = np.hypot(dx, dy)
    local = np.mod(SPIRAL["sense"] * (np.arctan2(dy, dx) - start), 2 * math.pi)
    best, scale = np.full(r.shape, np.inf), np.full(r.shape, rho0)
    for n in range(int(SPIRAL["turns"]) + 2):
        phi = local + 2 * math.pi * n
        rho = rho0 * np.exp(b * np.minimum(phi, total))
        dist = np.where(phi <= total, np.abs(r - rho), np.inf)
        closer = dist < best
        best, scale = np.where(closer, dist, best), np.where(closer, rho, scale)
    for phi in (0.0, total):
        px, py, rho = spiral_point(phi)
        dist = np.hypot(x - px, y - py)
        closer = dist < best
        best, scale = np.where(closer, dist, best), np.where(closer, rho, scale)
    return best, scale


# ---------------------------------------------------------------------------------------------
# The shell.


def disk_rho(x, y):
    """How far (x, y) lies out on the disk: 0 in the middle, 1 on the rim."""
    (cx, cy), (rx, ry) = DISK["at"], DISK["size"]
    return np.hypot((x - cx) / rx, (y - cy) / ry)


def heights(x, y):
    """Height of the front and of the back over the centre plane at (x, y), negative off the disk.
    The front rises at the spiral's eye and dips along the spiral, so the whorls bulge."""
    rho = disk_rho(x, y)
    base = np.sqrt(np.clip(1 - rho * rho, 0, 1))
    beyond = np.clip(rho - 1, 0, None) * min(DISK["size"])
    dist, scale = spiral_distance(x, y)
    half = scale * (1 - 1 / SPIRAL["growth"]) / 2
    groove = RELIEF["groove"] * scale / SPIRAL["outer"] * np.square(np.clip(1 - dist / half, 0, 1))
    spire = SPIRE["height"] * np.exp(-np.square(np.hypot(x - SPIRAL["eye"][0], y - SPIRAL["eye"][1]) / SPIRE["width"]))
    fade = np.clip(base / RELIEF["fade"], 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    return DOME["front"] * base + (spire - groove) * fade - beyond, DOME["back"] * base - beyond


def shell_sdf(points):
    """The domed shell over its disk (not yet clipped); not a true distance, but its zero is exact."""
    front, back = heights(points[:, 0], points[:, 1])
    z = points[:, 2] - DOME["z"]
    return np.maximum(z - front, -z - back)


def smax(a, b, k):
    return -smooth_union(-a, -b, k)


def outline_sd(points):
    """Signed 2D distance to the shell's outline: the disk where the pet leaves room. The corners at
    the head are rounded wide; the cut at the bell stays tight, so the root keeps its tuck."""
    disk = (disk_rho(points[:, 0], points[:, 1]) - 1) * min(DISK["size"])
    bell, head = room_parts(points)
    return smax(smax(disk, -head, DISK["corner"]), -bell, CLIP["soft"])


def clipped_sdf(points):
    return smax(shell_sdf(points), outline_sd(points), CLIP["soft"])


def cord_mesh():
    """The cream cord along the spiral, lying in its groove, from a bead at the eye outwards. Where
    the shell goes behind the head, the cord thins to a point."""
    _, _, _, total = spiral_shape()
    count = int(SPIRAL["turns"] * CORD["per_turn"]) + 1
    phis = np.linspace(0, total, count)
    flat = np.array([spiral_point(phi) for phi in phis])[:, :2]
    radii = CORD["inner"] + (CORD["outer"] - CORD["inner"]) * phis / total
    on, normals, _ = on_shell(flat, radii, CORD["sink"])
    radii *= np.sqrt(np.clip(room(on) / CORD["taper"], 0, 1))
    end = int(np.argmax(radii < CORD["tip"])) or count
    centres = on + normals * (radii * (1 - CORD["sink"]))[:, None]
    cord = sweep([(Vector(c), r, r) for c, r in zip(centres[:end], radii[:end])], ring_size=CORD["ring"], cap_rings=CORD["caps"])
    bead = blob(on[0] + normals[0] * BEAD["r"] * BEAD["lift"], normals[0], (0, 1, 0), (BEAD["r"],) * 3, ring=BEAD["ring"], stacks=BEAD["stacks"])
    return merge([outward(cord), bead])


def last_turn(angle):
    """Radius and phi of the spiral's outermost turn in the direction `angle` (radians) from the eye."""
    b, rho0, start, total = spiral_shape()
    local = (SPIRAL["sense"] * (angle - start)) % (2 * math.pi)
    phi = local + 2 * math.pi * math.floor((total - local) / (2 * math.pi))
    return rho0 * math.exp(b * phi), phi


def on_shell(flat, radii, sink):
    """Centres of a tube along 2D points `flat` that lies on the shell's front, sunk `sink` radii into it."""
    on = np.c_[flat, DOME["z"] + heights(flat[:, 0], flat[:, 1])[0]]
    normals = unit_rows(sdf_gradient(shell_sdf, on))
    return on, normals, on + normals * (radii * (1 - sink))[:, None]


def growth_mesh():
    """Short strokes across the outer whorl, from beside the cord out towards the rim."""
    _, _, _, total = spiral_shape()
    eye, t = np.asarray(SPIRAL["eye"]), np.linspace(0, 1, GROWTH["samples"])
    strokes = []
    for degrees in GROWTH["angles"]:
        angle = math.radians(degrees)
        rho, phi = last_turn(angle)
        # Out along the ray until the shell's edge comes near.
        reach = rho + np.linspace(0, *GROWTH["search"])
        ray = np.c_[eye + reach[:, None] * (math.cos(angle), math.sin(angle)), np.zeros(len(reach))]
        rim = reach[int(np.argmax(outline_sd(ray) > -GROWTH["margin"]))]
        start = rho + CORD["inner"] + (CORD["outer"] - CORD["inner"]) * phi / total + GROWTH["gap"]
        if rim - start < GROWTH["shortest"]:
            continue
        rhos = start + (rim - start) * t
        angles = angle + SPIRAL["sense"] * math.radians(GROWTH["bend"]) * t
        flat = eye + rhos[:, None] * np.c_[np.cos(angles), np.sin(angles)]
        radii = GROWTH["r"] * np.sin(np.pi * (GROWTH["ends"] + (1 - 2 * GROWTH["ends"]) * t)) ** GROWTH["fullness"]
        _, _, centres = on_shell(flat, radii, GROWTH["sink"])
        strokes.append(outward(sweep([(Vector(c), r, r) for c, r in zip(centres, radii)], ring_size=GROWTH["ring"], cap_rings=GROWTH["caps"])))
    return merge(strokes)


def build(collection):
    """The shell, clipped to the outside of the pet, and the cream cord in its spiral groove."""
    verts, faces = surface_nets(clipped_sdf, GRID["low"], GRID["high"], GRID["step"])
    shell = generator.add_mesh(collection, "snail_shell", outward((verts, faces)), mat("Schneckenkaramell"))
    shell.modifiers.new("Vereinfachen", "DECIMATE").ratio = min(1.0, GRID["verts"] / len(verts))
    generator.add_mesh(collection, "snail_spiral", cord_mesh(), mat("Schneckenspirale"))
    generator.add_mesh(collection, "snail_growth", growth_mesh(), mat("Schneckenrille"))


generator.run("snail-shell", "Körper", build, __file__)
