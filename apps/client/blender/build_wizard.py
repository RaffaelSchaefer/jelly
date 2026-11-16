"""Builds the shopkeeper's cosmetics: `wizard-hat`, `wizard-face` and `wizard-orb`.

Only the wizard in the app's shop wears them. They are not in the server's catalog, so the app's
`COSMETICS` and `COSMETIC_MODELS` leave them out; the shop loads them through `@jelly/scene/wizard`.

Replaces the meshes in the three collections. Change the numbers below and run it again:
    blender blender/cosmetics.blend --background --python blender/build_wizard.py -- --save --export
`--save` stores the collections (and this script as a text block) in cosmetics.blend, `--export`
writes only these three .glb files.

All geometry is written in Three.js coordinates (y up, +z front) and converted once in `to_blender`.
The hat and the face sit on the reference pet. The orb is modelled around the origin: the shop
places it beside the wizard and lets it float.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HEAD_Y, HEAD_Z, HEAD_R, HEAD_DEPTH = 0.66, 0.2, 0.62, 0.9
# Body outline from jellyGeometry.ts as (radius, height), used to rest the beard on the belly.
BODY_PROFILE = [(0.86, -0.55), (0.83, -0.33), (0.75, -0.14), (0.6, 0.02), (0.4, 0.11), (0.18, 0.15)]
BODY_DEPTH = 0.8

NIGHT, GOLD, STAR = "#2b2a72", "#d4a640", "#ffd75e"
BEARD_WHITE = "#f2efe6"
CRYSTAL, SPARK = "#a8e6ff", "#fff1b8"
PARTS = ("wizard-hat", "wizard-face", "wizard-orb")


def to_blender(p):
    return (p[0], -p[2], p[1])


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name, hex_color, glow=None):
    """A material by its hex colour. `glow` (0-1) dampens the light from below, see cosmetic.ts."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    rgb = [linear(int(hex_color[i : i + 2], 16) / 255) for i in (1, 3, 5)]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    mat.diffuse_color = (*rgb, 1)
    if glow is not None:
        mat["glow"] = glow
    elif "glow" in mat:
        del mat["glow"]
    return mat


def add_mesh(collection, name, verts, faces, mat, mirror=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(v) for v in verts], [], faces)
    mesh.update()
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    if mirror:
        mod = obj.modifiers.new("Spiegel", "MIRROR")
        mod.use_axis[0] = True
        mod.use_mirror_merge = False
    return obj


def skin(rings, ring_size, start_pole=None, end_pole=None):
    """Quads between rings, fans to the poles. Outward if rings run along T with (N, B, T) right-handed."""
    verts, faces = [], []
    for ring in rings:
        verts.extend(ring)
    for i in range(len(rings) - 1):
        for j in range(ring_size):
            a, b = i * ring_size + j, i * ring_size + (j + 1) % ring_size
            c, d = b + ring_size, a + ring_size
            faces.append((a, b, c, d))
    if start_pole is not None:
        pole = len(verts)
        verts.append(start_pole)
        for j in range(ring_size):
            faces.append((pole, (j + 1) % ring_size, j))
    if end_pole is not None:
        pole = len(verts)
        verts.append(end_pole)
        base = (len(rings) - 1) * ring_size
        for j in range(ring_size):
            faces.append((base + j, base + (j + 1) % ring_size, pole))
    return verts, faces


def ring_at(center, n, b, h, w, ring_size):
    out = []
    for j in range(ring_size):
        a = 2 * math.pi * j / ring_size
        out.append(center + n * (h * math.cos(a)) + b * (w * math.sin(a)))
    return out


