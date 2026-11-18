"""Builds `bandana`: a cherry-red kerchief with cream polka dots, tied round the pet's neck.

A narrow rolled band runs along the neck seam, from the left side of the body, where it tucks away,
into a small knot at the right shoulder; two short tails splay from the knot onto the body. Below
the band a triangular cloth drapes over the upper chest: it hugs the body, soft folds radiate from
its top corners, its point is rounded and a thin cream hem runs along its two lower edges. Cream dots
of different sizes lie on the cloth and ride its folds; one slips under the band.

    blender blender/cosmetics.blend --background --python blender/build_bandana.py -- [--save] [--export]

Slot "Körper": the kerchief hangs in the jelly's root, below the head, which bobs and dips above it.
Everything lies on the body's front, a copy of its lathe profile rounded by a Catmull-Rom curve, so
the cloth shows the folds and no creases of the profile. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import BODY_DEPTH, BODY_PROFILE, blob, catmull, circles_outline, merge, outward, resample, skin, smooth  # noqa: E402

# The band's centre line (x, y) from the left side of the body into the knot, and its sections
# (across, deep): fattest in front, thinner where it turns away round the neck.
BAND = [(-0.555, 0.008), (-0.45, 0.03), (-0.24, 0.058), (0.0, 0.068), (0.24, 0.058), (0.42, 0.032), (0.5, 0.01)]
BAND_SECTIONS = [(0.042, 0.023), (0.046, 0.025), (0.05, 0.027), (0.052, 0.028), (0.05, 0.027), (0.046, 0.025), (0.042, 0.023)]
# How far the band stands off the body over the cloth and beside it, where it hugs the shoulders;
# it eases from one to the other between `from` and `to` past the cloth's corners.
BAND_LIFT = {"cloth": 0.03, "side": 0.018, "from": -0.02, "to": 0.05}

# The cloth: top corners at |x| `width` just above the band's centre line, the rounded point below.
# Its sides bow out a little and ripple `waves` times, as the folds reach them. `lift` and `half`
# give its distance off the body and half thickness.
CLOTH = {"width": 0.5, "top": 0.01, "tip": -0.34, "round": 0.055, "bow": 0.012, "wave": 0.006, "waves": 1, "lift": 0.012, "half": 0.009}
# Points of the outline per stretch: under the band, each side and round the point.
OUTLINE = {"top": 18, "side": 20, "tip": 8}
# The profile (scale towards the middle, height in halves) from the back to the front: a flat back,
# a narrow round rim, then a front with enough rings for the folds.
CLOTH_PROFILE = [(1.0, -1.0), (1.0, 0.0), (0.988, 0.6), (0.972, 0.9), (0.955, 1.0)] + [(s, 1.0) for s in (0.9, 0.82, 0.73, 0.63, 0.52, 0.41, 0.3, 0.19, 0.09)]
CLOTH_MIDDLE = (0.0, -0.08)
# Folds: ridges from a top corner (-1 left, 1 knot) towards a point `at` of the way down the other
# side, `rise` high just below the band and fading along the ridge, `wide` across. Negative rises
# are the valleys between them.
FOLDS = [
    (-1, 0.35, 0.026, 0.04), (-1, 0.57, -0.01, 0.035), (-1, 0.8, 0.02, 0.04),
    (1, 0.25, 0.03, 0.038), (1, 0.43, -0.01, 0.032), (1, 0.62, 0.028, 0.04), (1, 0.8, -0.008, 0.032), (1, 0.95, 0.018, 0.038),
]
# Every ridge rises over the first `fade_in` of its length (under the band it would poke through
# the band), widens from `narrow` times its width and fades with the power `falloff`.
FOLD = {"fade_in": 0.15, "narrow": 0.6, "falloff": 1.2}
# The cloth bellies out a little over the chest: (x, y), rise and half sizes.
DRAPE = {"at": (0.0, -0.16), "rise": 0.014, "size": (0.25, 0.14)}

# Polka dots (x, y, radius) on the cloth, as thin domes over its front; one slips under the band.
DOTS = [
    (-0.2, -0.05, 0.05), (0.04, -0.06, 0.042), (0.2, 0.035, 0.034), (0.26, -0.08, 0.026), (-0.05, -0.16, 0.055),
    (0.16, -0.17, 0.032), (-0.21, -0.14, 0.024), (0.03, -0.26, 0.03), (-0.35, -0.02, 0.026),
]
# Points round a dot from a radius on: (radius, points).
DOT = {"lift": 0.002, "half": 0.0045, "rings": [(0.04, 18), (0.028, 14), (0.0, 12)]}
DOT_PROFILE = [(1.0, -1.0), (1.0, 0.0), (0.8, 0.8), (0.45, 1.0)]
# The hem along both lower edges: (across, deep), centred on the cloth's rim at `sit` of its half
# thickness, so it stands a little proud of the front.
HEM = {"across": 0.011, "deep": 0.009, "sit": 0.5, "count": 34}

# The knot at the cloth's right corner: half sizes (across, up, deep) and how far it stands out.
KNOT = {"at": (0.5, 0.01), "size": (0.09, 0.075, 0.058), "lift": 0.075, "power": 2.9, "roll": -25}
# Tails from under the knot onto the body: (angle in degrees, length). A tail is a leaf whose radii
# swell from its base to its belly at `belly` of its length, then `taper` to its round tip; it lies
# `lift` off the body and rises by `rise` towards the knot.
TAILS = [(-106, 0.18), (-34, 0.16)]
TAIL = {"radii": (0.022, 0.058, 0.032), "belly": 0.7, "taper": 1.5, "lift": 0.02, "half": 0.011, "rise": 0.035}
TAIL_PROFILE = [(1.0, -1.0), (1.0, 0.0), (0.92, 0.8), (0.6, 1.0)]

# name -> (hex, glow, fluff). Deeper than they show: the app lightens every colour towards pastel.
SWATCH = {
    "Halstuchrot": ("#a00a18", 0.25, 0.4),
    "Halstuchband": ("#7a0412", 0.2, 0.4),
    "Halstuchpunkte": ("#fbe9c8", 0.9, 0.4),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


# ---------------------------------------------------------------------------------------------
# The body's front.


def _radius_curve():
    """Heights and radii of the rounded lathe profile, and the radius' slope."""
    curve = catmull([Vector((r, y, 0)) for r, y in BODY_PROFILE], 600)
    ys, rs = np.array([p.y for p in curve]), np.array([p.x for p in curve])
    order = np.argsort(ys)
    ys, rs = ys[order], rs[order]
    return ys, rs, np.gradient(rs, ys)


