"""The frame every cosmetic generator shares: materials, meshes in Three.js coordinates and the flags.

A generator (`build_party_hat.py`, `build_hood.py`, `build_crown.py`, `build_golden_cup.py`,
`build_sprout.py`, `build_schnoerbi_mask.py`, `build_long_schnoerbi.py`, `build_goose.py`) holds only
its numbers and a `build(collection)` and ends with `generator.run(...)`:

    blender blender/cosmetics.blend --background --python blender/build_crown.py -- [--save] [--export]

    --save    store the collection in cosmetics.blend, with the generator, this file and shapes.py
              as text blocks, so the numbers travel with the .blend
    --export  write packages/jelly-scene/src/cosmetics/<name>.glb

Every run rebuilds the collection from the numbers; without `--save` the .blend on disk stays as
it was. Geometry is written in Three.js coordinates (y up, +z front) and converted once in
`shapes.to_blender`. See README.md for the modelling rules.
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # no __pycache__ next to the .blend

import setup_cosmetics  # noqa: E402
from shapes import to_blender  # noqa: E402


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def material(name, hex_color, glow=None, fluff=None):
    """The material `name` in `hex_color`, created or updated. `glow` (0–1) dampens the light lower
    edge the app adds; without it the material lights up fully. `fluff` (0–1) turns it into plush:
    no jelly gloss, fur grain and a light, fuzzy rim instead."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if mat.node_tree is None:
        mat.use_nodes = True
    rgb = [linear(int(hex_color[i : i + 2], 16) / 255) for i in (1, 3, 5)]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = 0.35
    mat.diffuse_color = (*rgb, 1)
    for key, value in (("glow", glow), ("fluff", fluff)):
        if value is None:
            mat.pop(key, None)
        else:
            mat[key] = value
    return mat


def add_mesh(collection, name, mesh_data, mat, mirror=False):
    """One smooth-shaded object with exactly one material; `mirror` adds its twin at -x."""
    verts, faces = mesh_data
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


def cosmetic_collection(name, slot):
    """The collection `name` under "Cosmetics", created on the first run."""
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.data.collections[setup_cosmetics.ROOT].children.link(collection)
    collection["slot"] = slot
    return collection


def rebuild(collection, build):
    for obj in list(collection.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    build(collection)


def save(script):
    """Stores the .blend with the generator, this file and shapes.py as text blocks."""
    for path in (script, __file__, os.path.join(HERE, "shapes.py")):
        name = os.path.basename(path)
        text = bpy.data.texts.get(name) or bpy.data.texts.new(name)
        with open(path, encoding="utf-8") as source:
            text.from_string(source.read())
    bpy.ops.wm.save_mainfile()


def run(name, slot, build, script):
    """Rebuilds the collection `name` (slot `Kopf`, `Gesicht` or `Hände`) and handles the flags."""
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    collection = cosmetic_collection(name, slot)
    rebuild(collection, build)
    if "--save" in args:
        save(script)
    if "--export" in args:
        print("Exportiert:", setup_cosmetics.export([collection]))
    print("BUILT", name, [obj.name for obj in collection.all_objects])
    return collection
