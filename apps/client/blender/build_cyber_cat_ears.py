"""Builds `cyber-cat-ears`: two angular cat ears like armour cut from dark steel, each with a raised
inner plate, a neon panel set into it, a light strip along the outer edge and three status lights.

Each ear is built up in layers, all implicit surfaces like the Kamina glasses: the dark plate, a
flat outline with a round rim and a notch in its outer edge and a step in its inner one; on its
front a lighter plate, the plate's outline drawn in; on that the neon panel with its halo. Neon
shines by itself in the app, without shading, and takes the wearer's colour; the halo is a darker
shade of it, its light on the plate, in two steps like a drawn glow. The strip along the upper
outer edge is neon too, the three lights at the foot are white.

The app draws the ears behind the pet like the plush cat ears (`behind` in `COSMETIC_LOOKS`,
cosmetic.ts): the head and its ink edge cover their feet, so everything stays behind the plane
where that ink lies (z 0.2).

    blender blender/cosmetics.blend --background --python blender/build_cyber_cat_ears.py -- [--save] [--export]

Geometry is in Three.js coordinates (y up, +z front); see README.md for the modelling rules.
"""
import math
import os
import sys

import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import generator  # noqa: E402
from shapes import HEAD_R, HEAD_Y, blob, merge, outward, polygon_sd, sweep  # noqa: E402

# The +x ear's frame: its foot lies on the head's outline `rise` degrees above its middle, its
# height runs along `lean` degrees (90 is straight up). `across` points out and down from it.
SEAT = {"rise": 54, "lean": 64}
FOOT = (HEAD_R * math.cos(math.radians(SEAT["rise"])), HEAD_Y + HEAD_R * math.sin(math.radians(SEAT["rise"])))
UP = (math.cos(math.radians(SEAT["lean"])), math.sin(math.radians(SEAT["lean"])))
ACROSS = (UP[1], -UP[0])
# The plate's outline as (across, up) from the foot, counter-clockwise from the outer foot: the
# outer edge with its notch, the tip cut off flat, the inner edge with its step. The foot reaches
# into the head, which covers it up to about `up` 0.04. The tip stays under the speech bubble.
PLATE = [(0.22, -0.16), (0.21, 0.13), (0.178, 0.165), (0.172, 0.225), (0.088, 0.425), (-0.01, 0.425), (-0.12, 0.27), (-0.168, 0.255), (-0.205, 0.09), (-0.215, -0.16)]
# The neon panel's outline, the plate's shape drawn in.
PANEL = [(0.13, 0.11), (0.052, 0.345), (0.006, 0.345), (-0.075, 0.225), (-0.112, 0.215), (-0.132, 0.11)]
# How round all corners are: they stay angular, but the ink edge runs round them unbroken.
ROUND = 0.014
# The plate's centre plane, half its thickness and the width over which its rim rounds up.
Z = 0.1
RIM = (0.034, 0.03)
# The layers on the plate's front, each a cushion: the lighter plate (the plate's outline `grow`
# further in), the halo and the panel; per layer how far its outline grows, its height and the width
# of its rounded rim. Each stands on the one before.
LAYERS = {
    "inner": {"outline": PLATE, "grow": -0.034, "cushion": (0.011, 0.016)},
    "halo": {"outline": PANEL, "grow": 0.024, "cushion": (0.007, 0.012)},
    "panel": {"outline": PANEL, "grow": 0.0, "cushion": (0.016, 0.04)},
}
# The light strip along the upper outer edge, on the rim between the plate's edge and the inner
# plate: from and to (across, up), its radius. The status lights below the notch: centres (across,
# up) and their radius.
STRIP = {"from": (0.157, 0.235), "to": (0.083, 0.405), "radius": 0.0085}
LIGHTS = {"at": [(0.205, 0.0), (0.204, 0.04), (0.203, 0.08)], "radius": 0.0095, "lift": 0.003}
# Surface nets: the box round the +x ear and its grid step; each part is thinned to its budget.
GRID = {"low": (0.06, 0.82, Z - 0.06), "high": (0.78, 1.6, Z + 0.11), "step": 0.0055}
BUDGET = {"plate": 1000, "inner": 500, "halo": 350, "panel": 450}

# name -> (hex, glow, fluff, tint, glass, neon). The plates are dark and glow little from below, so
# they stay dark; the inner one is a lighter gunmetal. The panel and the strip shine in the
# wearer's colour, cyan without one, the halo in a darker shade of it; the lights shine white.
SWATCH = {
    "Cyberstahl": ("#1d212e", 0.2),
    "Cybergrau": ("#3a4157", 0.25),
    "Cyberneon": ("#19e6ff", 1.0, None, 1.0, None, 1.0),
    "Cyberschein": ("#0c6f85", 1.0, None, 0.42, None, 1.0),
    "Cyberweiß": ("#ffffff", 1.0, None, None, None, 1.0),
}