YS, RS, SLOPES = _radius_curve()


def smoothstep(a, b, x):
    """0 below `a`, 1 above `b`, eased in between."""
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def place(x, y, offset):
    """The point `offset` out from the body's front at (x, y), and the body's normal there."""
    r, slope = float(np.interp(y, YS, RS)), float(np.interp(y, YS, SLOPES))
    z = BODY_DEPTH * math.sqrt(max(r * r - x * x, 0.0))
    normal = Vector((x, -r * slope, z / BODY_DEPTH**2)).normalized()
    return Vector((x, y, z)) + normal * offset, normal


def lay(outline, middle, offset, profile):
    """A cushion from a closed outline (x, y) laid onto the body: ring k is the outline scaled by
    profile[k][0] towards `middle`, raised `offset(x, y, height)` along the body's normal."""
    cx, cy = middle
    rings = []
    for scale, height in profile:
        ring = []
        for x, y in outline:
            px, py = cx + (x - cx) * scale, cy + (y - cy) * scale
            ring.append(place(px, py, offset(px, py, height))[0])
        rings.append(ring)
    back, front = place(cx, cy, offset(cx, cy, -1.0))[0], place(cx, cy, offset(cx, cy, 1.0))[0]
    return outward(skin(rings, len(outline), back, front))


