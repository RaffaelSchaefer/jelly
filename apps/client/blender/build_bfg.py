"""Builds `bfg`: the big plasma gun after the BFG, far too big for the pet and pointed at whoever
looks at it. Seen at three quarters from above: the muzzle, a tall oval full of plasma, comes
forward on the right between two pods, the long top and the right side lead back to the stock
beside the pet's head. Only the head peeks over it.

    blender blender/cosmetics.blend --background --python blender/build_bfg.py -- [--save] [--export] [--loose]

The pet holds it with both hands (slot Hände): the left hand on the pistol grip, the right one on
the shroud's side under the chamber, where `HOLDS` in packages/jelly-scene/src/held.ts puts them.
HandHeld.tsx moves it with the hands, but only a little: it is too heavy to swing along while the
pet waves or is poked. The shapes are traced from a side view of the reference, muzzle to the
left, in its pixels (`ref`), and pushed out across: the gun's own frame, `x` along it, `y` up, `w`
across towards its right side, which shows. Every part is meshed in that frame, so thin details
need only thin grids, and then placed on the pet by `POSE`: the muzzle turned towards the camera
and to the right, the top tipped towards the camera. --loose exports even if a check fails, to
look at it while tuning.

The gun is drawn behind the pet (`behind` in COSMETIC_LOOKS): the real depth decides, so the hands
show in front of it and its far end vanishes behind the pet. The checks look through the app's
camera: nothing may cover a hand or the face, not even at the ends of its sway, nothing may leave
the pet window. Within one paint layer only the outline gets ink, so the details live in their
colours. Three.js coordinates.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import FACE_WINDOWS, outward, polygon_sd, sdf_gradient, surface_nets, unit_rows  # noqa: E402

# Where the reference's side view (2400 × 1600 px, muzzle to the left) lands in the gun's frame:
# its edges in pixels and in units, a little longer than tall. Across, a pixel counts as one up.
REF_PX = {"left": 156, "right": 2244, "top": 316, "bottom": 1284}
REF_AT = {"left": -1.6, "right": 1.6, "top": 0.245, "bottom": -1.025}
# How the frame sits on the pet: turned from pointing right towards the camera by `turn`, its top
# tipped towards the camera by `tip`, then rolled about the camera's axis by `roll` (radians), the
# muzzle up. Scaled by `size`, its pistol grip (`GRIP_PX`) in the left hand, behind its centre.
POSE = {"turn": 0.7, "tip": 0.3, "roll": 0.15, "size": 0.92, "grip": (-0.92, -0.4, 0.3)}
GRIP_PX = (1800, 920)

# The side outlines in reference pixels, `half` their reach across each way, `round` their edges.
HOUSING = {"corners": [(155, 340), (760, 340), (760, 700), (155, 700)], "half": 0.27, "round": 0.06}
FRONT_BLOCK = {"corners": [(745, 350), (1150, 350), (1150, 610), (1000, 700), (745, 700)], "half": 0.25, "round": 0.06}
RECEIVER = {"corners": [(1150, 395), (1425, 395), (1455, 342), (1845, 340), (1875, 378), (1875, 575), (1260, 575), (1150, 640)], "half": 0.22, "round": 0.06}
STOCK = {"corners": [(1850, 380), (2190, 375), (2190, 885), (1975, 885), (1860, 728)], "half": 0.16, "round": 0.06}
BUTT = {"corners": [(2170, 382), (2244, 390), (2244, 875), (2170, 885)], "half": 0.175, "round": 0.04}
TOP_COVER = {"corners": [(230, 316), (1150, 316), (1150, 352), (230, 352)], "half": 0.19, "round": 0.025}
SHROUD = {
    "corners": [(155, 700), (1000, 700), (1215, 575), (1215, 840), (1440, 840), (1440, 1080), (1000, 1080), (880, 1125), (860, 1160), (250, 1160), (155, 880)],
    "holes": [[(855, 760), (1095, 760), (1095, 890), (855, 890)]],
    "half": 0.23,
    "round": 0.06,
}
GRIP = {"corners": [(1650, 645), (1805, 645), (1818, 950), (1695, 950), (1680, 760)], "half": 0.08, "round": 0.04}
TRIGGER_FRAME = {"corners": [(1440, 640), (1660, 640), (1660, 775), (1440, 775)], "holes": [[(1480, 678), (1615, 678), (1615, 742), (1480, 742)]], "half": 0.07, "round": 0.03}
TRIGGER = {"corners": [(1575, 685), (1598, 685), (1585, 738), (1565, 738)], "half": 0.03, "round": 0.01}
BOTTOM_BAR = {"corners": [(1405, 940), (1825, 940), (1825, 1075), (1405, 1075)], "half": 0.1, "round": 0.04}
FOOT = {"corners": [(640, 1150), (850, 1150), (850, 1185), (805, 1205), (685, 1205), (640, 1185)], "half": 0.13, "round": 0.03}
SKID = {"corners": [(250, 1140), (640, 1140), (640, 1172), (250, 1172)], "half": 0.12, "round": 0.015}
# The column between receiver and shroud: upright, (x px, from py, to py), oval across.
COLUMN = {"at": 1285, "from": 600, "to": 850, "along": 0.09, "across": 0.12, "edge": 0.02}
# The pods either side of the housing: tubes from `front` to `back` (pixels along), round (y, ±w)
# with half sizes up and across, their rims rounded. Dark rings round them (px along, tube).
POD = {"front": 175, "back": 740, "y": -0.016, "w": 0.55, "up": 0.19, "across": 0.2, "edge": 0.05}
POD_RINGS = [(215, 0.028), (520, 0.02)]

# Faces the details lie on: the front at the muzzle, the pods' fronts and the top cover's top, in
# pixels. Each side detail lies on the side of its part, `w` its half reach across.
FRONT_PX, POD_FRONT_PX, TOP_PY = 155, 175, 316
# On the front face: the muzzle, an upright pill round (w 0, y `centre`), `reach` up and down from
# its middle; the dark rim, a light lip, the halo and the plasma as (radius, lift off the face).
MUZZLE = {"centre": -0.15, "reach": 0.1, "rings": {"rim": (0.205, 0.006), "lip": (0.172, 0.014), "halo": (0.158, 0.018), "core": (0.118, 0.024)}}
# On each pod's front: a light cap and a dot of plasma (half sizes up and across, radius).
CAP = {"up": 0.13, "across": 0.14, "core": 0.05}
# On the top cover: light tabs near its right edge (from px, to px), a row of light knobs (px) and
# red dots (px, w).
TABS = {"at": [(390, 450), (480, 540), (570, 630)], "w": (0.04, 0.15)}
KNOBS = {"at": [925, 990, 1055], "radius": 0.035}
RED_DOTS = {"at": [(300, -0.1), (720, -0.05)], "radius": 0.02}
# On the front block's side: the plasma chamber as rounded rectangles in pixels, and bolts.
CHAMBER = {
    "frame": [(800, 452), (1020, 452), (1020, 573), (800, 573)],
    "halo": [(822, 474), (998, 474), (998, 551), (822, 551)],
    "core": [(842, 492), (978, 492), (978, 533), (842, 533)],
}
FRONT_BOLTS = {"at": [(995, 605), (1032, 605), (1013, 630)], "radius": 0.02}
# On the receiver's side: a dark slot, the slide with light ribs and a knob, a light arrow.
SLOT = [(1280, 460), (1400, 460), (1400, 505), (1280, 505)]
SLIDE = {"window": [(1460, 452), (1660, 452), (1660, 512), (1460, 512)], "ribs": [1490, 1525, 1560, 1595], "knob": (1640, 482), "radius": 0.032}
ARROW = [(1210, 484), (1248, 464), (1248, 504)]
# On the shroud's side: the dial, the vents, a small grille, the flap with its clips, panel lines
# and a red label, in pixels; radii and widths in units.
DIAL = {"at": (1296, 948), "disc": 0.095, "ring": (0.058, 0.08), "hub": 0.04}
VENTS = {"at": [((491, 966), (546, 1130)), ((556, 966), (611, 1130)), ((621, 966), (676, 1130))], "width": 0.022}
GRILLE = {"at": [((256, 746), (256, 784)), ((280, 746), (280, 784)), ((304, 746), (304, 784))], "width": 0.011}
FLAP = {"corners": [(700, 805), (890, 805), (890, 968), (700, 968)], "clips": [(738, 812), (852, 812)], "clip": 0.016}
LINES = {"at": [((300, 885), (845, 885)), ((215, 892), (318, 1145))], "width": 0.008}
RED_LABEL = [(745, 975), (815, 975), (815, 992), (745, 992)]
# On the stock's side: a light panel with a dark button ring, a red triangle and three slots.
STOCK_PANEL = [(1960, 595), (2150, 595), (2150, 875), (1985, 875), (1905, 760)]
BUTTON = {"at": (2100, 690), "ring": (0.028, 0.046)}
STOCK_TRIANGLE = [(2003, 682), (2036, 664), (2036, 700)]
STOCK_SLOTS = {"at": [((2080, 800), (2080, 855)), ((2105, 800), (2105, 855)), ((2130, 800), (2130, 855))], "width": 0.012}

# Where the hands hold the gun at rest (`HOLDS` in packages/jelly-scene/src/held.ts): the left one
# on the pistol grip, at the board grip's place. The right one grips the shroud's lower edge on the
# side that shows: its centre `out` off that side at the pixel `at`, the fingers pointing down so
# they curl under the edge, the back of the hand outwards. The build prints its place and turn for
# held.ts. Both must show, every face of the gun stays behind them. Their radius and ink.
LEFT_HAND = (-0.92, -0.4, 0.82)
RIGHT_GRIP = {"at": (900, 960), "out": 0.32}
HAND = {"radius": 0.2, "ink": 0.035}
# The app's camera and the pet window at 100 %: half its width in pet units at z 0, less the ink
# and a little air, and the stage's bottom edge.
CAMERA = (0.0, 0.1, 5.8)
SCREEN = {"half_width": 2.07, "bottom": -1.3}
# The face lies about this deep, for projecting its windows, which keep `ROOM` clear round them.
FACE_Z, ROOM = 0.72, 0.05
# How far the gun follows the hands while the pet waves or is poked (`steady` in held.ts): its
# middle by `reach` aside and down, never up, its tilt by `lean`. Even then it stays off the face.
SWAY = {"reach": 0.03, "lean": 0.03}
# Surface nets in the gun's frame: the grid step for parts and for details, and the air round
# each part; Decimate thins each to its budget.
STEP, FINE, AIR = 0.009, 0.0045, 0.02

# name -> (hex, glow, fluff, tint, glass, neon). Deeper than they show: the app lightens every
# colour towards pastel. Light and mid gunmetal, nearly black for the top, grip and rims, light
# trim and a red accent. The plasma shines in the wearer's colour, green without one, the halo in a
# darker shade.
SWATCH = {
    "BFG-Hell": ("#7d879d", 0.4),
    "BFG-Stahl": ("#4b556e", 0.3),
    "BFG-Dunkel": ("#232838", 0.2),
    "BFG-Kante": ("#c3cbd8", 0.5),
    "BFG-Rot": ("#d8343f", 0.4),
    "BFG-Plasma": ("#3dff52", 1.0, None, 1.0, None, 1.0),
    "BFG-Schein": ("#139a2c", 1.0, None, 0.42, None, 1.0),
}


def ref(px, py):
    """A point of the reference, in pixels, in the gun's frame (along, up)."""
    sx = (REF_AT["right"] - REF_AT["left"]) / (REF_PX["right"] - REF_PX["left"])
    sy = (REF_AT["top"] - REF_AT["bottom"]) / (REF_PX["bottom"] - REF_PX["top"])
    return REF_AT["left"] + (px - REF_PX["left"]) * sx, REF_AT["top"] - (py - REF_PX["top"]) * sy


