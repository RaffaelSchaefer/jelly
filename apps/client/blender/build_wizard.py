"""Builds Funkelbart, the shopkeeper: one collection `wizard`, exported as `wizard.glb`.

Only the wizard in the app's shop wears these parts. They are not in the server's catalog, so the
app's `COSMETICS` and `COSMETIC_MODELS` leave them out; the shop loads them through
`@jelly/scene/wizard`, which splits the file by the custom property `part` of every object.

    blender blender/cosmetics.blend --background --python blender/build_wizard.py -- [flags]

    --save          store the collection (and these scripts as text blocks) in cosmetics.blend
    --export        write packages/jelly-scene/src/cosmetics/wizard.glb, delete the v1 GLBs
    --check         print vertices, bytes and bounds per part as JSON, exit 1 when a rule breaks
    --preview PATH  render the shop camera with the app's paint layers into PATH (PNG)

Every run rebuilds the collection from the numbers below and removes the v1 collections
(`wizard-hat`, `wizard-face`, `wizard-orb`); without `--save` the .blend on disk stays as it was.
All geometry is written in Three.js coordinates (y up, +z front) and converted once in
`shapes.to_blender`. Head and body parts sit on the reference pet. The orb parts are modelled
around the ball's rest centre (the origin) and the wand in the frame of the right hand; the shop
places both. See README.md.
"""
import json
import math
import os
import sys
import tempfile

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ next to the .blend

import preview  # noqa: E402
import setup_cosmetics  # noqa: E402
from shapes import (  # noqa: E402
    HEAD_Z,
    badge,
    catmull,
    closed_sweep,
    crescent_outline,
    decal_badge,
    decal_strand,
    from_blender,
    lerp_sections,
    on_pet,
    puff,
    skin,
    smooth,
    squircle_outline,
    star_outline,
    strand,
    surface_z,
    sweep,
    sweep_mod,
    to_blender,
)

COLLECTION = "wizard"
V1_COLLECTIONS = ("wizard-hat", "wizard-face", "wizard-orb")
SCRIPTS = ("build_wizard.py", "shapes.py", "preview.py")

# Mirrors WIZARD_PARTS in packages/jelly-scene/src/wizard.ts: part -> (anchor, paint layer).
PARTS = {
    "hat": ("head", 0),
    "hair": ("head", 0),
    "hatTrim": ("head", 1),
    "locks": ("head", 1),
    "beard": ("head", 2),
    "brow": ("head", 2),
    "mustache": ("head", 3),
    "nose": ("head", 4),
    "robe": ("body", 0),
    "clasps": ("body", 1),
    "orbStand": ("orb", 0),
    "orbSparks": ("orb", 0),
    "orbClaws": ("orb", 2),
    "wand": ("hand", 2),
}
# Exported as right halves (x >= 0); the shop draws them a second time, mirrored.
HALVES = ("brow", "mustache")

# The swatch: name -> (hex, glow). `glow` (0-1) dampens the light from below, see cosmetic.ts.
# Value order: beard > brass > body > wine > navy hat, so the face is framed by white.
SWATCH = {
    "Nachtblau": ("#24306f", 0.15),
    "Saum": ("#34418a", 0.2),
    "Stickgarn": ("#f3d98c", 0.5),
    "Flicken": ("#3f6f7a", 0.3),
    "Weinrot": ("#6e1f3f", 0.25),
    "Weinrot dunkel": ("#4f1630", 0.25),
    "Messing": ("#d6a54a", 0.6),
    "Messing dunkel": ("#8a6326", 0.6),
    "Sterngold": ("#ffd75e", 1.0),
    "Bart": ("#f4efe4", 1.0),
    "Bartschatten": ("#e3dccd", 1.0),
    "Nase": ("#c7789f", 0.4),
    "Zauberholz": ("#7a4a2a", 0.3),
    "Funke": ("#fff1b8", 1.0),
}

