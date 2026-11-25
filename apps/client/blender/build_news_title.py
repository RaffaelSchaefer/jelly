"""Builds the opening title of the Jelly-News: a candy globe with two orbit rings, the logo of the
channel as two plates with extruded letters, `JELLY` and `NEWS`, and a sparkle. The stage flies them
in front of its camera while a show opens (`packages/jelly-stage/src/newsTitle*.ts`).

    blender --background --factory-startup --python blender/build_news_title.py -- [--export] [--check] [--preview out.png]

    --export           write packages/jelly-stage/src/newsTitle.glb
    --check            print vertices and bytes of the GLB (exported to a temporary folder unless
                       --export ran) and exit 1 past the budget
    --preview out.png  render the parts as they stand once the logo has landed (Workbench)

Unlike a cosmetic the title needs no .blend: every run builds it from the numbers below in an empty
scene, `--factory-startup` keeps your own Blender settings out of it. Every object carries the
custom property `part`: the stage loads the file with `loadModelParts` of @jelly/scene and moves
each part on its own, so each part is built around its own pivot and the stage puts them together.
`TITLE_MODEL` in newsTitleLayout.ts mirrors the sizes printed by `--check`, and newsTitle.test.ts
compares the two. Three.js coordinates (y up, +z front), one unit is the radius of the globe.

The letters are Inter, which Blender ships in datafiles/fonts under the SIL Open Font License 1.1
(Copyright 2020 The Inter Project Authors): only their outlines become geometry. Blender reads the
regular weight of the variable font, `TEXT["bold"]` widens the outlines to a black weight.
"""
import json
import math
import os
import struct
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ next to the scripts

import generator  # noqa: E402
from shapes import badge, from_blender, outward, star_outline, to_blender  # noqa: E402

OUT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "packages", "jelly-stage", "src", "newsTitle.glb"))
FONT = os.path.join(bpy.utils.resource_path("LOCAL"), "datafiles", "fonts", "Inter.woff2")
# The GLB lies in the bundle as a data URL, which is a third larger than the file.
BUDGET = {"bytes": 200_000, "vertices": 7_000}

