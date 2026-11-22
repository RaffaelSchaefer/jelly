"""Builds `long-schnoerbi`: a very long, cuddly plush Schnörbi the pet holds across its belly.

One smooth sweep makes head and body: the round head peeks out beyond the left hand, the soft pink
body sags a little between both hands and droops past the right one down to the floor, where two
round cream feet show their rosy soles. Little felt hearts in lilac, mint and butter yellow are
sewn onto the fur. The head wears the Schnörbi face, a little tilted: big shiny eyes in thin gold
rims, a fluffy cream tuft above them, a split beak that smiles, rosy cheeks and two tiny cream paws
under the chin.

    blender blender/cosmetics.blend --background --python blender/build_long_schnoerbi.py -- [--save] [--export]

Modelled in pet coordinates around the GRIP pose (hands at x ±0.92, y -0.4, z 0.82), which
HandHeld.tsx cancels out at rest, like the golden cup. The head sits at -x, so nothing here is
mirrored by a modifier: both sides are built in place. Three.js coordinates.
"""
import bisect
import functools
import math
import os
import sys

from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import badge, blob, catmull, fur, loop_skin, merge, outward, smooth, spow, sweep  # noqa: E402

# The centre line (x, y) at depth DEPTH_Z, from the head's centre to the tail on the floor. With
# tufts and outline it stays within |x| 1.85, the pet window shows little more. The body passes
# just below the hands' centres, so their fingers show above it, and sags between them.
DEPTH_Z = 0.98
SPINE = [
    (-1.36, -0.14), (-1.14, -0.42), (-0.92, -0.56), (-0.45, -0.64), (0.0, -0.66), (0.45, -0.64),
    (0.92, -0.56), (1.18, -0.63), (1.36, -0.76), (1.46, -0.93),
]
# The head's radius and the body's, how softly the neck blends them and how much flatter everything
# is front to back. Over its last share the tail thins a little.
HEAD_R, BODY_R, NECK, FLAT_DEPTH = 0.42, 0.24, 0.16, 0.92
TAIL = {"from": 0.75, "thin": 0.2}
# Fluff: tufts of fur stand out along the normals round jittered points of a 3D grid (`cell`), each
# with its own height, up to `reach` from its point. Only where the surface turns away from the
# camera, |normal z| from `edge[1]` down to `edge[0]`: the face stays smooth, the outline turns fluffy.
TUFTS = {"cell": 0.1, "reach": 0.09, "height": 0.06, "sharp": 1.5, "edge": (0.35, 0.75), "seed": "schnoerbi"}
# Rings: dense round the head, where the profile turns fast, and dense enough for the tufts.
STEP = {"head": 0.026, "body": 0.046, "until": 0.75, "ring": 26, "cap": 12}

# The face, as offsets (across, up) from the head's centre, tilted as a whole by TILT towards the pet.
TILT = math.radians(-10)
EYE = {"across": 0.155, "up": -0.015, "rx": 0.1, "ry": 0.112, "half": 0.05, "sink": 0.016}
# The pupils look a little up towards the pet's face; the glints stay where the light is.
PUPIL = {"rx": 0.068, "ry": 0.08, "half": 0.016, "lift": 0.034, "look": (0.012, 0.01)}
GLINTS = [((-0.03, 0.036), 0.028), ((0.03, -0.03), 0.013)]  # (offset from the eye, radius)
GLINT_LIFT = 0.052
# Thin gold rims round the eyes that meet in the middle: hole, outer edge (across, above, below) and
# a pillow across the band.
RIM = {"hole": (0.106, 0.118), "outer": (0.158, 0.165, 0.15), "half": 0.018, "lid": 0.006, "lift": 0.01, "power": 2.6, "loop": 32, "ring": 8}
# The beak is a ball split across, the cut curves up at its ends like a smile.
BEAK = {"up": -0.165, "forward": 0.03, "across": 0.07, "high": 0.06, "deep": 0.065, "smile": 0.016}
LOWER_SCALE, LOWER_BACK, PRESS = 0.9, 0.01, 0.18
CHEEK = {"at": (0.255, -0.15), "rx": 0.055, "ry": 0.036, "half": 0.006}
# The tuft on top of the head, above the eyes: plump curls as (root across, lean out from straight
# up in degrees, length, curl in radians towards the lean). They grow from the front of the crown and
# stand up over the head's top, flat side to the front; the middle one curls over like a cowlick.
TUFT = [(-0.13, -58, 0.12, 0.8), (-0.07, -30, 0.19, 0.8), (0.0, 6, 0.28, 1.5), (0.07, 30, 0.19, 0.8), (0.13, 58, 0.12, 0.8)]
TUFT_ROOT = {"up": 0.355, "arc": 0.02, "sink": 0.012, "back": 0.3}
TUFT_SECTIONS = [(0.062, 0.03), (0.056, 0.027), (0.045, 0.022), (0.03, 0.016)]  # (across, deep)
# Two tiny paws tucked under the chin.
PAWS = {"across": 0.088, "up": -0.355, "sink": 0.0, "turn": 25, "size": (0.058, 0.074, 0.05)}
# Two round feet at the tail's end that show their soles: offset of each from the end, half sizes
# and the pad on the sole.
FEET = {"offset": (0.115, -0.11, 0.07), "splay": 20, "size": (0.112, 0.092, 0.065), "pad": (0.06, 0.05, 0.014)}