# Rules for --check: the GLB budget and the windows of mouth and lidded eyes, as (|x|, y) ranges.
BUDGET = {"vertices": 10_500, "bytes": 380_000}
KEEP_CLEAR = {"mouth": ((0.0, 0.12), (0.345, 0.52)), "eye": ((0.11, 0.27), (0.58, 0.69))}
KEEP_CLEAR_PARTS = ("hair", "locks", "beard", "brow", "mustache", "nose")


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name):
    """The swatch material `name`, created or updated."""
    hex_color, glow = SWATCH[name]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    rgb = [linear(int(hex_color[i : i + 2], 16) / 255) for i in (1, 3, 5)]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    mat.diffuse_color = (*rgb, 1)
    mat["glow"] = glow
    return mat


def add_part(collection, part, name, mesh_data, swatch, mirror=False):
    """One object of `part` with exactly one material; `mirror` adds its twin at -x."""
    verts, faces = mesh_data
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(v) for v in verts], [], faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    mesh.materials.append(material(swatch))
    obj = bpy.data.objects.new(name, mesh)
    obj["part"] = part
    collection.objects.link(obj)
    if mirror:
        mod = obj.modifiers.new("Spiegel", "MIRROR")
        mod.use_axis[0] = True
        mod.use_mirror_merge = False
    return obj


# ---------------------------------------------------------------------------------------------
# Hat: a felt cone that kinks twice into a curled tip, a floppy rippled brim with a rolled hem,
# embroidery and a mended patch (layer 0); the wine band, its brass clasp and the tip star (layer 1).
HAT_PATH = [(0.0, 0.97, 0.2), (0.03, 1.28, 0.19), (0.0, 1.55, 0.17), (-0.16, 1.77, 0.15), (-0.42, 1.87, 0.15), (-0.62, 1.80, 0.17), (-0.70, 1.66, 0.2)]
HAT_SECTIONS = [(0.5, 0.46), (0.41, 0.38), (0.30, 0.28), (0.20, 0.19), (0.125, 0.12), (0.08, 0.075), (0.055, 0.052)]
HAT_SAMPLES, HAT_RING = 30, 18
FOLDS = [(0.36, 0.10), (0.60, 0.09)]  # (u along the cone, pinch)
BRIM = {"y": 0.99, "rx": 0.98, "rz": 0.86, "half": 0.04, "tilt": math.radians(5), "droop": 0.075, "ripple": 0.03, "waves": 5}
EMBROIDERY_LIFT = 0.006
MOON = {"u": 0.17, "shift": -0.42, "r": 0.11, "half": 0.016, "roll": math.radians(-25)}
# (u, shift, radius, points): 5-point stars (inner 0.48) and 4-point twinkles (inner 0.32).
HAT_STARS = [(0.33, 0.12, 0.062, 5), (0.44, -0.20, 0.046, 5), (0.20, 0.50, 0.04, 4), (0.55, 0.15, 0.036, 5), (0.68, -0.05, 0.032, 4)]
PATCH = {"u": 0.24, "shift": 0.52, "r": 0.12, "half": 0.012, "lift": 0.004, "roll": math.radians(12)}
BAND = {"y": 1.06, "gap": 0.012, "from": -12, "to": 192, "radial": 0.026, "height": 0.06}


def cone_frame():
    """Cone samples (point, h, w) with the two folds pinched in, and the crumple per ring."""
    points = catmull([Vector(p) for p in HAT_PATH], HAT_SAMPLES)
    samples, mods = [], []
    for i, (p, (h, w)) in enumerate(zip(points, lerp_sections(HAT_SECTIONS, HAT_SAMPLES))):
        u = i / (HAT_SAMPLES - 1)
        pinch = 1 - sum(depth * math.exp(-(((u - at) / 0.035) ** 2)) for at, depth in FOLDS)
        samples.append((p, h * pinch, w * pinch))
        phase = 2.4 * u
        amp = 0.045 * min(1.0, u * 4)  # the base stays round where the band sits
        mods.append(lambda a, phase=phase, amp=amp: 1 + amp * math.sin(3 * a + phase) + amp * 0.5 * math.sin(5 * a - phase))
    return samples, mods