# Continents as caps on the globe: (latitude, longitude, angular radius) in degrees, longitude 0
# facing the camera. Not a map, just enough of one that the ball reads as the earth.
CONTINENTS = [
    # North America, Alaska, the east coast and Greenland.
    (48, -100, 19), (60, -115, 15), (35, -92, 12), (24, -103, 7), (64, -150, 8), (50, -72, 8), (72, -42, 9),
    # Central and South America.
    (15, -88, 5), (-5, -62, 14), (-20, -57, 11), (-35, -66, 8), (5, -71, 7),
    # Europe with Scandinavia, Africa with its horn.
    (50, 12, 9), (58, 22, 7), (43, 0, 5), (64, 15, 6), (8, 18, 16), (20, 10, 12), (-12, 25, 12), (-26, 24, 8), (10, 40, 6),
    # Asia, India, the south east, Japan and the islands.
    (55, 90, 23), (40, 72, 13), (65, 128, 15), (30, 105, 13), (20, 79, 8), (14, 102, 6), (45, 50, 9), (37, 139, 3), (-2, 114, 5), (-5, 136, 4),
    # Australia and Antarctica.
    (-25, 134, 12), (-35, 146, 5), (-88, 0, 16),
]
# The coasts: caps join smoothly within `blend` radians, value noise of two sizes frays them. The
# same seed gives the same globe on every run.
COAST = {"blend": 0.05, "noise": ((3.5, 0.035), (8.0, 0.012)), "seed": 7}
# The land is a plateau `height` over the sea, reached `top` radians inside the coast: a gummy
# slab with a round edge. Its patch reaches `edge` radians out to sea and sinks `drop` there, so
# its rim hides under the water and the coast is where land and sea cross, a smooth line however
# coarse the patch is.
LAND = {"subdivisions": 5, "height": 0.035, "top": 0.07, "edge": -0.07, "drop": 0.03}
SEA = {"segments": 40, "rings": 20}
# Two orbit rings, flat in the x–z plane: the stage tilts and turns them.
RINGS = {"ring-inner": (1.3, 0.032), "ring-outer": (1.46, 0.024)}
RING_SEGMENTS = (56, 6)
# The logo as in the lower third (newsBarPaint.ts): JELLY on deep blue, NEWS on the light accent.
# Plates are rounded slabs `height` high and `depth` deep around their letters, with `pad` left and
# right of them, rounded by `round` in the plane and `bevel` at the edges.
PLATE = {"height": 0.66, "depth": 0.2, "pad": 0.2, "round": 0.1, "bevel": 0.045}
# Inter at `size` (an em), widened by `bold`, `extrude` deep plus a round `bevel`, letters `space`
# apart. The letters stand `lift` out of their plate. `resolution` thins the curves of the font.
TEXT = {"size": 0.5, "bold": 0.016, "extrude": 0.03, "bevel": 0.012, "space": 1.06, "lift": 0.06, "resolution": 2}
SPARKLE = {"inner": 0.3, "half": 0.16, "ring": 32}
# name -> (hex, glow, neon). The stage shades the title like a cosmetic: candy gloss, a light lower
# edge as strong as `glow`, and `neon` shines by itself. Gloss and tone mapping lighten every
# colour, so sea, land and the light plate start out deeper than they show.
SWATCH = {
    "Titel-Meer": ("#1a7fff", 0.35, None),
    "Titel-Land": ("#34d685", 0.35, None),
    "Titel-Ring": ("#1fc0ff", 0.5, 0.35),
    "Titel-Ring-Hell": ("#ffffff", 0.6, None),
    "Titel-Jelly-Platte": ("#0c2257", 0.12, None),
    "Titel-Jelly-Schrift": ("#ffffff", 0.0, None),
    "Titel-Jelly-Kante": ("#a9bde6", 0.3, None),
    "Titel-News-Platte": ("#16b2f0", 0.2, None),
    "Titel-News-Schrift": ("#0c2257", 0.0, None),
    "Titel-News-Kante": ("#1f5fe0", 0.3, None),
    "Titel-Funkeln": ("#ffe066", None, 1.0),
}
WORDS = {"jelly": ("JELLY", "Titel-Jelly-Platte", "Titel-Jelly-Schrift", "Titel-Jelly-Kante"),
         "news": ("NEWS", "Titel-News-Platte", "Titel-News-Schrift", "Titel-News-Kante")}


def material(name):
    hex_color, glow, neon = SWATCH[name]
    return generator.material(name, hex_color, glow=glow, neon=neon)


def link(collection, name, mesh, part):
    """An object for `mesh`, smooth, without UV maps (the stage reads none), tagged with its part."""
    for layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(layer)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["part"] = part
    return obj


# ---------------------------------------------------------------------------------------------
# The globe.


def directions(lat_lon):
    """Unit vectors of (latitude, longitude) pairs in degrees, Three.js axes, longitude 0 at +z."""
    lat, lon = np.radians(np.asarray(lat_lon, float)).T
    return np.stack([np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)], 1)


def value_noise(points, frequency, seed):
    """Smooth value noise in [-0.5, 0.5] on a lattice of `frequency` cells per unit, fixed by `seed`."""
    p = points * frequency + seed * 17.13
    cell = np.floor(p)
    f = p - cell
    f = f * f * (3 - 2 * f)

    def corner(offset):
        q = cell + offset
        h = np.sin(q @ np.array([127.1, 311.7, 74.7]) + seed * 3.7) * 43758.5453
        return h - np.floor(h) - 0.5

    total = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                weight = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                total = total + weight * corner(np.array([dx, dy, dz], float))
    return total