def sweep(samples, ring_size=20, cap_rings=6, cap=None, up=Vector((0, 0, 1))):
    """samples: list of (point, h, w). Closed with round ends, so the outline stays whole."""
    points = [s[0] for s in samples]
    count = len(points)
    frames = []
    for i, point in enumerate(points):
        tangent = (points[min(i + 1, count - 1)] - points[max(i - 1, 0)]).normalized()
        binormal = (up - tangent * up.dot(tangent)).normalized()
        frames.append((tangent, binormal.cross(tangent).normalized(), binormal))

    rings = []

    def cap_rings_at(index, sign):
        tangent, n, b = frames[index]
        point, h, w = samples[index]
        length = cap if cap is not None else (h + w) / 2
        made = []
        for k in range(1, cap_rings):
            phi = k / cap_rings * math.pi / 2
            scale = math.cos(phi)
            made.append(ring_at(point + tangent * (sign * length * math.sin(phi)), n, b, h * scale, w * scale, ring_size))
        return made, point + tangent * (sign * length)

    start, start_pole = cap_rings_at(0, -1)
    rings.extend(reversed(start))
    for (point, h, w), (_, n, b) in zip(samples, frames):
        rings.append(ring_at(point, n, b, h, w, ring_size))
    end, end_pole = cap_rings_at(count - 1, 1)
    rings.extend(end)
    return skin(rings, ring_size, start_pole, end_pole)