CONE, CRUMPLE = cone_frame()


def cone_point(u, shift, lift):
    """A point `lift` above the cone's front at `u` along it, `shift` of its half width aside."""
    p, h, w = CONE[min(int(u * (HAT_SAMPLES - 1)), HAT_SAMPLES - 2)]
    depth = w * math.sqrt(max(0.0, 1 - shift**2))
    return p + Vector((shift * h, 0, depth + lift)), Vector((shift * 0.7, 0.15, 1)).normalized()


def brim_point(theta, s=1.0):
    """A point of the brim at angle `theta` and `s` of its radius: the sides sag, the edge ripples."""
    x = BRIM["rx"] * s * math.cos(theta)
    z = BRIM["rz"] * s * math.sin(theta)
    lift = s * s * (-BRIM["droop"] * math.cos(theta) ** 2 + BRIM["ripple"] * math.sin(BRIM["waves"] * theta + 0.4))
    return Vector((x, BRIM["y"] + lift - z * math.tan(BRIM["tilt"]), HEAD_Z + z))


def brim_mesh(ring_size=48, stacks=7):
    """A floppy superellipse disc. The rings run with -theta, as in puff(), so normals face out."""
    rings = []
    for i in range(1, stacks):
        t = -math.pi / 2 + math.pi * i / stacks
        along = BRIM["half"] * math.copysign(abs(math.sin(t)) ** (2 / 2.6), math.sin(t))
        s = abs(math.cos(t)) ** (2 / 2.6)
        rings.append([brim_point(-2 * math.pi * j / ring_size, s) + Vector((0, along, 0)) for j in range(ring_size)])
    center, half = brim_point(0, 0), Vector((0, BRIM["half"], 0))
    return skin(rings, ring_size, center - half, center + half)


def band_mesh(count=30):
    """The wine band hugging the cone above the brim, open at the back."""
    _, h, w = CONE[3]
    rx, rz = h + BAND["gap"], w + BAND["gap"]
    samples = []
    for i in range(count):
        theta = math.radians(BAND["from"] + (BAND["to"] - BAND["from"]) * i / (count - 1))
        samples.append((Vector((rx * math.cos(theta), BAND["y"], HEAD_Z + rz * math.sin(theta))), BAND["radial"], BAND["height"]))
    return sweep(samples, ring_size=10, cap_rings=4, up=Vector((0, 1, 0)))


def build_hat(collection):
    add_part(collection, "hat", "hat_brim", brim_mesh(), "Nachtblau")
    add_part(collection, "hat", "hat_hem", closed_sweep([brim_point(2 * math.pi * k / 48) for k in range(48)], 0.034, 0.03, ring_size=8), "Saum")
    add_part(collection, "hat", "hat_cone", sweep_mod(CONE, ring_size=HAT_RING, cap=0.04, mods=CRUMPLE), "Nachtblau")
    at, normal = cone_point(MOON["u"], MOON["shift"], EMBROIDERY_LIFT)
    add_part(collection, "hat", "hat_moon", badge(crescent_outline(), at, normal, MOON["r"], MOON["half"], roll=MOON["roll"]), "Stickgarn")
    for k, (u, shift, radius, points) in enumerate(HAT_STARS):
        at, normal = cone_point(u, shift, EMBROIDERY_LIFT)
        outline = star_outline(points, 0.48 if points == 5 else 0.32)
        add_part(collection, "hat", f"hat_star_{k}", badge(outline, at, normal, radius, 0.014, roll=0.3 * k), "Stickgarn")
    at, normal = cone_point(PATCH["u"], PATCH["shift"], PATCH["lift"])
    add_part(collection, "hat", "hat_patch", badge(squircle_outline(1.0, 0.82), at, normal, PATCH["r"], PATCH["half"], roll=PATCH["roll"]), "Flicken")

    add_part(collection, "hatTrim", "hat_band", band_mesh(), "Weinrot")
    _, h, w = CONE[3]
    clasp_at = Vector((0.14, BAND["y"], HEAD_Z + w * math.sqrt(max(0.0, 1 - (0.14 / h) ** 2)) + 0.05))
    add_part(collection, "hatTrim", "hat_clasp", badge(star_outline(5, 0.5), clasp_at, (0.25, 0.1, 1), 0.085, 0.028), "Messing")
    tip = CONE[-1][0] + Vector((-0.03, -0.06, 0.04))
    add_part(collection, "hatTrim", "hat_tip_star", badge(star_outline(5, 0.5), tip, (-0.2, -0.1, 1), 0.075, 0.025, roll=0.4), "Sterngold")


