"""Jelly cosmetics pipeline for Blender 4.2+.

Create the modelling file once (writes blender/cosmetics.blend next to this script):
    blender --background --python blender/setup_cosmetics.py
Export every cosmetic without opening Blender:
    blender blender/cosmetics.blend --background --python blender/setup_cosmetics.py -- --export

Inside cosmetics.blend this script is embedded as a text block that registers itself on load
and adds the "Cosmetics" tab to the 3D view sidebar (N) with the export buttons.
See blender/README.md for the modelling rules.
"""
import os
import sys

import bpy

# Mirrors COSMETICS in src/pet.ts (id, slot). A new cosmetic needs an entry there; here it only
# pre-creates the collection, any collection under "Cosmetics" is exported by its name.
COSMETICS = [
    ("headset", "Kopf"),
    ("headset-neutral", "Kopf"),
    ("beanie", "Kopf"),
    ("party-hat", "Kopf"),
    ("pixel-glasses", "Gesicht"),
    ("hood", "Kopf"),
    ("crown", "Kopf"),
    ("golden-cup", "Hände"),
]
ROOT = "Cosmetics"
REFERENCE = "Referenz"
FRAME = "Sichtbereich"
OUTPUT = "//../src/cosmetics/"  # relative to cosmetics.blend
TEXT_NAME = "cosmetics_pipeline.py"


def cosmetic_collections():
    root = bpy.data.collections.get(ROOT)
    return list(root.children) if root else []


def export(collections):
    """Writes each collection's meshes as <name>.glb; returns the names it exported."""
    if not bpy.data.filepath:
        raise RuntimeError("Erst die .blend-Datei speichern, der Exportpfad ist relativ zu ihr.")
    out = bpy.path.abspath(OUTPUT)
    os.makedirs(out, exist_ok=True)
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    done = []
    for collection in collections:
        meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
        if not meshes:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in meshes:
            obj.hide_set(False)
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out, f"{collection.name}.glb"),
            export_format="GLB",
            use_selection=True,
            export_apply=True,  # bakes modifiers (mirror, subdivision, ...)
            export_yup=True,  # back to the app's Y-up axes
            export_animations=False,
            export_cameras=False,
            export_lights=False,
        )
        done.append(collection.name)
    return done


def build_scene(save_path):
    if os.path.exists(save_path):
        raise SystemExit(f"{save_path} gibt es schon und bleibt unangetastet. Zum Neuaufsetzen erst umbenennen.")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"

    reference = bpy.data.collections.new(REFERENCE)
    scene.collection.children.link(reference)
    obj_path = os.path.join(os.path.dirname(save_path), "pet_reference.obj")
    bpy.ops.wm.obj_import(filepath=obj_path, forward_axis="NEGATIVE_Z", up_axis="Y")
    body = bpy.data.materials.new("Referenz")
    body.diffuse_color = (0.13, 0.35, 0.93, 1.0)
    for obj in list(bpy.context.selected_objects):
        for collection in obj.users_collection:
            collection.objects.unlink(obj)
        reference.objects.link(obj)
        obj.data.materials.clear()
        obj.data.materials.append(body)
        obj.hide_select = True  # the pet is a template, not part of any cosmetic
        obj.hide_render = True

    # What the app's camera shows at 100 % size (Blender axes: X right, -Y front, Z up). The top edge
    # is where the speech bubble starts; anything above it is hidden behind the bubble.
    x, bottom, top = 2.2, -1.65, 1.6
    frame = bpy.data.meshes.new(FRAME)
    frame.from_pydata([(-x, 0, bottom), (x, 0, bottom), (x, 0, top), (-x, 0, top)], [(0, 1), (1, 2), (2, 3), (3, 0)], [])
    guide = bpy.data.objects.new(FRAME, frame)
    reference.objects.link(guide)
    guide.hide_select = True
    guide.hide_render = True

    root = bpy.data.collections.new(ROOT)
    scene.collection.children.link(root)
    for name, slot in COSMETICS:
        collection = bpy.data.collections.new(name)
        collection["slot"] = slot
        root.children.link(collection)

    text = bpy.data.texts.get(TEXT_NAME) or bpy.data.texts.new(TEXT_NAME)
    with open(__file__, encoding="utf-8") as source:
        text.from_string(source.read())
    text.use_module = True
    bpy.ops.wm.save_as_mainfile(filepath=save_path)


class COSMETICS_OT_export(bpy.types.Operator):
    bl_idname = "cosmetics.export"
    bl_label = "Cosmetics exportieren"
    bl_description = "Schreibt die Collections unter „Cosmetics“ als .glb nach src/cosmetics"
    only: bpy.props.StringProperty(default="")

    def execute(self, context):
        collections = [c for c in cosmetic_collections() if not self.only or c.name == self.only]
        try:
            done = export(collections)
        except RuntimeError as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        self.report({"INFO"}, f"Exportiert: {', '.join(done) or 'nichts (leere Collections)'}")
        return {"FINISHED"}


class COSMETICS_PT_panel(bpy.types.Panel):
    bl_label = "Jelly"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Cosmetics"

    def draw(self, context):
        layout = self.layout
        for collection in cosmetic_collections():
            count = sum(1 for obj in collection.all_objects if obj.type == "MESH")
            row = layout.row()
            row.label(text=f"{collection.name} · {collection.get('slot', '?')}", icon="MESH_DATA" if count else "BLANK1")
            sub = row.row()
            sub.enabled = count > 0
            sub.operator(COSMETICS_OT_export.bl_idname, text="", icon="EXPORT").only = collection.name
        layout.operator(COSMETICS_OT_export.bl_idname, text="Alle exportieren", icon="EXPORT").only = ""


CLASSES = (COSMETICS_OT_export, COSMETICS_PT_panel)


def register():
    for cls in CLASSES:
        if not hasattr(bpy.types, cls.__name__):
            bpy.utils.register_class(cls)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--export" in args:
        print("Exportiert:", ", ".join(export(cosmetic_collections())) or "nichts")
    else:
        build_scene(os.path.join(os.path.dirname(os.path.abspath(__file__)), "cosmetics.blend"))
        register()
else:
    register()