# The pattern on the fur: felt hearts on the front of the body, evenly from behind the neck (`from`,
# along the spine) to shortly before the tail's end (`before_end`). Heart by heart they cycle through
# heights round the body (degrees from the front), sizes, rolls and colours; the cycles differ in
# length, so the pattern looks scattered rather than in rows.
HEARTS = {
    "count": 13, "from": 0.62, "before_end": 0.3, "around": (30, -24, 6, -36, 20), "size": (0.078, 0.064, 0.07),
    "roll": (-18, 14, -8, 22), "colours": ("Herzlila", "Herzmint", "Herzgelb"), "half": 0.009, "lift": 0.01, "ring": 16,
}

# name -> (hex, glow, fluff, tint). Deeper than they show: the app lightens every colour towards pastel.
# Fur, paws, feet, hearts, cheeks and the tuft are plush (`fluff`), eyes, rims and beak keep their gloss.
SWATCH = {
    "Schnörbipink": ("#ec4f97", 0.5, 1.0, 1.0),
    "Bäckchen": ("#ff2f7a", 0.6, 0.5),
    "Maskengold": ("#f5a300", 0.25),
    "Augenweiß": ("#fffaf0", 1.0),
    "Pupille": ("#1d1630", 0.1),
    "Schnabeloben": ("#ff7a00", 0.25),
    "Schnabelunten": ("#f05200", 0.25),
    "Buschcreme": ("#fff1d6", 1.0, 1.0),
    "Herzlila": ("#9b6cf2", 0.5, 0.6),
    "Herzmint": ("#2fc7a1", 0.5, 0.6),
    "Herzgelb": ("#ffb21f", 0.5, 0.6),
}


def mat(name):
    return generator.material(name, *SWATCH[name])