def axes():
    """The frame's directions on the pet: towards the muzzle, up, across (its right side)."""
    turn, tip, roll = POSE["turn"], POSE["tip"], POSE["roll"]
    flat = [np.array([math.cos(turn), 0.0, math.sin(turn)]), np.array([0.0, 1.0, 0.0]), np.array([-math.sin(turn), 0.0, math.cos(turn)])]
    c, s = math.cos(tip), math.sin(tip)
    tipped = [np.array([v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]) for v in flat]
    c, s = math.cos(roll), math.sin(roll)
    return [np.array([v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]) for v in tipped]


FORWARD, UP, ACROSS = axes()
ORIGIN = np.array(POSE["grip"])
GRIP_AT = ref(*GRIP_PX)


def three_euler(rotation):
    """three.js Euler angles (order XYZ) of a rotation matrix."""
    m13 = float(np.clip(rotation[0, 2], -1, 1))
    if abs(m13) < 0.9999999:
        return math.atan2(-rotation[1, 2], rotation[2, 2]), math.asin(m13), math.atan2(-rotation[0, 1], rotation[0, 0])
    return math.atan2(rotation[2, 1], rotation[1, 1]), math.asin(m13), 0.0


def right_hand():
    """Where the right hand holds and how it turns: the hand's frame has its fingers along +y and
    its palm along +z (`sdHand` in jelly.frag.glsl)."""
    x, y = ref(*RIGHT_GRIP["at"])
    side = ORIGIN + POSE["size"] * ((GRIP_AT[0] - x) * FORWARD + (y - GRIP_AT[1]) * UP + SHROUD["half"] * ACROSS)
    fingers, palm = -UP, -ACROSS
    return tuple(side + ACROSS * RIGHT_GRIP["out"]), three_euler(np.column_stack([np.cross(fingers, palm), fingers, palm]))


