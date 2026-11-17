"""Shape helpers for generated cosmetics: tubes, puffs, badges and decals that hug the pet.

Imported by build_wizard.py (and usable by any other generator). Everything here is plain geometry
in Three.js coordinates (y up, +z front, units of the pet); `to_blender` converts once when a mesh
is made. A helper returns `(verts, faces)` for `bpy.types.Mesh.from_pydata`, with outward normals.

The pet's front surface (`head_z`, `body_z`, `surface_z`, `on_pet`) mirrors
`packages/jelly-scene/src/jellyGeometry.ts`.
"""
import math

from mathutils import Vector

HEAD_Y, HEAD_Z, HEAD_R, HEAD_DEPTH = 0.66, 0.2, 0.62, 0.9
# Body outline from jellyGeometry.ts as (radius, height), used to rest parts on the belly.
BODY_PROFILE = [(0.86, -0.55), (0.83, -0.33), (0.75, -0.14), (0.6, 0.02), (0.4, 0.11), (0.18, 0.15)]
BODY_DEPTH = 0.8
# How soft the neck is in `surface_z`: the width of the smooth maximum of head and body.
NECK_SOFTNESS = 0.3


def to_blender(p):
    """Three.js (x, y, z) to Blender (x, -z, y)."""
    return (p[0], -p[2], p[1])


def from_blender(p):
    """Blender (x, y, z) back to Three.js (x, z, -y)."""
    return Vector((p[0], p[2], -p[1]))


# ---------------------------------------------------------------------------------------------
# Rings and skins.


def skin(rings, ring_size, start_pole=None, end_pole=None):
    """Quads between rings, fans to the poles. Outward if rings run along T with (N, B, T) right-handed."""
    verts, faces = [], []
    for ring in rings:
        verts.extend(ring)
    for i in range(len(rings) - 1):
        for j in range(ring_size):
            a, b = i * ring_size + j, i * ring_size + (j + 1) % ring_size
            faces.append((a, b, b + ring_size, a + ring_size))
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


def loop_skin(rings):
    """Quads between consecutive closed rings, the last joined to the first: a seamless torus."""
    size, count = len(rings[0]), len(rings)
    faces = []
    for i in range(count):
        a, b = i * size, (i + 1) % count * size
        faces.extend((a + j, a + (j + 1) % size, b + (j + 1) % size, b + j) for j in range(size))
    return [p for ring in rings for p in ring], faces


def ring_at(center, n, b, h, w, ring_size, mod=None):
    """An ellipse of half axes `h` (along n) and `w` (along b). `mod(angle)` scales it per angle."""
    out = []
    for j in range(ring_size):
        a = 2 * math.pi * j / ring_size
        s = mod(a) if mod else 1.0
        out.append(center + n * (h * s * math.cos(a)) + b * (w * s * math.sin(a)))
    return out


def frames_along(points, up):
    """(tangent, normal, binormal) per point; the binormal leans towards `up`."""
    count = len(points)
    frames = []
    for i in range(count):
        tangent = (points[min(i + 1, count - 1)] - points[max(i - 1, 0)]).normalized()
        binormal = (up - tangent * up.dot(tangent)).normalized()
        frames.append((tangent, binormal.cross(tangent).normalized(), binormal))
    return frames


def sweep_mod(samples, ring_size=20, cap_rings=5, cap=None, up=Vector((0, 0, 1)), mods=None):
    """A tube through `samples` (point, h, w) with round ends, so the outline stays whole.

    `mods[i](angle)` scales ring i around its angle: dents, folds and crumple.
    """
    frames = frames_along([s[0] for s in samples], up)

    def caps(index, sign):
        tangent, n, b = frames[index]
        point, h, w = samples[index]
        mod = mods[index] if mods else None
        length = cap if cap is not None else (h + w) / 2
        made = []
        for k in range(1, cap_rings):
            phi = k / cap_rings * math.pi / 2
            scale = math.cos(phi)
            made.append(ring_at(point + tangent * (sign * length * math.sin(phi)), n, b, h * scale, w * scale, ring_size, mod))
        return made, point + tangent * (sign * length)

    start, start_pole = caps(0, -1)
    rings = list(reversed(start))
    for i, ((point, h, w), (_, n, b)) in enumerate(zip(samples, frames)):
        rings.append(ring_at(point, n, b, h, w, ring_size, mods[i] if mods else None))
    end, end_pole = caps(len(samples) - 1, 1)
    rings.extend(end)
    return skin(rings, ring_size, start_pole, end_pole)


def sweep(samples, ring_size=20, cap_rings=5, cap=None, up=Vector((0, 0, 1))):
    """A tube through `samples` (point, h, w) with round ends."""
    return sweep_mod(samples, ring_size, cap_rings, cap, up)