def tube(points, sections, offset, count, ring_size, cap_rings=4):
    """A tube along the body through `points` (x, y) with sections (across, deep), its centre
    `offset(x, y)` plus its depth out along the normal; round caps at both ends."""
    samples = smooth([(x, y, 0) for x, y in points], sections, count)
    centres = [place(p.x, p.y, offset(p.x, p.y) + w) for p, _, w in samples]

    def ring(i, centre, scale):
        (_, h, w), normal = samples[i], centres[i][1]
        t = (centres[min(i + 1, count - 1)][0] - centres[max(i - 1, 0)][0]).normalized()
        across = normal.cross(t).normalized()
        deep = t.cross(across)
        angles = (2 * math.pi * j / ring_size for j in range(ring_size))
        return [centre + across * (h * scale * math.cos(a)) + deep * (w * scale * math.sin(a)) for a in angles], t

    def cap(i, sign):
        centre, (_, h, w) = centres[i][0], samples[i]
        t = ring(i, centre, 1)[1]
        length = (h + w) / 2
        phis = [k / cap_rings * math.pi / 2 for k in range(1, cap_rings)]
        return [ring(i, centre + t * (sign * length * math.sin(phi)), math.cos(phi))[0] for phi in phis], centre + t * (sign * length)

    start, start_pole = cap(0, -1)
    end, end_pole = cap(count - 1, 1)
    middle = [ring(i, centre, 1)[0] for i, (centre, _) in enumerate(centres)]
    return outward(skin([*reversed(start), *middle, *end], ring_size, start_pole, end_pole))


# ---------------------------------------------------------------------------------------------
# The cloth.


BAND_CURVE = catmull([Vector((x, y, 0)) for x, y in BAND], 200)


def band_y(x):
    """Height of the band's centre line at `x`."""
    return float(np.interp(x, [p.x for p in BAND_CURVE], [p.y for p in BAND_CURVE]))


CORNER_Y = band_y(CLOTH["width"]) + CLOTH["top"]


def fold(x, y):
    """How far the folds lift the cloth at (x, y)."""
    c, corner_y = CLOTH, CORNER_Y
    lift = 0.0
    for side, at, rise, wide in FOLDS:
        corner = np.array((side * c["width"], corner_y))
        other = np.array((-side * c["width"], corner_y))
        target = other + (np.array((0.0, c["tip"])) - other) * at
        axis = target - corner
        length = np.linalg.norm(axis)
        axis /= length
        rel = np.array((x, y)) - corner
        t = float(rel @ axis) / length
        if not 0 <= t <= 1:
            continue
        across = abs(rel[0] * axis[1] - rel[1] * axis[0])
        width = wide * (FOLD["narrow"] + t)
        lift += rise * smoothstep(0, FOLD["fade_in"], t) * (1 - t) ** FOLD["falloff"] * math.exp(-((across / width) ** 2))
    (dx, dy), (sx, sy) = DRAPE["at"], DRAPE["size"]
    return lift + DRAPE["rise"] * math.exp(-(((x - dx) / sx) ** 2) - ((y - dy) / sy) ** 2)


def cloth_front(x, y):
    """The offset of the cloth's front off the body at (x, y)."""
    return CLOTH["lift"] + fold(x, y) + CLOTH["half"]


def cloth_outline():
    """The cloth's outline: along the band, down the right side, round the point, up the left."""
    c, n, corner_y = CLOTH, OUTLINE, CORNER_Y
    tip = Vector((0.0, c["tip"]))
    beta = math.atan2(c["width"], corner_y - c["tip"])
    reach = c["round"] / math.tan(beta)
    centre = tip + Vector((0.0, c["round"] / math.sin(beta)))
    out = [(x, band_y(x) + c["top"]) for x in np.linspace(-c["width"], c["width"], n["top"], endpoint=False)]
    for side in (1, -1):
        corner = Vector((side * c["width"], corner_y))
        end = tip + (corner - tip).normalized() * reach
        a, b = (corner, end) if side == 1 else (end, corner)
        d = b - a
        normal = Vector((-d.y, d.x)).normalized()
        for k in range(n["side"]):
            u = k / n["side"]
            p = a + d * u + normal * (math.sin(math.pi * u) * (c["bow"] + c["wave"] * math.sin(2 * math.pi * c["waves"] * u)))
            out.append((p.x, p.y))
        if side == 1:
            start = math.atan2(end.y - centre.y, end.x - centre.x)
            stop = math.pi - start
            sweep = (stop - start) % (2 * math.pi) - 2 * math.pi
            for k in range(n["tip"]):
                angle = start + sweep * k / n["tip"]
                out.append((centre.x + c["round"] * math.cos(angle), centre.y + c["round"] * math.sin(angle)))
    return out