def local(points):
    """The points in the ear's frame as columns (across, up, depth in front of its plane)."""
    dx, dy = points[:, 0] - FOOT[0], points[:, 1] - FOOT[1]
    return np.column_stack([dx * ACROSS[0] + dy * ACROSS[1], dx * UP[0] + dy * UP[1], points[:, 2] - Z])


def world(across, up, depth):
    """A point of the ear's frame in pet coordinates."""
    return Vector((FOOT[0] + across * ACROSS[0] + up * UP[0], FOOT[1] + across * ACROSS[1] + up * UP[1], Z + depth))


def rise(s, height, width):
    """A front's height above its centre, `s` inside the edge: a quarter ellipse, then flat."""
    u = np.clip(s / width, 0, 1)
    return height * np.sqrt(1 - (1 - u) ** 2)


def outline_sd(q, outline, grow=0.0):
    """Signed 2D distance to an outline of the ear's frame with round corners, `grow` further out."""
    return polygon_sd(q[:, 0], q[:, 1], outline) - ROUND - grow


def plate_sdf(points):
    q = local(points)
    d = outline_sd(q, PLATE)
    return np.maximum(d, np.abs(q[:, 2]) - rise(np.maximum(-d, 0), *RIM))


def front_of(q, layers):
    """How far in front of the plane the front lies under `q` with these layers stacked on the plate."""
    front = RIM[0] + np.zeros(len(q))
    for name in layers:
        layer = LAYERS[name]
        d = outline_sd(q, layer["outline"], layer["grow"])
        front = front + np.where(d < 0, rise(np.maximum(-d, 0), *layer["cushion"]), 0.0)
    return front


def layer_sdf(name, below):
    """The cushion `name` on the front built from the layers `below`. Its back half lies inside them."""
    layer = LAYERS[name]

    def sdf(points):
        q = local(points)
        d = outline_sd(q, layer["outline"], layer["grow"])
        base = front_of(q, below)
        return np.maximum(d, np.abs(q[:, 2] - base) - rise(np.maximum(-d, 0), *layer["cushion"]))

    return sdf


def on_front(across, up, lift):
    """The point `lift` in front of the plate's front at (across, up), the rim's curve included."""
    q = np.array([[*world(across, up, 0)]])
    d = outline_sd(local(q), PLATE)[0]
    return world(across, up, rise(max(-d, 0.0), *RIM) + lift)


def strip_mesh():
    """The light strip: a tube along the rim with round ends."""
    r = STRIP["radius"]
    points = [on_front(*STRIP["from"], 0), on_front(*STRIP["to"], 0)]
    samples = [(points[0].lerp(points[1], t / 7), r, r) for t in range(8)]
    return outward(sweep(samples, ring_size=8, cap_rings=3))


def lights_mesh():
    """Three small domes on the rim below the notch."""
    r = LIGHTS["radius"]
    lights = []
    for across, up in LIGHTS["at"]:
        centre = on_front(across, up, LIGHTS["lift"])
        lights.append(blob(centre, (0, 0, 1), (0, 1, 0), (r, r, r * 0.7), ring=12, stacks=6))
    return merge(lights)


def build(collection):
    """Per side the plate, the inner plate, the halo and the panel, the strip and the lights."""
    mats = {name: generator.material(name, *swatch) for name, swatch in SWATCH.items()}
    parts = [
        ("cyber_cat_ears_plate", plate_sdf, "Cyberstahl", "plate"),
        ("cyber_cat_ears_inner", layer_sdf("inner", []), "Cybergrau", "inner"),
        ("cyber_cat_ears_halo", layer_sdf("halo", ["inner"]), "Cyberschein", "halo"),
        ("cyber_cat_ears_panel", layer_sdf("panel", ["inner", "halo"]), "Cyberneon", "panel"),
    ]
    for name, sdf, material, budget in parts:
        generator.add_implicit(collection, name, sdf, GRID, mats[material], BUDGET[budget], mirror=True)
    generator.add_mesh(collection, "cyber_cat_ears_strip", strip_mesh(), mats["Cyberneon"], mirror=True)
    generator.add_mesh(collection, "cyber_cat_ears_lights", lights_mesh(), mats["Cyberweiß"], mirror=True)


generator.run("cyber-cat-ears", "Kopf", build, __file__)