def closed_sweep(points, h, w, ring_size=12, up=Vector((0, 1, 0))):
    """A tube along a closed loop of points, without caps: hems, rings and cups."""
    count = len(points)
    rings = []
    for i in range(count):
        t = (points[(i + 1) % count] - points[i - 1]).normalized()
        b = (up - t * up.dot(t)).normalized()
        rings.append(ring_at(points[i], b.cross(t).normalized(), b, h, w, ring_size))
    verts, faces = [], []
    for ring in rings:
        verts.extend(ring)
    for i in range(count):
        nxt = (i + 1) % count
        for j in range(ring_size):
            k = (j + 1) % ring_size
            faces.append((i * ring_size + j, i * ring_size + k, nxt * ring_size + k, nxt * ring_size + j))
    return verts, faces


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


# ---------------------------------------------------------------------------------------------
# Curves.


def catmull(points, count):
    """`count` samples on a Catmull-Rom curve through `points` (Vectors), ends included."""
    padded = [points[0], *points, points[-1]]
    out = []
    for i in range(count):
        t = i / (count - 1) * (len(points) - 1)
        k = min(int(t), len(points) - 2)
        u = t - k
        p0, p1, p2, p3 = (Vector(padded[k + j]) for j in range(4))
        out.append(0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u**2 + (3 * p1 - p0 - 3 * p2 + p3) * u**3))
    return out


def lerp_sections(sections, count):
    """`count` sections (h, w) eased between the given ones, matching `catmull`'s samples."""
    out = []
    for i in range(count):
        t = i / (count - 1) * (len(sections) - 1)
        k = min(int(t), len(sections) - 2)
        u = t - k
        ease = u * u * (3 - 2 * u)
        (h0, w0), (h1, w1) = sections[k], sections[k + 1]
        out.append((h0 + (h1 - h0) * ease, w0 + (w1 - w0) * ease))
    return out


def smooth(points, sections, count):
    """`count` samples (point, h, w) on a Catmull-Rom curve through `points`, sections eased."""
    return [(p, h, w) for p, (h, w) in zip(catmull([Vector(p) for p in points], count), lerp_sections(sections, count))]


# ---------------------------------------------------------------------------------------------
# Flat outlines (counter-clockwise, about unit size) and badges made from them.


def polygon(corners, per_edge=24):
    """Points along the edges of a closed polygon."""
    out = []
    for i in range(len(corners)):
        a, b = corners[i], corners[(i + 1) % len(corners)]
        for k in range(per_edge):
            u = k / per_edge
            out.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
    return out