def coast_field(normals):
    """Radians from the coast for unit vectors: positive on land, negative at sea."""
    caps = directions([(lat, lon) for lat, lon, _ in CONTINENTS])
    radii = np.radians([radius for _, _, radius in CONTINENTS])
    inside = radii[None, :] - np.arccos(np.clip(normals @ caps.T, -1, 1))
    k = COAST["blend"]
    field = k * np.log(np.exp(inside / k).sum(1))
    for frequency, amount in COAST["noise"]:
        field += amount * 2 * value_noise(normals, frequency, COAST["seed"])
    return field


def smoothstep(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def build_sea(collection):
    """The sea: a smooth ball of radius 1."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=SEA["segments"], v_segments=SEA["rings"], radius=1.0)
    mesh = bpy.data.meshes.new("title_sea")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material("Titel-Meer"))
    return link(collection, "title_sea", mesh, "globe")


def build_land(collection):
    """The land: the patch of a fine ball where the coast field reaches out, raised over the sea
    inland and sunk under it at its rim."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=LAND["subdivisions"], radius=1.0)
    verts = list(bm.verts)
    field = coast_field(np.array([from_blender(v.co).normalized() for v in verts]))
    rise = smoothstep(LAND["edge"], LAND["top"], field)
    radius = 1 - LAND["drop"] + (LAND["drop"] + LAND["height"]) * rise
    at_sea = {v for v, value in zip(verts, field) if value < LAND["edge"]}
    for vertex, reach in zip(verts, radius):
        vertex.co = vertex.co.normalized() * reach
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if any(v in at_sea for v in f.verts)], context="FACES")
    mesh = bpy.data.meshes.new("title_land")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material("Titel-Land"))
    return link(collection, "title_land", mesh, "globe")


def build_ring(collection, part, color):
    """An orbit ring: a thin torus around the y axis."""
    radius, tube = RINGS[part]
    around, across = RING_SEGMENTS
    verts, faces = [], []
    for i in range(around):
        a = 2 * math.pi * i / around
        for j in range(across):
            b = 2 * math.pi * j / across
            reach = radius + tube * math.cos(b)
            verts.append((reach * math.cos(a), tube * math.sin(b), reach * math.sin(a)))
            faces.append((i * across + j, i * across + (j + 1) % across, ((i + 1) % around) * across + (j + 1) % across, ((i + 1) % around) * across + j))
    verts, faces = outward((verts, faces))
    mesh = bpy.data.meshes.new(f"title_{part}")
    mesh.from_pydata([to_blender(v) for v in verts], [], faces)
    mesh.materials.append(material(color))
    return link(collection, f"title_{part}", mesh, part)


# ---------------------------------------------------------------------------------------------
# The logo.


def standing(curve_object):
    """The mesh of a flat curve, stood up to face the camera and centred on its bounds."""
    curve_object.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.view_layer.update()
    evaluated = curve_object.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    mesh.transform(curve_object.matrix_world)
    bpy.data.objects.remove(curve_object)
    low = Vector([min(v.co[i] for v in mesh.vertices) for i in range(3)])
    high = Vector([max(v.co[i] for v in mesh.vertices) for i in range(3)])
    mesh.transform(Matrix.Translation(-(low + high) / 2))
    return mesh


def build_letters(word):
    """The letters of `word`: Inter, widened, extruded and rounded, centred on their bounds."""
    curve = bpy.data.curves.new(f"title_{word}", type="FONT")
    curve.font = bpy.data.fonts.load(FONT, check_existing=True)
    curve.body = word
    curve.size = TEXT["size"]
    curve.offset = TEXT["bold"]
    curve.extrude = TEXT["extrude"]
    curve.bevel_depth = TEXT["bevel"]
    curve.bevel_resolution = 1
    curve.resolution_u = TEXT["resolution"]
    curve.space_character = TEXT["space"]
    curve.align_x = "CENTER"
    obj = bpy.data.objects.new(f"title_{word}", curve)
    bpy.context.scene.collection.objects.link(obj)
    return standing(obj)