# ---------------------------------------------------------------------------------------------
# Face. The mouth stays free (|x| < 0.12, y 0.345-0.52), so do the lidded eyes (|x| 0.11-0.27,
# y 0.58-0.69). Brows and mustache are right halves; the shop draws them twice, once mirrored.
HAIR = [
    ([(0.48, 0.92), (0.58, 0.84), (0.63, 0.72), (0.61, 0.60), (0.56, 0.50), (0.53, 0.44)], [(0.05, 0.035), (0.055, 0.04), (0.05, 0.038), (0.045, 0.034), (0.035, 0.03), (0.02, 0.02)]),
    ([(0.42, 0.90), (0.50, 0.82), (0.54, 0.72), (0.53, 0.64), (0.50, 0.60)], [(0.04, 0.03), (0.045, 0.035), (0.04, 0.032), (0.028, 0.024), (0.016, 0.016)]),
]
# The beard as one cushion: its outline (front view, counter-clockwise from the bottom centre)
# is scalloped below and dips under the mouth above.
BEARD_RIGHT = [(0.07, -0.05), (0.13, -0.02), (0.19, -0.07), (0.26, -0.03), (0.32, 0.03), (0.38, 0.02), (0.42, 0.10), (0.455, 0.20), (0.47, 0.31), (0.46, 0.41), (0.42, 0.48), (0.33, 0.45), (0.22, 0.40), (0.12, 0.34)]
BEARD_OUTLINE = [(0.0, -0.09), *BEARD_RIGHT, (0.0, 0.33), *[(-x, y) for x, y in reversed(BEARD_RIGHT)]]
BEARD = {"center": (0.0, 0.17), "lift": 0.05, "half": 0.11, "ring": 56, "stacks": 5}
# Locks hang out from under the cushion: (points, sections, mirrored).
LOCKS = [
    ([(0.0, 0.06), (0.0, -0.08), (-0.035, -0.17), (-0.10, -0.225), (-0.155, -0.19), (-0.145, -0.14)], [(0.11, 0.05), (0.095, 0.05), (0.06, 0.04), (0.035, 0.03), (0.022, 0.022), (0.016, 0.016)], False),
    ([(0.19, 0.04), (0.22, -0.06), (0.25, -0.13), (0.30, -0.155), (0.34, -0.125)], [(0.095, 0.05), (0.075, 0.045), (0.045, 0.035), (0.024, 0.022), (0.016, 0.016)], True),
    ([(0.37, 0.12), (0.41, 0.03), (0.45, -0.03), (0.50, -0.035)], [(0.075, 0.045), (0.055, 0.04), (0.03, 0.026), (0.016, 0.016)], True),
]
BEAD = {"x": -0.016, "y": -0.13, "rx": 0.07, "rz": 0.055, "lift": 0.08, "radial": 0.018, "height": 0.03}
BROW_TUFTS = [
    ([(0.10, 0.77), (0.20, 0.825), (0.30, 0.81), (0.37, 0.76)], [(0.03, 0.03), (0.042, 0.034), (0.036, 0.03), (0.02, 0.02)]),
    ([(0.13, 0.755), (0.24, 0.78), (0.33, 0.745), (0.385, 0.685)], [(0.03, 0.03), (0.04, 0.032), (0.032, 0.028), (0.02, 0.02)]),
    ([(0.20, 0.745), (0.30, 0.725), (0.355, 0.67), (0.345, 0.62)], [(0.03, 0.028), (0.034, 0.03), (0.026, 0.024), (0.016, 0.016)]),
]
MUSTACHE = (
    [(0.035, 0.556), (0.12, 0.548), (0.20, 0.528), (0.28, 0.497), (0.35, 0.49), (0.398, 0.515), (0.405, 0.552), (0.38, 0.572), (0.355, 0.56)],
    [(0.022, 0.024), (0.024, 0.026), (0.034, 0.03), (0.04, 0.032), (0.034, 0.028), (0.026, 0.024), (0.02, 0.02), (0.015, 0.015), (0.012, 0.012)],
)
NOSE = {"x": 0.0, "y": 0.60, "lift": 0.02, "axis": (0, 0.15, 1), "rx": 0.052, "ry": 0.057, "half": 0.04}


