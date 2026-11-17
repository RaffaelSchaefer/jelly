"""Renders the wizard as the shop shows him: the stage camera, the app's paint layers and the DOM
counter in front of him.

`build_wizard.py -- --preview out.png` calls `render`. It moves the orb parts to their rest spot
and the wand into the pointing hand, adds stand-ins for what the app draws itself (the lidded eyes
and mouth, the crystal ball, the counter) and renders one Workbench pass per paint layer. numpy
stacks the passes in the app's painter order: pet, layer 0 to 4, counter. Like a sticker, each
layer covers the ones below, whatever their depth. It never saves the .blend.
"""
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

from shapes import badge, catmull, head_z, polygon, puff, sweep, to_blender

# The shop camera in wizard coordinates: eye (0, 0.5, 9.4) minus WIZARD_AT (-2.3, -0.12, 0).
CAMERA = (2.3, 0.62, 9.4)
FOV = 24
SIZE = (1440, 600)
# Where the shop puts what is not on the pet: ORB_REST in wizard.ts, the 'point' pose of the right
# hand in emoteAnimation.ts, and the hand's rest spot on the reference pet (HAND in jellyGeometry.ts).
ORB_REST = (1.68, 0.0, 0.75)
POINT_HAND = {"at": (1.05, 0.3, 0.5), "turn": (0.0, -0.3, -1.4)}
HAND_REST = (1.1, -0.4, 0.18)
# The DOM counter (COUNTER in src/pet/shopStage.ts) in wizard coordinates.
COUNTER = {"left": -2.8, "right": 2.35, "top": -0.32, "bottom": -2.5, "back": 0.55, "front": 1.08}
BALL_R = 0.21
COLORS = {"body": "#4636a6", "ink": "#110930", "glint": "#f3ffff", "reflection": "#8fdcff", "ball": "#6d64d2", "wood": "#5a3820"}
OUTLINE = (0.012, 0.004, 0.03)
# The lidded eye (eyeShapes.ts), in eye units with +x towards the face centre for the left eye.
EYE = {"x": 0.19, "y": 0.66, "rx": 0.06, "ry": 0.074, "lid": 0.012}


def srgb(hex_color):
    rgb = [int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb) + (1.0,)


def stand_in(collection, name, mesh_data, color):
    """A preview-only object in `collection`."""
    verts, faces = mesh_data
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_blender(v) for v in verts], [], faces)
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = srgb(color)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def eye_parts(side):
    """Pupil cut by the lid, twinkle and lid stroke of one eye, as (name, mesh, colour)."""
    inward = -side
    x0, y0 = side * EYE["x"], EYE["y"]
    z0 = head_z(x0, y0)
    normal = (x0 * 0.5, 0, 1)

    def at(x, y, lift):
        return Vector((x0 + inward * x, y0 + y, z0 + lift))

    cut = math.asin(EYE["lid"] / EYE["ry"])
    arc = [math.pi - cut + (math.pi + 2 * cut) * k / 47 for k in range(48)]
    pupil = [(inward * EYE["rx"] * math.cos(a) / EYE["ry"], math.sin(a)) for a in arc]
    if inward < 0:
        pupil.reverse()  # mirrored, so keep the outline counter-clockwise
    yield "pupil", badge(polygon(pupil, 2), at(0, 0, 0.008), normal, EYE["ry"], 0.004, ring_size=40, stacks=2, passes=1), COLORS["ink"]
    yield "twinkle", puff(at(-0.02, -0.026, 0.014), normal, 0.017, 0.003, ring_size=12, stacks=4), COLORS["glint"]
    yield "reflection", puff(at(0.02, -0.05, 0.014), normal, 0.0075, 0.003, ring_size=8, stacks=4), COLORS["reflection"]
    lid = [at(-0.078 + 0.15 * k / 7, -0.004 + 0.02 * k / 7, 0.014) for k in range(8)]
    yield "lid", sweep([(p, 0.012, 0.006) for p in lid], ring_size=8, cap_rings=3), COLORS["ink"]


def add_face(collection):
    """The parts of the face the app draws itself: lidded eyes and the smile."""
    for side in (-1, 1):
        for name, mesh_data, color in eye_parts(side):
            stand_in(collection, f"preview_{name}_{side}", mesh_data, color)
    smile = [Vector((0.072 * math.cos(a), 0.495 + 0.047 * math.sin(a), 0)) for a in (math.pi + math.pi * k / 10 for k in range(11))]
    smile = [Vector((p.x, p.y, head_z(p.x, p.y) + 0.01)) for p in catmull(smile, 14)]
    stand_in(collection, "preview_mouth", sweep([(p, 0.013, 0.006) for p in smile], ring_size=8, cap_rings=3), COLORS["ink"])