def local(points):
    """Pet points in the gun's frame, as rows (along, up, across) in reference units."""
    moved = (points - ORIGIN) / POSE["size"]
    return np.column_stack([GRIP_AT[0] - moved @ FORWARD, GRIP_AT[1] + moved @ UP, moved @ ACROSS])


def world(points):
    """Points of the gun's frame, as rows, on the pet."""
    x, y, w = np.asarray(points, float).T
    offsets = np.outer(GRIP_AT[0] - x, FORWARD) + np.outer(y - GRIP_AT[1], UP) + np.outer(w, ACROSS)
    return ORIGIN + POSE["size"] * offsets


def box(low, high, step=STEP):
    """The surface nets box in the gun's frame from `low` to `high`, with air."""
    return {"low": tuple(np.array(low) - AIR), "high": tuple(np.array(high) + AIR), "step": step}


def rounded(corners, radius, steps=6):
    """The outline through `corners` (reference pixels) in the frame, every corner rounded by an
    arc of `radius`: inside its rounded edge the distance then has no crease."""
    points = [np.array(ref(*corner), float) for corner in corners]
    out = []
    for index, corner in enumerate(points):
        before, after = points[index - 1] - corner, points[(index + 1) % len(points)] - corner
        lengths = np.linalg.norm(before), np.linalg.norm(after)
        before, after = before / lengths[0], after / lengths[1]
        half_angle = math.acos(np.clip(before @ after, -1, 1)) / 2
        if half_angle > 1.55:
            out.append(corner)
            continue
        reach = min(radius / math.tan(half_angle), 0.45 * min(lengths))
        arc = reach * math.tan(half_angle)
        bisector = (before + after) / np.linalg.norm(before + after)
        centre = corner + bisector * arc / math.sin(half_angle)
        start, end = corner + before * reach - centre, corner + after * reach - centre
        a0 = math.atan2(start[1], start[0])
        turn = (math.atan2(end[1], end[0]) - a0 + math.pi) % (2 * math.pi) - math.pi
        out.extend(centre + arc * np.array([math.cos(a0 + turn * k / steps), math.sin(a0 + turn * k / steps)]) for k in range(steps + 1))
    return out