def bead_mesh():
    """The brass bead: a ring around the centre lock."""
    x, y = BEAD["x"], BEAD["y"]
    z = surface_z(x, y) + BEAD["lift"]
    ring = [Vector((x + BEAD["rx"] * math.cos(a), y, z + BEAD["rz"] * math.sin(a))) for a in (2 * math.pi * k / 24 for k in range(24))]
    return closed_sweep(ring, BEAD["radial"], BEAD["height"], ring_size=8, up=Vector((0, 1, 0)))


def build_face(collection):
    for k, (points, sections) in enumerate(HAIR):
        add_part(collection, "hair", f"hair_{k}", strand(points, sections, lift=0.02, ring_size=8, cap=0.03, count=12), "Bartschatten", mirror=True)
    add_part(collection, "beard", "beard", decal_badge(BEARD_OUTLINE, BEARD["center"], BEARD["lift"], BEARD["half"], ring_size=BEARD["ring"], stacks=BEARD["stacks"]), "Bart")
    for k, (points, sections, mirror) in enumerate(LOCKS):
        add_part(collection, "locks", f"lock_{k}", strand(points, sections, lift=0.08, ring_size=10, cap=0.02, count=12), "Bartschatten", mirror=mirror)
    add_part(collection, "locks", "lock_bead", bead_mesh(), "Messing")
    for k, (points, sections) in enumerate(BROW_TUFTS):
        add_part(collection, "brow", f"brow_{k}", strand(points, sections, lift=0.03, ring_size=8, cap=0.02, count=10), "Bart")
    add_part(collection, "mustache", "mustache", strand(*MUSTACHE, lift=0.04, ring_size=8, cap=0.015, count=18), "Bart")
    center = on_pet(NOSE["x"], NOSE["y"], NOSE["lift"])
    add_part(collection, "nose", "nose", puff(center, NOSE["axis"], NOSE["rx"], NOSE["half"], ring_size=14, stacks=7, radius2=NOSE["ry"]), "Nase")


# ---------------------------------------------------------------------------------------------
# Robe: wine cape panels that hug the shoulders with gold piping, a rolled collar (layer 0) and
# two brass star clasps (layer 1). It hangs in the jelly's root and sways with the body.
CAPE = ([(0.50, 0.07), (0.60, -0.05), (0.67, -0.19), (0.72, -0.36)], [(0.12, 0.03), (0.15, 0.03), (0.20, 0.03), (0.23, 0.03)])
TRIM = ([(0.38, 0.10), (0.43, -0.04), (0.46, -0.18), (0.49, -0.36)], [(0.022, 0.02)] * 4)
COLLAR = ([(0.0, 0.10), (0.24, 0.09), (0.44, 0.05), (0.56, -0.01)], [(0.055, 0.05), (0.06, 0.05), (0.055, 0.05), (0.045, 0.045)])
CLASP = {"x": 0.565, "y": -0.03, "lift": 0.12, "normal": (0.3, 0.25, 1), "r": 0.075, "half": 0.024, "roll": 0.15}