def resample(outline, ring_size, passes):
    """Smooths a closed outline `passes` times and spaces `ring_size` points evenly along it."""
    total = len(outline)
    for _ in range(passes):
        outline = [
            ((outline[i - 1][0] + outline[i][0] * 2 + outline[(i + 1) % total][0]) / 4, (outline[i - 1][1] + outline[i][1] * 2 + outline[(i + 1) % total][1]) / 4)
            for i in range(total)
        ]
    lengths = [0.0]
    for i in range(total):
        a, b = outline[i], outline[(i + 1) % total]
        lengths.append(lengths[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    boundary = []
    for j in range(ring_size):
        target = lengths[-1] * j / ring_size
        index = next(k for k in range(total) if lengths[k + 1] >= target)
        boundary.append(outline[index])
    return boundary


def star_outline(points=5, inner=0.48):
    """A star with `points` tips; `inner` is the radius of the notches."""
    corners = []
    for i in range(points * 2):
        angle = math.pi / 2 + math.pi * i / points
        reach = 1.0 if i % 2 == 0 else inner
        corners.append((math.cos(angle) * reach, math.sin(angle) * reach))
    return polygon(corners)


def crescent_outline(d=0.45, r1=0.85, samples=96):
    """A crescent moon: the unit circle minus a circle of radius `r1` shifted by `d`."""
    x0 = (1 + d * d - r1 * r1) / (2 * d)
    y0 = math.sqrt(1 - x0 * x0)
    phi = math.atan2(y0, x0)
    psi = math.atan2(y0, x0 - d)
    out = []
    for k in range(samples):
        a = phi + (2 * math.pi - 2 * phi) * k / (samples - 1)
        out.append((math.cos(a), math.sin(a)))
    for k in range(samples):
        a = -psi - (2 * math.pi - 2 * psi) * k / (samples - 1)
        out.append((d + r1 * math.cos(a), r1 * math.sin(a)))
    # Centre the moon's mass.
    return [(x + 0.25, y) for x, y in out]


def squircle_outline(sx=1.0, sy=0.82, power=4, samples=160):
    """A rounded square (superellipse) with half sizes `sx` and `sy`."""
    out = []
    for k in range(samples):
        a = 2 * math.pi * k / samples
        c, s = math.cos(a), math.sin(a)
        out.append((sx * math.copysign(abs(c) ** (2 / power), c), sy * math.copysign(abs(s) ** (2 / power), s)))
    return out


def badge(outline, center, normal, radius, half, ring_size=24, stacks=3, up=Vector((0, 1, 0)), passes=10, roll=0.0):
    """A puffy flat shape from a closed 2D outline, facing `normal`, rolled by `roll` radians."""
    c, s = math.cos(roll), math.sin(roll)
    boundary = resample([(x * c - y * s, x * s + y * c) for x, y in outline], ring_size, passes)
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


# ---------------------------------------------------------------------------------------------
# The pet's front and parts that rest on it.


def head_z(x, y):
    """Front of the head at (x, y), 0 outside it."""
    inside = HEAD_R**2 - x**2 - (y - HEAD_Y) ** 2
    return HEAD_Z + HEAD_DEPTH * math.sqrt(inside) if inside > 0 else 0.0


def head_normal(p):
    """The head's outward normal at `p`, a point on or near it."""
    return Vector((p.x, p.y - HEAD_Y, (p.z - HEAD_Z) / HEAD_DEPTH**2)).normalized()


def body_z(x, y):
    """Front of the body at (x, y), 0 outside it."""
    for (r0, y0), (r1, y1) in zip(BODY_PROFILE, BODY_PROFILE[1:]):
        if y0 <= y <= y1:
            radius = r0 + (r1 - r0) * (y - y0) / (y1 - y0)
            inside = radius**2 - x**2
            return BODY_DEPTH * math.sqrt(inside) if inside > 0 else 0.0
    return BODY_DEPTH * BODY_PROFILE[0][0] if y < BODY_PROFILE[0][1] else 0.0


def surface_z(x, y, k=NECK_SOFTNESS):
    """Front of the pet with a soft neck: a smooth maximum of head and body, no crease."""
    a, b = head_z(x, y), body_z(x, y)
    h = max(k - abs(a - b), 0.0) / k
    return max(a, b) + h * h * k / 4


def on_pet(x, y, lift):
    """A point `lift` in front of the pet's surface at (x, y)."""
    return Vector((x, y, max(head_z(x, y), body_z(x, y)) + lift))


def strand(points, sections, lift, ring_size=16, cap=None, count=16):
    """A tube along the pet's front: points (x, y), sections (h, w) per point."""
    samples = [(on_pet(p.x, p.y, lift), h, w) for p, h, w in smooth([(x, y, 0) for x, y in points], sections, count)]
    return sweep(samples, ring_size=ring_size, cap_rings=5, cap=cap)


def decal_strand(points, sections, lift, ring_size=12, count=16, cap=None, cap_rings=4):
    """A strand whose rings bend onto the pet: wide panels hug the body instead of floating.

    Every ring vertex sits at surface_z + lift + w·sin(angle); h is the half width across the strand.
    """
    samples = smooth([(x, y, 0) for x, y in points], sections, count)
    centers = [s[0] for s in samples]
    tangents = [(centers[min(i + 1, count - 1)] - centers[max(i - 1, 0)]).normalized() for i in range(count)]

    def ring(center, t, h, w):
        n = Vector((-t.y, t.x, 0))
        out = []
        for j in range(ring_size):
            a = 2 * math.pi * j / ring_size
            q = center + n * (h * math.cos(a))
            out.append(Vector((q.x, q.y, surface_z(q.x, q.y) + lift + w * math.sin(a))))
        return out

    def caps(sample, t, sign):
        point, h, w = sample
        length = cap if cap is not None else (h + w) / 2
        made = []
        for k in range(1, cap_rings):
            phi = k / cap_rings * math.pi / 2
            scale = math.cos(phi)
            made.append(ring(point + t * (sign * length * math.sin(phi)), t, h * scale, w * scale))
        end = point + t * (sign * length)
        return made, Vector((end.x, end.y, surface_z(end.x, end.y) + lift))

    start, start_pole = caps(samples[0], tangents[0], -1)
    rings = list(reversed(start))
    for (point, h, w), t in zip(samples, tangents):
        rings.append(ring(point, t, h, w))
    end, end_pole = caps(samples[-1], tangents[-1], 1)
    rings.extend(end)
    # The ring runs n -> front, with n = left of t: (n, front, t) is right-handed.
    return skin(rings, ring_size, start_pole, end_pole)


def decal_badge(outline, center, lift, half, ring_size=48, stacks=5, passes=6):
    """A cushion from a 2D outline that hugs the pet: rings shrink to `center` and rise to the front."""
    boundary = resample(polygon(outline, 12), ring_size, passes)
    cx, cy = center

    def place(x, y, phi):
        scale = math.cos(phi)
        px, py = cx + (x - cx) * scale, cy + (y - cy) * scale
        return Vector((px, py, surface_z(px, py) + lift + half * math.sin(phi)))

    rings = []
    for i in range(-stacks + 1, stacks):
        phi = i / stacks * math.pi / 2
        rings.append([place(x, y, phi) for x, y in boundary])
    back = Vector((cx, cy, surface_z(cx, cy) + lift - half))
    front = Vector((cx, cy, surface_z(cx, cy) + lift + half))
    return skin(rings, ring_size, back, front)