def rounded_edge(flat, deep, round_):
    """The distance to a shape `flat` in its outline and `deep` across, its edges rounded by
    `round_`: both already shrunk by it."""
    return np.hypot(np.maximum(flat, 0), np.maximum(deep, 0)) + np.minimum(np.maximum(flat, deep), 0) - round_


def slab(rim, deep, half, round_):
    """A thin slab `half` deep each way whose edge rounds like a quarter ellipse over `round_`:
    `rim` is the distance outside its flat middle, `deep` the depth from its middle plane."""
    ellipse = half * (np.hypot(np.maximum(rim, 0) / round_, deep / half) - 1)
    return np.where(rim > 0, ellipse, np.abs(deep) - half)


def extruded(look):
    """A side outline pushed out `half` each way across, holes cut through, its edges rounded."""
    r = look["round"]
    outline = rounded(look["corners"], r)
    holes = [rounded(hole, r) for hole in look.get("holes", [])]

    def sdf(p):
        flat = polygon_sd(p[:, 0], p[:, 1], outline)
        for hole in holes:
            flat = np.maximum(flat, -polygon_sd(p[:, 0], p[:, 1], hole))
        return rounded_edge(flat + r, np.abs(p[:, 2]) - (look["half"] - r), r)

    corners = np.array(outline)
    return sdf, box((*corners.min(axis=0), -look["half"]), (*corners.max(axis=0), look["half"]))