def build_robe(collection):
    add_part(collection, "robe", "cape", decal_strand(*CAPE, lift=0.025, ring_size=12, count=12, cap=0.06), "Weinrot", mirror=True)
    add_part(collection, "robe", "cape_trim", decal_strand(*TRIM, lift=0.055, ring_size=8, count=14, cap=0.02), "Messing", mirror=True)
    add_part(collection, "robe", "collar", strand(*COLLAR, lift=0.06, ring_size=12, cap=0.04, count=14), "Weinrot dunkel", mirror=True)
    at = on_pet(CLASP["x"], CLASP["y"], CLASP["lift"])
    clasp = badge(star_outline(5, 0.5), at, CLASP["normal"], CLASP["r"], CLASP["half"], ring_size=30, stacks=4, roll=CLASP["roll"])
    add_part(collection, "clasps", "clasp", clasp, "Messing", mirror=True)


# ---------------------------------------------------------------------------------------------
# Orb: a brass claw stand around the ball's rest centre (the origin). The foot's bottom at y -0.32
# stands on the counter. The ball itself is procedural (crystal.ts), so there is no ball mesh.
BALL_R = 0.21
FOOT = {"y": -0.29, "r": 0.16, "half": 0.03}
STEM = [(-0.26, 0.05), (-0.23, 0.065), (-0.20, 0.04), (-0.17, 0.07)]  # (y, radius)
CUP = {"y": -0.165, "r": 0.115, "tube": 0.022}
SPARKS = [((0.29, 0.16, 0.05), 0.05), ((-0.28, 0.05, 0.08), 0.038), ((0.12, 0.31, 0.06), 0.03)]


def talon(azimuth, top):
    """A talon from the cup up around the ball to elevation `top` (degrees), with a curled tip."""
    points = []
    for k in range(9):
        u = k / 8
        e = math.radians(-62 + (top + 62) * u)
        r = BALL_R + 0.03 - 0.012 * u
        points.append(Vector((r * math.cos(e) * math.cos(azimuth), r * math.sin(e), r * math.cos(e) * math.sin(azimuth))))
    points.append(points[-1] - points[-1].normalized() * 0.04 + Vector((0, 0.02, 0)))
    sections = [(0.03 - 0.018 * (k / 9) ** 1.5, 0.026 - 0.016 * (k / 9) ** 1.5) for k in range(10)]
    return sweep([(p, h, w) for p, (h, w) in zip(points, sections)], ring_size=8, cap_rings=3, cap=0.012, up=-points[4].normalized())


def build_orb(collection):
    foot = puff((0, FOOT["y"], 0), (0, 1, 0), FOOT["r"], FOOT["half"], power=3.0, ring_size=32, stacks=8)
    add_part(collection, "orbStand", "orb_foot", foot, "Messing dunkel")
    stem = [(Vector((0, y, 0)), r, r) for y, r in STEM]
    add_part(collection, "orbStand", "orb_stem", sweep(stem, ring_size=20, cap_rings=4, cap=0.02, up=Vector((0, 0, 1))), "Messing")
    cup = [Vector((CUP["r"] * math.cos(a), CUP["y"], CUP["r"] * math.sin(a))) for a in (2 * math.pi * k / 40 for k in range(40))]
    add_part(collection, "orbStand", "orb_cup", closed_sweep(cup, CUP["tube"], CUP["tube"], ring_size=10), "Messing")
    add_part(collection, "orbStand", "orb_talon_left", talon(math.radians(180), 18), "Messing")
    add_part(collection, "orbStand", "orb_talon_right", talon(math.radians(0), 18), "Messing")
    add_part(collection, "orbClaws", "orb_claw_left", talon(math.radians(132), -12), "Messing")
    add_part(collection, "orbClaws", "orb_claw_right", talon(math.radians(48), -12), "Messing")
    for k, (at, radius) in enumerate(SPARKS):
        add_part(collection, "orbSparks", f"orb_spark_{k}", badge(star_outline(4, 0.3), at, (0, 0, 1), radius, 0.012), "Funke")


