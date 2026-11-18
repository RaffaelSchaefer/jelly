"""Builds `knit-scarf`: a chunky, cosy knitted scarf around the pet's neck.

A plump roll follows the seam between head and body and tucks away at the sides of the neck. Out
from behind its middle comes a second, bulkier wrap that runs in front of it to the right and
turns down there: the scarf's end, lying flat on the chest with cream stripes and a fringe.

The knit is in the shape, there are no inner lines: both wraps are ribbed across, like a knitted
collar, so their ribs scallop the outline; the flat end is ribbed along its length. Second wrap and
end are one sweep whose ribs turn from across to along where it flattens, so the end flows out of
the wrap without a seam. Its stripes are bands of that sweep that share their border rings. Ribs
across are counted in rings, so they never alias; ribs along are spaced by arc length over each
section, so they stay even on round and flat parts alike. The unseen back of every section stays
sparse.

    blender blender/cosmetics.blend --background --python blender/build_knit_scarf.py -- [--save] [--export]

Slot `Körper`: it hangs in the jelly's root, the head moves above it. The app paints it over the pet
like a sticker, so there is no back half. Three.js coordinates, units of the pet.
"""
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import catmull, merge, outward, skin, spow, surface_z, sweep  # noqa: E402

# The roll round the neck: its centre line (x, y, z) from the left side over the front to the right
# side, with sections (half height, half depth). It bends back at both ends round the neck's axis at
# depth NECK_AXIS_Z, which also sets which way its front faces.
WRAP = [(-0.555, 0.205, 0.07), (-0.47, 0.17, 0.28), (-0.3, 0.13, 0.44), (0.0, 0.115, 0.52), (0.3, 0.13, 0.44), (0.47, 0.17, 0.28), (0.555, 0.205, 0.07)]
WRAP_SECTIONS = [(0.085, 0.066), (0.098, 0.074), (0.108, 0.08), (0.11, 0.082), (0.108, 0.08), (0.098, 0.074), (0.085, 0.066)]
NECK_AXIS_Z = 0.1

# Second wrap and end as one sweep: points (x, y, z, hug, across) with sections (half width, half
# depth, squareness). It starts tucked behind the roll's middle, runs in front of its lower half to
# the right, the knot, and turns down onto the chest: `hug` 1 lays a point on the pet, `across` 1
# ribs it across like the roll and 0 along its length; squareness 2 is round, higher a flat strip.
TAIL = [
    (-0.02, 0.08, 0.46, 0.0, 1.0), (0.13, 0.045, 0.62, 0.0, 1.0), (0.26, 0.008, 0.625, 0.0, 1.0), (0.34, -0.125, 0.56, 1.0, 0.0),
    (0.39, -0.25, 0.58, 1.0, 0.0), (0.43, -0.375, 0.6, 1.0, 0.0),
]
TAIL_SECTIONS = [(0.065, 0.045, 2.2), (0.108, 0.085, 2.2), (0.113, 0.074, 2.5), (0.095, 0.034, 3.4), (0.095, 0.03, 3.5), (0.1, 0.03, 3.5)]
LIFT = 0.006
# Where the knot faces, and how far the strip turns from there towards the pet's own front: fully,
# it would roll away with the side of the body, look narrow and fold where it leaves the knot.
FRONT, TURN = Vector((0, 0.25, 1)).normalized(), 0.5
# The squared-off end of the strip: how long its cap is and how square its corners are.
TAIL_CAP = {"length": 0.024, "square": 0.25}
# Cream stripes as arc lengths (from, to) back from the end of the strip.
STRIPES = [(0.045, 0.08), (0.11, 0.145), (0.175, 0.21)]