def add_counter(collection):
    """A brown box where the DOM counter covers the stage: top strip, front face below it."""
    c = COUNTER
    corners = [(x, y, z) for x in (c["left"], c["right"]) for y in (c["bottom"], c["top"]) for z in (c["back"], c["front"])]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return stand_in(collection, "preview_counter", (corners, faces), COLORS["wood"])


def three_to_blender(matrix):
    """A transform in Three.js axes as one in Blender axes."""
    axes = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    return axes @ matrix @ axes.inverted()


def hand_matrix():
    """The right hand while he points: Euler XYZ as in Three.js, i.e. Rx · Ry · Rz."""
    a, b, c = POINT_HAND["turn"]
    turn = Matrix.Rotation(a, 4, "X") @ Matrix.Rotation(b, 4, "Y") @ Matrix.Rotation(c, 4, "Z")
    return three_to_blender(Matrix.Translation(POINT_HAND["at"]) @ turn)


def place_parts(collection, parts, halves):
    """Moves the orb parts to their rest spot and the wand into the pointing hand, and mirrors the
    halves the shop draws twice."""
    for obj in list(collection.all_objects):
        anchor = parts[obj["part"]][0]
        if anchor == "orb":
            obj.location = to_blender(ORB_REST)
        elif anchor == "hand":
            obj.matrix_world = hand_matrix()
        if obj["part"] in halves:
            mirror = obj.modifiers.new("Vorschau", "MIRROR")
            mirror.use_axis[0] = True
            mirror.use_mirror_merge = False


def pet_objects():
    """The reference pet: body, head and the right hand in the pointing pose."""
    body = bpy.data.materials.new("preview_body")
    body.diffuse_color = srgb(COLORS["body"])
    hands = [obj for obj in bpy.data.objects if obj.name.startswith("hand_")]
    right = max(hands, key=lambda obj: sum((obj.matrix_world @ Vector(corner)).x for corner in obj.bound_box))
    right.location = to_blender([p - r for p, r in zip(POINT_HAND["at"], HAND_REST)])
    pet = [bpy.data.objects["body"], bpy.data.objects["head"], right]
    for obj in pet:
        obj.data.materials.clear()
        obj.data.materials.append(body)
    return pet


def setup(scene):
    data = bpy.data.cameras.new("preview_camera")
    data.sensor_fit = "VERTICAL"
    data.angle_y = math.radians(FOV)
    camera = bpy.data.objects.new("preview_camera", data)
    camera.location = to_blender(CAMERA)
    camera.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_object_outline = True
    shading.object_outline_color = OUTLINE
    shading.show_specular_highlight = True
    scene.render.resolution_x, scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100


def render_pass(scene, objects, transparent, path):
    """Renders only `objects` and returns the pixels (rows bottom up, RGBA)."""
    for obj in scene.objects:
        if obj.type != "CAMERA":
            obj.hide_render = obj not in objects
    scene.render.film_transparent = transparent
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(path, check_existing=False)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(height, width, 4)


def render(collection, out_path, parts, halves):
    """Renders the layered preview of `collection` into `out_path`.

    `parts` maps each part to (anchor, paint layer); `halves` are the parts drawn twice, mirrored.
    """
    scene = bpy.context.scene
    extra = bpy.data.collections.new("wizard-preview")
    scene.collection.children.link(extra)
    place_parts(collection, parts, halves)
    pet = pet_objects()
    add_face(extra)
    face = list(extra.all_objects)
    ball = stand_in(extra, "preview_ball", puff(ORB_REST, (0, 1, 0), BALL_R, BALL_R, ring_size=32, stacks=16), COLORS["ball"])
    counter = add_counter(extra)
    setup(scene)
    wizard = list(collection.all_objects)
    passes = [(pet + face, False)]
    for layer in range(5):
        objects = [obj for obj in wizard if parts[obj["part"]][1] == layer] + ([ball] if layer == 1 else [])
        passes.append((objects, True))
    passes.append(([counter], True))
    stack = None
    with tempfile.TemporaryDirectory() as folder:
        for index, (objects, transparent) in enumerate(passes):
            pixels = render_pass(scene, objects, transparent, os.path.join(folder, f"pass_{index}.png"))
            if stack is None:
                stack = pixels
                continue
            alpha = pixels[..., 3:4]
            stack[..., :3] = pixels[..., :3] * alpha + stack[..., :3] * (1 - alpha)
    height, width = stack.shape[:2]
    out = bpy.data.images.new("wizard-preview", width, height, alpha=False)
    out.pixels.foreach_set(stack.ravel())
    out.filepath_raw = out_path
    out.file_format = "PNG"
    out.save()
    print("Vorschau:", out_path)