def rounded_rectangle(width, height, round_by, per_corner=6):
    """The outline of a rectangle with round corners, counter-clockwise, as (x, y) points."""
    points = []
    for corner, (cx, cy) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1))):
        centre = (cx * (width / 2 - round_by), cy * (height / 2 - round_by))
        for k in range(per_corner + 1):
            a = math.pi / 2 * (corner + k / per_corner)
            points.append((centre[0] + round_by * math.cos(a), centre[1] + round_by * math.sin(a)))
    return points


def build_plate(width):
    """A plate `width` wide: a rounded slab, its edges rounded once more."""
    curve = bpy.data.curves.new("title_plate", type="CURVE")
    curve.dimensions = "2D"
    curve.fill_mode = "BOTH"
    bevel = PLATE["bevel"]
    outline = rounded_rectangle(width - 2 * bevel, PLATE["height"] - 2 * bevel, PLATE["round"] - bevel)
    spline = curve.splines.new("POLY")
    spline.points.add(len(outline) - 1)
    for point, (x, y) in zip(spline.points, outline):
        point.co = (x, y, 0, 1)
    spline.use_cyclic_u = True
    curve.extrude = PLATE["depth"] / 2 - bevel
    curve.bevel_depth = bevel
    curve.bevel_resolution = 2
    obj = bpy.data.objects.new("title_plate", curve)
    bpy.context.scene.collection.objects.link(obj)
    return standing(obj)