# Ribs across (roll, knot): a rib every `period` along the sweep, rings at `per` points of it, the
# radius dipping by `depth` of the section into narrow grooves (`power` below 1 keeps the crests
# round and wide; `mean` keeps the average size).
ACROSS = {"period": 0.064, "per": 4, "depth": 0.15, "power": 0.5, "mean": 0.7}
# Ribs along (flat end): `count` ribs over the front, `samples` vertices each, `depth` of the
# section's half depth. Every section has the same points: `count` × `samples` + 1 over the front,
# reaching `reach` radians past the silhouette, and `back` over the unseen back.
ALONG = {"count": 4, "samples": 3, "depth": 0.45, "power": 0.6, "mean": 0.5, "reach": 0.35, "back": 3}
# Points per curve when measuring arc lengths, and rings per rounded end of a sweep.
DENSE, CAP_RINGS = 400, 4
# Lengths along a sweep count depth less, as the camera sees them: the roll's ends turn away and
# get fewer rings. Rings come about every STEP.
DEPTH_WEIGHT = 0.35
STEP = ACROSS["period"] / ACROSS["per"]

# The fringe: slim tassels across the end of the strip that fan out a little, so ink shows between
# their tips. Sections (across, deep) at root, middle and tip.
FRINGE = {"count": 7, "pitch": 0.03, "splay": 6.0, "length": 0.085, "sink": 0.018, "sections": [(0.015, 0.013), (0.016, 0.014), (0.009, 0.009)], "ring": 6}