def oval_distance(u, v, centre, half_u, half_v):
    """Close to the 2D distance to an oval with half sizes `half_u` and `half_v`."""
    return (np.hypot((u - centre[0]) / half_u, (v - centre[1]) / half_v) - 1) * min(half_u, half_v)


def pods():
    """Both pods: tubes along the barrel, oval across, with rounded rims."""
    p = POD
    front, back = ref(p["front"], 0)[0], ref(p["back"], 0)[0]
    middle, length = (front + back) / 2, (back - front) / 2

    def sdf(q):
        oval = oval_distance(q[:, 1], np.abs(q[:, 2]), (p["y"], p["w"]), p["up"], p["across"]) + p["edge"]
        return rounded_edge(oval, np.abs(q[:, 0] - middle) - (length - p["edge"]), p["edge"])

    reach = p["w"] + p["across"]
    return sdf, box((front, p["y"] - p["up"], -reach), (back, p["y"] + p["up"], reach))


def pod_rings():
    """Dark rings round both pods."""
    p = POD

    def sdf(q):
        oval = oval_distance(q[:, 1], np.abs(q[:, 2]), (p["y"], p["w"]), p["up"], p["across"])
        return np.minimum.reduce([np.hypot(oval, q[:, 0] - ref(px, 0)[0]) - tube for px, tube in POD_RINGS])

    xs = [ref(px, 0)[0] for px, _ in POD_RINGS]
    reach = p["w"] + p["across"] + 0.03
    return sdf, box((min(xs) - 0.03, p["y"] - p["up"] - 0.03, -reach), (max(xs) + 0.03, p["y"] + p["up"] + 0.03, reach), FINE)


def column():
    """The upright column between receiver and shroud."""
    c = COLUMN
    x, top = ref(c["at"], c["from"])
    bottom = ref(c["at"], c["to"])[1]

    def sdf(q):
        oval = oval_distance(q[:, 0], q[:, 2], (x, 0), c["along"], c["across"]) + c["edge"]
        return rounded_edge(oval, np.abs(q[:, 1] - (top + bottom) / 2) - ((top - bottom) / 2 - c["edge"]), c["edge"])

    return sdf, box((x - c["along"], bottom, -c["across"]), (x + c["along"], top, c["across"]))


def on_face(axis, at, field, bounds, lift, half=0.006, round_=0.012):
    """A flat detail on a face of the frame: across `axis` (0 the front, which faces -x, 1 the top,
    2 the right side) at `at`, `lift` out of it. `field` gives its distance in the face's other two
    coordinates, in order; `bounds` their (low, high)."""
    out = -1 if axis == 0 else 1
    others = [i for i in range(3) if i != axis]

    def sdf(q):
        return slab(field(q[:, others[0]], q[:, others[1]]) + round_, q[:, axis] - (at + out * lift), half, round_)

    low, high = [0.0] * 3, [0.0] * 3
    low[axis], high[axis] = sorted((at, at + out * (lift + half)))
    (low[others[0]], low[others[1]]), (high[others[0]], high[others[1]]) = bounds
    return sdf, box(low, high, FINE)


def pill(u, v, a, b, radius):
    """The 2D distance to a pill from `a` to `b` (u, v) of `radius`."""
    eu, ev = b[0] - a[0], b[1] - a[1]
    t = np.clip(((u - a[0]) * eu + (v - a[1]) * ev) / max(eu * eu + ev * ev, 1e-12), 0, 1)
    return np.hypot(u - a[0] - eu * t, v - a[1] - ev * t) - radius


def union(fields):
    """The union of 2D distances."""
    return lambda u, v: np.minimum.reduce([field(u, v) for field in fields])


def shape(corners, radius=0.012):
    """A rounded outline in reference pixels as a 2D distance, with its bounds."""
    outline = np.array(rounded(corners, radius))
    return (lambda u, v: polygon_sd(u, v, outline)), (outline.min(axis=0), outline.max(axis=0))


def bounds_of(*pairs):
    """The (low, high) round several bounds."""
    return np.min([low for low, _ in pairs], axis=0), np.max([high for _, high in pairs], axis=0)


def side(part, items, lift=0.006, half=0.006, round_=0.012):
    """Details on the right side of `part`: `items` are (field, bounds)."""
    return on_face(2, part["half"], union([field for field, _ in items]), bounds_of(*[b for _, b in items]), lift, half, round_)