# ---------------------------------------------------------------------------------------------
# Wand, in the frame of jelly.hands[1] (fingers +y, palm +z): a gnarled shaft with two knots,
# a brass ferrule and a star tip. The shop shows it only while he points.
WAND_PATH = [(0.0, -0.08, 0.02), (0.012, 0.12, 0.03), (-0.008, 0.30, 0.03), (0.01, 0.50, 0.03)]
WAND_SECTIONS = [(0.03, 0.03), (0.026, 0.026), (0.022, 0.022), (0.017, 0.017)]
WAND_KNOTS = ((0.20, 0.034, 0.03), (0.38, 0.034, 0.03))  # (y, radius, half)
WAND_FERRULE = {"y": 0.05, "r": 0.036, "tube": 0.012}
WAND_STAR = {"at": (0.012, 0.58, 0.03), "r": 0.075, "half": 0.022}


def shaft_at(y):
    """The point and direction of the wand's shaft at height `y`."""
    points = catmull([Vector(p) for p in WAND_PATH], 200)
    index = min(range(1, len(points) - 1), key=lambda i: abs(points[i].y - y))
    return points[index], (points[index + 1] - points[index - 1]).normalized()


def build_wand(collection):
    shaft = sweep(smooth(WAND_PATH, WAND_SECTIONS, 14), ring_size=10, cap_rings=4, up=Vector((0, 0, 1)))
    add_part(collection, "wand", "wand_shaft", shaft, "Zauberholz")
    for k, (y, radius, half) in enumerate(WAND_KNOTS):
        at, direction = shaft_at(y)
        add_part(collection, "wand", f"wand_knot_{k}", puff(at, direction, radius, half, ring_size=12, stacks=6), "Zauberholz")
    at, _ = shaft_at(WAND_FERRULE["y"])
    ring = [at + Vector((WAND_FERRULE["r"] * math.cos(a), 0, WAND_FERRULE["r"] * math.sin(a))) for a in (2 * math.pi * k / 24 for k in range(24))]
    add_part(collection, "wand", "wand_ferrule", closed_sweep(ring, WAND_FERRULE["tube"], WAND_FERRULE["tube"], ring_size=6), "Messing")
    star = badge(star_outline(5, 0.48), WAND_STAR["at"], (0, 0, 1), WAND_STAR["r"], WAND_STAR["half"])
    add_part(collection, "wand", "wand_star", star, "Sterngold")


# ---------------------------------------------------------------------------------------------
# Pipeline.


def remove_objects(collection):
    for obj in list(collection.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def remove_v1():
    """The v1 wizard had three collections; all parts now live in one."""
    for name in V1_COLLECTIONS:
        collection = bpy.data.collections.get(name)
        if collection is not None:
            remove_objects(collection)
            bpy.data.collections.remove(collection)


def wizard_collection():
    """The collection `wizard` under "Cosmetics", created on the first run."""
    collection = bpy.data.collections.get(COLLECTION)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION)
        collection["slot"] = "NPC"
        bpy.data.collections["Cosmetics"].children.link(collection)
    return collection


def build(collection):
    remove_objects(collection)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for fill in (build_hat, build_face, build_robe, build_orb, build_wand):
        fill(collection)


def save():
    """Stores the collection and the generator, so the parameters travel with the .blend."""
    for name in SCRIPTS:
        text = bpy.data.texts.get(name) or bpy.data.texts.new(name)
        with open(os.path.join(HERE, name), encoding="utf-8") as source:
            text.from_string(source.read())
    bpy.ops.wm.save_mainfile()