def puff(center, axis, radius, half, power=2.0, ring_size=32, stacks=16, radius2=None):
    """A rounded disc around `axis`. power 2 is an ellipsoid, higher gets pillowy."""
    center, axis = Vector(center), Vector(axis).normalized()
    helper = Vector((0, 1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
    binormal = (helper - axis * helper.dot(axis)).normalized()
    normal = binormal.cross(axis).normalized()
    exponent = 2 / power
    rings = []
    for i in range(1, stacks):
        t = -math.pi / 2 + math.pi * i / stacks
        along = half * math.copysign(abs(math.sin(t)) ** exponent, math.sin(t))
        scale = abs(math.cos(t)) ** exponent
        rings.append(ring_at(center + axis * along, normal, binormal, radius * scale, (radius2 or radius) * scale, ring_size))
    return skin(rings, ring_size, center - axis * half, center + axis * half)


def star(center, normal, radius, half, points=5, ring_size=40, stacks=6, up=Vector((0, 1, 0))):
    """A puffy star facing `normal`. Smoothed tips keep the ink outline whole."""
    corners = []
    for i in range(points * 2):
        angle = math.pi / 2 + math.pi * i / points
        reach = 1.0 if i % 2 == 0 else 0.48
        corners.append((math.cos(angle) * reach, math.sin(angle) * reach))
    outline = []
    for i in range(len(corners)):
        a, b = corners[i], corners[(i + 1) % len(corners)]
        for k in range(24):
            u = k / 24
            outline.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
    total = len(outline)
    for _ in range(14):
        outline = [
            ((outline[i - 1][0] + outline[i][0] * 2 + outline[(i + 1) % total][0]) / 4, (outline[i - 1][1] + outline[i][1] * 2 + outline[(i + 1) % total][1]) / 4)
            for i in range(total)
        ]
    # Even spacing along the boundary, counter-clockwise seen from the front.
    lengths = [0.0]
    for i in range(total):
        a, b = outline[i], outline[(i + 1) % total]
        lengths.append(lengths[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    boundary = []
    for j in range(ring_size):
        target = lengths[-1] * j / ring_size
        index = next(k for k in range(total) if lengths[k + 1] >= target)
        boundary.append(outline[index])
    z_axis = Vector(normal).normalized()
    x_axis = up.cross(z_axis).normalized()
    y_axis = z_axis.cross(x_axis)
    center = Vector(center)

    def place(x, y, z):
        return center + x_axis * (x * radius) + y_axis * (y * radius) + z_axis * z

    rings = []
    for i in range(-stacks + 1, stacks):
        phi = i / stacks * math.pi / 2
        scale = math.cos(phi)
        rings.append([place(x * scale, y * scale, half * math.sin(phi)) for x, y in boundary])
    return skin(rings, ring_size, place(0, 0, -half), place(0, 0, half))


def bezier(p0, p1, p2, u):
    return p0 * (1 - u) ** 2 + p1 * (2 * u * (1 - u)) + p2 * u**2


def head_z(x, y):
    """Front of the head at (x, y), 0 outside it."""
    inside = HEAD_R**2 - x**2 - (y - HEAD_Y) ** 2
    return HEAD_Z + HEAD_DEPTH * math.sqrt(inside) if inside > 0 else 0.0


def body_z(x, y):
    """Front of the body at (x, y), 0 outside it."""
    for (r0, y0), (r1, y1) in zip(BODY_PROFILE, BODY_PROFILE[1:]):
        if y0 <= y <= y1:
            radius = r0 + (r1 - r0) * (y - y0) / (y1 - y0)
            inside = radius**2 - x**2
            return BODY_DEPTH * math.sqrt(inside) if inside > 0 else 0.0
    return BODY_DEPTH * BODY_PROFILE[0][0] if y < BODY_PROFILE[0][1] else 0.0


def on_pet(x, y, lift):
    """A point `lift` in front of the pet's surface at (x, y)."""
    return Vector((x, y, max(head_z(x, y), body_z(x, y)) + lift))


def smooth(points, sections, count):
    """`count` samples on a Catmull-Rom curve through `points`, sections eased in between."""
    padded = [points[0], *points, points[-1]]
    out = []
    for i in range(count):
        t = i / (count - 1) * (len(points) - 1)
        k = min(int(t), len(points) - 2)
        u = t - k
        p0, p1, p2, p3 = (Vector(padded[k + j]) for j in range(4))
        point = 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u**2 + (3 * p1 - p0 - 3 * p2 + p3) * u**3)
        ease = u * u * (3 - 2 * u)
        (h0, w0), (h1, w1) = sections[k], sections[k + 1]
        out.append((point, h0 + (h1 - h0) * ease, w0 + (w1 - w0) * ease))
    return out


def strand(points, sections, lift, ring_size=16, cap=None, count=16):
    """A tube along the pet's front: points (x, y), sections (h, w) per point."""
    samples = [(on_pet(point.x, point.y, lift), h, w) for point, h, w in smooth([Vector((x, y, 0)) for x, y in points], sections, count)]
    return sweep(samples, ring_size=ring_size, cap_rings=5, cap=cap)


# The hat: brim, a cone that flops outward, a gold band and stars. Its tip stays below y 2.1, the
# shop's camera leaves room for that.
BRIM_Y = 1.0
BRIM_TILT = math.radians(5)
CONE = (Vector((0, BRIM_Y - 0.02, HEAD_Z)), Vector((0.02, 1.62, HEAD_Z)), Vector((-0.46, 1.9, 0.17)))
BAND_Y = 1.07
HAT_STARS = [(0.3, 0.17, 0.075), (0.52, -0.1, 0.06), (0.72, 0.06, 0.05)]


def cone_section(u):
    taper = (1 - u) ** 1.1
    return 0.035 + 0.52 * taper, 0.035 + 0.47 * taper


def cone_samples(count=30):
    samples = []
    for i in range(count):
        u = i / (count - 1)
        h, w = cone_section(u)
        samples.append((bezier(*CONE, u), h, w))
    return samples


def band_samples(count=36):
    rx, rz = 0.515, 0.47
    samples = []
    for i in range(count):
        theta = math.radians(-20 + 220 * i / (count - 1))
        samples.append((Vector((rx * math.cos(theta), BAND_Y, HEAD_Z + rz * math.sin(theta))), 0.028, 0.055))
    return samples


def hat_star(u, shift, radius):
    """A star on the cone's front at `u` along it, `shift` (of its half width) to the side."""
    h, w = cone_section(u)
    center = bezier(*CONE, u)
    dx = shift * h
    depth = w * math.sqrt(max(0.0, 1 - shift**2))
    return star(center + Vector((dx, 0, depth + 0.012)), (shift * 0.6, 0.12, 1), radius, 0.02)


def build_hat(collection):
    # Dunkles Blau bliebe unten sonst grau: Es leuchtet nur schwach.
    night, gold, star_gold = material("Nachtblau", NIGHT, glow=0.15), material("Gold", GOLD), material("Sterngold", STAR)
    brim_axis = (0, math.cos(BRIM_TILT), math.sin(BRIM_TILT))
    add_mesh(collection, "wizard_brim", *puff((0, BRIM_Y, HEAD_Z), brim_axis, 0.78, 0.035, power=2.6, ring_size=48, stacks=10, radius2=0.86), night)
    add_mesh(collection, "wizard_cone", *sweep(cone_samples(), ring_size=24, cap_rings=5, cap=0.05), night)
    add_mesh(collection, "wizard_band", *sweep(band_samples(), ring_size=12, cap_rings=4, up=Vector((0, 1, 0))), gold)
    for index, (u, shift, radius) in enumerate(HAT_STARS):
        add_mesh(collection, f"wizard_star_{index}", *hat_star(u, shift, radius), star_gold)
    tip = bezier(*CONE, 1.0)
    add_mesh(collection, "wizard_tip_star", *star(tip + Vector((-0.04, 0.0, 0.05)), (0, 0, 1), 0.085, 0.025), star_gold)


# The face: bushy brows, a small mustache, a beard along the jaw under the mouth and a long point.
# The mouth stays free (|x| < 0.12, y 0.38-0.52), so the wizard can talk. Brows and mustache keep
# clear of the half-closed eyes (y 0.608-0.712 at |x| 0.132-0.248).
BROW = ([(0.12, 0.795), (0.19, 0.812), (0.26, 0.80), (0.32, 0.765), (0.35, 0.72)], [(0.032, 0.03), (0.045, 0.032), (0.042, 0.03), (0.032, 0.026), (0.02, 0.02)])
MUSTACHE = ([(0.125, 0.546), (0.19, 0.545), (0.25, 0.532), (0.3, 0.505), (0.325, 0.47)], [(0.02, 0.026), (0.028, 0.03), (0.027, 0.028), (0.02, 0.024), (0.012, 0.016)])
JAW = ([(0.43, 0.43), (0.36, 0.34), (0.25, 0.29), (0.12, 0.265), (0.0, 0.26)], [(0.04, 0.04), (0.07, 0.05), (0.085, 0.06), (0.09, 0.065), (0.09, 0.065)])
BEARD = ([(0.0, 0.28), (0.0, 0.15), (0.0, -0.05), (0.01, -0.32), (0.03, -0.58)], [(0.14, 0.06), (0.25, 0.08), (0.32, 0.1), (0.25, 0.09), (0.03, 0.03)])


def build_face(collection):
    white = material("Bartweiß", BEARD_WHITE)
    add_mesh(collection, "wizard_brow", *strand(*BROW, lift=0.03, cap=0.025), white, mirror=True)
    add_mesh(collection, "wizard_mustache", *strand(*MUSTACHE, lift=0.035, cap=0.02), white, mirror=True)
    add_mesh(collection, "wizard_jaw", *strand(*JAW, lift=0.05, cap=0.04), white, mirror=True)
    add_mesh(collection, "wizard_beard", *strand(*BEARD, lift=0.07, ring_size=24, cap=0.04, count=24), white)


# The orb: a crystal ball in a small gold cradle, with sparkles. Around the origin.
SPARKS = [((0.27, 0.17, 0.06), 0.05), ((-0.25, 0.06, 0.08), 0.04), ((0.17, -0.2, 0.1), 0.035)]


def build_orb(collection):
    crystal, gold, spark = material("Kristall", CRYSTAL), material("Gold", GOLD), material("Funke", SPARK)
    add_mesh(collection, "wizard_ball", *puff((0, 0, 0), (0, 1, 0), 0.2, 0.2, ring_size=24, stacks=16), crystal)
    add_mesh(collection, "wizard_cradle", *puff((0, -0.2, 0), (0, 1, 0), 0.11, 0.035, power=2.4, ring_size=24, stacks=8), gold)
    for index, (center, radius) in enumerate(SPARKS):
        add_mesh(collection, f"wizard_spark_{index}", *star(center, (0, 0, 1), radius, 0.015, points=4, ring_size=32), spark)


def cosmetic_collection(name):
    """The collection `name` under "Cosmetics", created on the first run."""
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        collection["slot"] = "NPC"
        bpy.data.collections["Cosmetics"].children.link(collection)
    return collection


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parts = [(cosmetic_collection(name), fill) for name, fill in zip(PARTS, (build_hat, build_face, build_orb))]
    for collection, _ in parts:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for collection, fill in parts:
        fill(collection)
    if "--save" in args:
        # The generator travels with the .blend, so the parameters stay editable.
        text = bpy.data.texts.get("build_wizard.py") or bpy.data.texts.new("build_wizard.py")
        with open(__file__, encoding="utf-8") as source:
            text.from_string(source.read())
        bpy.ops.wm.save_mainfile()
    if "--export" in args:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        sys.dont_write_bytecode = True  # no __pycache__ next to the .blend
        import setup_cosmetics

        print("Exportiert:", ", ".join(setup_cosmetics.export([collection for collection, _ in parts])))
    print("BUILT", {collection.name: [o.name for o in collection.objects] for collection, _ in parts})


main()