def disc(px, radius, ring=None):
    """A round detail in reference pixels: filled, or a ring from `ring` to `radius`."""
    u0, v0 = ref(*px)

    def field(u, v):
        distance = np.hypot(u - u0, v - v0)
        return distance - radius if ring is None else np.maximum(distance - radius, ring - distance)

    return field, (np.array([u0 - radius, v0 - radius]), np.array([u0 + radius, v0 + radius]))


def stroke(a, b, width):
    """A straight stroke between two points in reference pixels."""
    pa, pb = ref(*a), ref(*b)
    return (lambda u, v: pill(u, v, pa, pb, width)), (np.minimum(pa, pb) - width, np.maximum(pa, pb) + width)


def muzzle(layer):
    """One layer of the muzzle on the front face: the rim, the lip, the halo or the plasma."""
    radius, lift = MUZZLE["rings"][layer]
    c, reach = MUZZLE["centre"], MUZZLE["reach"]
    round_ = 0.05 if layer == "core" else 0.012
    face = ref(FRONT_PX, 0)[0]
    return on_face(0, face, lambda y, w: pill(w, y, (0, c - reach), (0, c + reach), radius), ((c - reach - radius, -radius), (c + reach + radius, radius)), lift, 0.006, round_)


def caps(layer):
    """One layer on both pods' fronts: the light cap or the plasma."""
    p = POD
    face = ref(POD_FRONT_PX, 0)[0]
    if layer == "cap":
        field, lift, round_ = (lambda y, w: oval_distance(y, np.abs(w), (p["y"], p["w"]), CAP["up"], CAP["across"])), 0.006, 0.012
    else:
        field, lift, round_ = (lambda y, w: np.hypot(y - p["y"], np.abs(w) - p["w"]) - CAP["core"]), 0.014, 0.03
    reach = p["w"] + CAP["across"]
    return on_face(0, face, field, ((p["y"] - CAP["up"], -reach), (p["y"] + CAP["up"], reach)), lift, 0.006, round_)


def top(layer):
    """Details on the top cover: light tabs and knobs, or red dots."""
    face = ref(0, TOP_PY)[1]
    if layer == "red":
        dots = [(ref(px, 0)[0], w) for px, w in RED_DOTS["at"]]
        r = RED_DOTS["radius"]
        field = lambda x, w: np.minimum.reduce([np.hypot(x - dx, w - dw) - r for dx, dw in dots])  # noqa: E731
        xs = [d[0] for d in dots]
        return on_face(1, face, field, ((min(xs) - r, -0.15), (max(xs) + r, 0.15)), 0.006, 0.006, r)
    w0, w1 = TABS["w"]
    tabs = [(ref(a, 0)[0], ref(b, 0)[0]) for a, b in TABS["at"]]
    knobs = [ref(px, 0)[0] for px in KNOBS["at"]]
    r = KNOBS["radius"]

    def field(x, w):
        boxes = [np.maximum(np.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2, np.abs(w - (w0 + w1) / 2) - (w1 - w0) / 2) for x0, x1 in tabs]
        return np.minimum.reduce(boxes + [np.hypot(x - kx, w) - r for kx in knobs])

    return on_face(1, face, field, ((tabs[0][0], -r), (knobs[-1] + r, w1)), 0.008, 0.008, 0.012)