def cloth_mesh():
    return lay(cloth_outline(), CLOTH_MIDDLE, lambda x, y, h: CLOTH["lift"] + fold(x, y) + CLOTH["half"] * h, CLOTH_PROFILE)


def hem_mesh():
    """A thin cream tube along the two lower edges, from corner to corner round the point."""
    outline = cloth_outline()[OUTLINE["top"] :] + [(-CLOTH["width"], CORNER_Y)]
    points = outline[:-1:2] + [outline[-1]]
    sit = CLOTH["half"] * HEM["sit"] - HEM["deep"]
    return tube(points, [(HEM["across"], HEM["deep"])] * len(points), lambda x, y: CLOTH["lift"] + fold(x, y) + sit, HEM["count"], 6, cap_rings=3)


def dots_mesh():
    dots = []
    for x, y, r in DOTS:
        ring = next(points for least, points in DOT["rings"] if r >= least)
        circle = [(x + r * math.cos(a), y + r * math.sin(a)) for a in (2 * math.pi * k / ring for k in range(ring))]
        dots.append(lay(circle, (x, y), lambda px, py, h: cloth_front(px, py) + DOT["lift"] + DOT["half"] * h, DOT_PROFILE))
    return merge(dots)


# ---------------------------------------------------------------------------------------------
# Band, knot and tails.


def band_mesh():
    def lift(x, y):
        b = BAND_LIFT
        return b["cloth"] + (b["side"] - b["cloth"]) * smoothstep(CLOTH["width"] + b["from"], CLOTH["width"] + b["to"], abs(x))

    return tube(BAND, BAND_SECTIONS, lift, 30, 10)


def knot_mesh():
    k = KNOT
    centre, normal = place(*k["at"], k["lift"])
    roll = math.radians(k["roll"])
    return blob(centre, normal, Vector((math.sin(roll), math.cos(roll), 0)), k["size"], power=k["power"], ring=16, stacks=8)


def tail_mesh(angle, length):
    """A leaf from the knot onto the body, rising towards its base, which hides under the knot."""
    t = TAIL
    (bx, by), (r0, r1, r2) = KNOT["at"], t["radii"]
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    circles = []
    for k in range(9):
        u = k / 8
        if u < t["belly"]:
            r = r0 + (r1 - r0) * math.sin(math.pi / 2 * u / t["belly"])
        else:
            r = r1 + (r2 - r1) * ((u - t["belly"]) / (1 - t["belly"])) ** t["taper"]
        circles.append((length * u, 0.0, r))
    flat = resample(circles_outline(circles, (length * 0.5, 0.0)), 24, 2)
    outline = [(bx + x * ca - y * sa, by + x * sa + y * ca) for x, y in flat]

    def offset(x, y, h):
        u = min(max(((x - bx) * ca + (y - by) * sa) / length, 0.0), 1.0)
        return t["lift"] + t["rise"] * (1 - u) ** 2 + t["half"] * h

    middle = (bx + length * 0.5 * ca, by + length * 0.5 * sa)
    return lay(outline, middle, offset, TAIL_PROFILE)


def build(collection):
    """Cloth with its dots and hem, band, knot and tails."""
    red, band, cream = mat("Halstuchrot"), mat("Halstuchband"), mat("Halstuchpunkte")
    generator.add_mesh(collection, "bandana_cloth", cloth_mesh(), red)
    generator.add_mesh(collection, "bandana_dots", merge([dots_mesh(), hem_mesh()]), cream)
    generator.add_mesh(collection, "bandana_band", merge([band_mesh(), knot_mesh()]), band)
    generator.add_mesh(collection, "bandana_tails", merge([tail_mesh(*tail) for tail in TAILS]), red)


generator.run("bandana", "Körper", build, __file__)