def smoothstep(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def smooth_max(a, b, k):
    """The larger of `a` and `b`, rounded off where they are within `k` of each other."""
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k / 4


# ---------------------------------------------------------------------------------------------
# Head and body.


def radius_at(s, total):
    """The half thickness `s` along the spine: the head's ball blends into the body."""
    head = math.sqrt(max(HEAD_R**2 - s**2, 0.0))
    tail = 1 - TAIL["thin"] * smoothstep((s / total - TAIL["from"]) / (1 - TAIL["from"]))
    return smooth_max(head, BODY_R * tail, NECK)


@functools.lru_cache(maxsize=None)
def spine():
    """The centre line, densely sampled, with the length along it at every sample."""
    dense = catmull([Vector((x, y, DEPTH_Z)) for x, y in SPINE], 600)
    lengths = [0.0]
    for a, b in zip(dense, dense[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    return dense, lengths


def along(s):
    """The point `s` along the spine and the direction it runs there."""
    dense, lengths = spine()
    k = min(max(bisect.bisect_right(lengths, s) - 1, 0), len(dense) - 2)
    t = (s - lengths[k]) / max(lengths[k + 1] - lengths[k], 1e-9)
    return dense[k].lerp(dense[k + 1], t), (dense[k + 1] - dense[k]).normalized()


def body_mesh():
    """Head and body as one sweep: the start cap rounds the head, the end cap the tail."""
    total, stops, s = spine()[1][-1], [], 0.0
    while s < total - STEP["body"] / 2:
        stops.append(s)
        s += STEP["head"] if s < STEP["until"] else STEP["body"]
    stops.append(total)
    samples = []
    for s in stops:
        r = radius_at(s, total)
        samples.append((along(s)[0], r, r * FLAT_DEPTH))
    return fur(outward(sweep(samples, ring_size=STEP["ring"], cap_rings=STEP["cap"])), TUFTS)


def heart_outline(samples=64):
    """A heart, about unit size round its middle."""
    out = []
    for k in range(samples):
        t = 2 * math.pi * k / samples
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((x / 16, (y + 2.5) / 16))
    return out


def heart_mesh(index):
    """Heart `index` of the pattern: a felt patch on the body's front, bent round the body."""
    total = spine()[1][-1]
    first, last = HEARTS["from"], total - HEARTS["before_end"]
    s = first + (last - first) * index / (HEARTS["count"] - 1)
    p, t = along(s)
    b = (Vector((0, 0, 1)) - t * t.z).normalized()
    n = b.cross(t).normalized()
    h = radius_at(s, total)
    w = h * FLAT_DEPTH
    a = math.pi / 2 - math.radians(HEARTS["around"][index % len(HEARTS["around"])])
    normal = (n * (math.cos(a) / h) + b * (math.sin(a) / w)).normalized()
    across = (b * (w * math.cos(a)) - n * (h * math.sin(a))).normalized()
    centre = p + n * (h * math.cos(a)) + b * (w * math.sin(a)) + normal * HEARTS["lift"]
    size = HEARTS["size"][index % len(HEARTS["size"])]
    roll = math.radians(HEARTS["roll"][index % len(HEARTS["roll"])])
    verts, faces = badge(heart_outline(), centre, normal, size, HEARTS["half"], ring_size=HEARTS["ring"], stacks=3, passes=2, roll=roll)
    bent = []
    for v in map(Vector, verts):
        d = (v - centre).dot(across)
        bent.append(v - normal * (h - math.sqrt(max(h * h - d * d, 0.0))))
    return outward((bent, faces))




# ---------------------------------------------------------------------------------------------
# The face, on the front of the head.


def tilted(u, v):
    c, s = math.cos(TILT), math.sin(TILT)
    return u * c - v * s, u * s + v * c


def on_face(u, v, lift=0.0):
    """The point `lift` in front of the head at (across, up) from its centre, face tilted."""
    x, y = tilted(u, v)
    inside = max(1 - (x**2 + y**2) / HEAD_R**2, 0.0)
    return Vector((SPINE[0][0] + x, SPINE[0][1] + y, DEPTH_Z + HEAD_R * FLAT_DEPTH * math.sqrt(inside) + lift))


def face_normal(u, v):
    p = on_face(u, v)
    return Vector(((p.x - SPINE[0][0]) / HEAD_R**2, (p.y - SPINE[0][1]) / HEAD_R**2, (p.z - DEPTH_Z) / (HEAD_R * FLAT_DEPTH) ** 2)).normalized()


FACE_UP = Vector((-math.sin(TILT), math.cos(TILT), 0))


def face_blob(u, v, lift, size, **kw):
    """A blob on the face at (across, up), facing out of the head, upright with the face."""
    return blob(on_face(u, v, lift), face_normal(u, v), FACE_UP, size, **kw)


def eye_meshes(side):
    """Eyeball, pupil and glints of the eye on `side` (-1 left, 1 right)."""
    u, v = side * EYE["across"], EYE["up"]
    ball = face_blob(u, v, -EYE["sink"], (EYE["rx"], EYE["ry"], EYE["half"]), ring=20, stacks=8)
    lu, lv = PUPIL["look"]
    pupil = face_blob(u + lu, v + lv, PUPIL["lift"], (PUPIL["rx"], PUPIL["ry"], PUPIL["half"]), ring=20, stacks=6)
    glints = merge(face_blob(u + gu, v + gv, GLINT_LIFT, (r, r, 0.005), ring=12, stacks=4) for (gu, gv), r in GLINTS)
    return ball, pupil, glints


def rim_mesh(side):
    """The gold rim round one eye: across the band a pillow from the hole to the outer edge."""
    ex, ey = side * EYE["across"], EYE["up"]
    (hx, hy), (ox, above, below) = RIM["hole"], RIM["outer"]
    rings = []
    for i in range(RIM["loop"]):
        t = 2 * math.pi * i / RIM["loop"]
        c, s = math.cos(t), math.sin(t)
        inner = Vector((ex + hx * c, ey + hy * s))
        outer = Vector((ex + ox * c, ey + (above if s > 0 else below) * s))
        half = RIM["half"] + RIM["lid"] * max(s, 0) ** 2
        ring = []
        for j in range(RIM["ring"]):
            a = 2 * math.pi * j / RIM["ring"]
            p = inner.lerp(outer, (spow(math.cos(a), 2 / RIM["power"]) + 1) / 2)
            ring.append(on_face(p.x, p.y, RIM["lift"] + half * spow(math.sin(a), 2 / RIM["power"])))
        rings.append(ring)
    return outward(loop_skin(rings))


def beak_mesh(upper):
    """One half of the beak ball, pressed flat along a cut that curves up at its ends."""
    scale = 1 if upper else LOWER_SCALE
    centre = on_face(0, BEAK["up"], BEAK["forward"] - (0 if upper else LOWER_BACK))
    size = (BEAK["across"] * scale, BEAK["high"] * scale, BEAK["deep"] * scale)
    verts, faces = blob(centre, face_normal(0, BEAK["up"]), FACE_UP, size, power=2.2, ring=24, stacks=10)
    side = FACE_UP.cross(face_normal(0, BEAK["up"])).normalized()
    sign, pressed = 1 if upper else -1, []
    for v in map(Vector, verts):
        d = v - centre
        across, up = d.dot(side), d.dot(FACE_UP)
        cut = BEAK["smile"] * (across / BEAK["across"]) ** 2
        pressed.append(v + FACE_UP * ((cut + (up - cut) * PRESS) - up) if (up - cut) * sign < 0 else v)
    return pressed, faces


def cheek_mesh(side):
    """A rosy oval on the fur below the outer corner of the eye."""
    u, v = CHEEK["at"]
    return face_blob(side * u, v, 0.004, (CHEEK["rx"], CHEEK["ry"], CHEEK["half"]), power=2.5, ring=20, stacks=4)


def tuft_curl(across, lean, length, curl):
    """One curl of the tuft: from the top of the head up and out, curling further over."""
    root_up = TUFT_ROOT["up"] + TUFT_ROOT["arc"] * (1 - (across / 0.14) ** 2)
    side = math.copysign(1, lean) if lean else 0
    root = on_face(across, root_up, -TUFT_ROOT["sink"])
    points = []
    for t in (0, 0.35, 0.7, 1):
        turn = math.radians(lean) + curl * t * t * side
        x, y = tilted(math.sin(turn) * length * t, math.cos(turn) * length * t)
        points.append(root + Vector((x, y, -TUFT_ROOT["back"] * length * t)))
    return sweep(smooth(points, TUFT_SECTIONS, 8), ring_size=8, cap_rings=4)


def paws_mesh():
    """Two tiny paws held up under the chin, leaning towards each other."""
    paws = []
    for side in (-1, 1):
        u, v = side * PAWS["across"], PAWS["up"]
        turn = TILT - math.radians(side * PAWS["turn"])
        up = Vector((-math.sin(turn), math.cos(turn), 0))
        paws.append(blob(on_face(u, v, -PAWS["sink"]), face_normal(u, v), up, PAWS["size"], ring=16, stacks=8))
    return merge(paws)


def feet_meshes():
    """Two round feet out of the tail's end, splayed, soles to the front, and their pads."""
    end = Vector((*SPINE[-1], DEPTH_Z))
    dx, dy, dz = FEET["offset"]
    feet, pads = [], []
    for side in (-1, 1):
        splay = math.radians(side * FEET["splay"])
        up = Vector((-math.sin(splay), math.cos(splay), 0))
        centre = end + Vector((side * dx, dy, dz))
        forward = Vector((0, -0.25, 1))
        feet.append(blob(centre, forward, up, FEET["size"], ring=20, stacks=10))
        pads.append(blob(centre + forward.normalized() * FEET["size"][2], forward, up, FEET["pad"], power=2.5, ring=16, stacks=4))
    return merge(feet), merge(pads)


def build(collection):
    """Body, face, paws and feet, and the hearts, one material each."""
    feet, pads = feet_meshes()
    generator.add_mesh(collection, "long_schnoerbi_body", body_mesh(), mat("Schnörbipink"))
    for k, colour in enumerate(HEARTS["colours"]):
        hearts = merge(heart_mesh(i) for i in range(k, HEARTS["count"], len(HEARTS["colours"])))
        generator.add_mesh(collection, f"long_schnoerbi_hearts_{k}", hearts, mat(colour))
    eyes = [eye_meshes(side) for side in (-1, 1)]
    whites = merge([ball for ball, _, _ in eyes] + [glints for _, _, glints in eyes])
    generator.add_mesh(collection, "long_schnoerbi_eyes", whites, mat("Augenweiß"))
    generator.add_mesh(collection, "long_schnoerbi_pupils", merge(pupil for _, pupil, _ in eyes), mat("Pupille"))
    generator.add_mesh(collection, "long_schnoerbi_rims", merge(rim_mesh(side) for side in (-1, 1)), mat("Maskengold"))
    generator.add_mesh(collection, "long_schnoerbi_beak_lower", beak_mesh(False), mat("Schnabelunten"))
    generator.add_mesh(collection, "long_schnoerbi_beak_upper", beak_mesh(True), mat("Schnabeloben"))
    cream = merge([tuft_curl(*curl) for curl in TUFT] + [paws_mesh(), feet])
    generator.add_mesh(collection, "long_schnoerbi_cream", cream, mat("Buschcreme"))
    rosy = merge([cheek_mesh(side) for side in (-1, 1)] + [pads])
    generator.add_mesh(collection, "long_schnoerbi_rosy", rosy, mat("Bäckchen"))


generator.run("long-schnoerbi", "Hände", build, __file__)