def details():
    """Every detail on the faces, as (name, material, (sdf, box), budget)."""
    chamber = [shape(CHAMBER[layer], 0.04) for layer in ("frame", "halo", "core")]
    dial = DIAL
    return [
        ("muzzle_rim", "BFG-Dunkel", muzzle("rim"), 220),
        ("muzzle_lip", "BFG-Kante", muzzle("lip"), 180),
        ("muzzle_halo", "BFG-Schein", muzzle("halo"), 180),
        ("muzzle_core", "BFG-Plasma", muzzle("core"), 220),
        ("caps", "BFG-Kante", caps("cap"), 220),
        ("cap_cores", "BFG-Plasma", caps("core"), 140),
        ("tabs", "BFG-Kante", top("light"), 220),
        ("top_dots", "BFG-Rot", top("red"), 80),
        ("chamber_frame", "BFG-Dunkel", side(FRONT_BLOCK, [chamber[0]]), 150),
        ("chamber_halo", "BFG-Schein", side(FRONT_BLOCK, [chamber[1]], 0.012), 150),
        ("chamber_core", "BFG-Plasma", side(FRONT_BLOCK, [chamber[2]], 0.018, 0.006, 0.02), 150),
        ("front_bolts", "BFG-Kante", side(FRONT_BLOCK, [disc(px, FRONT_BOLTS["radius"]) for px in FRONT_BOLTS["at"]], 0.008, 0.008, FRONT_BOLTS["radius"]), 120),
        ("receiver_dark", "BFG-Dunkel", side(RECEIVER, [shape(SLOT, 0.02), shape(SLIDE["window"], 0.02)]), 180),
        ("receiver_light", "BFG-Kante", side(RECEIVER, [stroke((x, 462), (x, 502), 0.01) for x in SLIDE["ribs"]] + [disc(SLIDE["knob"], SLIDE["radius"]), shape(ARROW, 0.006)], 0.012), 200),
        ("dial", "BFG-Kante", side(SHROUD, [disc(dial["at"], dial["disc"])]), 150),
        ("dial_ring", "BFG-Dunkel", side(SHROUD, [disc(dial["at"], dial["ring"][1], dial["ring"][0])], 0.012), 150),
        ("dial_hub", "BFG-Kante", side(SHROUD, [disc(dial["at"], dial["hub"])], 0.016, 0.006, 0.02), 100),
        ("shroud_dark", "BFG-Dunkel", side(SHROUD, [stroke(a, b, VENTS["width"]) for a, b in VENTS["at"]] + [stroke(a, b, GRILLE["width"]) for a, b in GRILLE["at"]] + [stroke(a, b, LINES["width"]) for a, b in LINES["at"]]), 320),
        ("flap", "BFG-Stahl", side(SHROUD, [shape(FLAP["corners"], 0.02)]), 120),
        ("flap_clips", "BFG-Dunkel", side(SHROUD, [disc(px, FLAP["clip"]) for px in FLAP["clips"]], 0.012), 80),
        ("shroud_red", "BFG-Rot", side(SHROUD, [shape(RED_LABEL, 0.005)]), 60),
        ("stock_panel", "BFG-Kante", side(STOCK, [shape(STOCK_PANEL, 0.03)]), 150),
        ("stock_dark", "BFG-Dunkel", side(STOCK, [disc(BUTTON["at"], BUTTON["ring"][1], BUTTON["ring"][0])] + [stroke(a, b, STOCK_SLOTS["width"]) for a, b in STOCK_SLOTS["at"]], 0.012), 150),
        ("stock_red", "BFG-Rot", side(STOCK, [shape(STOCK_TRIANGLE, 0.005)], 0.012), 60),
    ]


PARTS = [
    # name, material, (sdf, box), budget
    ("housing", "BFG-Hell", extruded(HOUSING), 340),
    ("front_block", "BFG-Hell", extruded(FRONT_BLOCK), 330),
    ("receiver", "BFG-Stahl", extruded(RECEIVER), 340),
    ("stock", "BFG-Hell", extruded(STOCK), 300),
    ("butt", "BFG-Dunkel", extruded(BUTT), 150),
    ("top_cover", "BFG-Dunkel", extruded(TOP_COVER), 260),
    ("shroud", "BFG-Hell", extruded(SHROUD), 540),
    ("grip", "BFG-Dunkel", extruded(GRIP), 180),
    ("trigger_frame", "BFG-Stahl", extruded(TRIGGER_FRAME), 180),
    ("trigger", "BFG-Dunkel", extruded(TRIGGER), 60),
    ("bottom_bar", "BFG-Stahl", extruded(BOTTOM_BAR), 180),
    ("foot", "BFG-Dunkel", extruded(FOOT), 120),
    ("skid", "BFG-Dunkel", extruded(SKID), 100),
    ("column", "BFG-Dunkel", column(), 150),
    ("pods", "BFG-Hell", pods(), 560),
    ("pod_rings", "BFG-Dunkel", pod_rings(), 220),
    *details(),
]


def screen(points):
    """Where `points` land in the pet window, in pet units at z 0."""
    x, y, z = points.T
    scale = CAMERA[2] / (CAMERA[2] - z)
    return x * scale, CAMERA[1] + (y - CAMERA[1]) * scale


RIGHT_HAND, RIGHT_TURN = right_hand()
HANDS = {"left": LEFT_HAND, "right": RIGHT_HAND}