def export(collection, folder=None):
    """Writes wizard.glb with the pipeline's options, into `folder` instead of the package if given."""
    output = setup_cosmetics.OUTPUT
    if folder:
        setup_cosmetics.OUTPUT = os.path.join(folder, "")
    try:
        setup_cosmetics.export([collection])
        target = bpy.path.abspath(setup_cosmetics.OUTPUT)
    finally:
        setup_cosmetics.OUTPUT = output
    return os.path.join(target, f"{collection.name}.glb")


def remove_v1_models():
    out = bpy.path.abspath(setup_cosmetics.OUTPUT)
    for name in V1_COLLECTIONS:
        path = os.path.join(out, f"{name}.glb")
        if os.path.exists(path):
            os.remove(path)


def read_glb(path):
    """Vertex count, size and part names of a GLB, as the app loads it."""
    with open(path, "rb") as handle:
        data = handle.read()
    length = int.from_bytes(data[12:16], "little")
    gltf = json.loads(data[20 : 20 + length])
    vertices = sum(gltf["accessors"][p["attributes"]["POSITION"]]["count"] for mesh in gltf["meshes"] for p in mesh["primitives"])
    parts = sorted({node["extras"]["part"] for node in gltf["nodes"] if "part" in node.get("extras", {})})
    return {"vertices": vertices, "bytes": len(data), "parts": parts}


def part_points(collection):
    """Every vertex per part in Three.js coordinates, with modifiers applied."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = {}
    for obj in list(collection.all_objects):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points.setdefault(obj["part"], []).extend(from_blender(obj.matrix_world @ v.co) for v in mesh.vertices)
        evaluated.to_mesh_clear()
    return points


def keep_clear_hits(points):
    """Vertices inside the mouth or eye windows. |x| tests the mirrored halves too."""
    hits = []
    for part in KEEP_CLEAR_PARTS:
        for p in points.get(part, []):
            for name, ((x0, x1), (y0, y1)) in KEEP_CLEAR.items():
                if x0 < abs(p.x) < x1 and y0 < p.y < y1:
                    hits.append({"part": part, "window": name, "at": [round(p.x, 4), round(p.y, 4)]})
    return hits


def check(collection, glb_path=None):
    """Prints the report as JSON. Returns False when a rule breaks."""
    with tempfile.TemporaryDirectory() as folder:
        glb = read_glb(glb_path or export(collection, folder))
    points = part_points(collection)
    bounds = {
        part: {
            "min": [round(min(getattr(p, axis) for p in found), 4) for axis in "xyz"],
            "max": [round(max(getattr(p, axis) for p in found), 4) for axis in "xyz"],
        }
        for part, found in sorted(points.items())
    }
    hits = keep_clear_hits(points)
    problems = [f"{key} {glb[key]} > {limit}" for key, limit in BUDGET.items() if glb[key] > limit]
    if glb["parts"] != sorted(PARTS):
        problems.append(f"parts {glb['parts']} != {sorted(PARTS)}")
    problems += [f"{hit['part']} in the {hit['window']} window at {hit['at']}" for hit in hits[:12]]
    report = {"vertices": glb["vertices"], "bytes": glb["bytes"], "budget": BUDGET, "parts": bounds, "keepClear": len(hits), "problems": problems}
    lines = [f' "{key}": {json.dumps(value)}' for key, value in report.items() if key != "parts"]
    lines.append(' "parts": {\n' + ",\n".join(f'  "{part}": {json.dumps(box)}' for part, box in bounds.items()) + "\n }")
    print("CHECK {\n" + ",\n".join(lines) + "\n}")
    return not problems


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    remove_v1()
    collection = wizard_collection()
    build(collection)
    if "--save" in args:
        save()
    exported = None
    if "--export" in args:
        exported = export(collection)
        remove_v1_models()
        print("Exportiert:", exported)
    ok = check(collection, exported) if "--check" in args else True
    if "--preview" in args:
        preview.render(collection, os.path.abspath(args[args.index("--preview") + 1]), PARTS, HALVES)
    print("BUILT", {part: sum(1 for o in collection.all_objects if o["part"] == part) for part in PARTS})
    if not ok:
        sys.exit(1)


main()