def trim(mesh):
    """Drops the back of the letters, which lies in the plate, and merges the flat strips a curve
    leaves along straight strokes."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if from_blender(f.normal).z < -0.3], context="FACES")
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges)
    bm.to_mesh(mesh)
    bm.free()


def paint_sides(mesh, face, side):
    """Gives the faces that look at the camera the colour `face`, the rest `side`."""
    mesh.materials.append(material(face))
    mesh.materials.append(material(side))
    for polygon in mesh.polygons:
        polygon.material_index = 0 if from_blender(polygon.normal).z > 0.6 else 1


def build_word(collection, part):
    """A word of the logo: its plate and, as a part of their own, its letters standing out of it."""
    word, plate_color, face, side = WORDS[part]
    letters = build_letters(word)
    width = max(v.co.x for v in letters.vertices) - min(v.co.x for v in letters.vertices)
    plate = build_plate(width + 2 * PLATE["pad"])
    plate.materials.append(material(plate_color))
    depth = TEXT["extrude"] + TEXT["bevel"]
    letters.transform(Matrix.Translation(to_blender((0, 0, PLATE["depth"] / 2 + TEXT["lift"] - depth))))
    trim(letters)
    paint_sides(letters, face, side)
    return link(collection, f"title_{part}", plate, part), link(collection, f"title_{part}_letters", letters, f"{part}-letters")


def build_sparkle(collection):
    """A sparkle: a puffy star with four points, facing the camera."""
    outline = star_outline(points=4, inner=SPARKLE["inner"])
    verts, faces = badge(outline, (0, 0, 0), (0, 0, 1), 1.0, SPARKLE["half"], ring_size=SPARKLE["ring"], stacks=3, passes=2)
    mesh = bpy.data.meshes.new("title_sparkle")
    mesh.from_pydata([to_blender(v) for v in verts], [], faces)
    mesh.materials.append(material("Titel-Funkeln"))
    return link(collection, "title_sparkle", mesh, "sparkle")


def build(collection):
    build_sea(collection)
    build_land(collection)
    build_ring(collection, "ring-inner", "Titel-Ring")
    build_ring(collection, "ring-outer", "Titel-Ring-Hell")
    build_word(collection, "jelly")
    build_word(collection, "news")
    build_sparkle(collection)


# ---------------------------------------------------------------------------------------------
# Export, check and preview.


def export(collection, path):
    """Writes the collection as one GLB with the custom properties, without UVs or colours."""
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj.name in collection.objects)
    bpy.context.view_layer.objects.active = collection.objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,  # the `part` of every object and a material's glow and neon
        export_texcoords=False,
        export_vertex_color="NONE",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )


def read_parts(path):
    """Vertices and bounds per part, read back from the GLB as the stage loads it."""
    with open(path, "rb") as file:
        data = file.read()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20 : 20 + length])
    parts = {}
    for node in gltf["nodes"]:
        part = node.get("extras", {}).get("part")
        if part is None or "mesh" not in node:
            continue
        entry = parts.setdefault(part, {"vertices": 0, "min": [math.inf] * 3, "max": [-math.inf] * 3})
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
            entry["vertices"] += accessor["count"]
            entry["min"] = [round(min(a, b), 3) for a, b in zip(entry["min"], accessor["min"])]
            entry["max"] = [round(max(a, b), 3) for a, b in zip(entry["max"], accessor["max"])]
    return {"bytes": len(data), "vertices": sum(p["vertices"] for p in parts.values()), "parts": parts}


def check(path):
    report = read_parts(path)
    report["budget"] = BUDGET
    report["problems"] = [key for key in ("bytes", "vertices") if report[key] > BUDGET[key]]
    print("CHECK", json.dumps(report, indent=1))
    return not report["problems"]


# Where the parts stand once the logo has landed, for the preview only: (part, location, rotation
# in degrees, scale). The stage's numbers are in newsTitleLayout.ts.
PREVIEW = [
    ("globe", (0, 0.2, 0), (25, 0, -18), 1), ("ring-inner", (0, 0.2, 0), (-18, 0, 20), 1), ("ring-outer", (0, 0.2, 0), (-22, 0, -24), 1),
    ("jelly", (-0.9, -0.75, 1.2), (0, 0, 0), 1), ("jelly-letters", (-0.9, -0.75, 1.2), (0, 0, 0), 1),
    ("news", (0.95, -0.75, 1.2), (0, 0, 0), 1), ("news-letters", (0.95, -0.75, 1.2), (0, 0, 0), 1),
    ("sparkle", (1.55, 1.05, 0.4), (0, 0, 12), 0.13),
]


def preview(collection, path):
    """Renders the parts where the stage puts them once the logo has landed."""
    scene = bpy.context.scene
    for part, location, rotation, scale in PREVIEW:
        for obj in collection.objects:
            if obj.get("part") != part:
                continue
            obj.location = to_blender(location)
            # Three.js rotation (x, y, z) in degrees, as Euler XYZ around Blender's x, -z and y.
            obj.rotation_euler = (math.radians(rotation[0]), -math.radians(rotation[2]), math.radians(rotation[1]))
            obj.scale = (scale, scale, scale)
    camera = bpy.data.objects.new("title_camera", bpy.data.cameras.new("title_camera"))
    scene.collection.objects.link(camera)
    camera.data.angle = math.radians(30)
    camera.data.sensor_fit = "VERTICAL"
    camera.location = to_blender((0, -0.05, 9.5))
    camera.rotation_euler = (math.radians(90), 0, 0)
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_object_outline = True
    scene.display.shading.object_outline_color = (0.03, 0.07, 0.2)
    scene.world = bpy.data.worlds.new("title_world")
    scene.world.color = (0.05, 0.13, 0.5)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    collection = bpy.data.collections.new("news-title")
    bpy.context.scene.collection.children.link(collection)
    build(collection)
    target = OUT if "--export" in args else os.path.join(tempfile.mkdtemp(), "newsTitle.glb")
    if "--export" in args or "--check" in args:
        export(collection, target)
        print("Exportiert:", target)
    healthy = check(target) if "--check" in args else True
    if "--preview" in args:
        preview(collection, args[args.index("--preview") + 1])
    print("BUILT", [obj.name for obj in collection.objects])
    if not healthy:
        sys.exit(1)


main()