# name -> (hex, glow, fluff). Much deeper than they show: the app lightens every colour towards
# pastel and the plush adds a light rim (a bandana in #d81f2a came out salmon pink). Roll and end
# are one part, so a low glow keeps the end from fading to rose below the roll.
SWATCH = {
    "Schalrot": ("#a00a18", 0.12, 0.85),
    "Schalcreme": ("#f3dcb4", 0.5, 0.85),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def pet_normal(x, y, eps=1e-3):
    """The outward normal of the pet's front at (x, y)."""
    dx = (surface_z(x + eps, y) - surface_z(x - eps, y)) / (2 * eps)
    dy = (surface_z(x, y + eps) - surface_z(x, y - eps)) / (2 * eps)
    return Vector((-dx, -dy, 1)).normalized()


def arc_lengths(points, depth_weight=1.0):
    out = [0.0]
    for a, b in zip(points, points[1:]):
        d = (b - a).to_3d()
        out.append(out[-1] + Vector((d.x, d.y, d.z * depth_weight)).length)
    return out


def at_length(lengths, s):
    """The segment index and blend where the arc length `s` falls."""
    k = 0
    while k < len(lengths) - 2 and lengths[k + 1] < s:
        k += 1
    return k, (s - lengths[k]) / max(lengths[k + 1] - lengths[k], 1e-12)


# ---------------------------------------------------------------------------------------------
# Knitted sweeps.


def profile(h, w, square, along):
    """A closed cross-section (across, deep), counter-clockwise from +across over the front:
    `along` ribs evenly by arc length over the front, a few plain points over the back."""
    e, reach, n = 2 / square, ALONG["reach"], ALONG["samples"]
    count = ALONG["count"] * n
    depth = ALONG["depth"] * w * along

    def base(a):
        return Vector((h * spow(math.cos(a), e), w * spow(math.sin(a), e)))

    dense = [base(-reach + (math.pi + 2 * reach) * k / DENSE) for k in range(DENSE + 1)]
    lengths = arc_lengths(dense)
    out = []
    for j in range(count + 1):
        k, t = at_length(lengths, lengths[-1] * j / count)
        point, tangent = dense[k].lerp(dense[k + 1], t), (dense[k + 1] - dense[k]).normalized()
        bump = math.sin(math.pi * (j % n) / n) ** ALONG["power"]
        out.append(point + Vector((tangent.y, -tangent.x)) * depth * (bump - ALONG["mean"]))
    for k in range(1, ALONG["back"] + 1):
        out.append(base(math.pi + reach + (math.pi - 2 * reach) * k / (ALONG["back"] + 1)))
    return out


def across_scale(phase, amount):
    """How much a ring swells at `phase` (in ribs along its sweep): ribs across, `amount` 0 to 1."""
    u = phase % 1.0
    return 1 + amount * ACROSS["depth"] * (math.sin(math.pi * u) ** ACROSS["power"] - ACROSS["mean"])


def frames(points, ups):
    """(tangent, across, front) per point; the front leans towards `ups`."""
    out = []
    for i, up in enumerate(ups):
        t = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        b = (up - t * up.dot(t)).normalized()
        out.append((t, b.cross(t).normalized(), b))
    return out


def ring(centre, frame, sample):
    """The ring of `sample` (point, (h, w, square), phase, across) round `centre`."""
    _, (h, w, square), phase, across = sample
    _, n, b = frame
    scale = across_scale(phase, across)
    return [centre + n * u + b * v for u, v in profile(h * scale, w * scale, square, 1 - across)]


def cap(frame, sample, sign, shape, rings=CAP_RINGS):
    """Rings that close a sweep's end and its pole. `shape` is (length, squareness)."""
    point, (h, w, square), phase, across = sample
    t = frame[0]
    length, corners = shape
    made = []
    for k in range(1, rings):
        phi = k / rings * math.pi / 2
        scale = math.cos(phi)
        shift = sign * length * math.sin(phi)
        made.append(ring(point + t * shift, frame, (None, (h * scale**corners, w * scale, square), phase + shift / ACROSS["period"], across)))
    return made, point + t * (sign * length)


def knit_sweep(samples, ups, end_shape=None):
    """A knitted tube through `samples` (point, (h, w, square), phase, across): start cap rings, body
    rings, end cap rings, both poles and the frames. `end_shape` (length, squareness) squares off
    the far end."""
    fr = frames([p for p, _, _, _ in samples], ups)
    first, last = samples[0][1], samples[-1][1]
    start, start_pole = cap(fr[0], samples[0], -1, ((first[0] + first[1]) / 2, 1.0))
    end, end_pole = cap(fr[-1], samples[-1], 1, end_shape or ((last[0] + last[1]) / 2, 1.0))
    body = [ring(sample[0], f, sample) for sample, f in zip(samples, fr)]
    return list(reversed(start)), body, end, start_pole, end_pole, fr


def path_samples(points, sections, hugs, acrosses, stops=()):
    """Samples (point, section, phase, across) about every STEP along a Catmull-Rom path and at
    `stops` (arc lengths back from its end), their arc lengths, hugs and the path's length. The
    phase counts ribs across, `ACROSS["per"]` rings each. Points with `hug` 1 lie on the pet."""
    # Hugging points take the pet's surface as their depth already, so the curve does not dip
    # between them and the free ones.
    controls = [Vector((x, y, z + (surface_z(x, y) + sec[1] + LIFT - z) * hug)) for (x, y, z), sec, hug in zip(points, sections, hugs)]
    dense = catmull(controls, DENSE)
    extra = catmull([Vector((h, a, 0)) for h, a in zip(hugs, acrosses)], DENSE)
    secs = catmull([Vector(s) for s in sections], DENSE)
    for i, p in enumerate(dense):
        snapped = surface_z(p.x, p.y) + secs[i].y + LIFT
        dense[i] = Vector((p.x, p.y, p.z + (snapped - p.z) * smoothstep(extra[i].x)))
    lengths = arc_lengths(dense, DEPTH_WEIGHT)
    total = lengths[-1]
    count = max(2, round(total / STEP))
    # A stop replaces the regular ring next to it: rings a hair apart fold.
    borders = [total - s for s in stops]
    regular = [total * k / count for k in range(count + 1)]
    marks = sorted([s for s in regular if all(abs(s - b) > STEP / 3 for b in borders)] + borders)
    period = total / count * ACROSS["per"]
    out, hugged = [], []
    for s in marks:
        k, t = at_length(lengths, s)
        sec, more = secs[k].lerp(secs[k + 1], t), extra[k].lerp(extra[k + 1], t)
        out.append((dense[k].lerp(dense[k + 1], t), (sec.x, sec.y, sec.z), s / period, smoothstep(more.y)))
        hugged.append(smoothstep(more.x))
    return out, marks, hugged, total


# ---------------------------------------------------------------------------------------------
# The parts.


def wrap_mesh():
    """The roll round the neck."""
    count = len(WRAP)
    samples, _, _, _ = path_samples(WRAP, [(h, w, 2.0) for h, w in WRAP_SECTIONS], [0.0] * count, [1.0] * count)
    ups = [Vector((p.x, 0, p.z - NECK_AXIS_Z)).normalized() for p, _, _, _ in samples]
    start, body, end, a, b, _ = knit_sweep(samples, ups)
    rings = start + body + end
    return outward(skin(rings, len(rings[0]), a, b))


def tail_meshes():
    """Second wrap and strip as red bands and cream stripes that share the rings where they meet,
    and the strip's end with its frame."""
    stops = [d for stripe in STRIPES for d in stripe]
    samples, marks, hugs, total = path_samples([p[:3] for p in TAIL], TAIL_SECTIONS, [p[3] for p in TAIL], [p[4] for p in TAIL], stops)
    ups = [FRONT.lerp(pet_normal(p.x, p.y), TURN * h).normalized() for (p, _, _, _), h in zip(samples, hugs)]
    start, body, end, start_pole, end_pole, fr = knit_sweep(samples, ups, (TAIL_CAP["length"], TAIL_CAP["square"]))
    size = len(body[0])

    def cream(i):
        mid = total - (marks[i] + marks[i + 1]) / 2
        return any(a < mid < b for a, b in STRIPES)

    red, stripes = [], []
    i = 0
    while i < len(body) - 1:
        j = i + 1
        while j < len(body) - 1 and cream(j) == cream(i):
            j += 1
        first, last = i == 0, j == len(body) - 1
        rings = (start if first else []) + body[i : j + 1] + (end if last else [])
        (stripes if cream(i) else red).append(skin(rings, size, start_pole if first else None, end_pole if last else None))
        i = j
    return merge(red), merge(stripes), (samples[-1][0], fr[-1])


def fringe_mesh(end, frame):
    """Tassels hanging from the end of the strip, fanning out a little."""
    t, n, _ = frame
    f = FRINGE
    tassels = []
    for k in range(f["count"]):
        offset = k - (f["count"] - 1) / 2
        turn = math.radians(-offset * f["splay"])
        direction = (t * math.cos(turn) + n * math.sin(turn)).normalized()
        root = end + n * (offset * f["pitch"]) - t * f["sink"]
        points = []
        for u in (0.0, 0.5, 1.0):
            p = root + direction * (f["length"] * u)
            points.append(Vector((p.x, p.y, surface_z(p.x, p.y) + LIFT + f["sections"][1][1])))
        sections = [f["sections"][0], f["sections"][0], f["sections"][1], f["sections"][2], f["sections"][2]]
        samples = [(p, h, w) for p, (h, w) in zip(catmull(points, 5), sections)]
        tassels.append(outward(sweep(samples, ring_size=f["ring"], cap_rings=3, up=pet_normal(root.x, root.y))))
    return merge(tassels)


def build(collection):
    """The roll, the second wrap with its striped end and the fringe."""
    red, cream = mat("Schalrot"), mat("Schalcreme")
    strip, stripes, (end, frame) = tail_meshes()
    wrap = wrap_mesh()
    fringe = fringe_mesh(end, frame)
    generator.add_mesh(collection, "knit_scarf_red", merge([wrap, strip]), red)
    generator.add_mesh(collection, "knit_scarf_cream", merge([stripes, fringe]), cream)


generator.run("knit-scarf", "Körper", build, __file__)