def covers_hand(points, normals, hand):
    """Which `points` lie between the camera and the hand `hand` at rest: they would hide it."""
    hx, hy, hz = HANDS[hand]
    sx, sy = screen(points)
    (cx,), (cy,) = screen(np.array([[hx, hy, hz]]))
    apart = np.hypot(sx - cx, sy - cy) / (CAMERA[2] / (CAMERA[2] - hz))
    front = hz + np.sqrt(np.maximum(HAND["radius"] ** 2 - apart**2, 0))
    return (normals[:, 2] >= 0) & (apart < HAND["radius"] + HAND["ink"]) & (points[:, 2] > front - 0.01)


def window_problems(name, points):
    """Parts beyond the pet window, or over the face as the camera sees it."""
    found = []
    sx, sy = screen(points)
    if np.abs(sx).max() > SCREEN["half_width"] or sy.min() < SCREEN["bottom"]:
        found.append(f"{name} out of the window: |x| {np.abs(sx).max():.3f}, y {sy.min():.3f}")
    for x0, x1, y0, y1 in FACE_WINDOWS:
        (wx0, wx1), (wy0, wy1) = screen(np.array([[x0 - ROOM, y0 - ROOM, FACE_Z], [x1 + ROOM, y1 + ROOM, FACE_Z]]))
        if ((sx > wx0) & (sx < wx1) & (sy > wy0) & (sy < wy1)).any():
            found.append(f"{name} over the face window {(x0, x1, y0, y1)}")
    return found


def sway_problems(points):
    """Face windows the gun covers at the ends of its sway: shifted and tilted round the middle
    between the hands as far as it follows them."""
    (lx, ly, _), (rx, ry, _) = HANDS["left"], HANDS["right"]
    mx, my = (lx + rx) / 2, (ly + ry) / 2
    found = []
    for dx in (-SWAY["reach"], 0, SWAY["reach"]):
        for dy in (-SWAY["reach"], 0):
            for tilt in (-SWAY["lean"], 0, SWAY["lean"]):
                c, s = math.cos(tilt), math.sin(tilt)
                x, y = points[:, 0] - mx, points[:, 1] - my
                moved = np.column_stack([c * x - s * y + mx + dx, s * x + c * y + my + dy, points[:, 2]])
                for problem in window_problems("swaying", moved):
                    if "face" in problem and problem not in found:
                        found.append(problem)
    return found


def add_part(collection, name, sdf, grid, mat, budget):
    """A part meshed in the gun's frame, placed on the pet and thinned, shaded by its own surface."""
    verts, faces = surface_nets(sdf, grid["low"], grid["high"], grid["step"])
    obj = generator.add_mesh(collection, f"bfg_{name}", outward((world(verts).tolist(), faces)), mat)

    def on_pet(points):
        return POSE["size"] * sdf(local(points))

    generator.thin(obj, budget, on_pet)
    points = np.array([(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices])
    return points, unit_rows(sdf_gradient(on_pet, points))


def build(collection):
    """Every part in its own material, checked through the app's camera."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    found, every, sizes = [], [], {}
    for name, mat, (sdf, grid), budget in PARTS:
        points, normals = add_part(collection, name, sdf, grid, mats[mat], budget)
        found += [f"{name} covers the {hand} hand" for hand in HANDS if covers_hand(points, normals, hand).any()]
        found += window_problems(name, points)
        every.append(points)
        sizes[name] = len(points)
    points = np.concatenate(every)
    found += sway_problems(points)
    hx, hy, hz = RIGHT_HAND
    scale = CAMERA[2] / (CAMERA[2] - hz)
    if screen(np.array([RIGHT_HAND]))[1][0] - (HAND["radius"] + HAND["ink"]) * scale < SCREEN["bottom"]:
        found.append("the right hand leaves the window at the bottom")
    sx, sy = screen(points)
    print("VIEW", f"x {sx.min():.2f} to {sx.max():.2f}, y {sy.min():.2f} to {sy.max():.2f}, {sum(sizes.values())} vertices")
    print("HOLD right", np.round(RIGHT_HAND, 3).tolist(), "turn", np.round(RIGHT_TURN, 4).tolist())
    print("CHECK", found or "ok", sizes)
    # --loose exports a failing gun anyway, to look at it while tuning.
    assert not found or "--loose" in sys.argv, found


generator.run("bfg", "Hände", build, __file__)
