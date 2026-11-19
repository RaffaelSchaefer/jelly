"""Shape helpers for generated cosmetics: tubes, puffs, badges and decals that hug the pet.

Imported by build_wizard.py (and usable by any other generator). Everything here is plain geometry
in Three.js coordinates (y up, +z front, units of the pet); `to_blender` converts once when a mesh
is made. A helper returns `(verts, faces)` for `bpy.types.Mesh.from_pydata`, with outward normals.

The pet's front surface (`head_z`, `body_z`, `surface_z`, `on_pet`) mirrors
`packages/jelly-scene/src/jellyGeometry.ts`.

Plush parts that flow into each other are implicit surfaces: signed distances on numpy arrays,
joined with `smooth_union` and meshed by `surface_nets`; `sdf_decal` lays flat parts onto them.
"""
import itertools
import math

import numpy as np
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


def spow(value, exponent):
    return math.copysign(abs(value) ** exponent, value)


def outward(mesh_data):
    """Flips the faces if they point inwards: the outline pushes the mesh out along its normals."""
    verts, faces = mesh_data
    volume = sum(Vector(verts[f[0]]).dot(Vector(verts[f[i]]).cross(Vector(verts[f[i + 1]]))) for f in faces for i in range(1, len(f) - 1))
    return (verts, faces) if volume > 0 else (verts, [tuple(reversed(f)) for f in faces])


def merge(meshes):
    """Several meshes as one, for parts that share a material."""
    verts, faces = [], []
    for mesh_verts, mesh_faces in meshes:
        offset = len(verts)
        verts.extend(mesh_verts)
        faces.extend(tuple(i + offset for i in face) for face in mesh_faces)
    return verts, faces


def blob(centre, forward, up, size, power=2.0, ring=24, stacks=10):
    """An ellipsoid, or a pillow for `power` above 2, with half sizes (across, up, deep): deep along
    `forward`, up towards `up`."""
    centre, f = Vector(centre), Vector(forward).normalized()
    u = (Vector(up) - f * Vector(up).dot(f)).normalized()
    a = u.cross(f)
    (rx, ry, rz), e = size, 2 / power
    rings = []
    for i in range(1, stacks):
        t = -math.pi / 2 + math.pi * i / stacks
        scale, depth = abs(math.cos(t)) ** e, rz * spow(math.sin(t), e)
        angles = (2 * math.pi * j / ring for j in range(ring))
        rings.append([centre + a * (rx * scale * spow(math.cos(p), e)) + u * (ry * scale * spow(math.sin(p), e)) + f * depth for p in angles])
    return outward(skin(rings, ring, centre - f * rz, centre + f * rz))


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


def circles_outline(circles, centre, samples=256):
    """The outline of a union of circles (x, y, r) round `centre`, which must see all of it: per
    direction the farthest point where the ray leaves a circle. Scallops, toes, teardrops."""
    cx, cy = centre
    out = []
    for k in range(samples):
        angle = 2 * math.pi * k / samples
        ux, uy = math.cos(angle), math.sin(angle)
        reach = 0.0
        for x, y, r in circles:
            along = (x - cx) * ux + (y - cy) * uy
            across2 = (x - cx) ** 2 + (y - cy) ** 2 - along * along
            if across2 < r * r:
                reach = max(reach, along + math.sqrt(r * r - across2))
        out.append((cx + reach * ux, cy + reach * uy))
    return out


# ---------------------------------------------------------------------------------------------
# Implicit shapes: signed distances (negative inside) of points in numpy arrays (..., 3).


def sd_ellipsoid(points, centre, radii):
    """Close to the distance to an ellipsoid with half sizes `radii` along x, y and z."""
    q, radii = np.asarray(points) - centre, np.asarray(radii, float)
    k0 = np.linalg.norm(q / radii, axis=-1)
    k1 = np.linalg.norm(q / (radii * radii), axis=-1)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


def sd_round_cone(points, a, b, ra, rb):
    """The distance to a cone from a ball of radius `ra` at `a` to one of `rb` at `b`."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    ba = b - a
    l2, rr = ba @ ba, ra - rb
    a2 = l2 - rr * rr
    pa = np.asarray(points) - a
    y = pa @ ba
    z = y - l2
    x2 = np.square(pa * l2 - y[..., None] * ba).sum(-1)
    y2, z2 = y * y * l2, z * z * l2
    k = np.sign(rr) * rr * rr * x2
    tip = np.sqrt(x2 + z2) / l2 - rb
    base = np.sqrt(x2 + y2) / l2 - ra
    side = (np.sqrt(x2 * a2 / l2) + y * rr) / l2 - ra
    return np.where(np.sign(z) * a2 * z2 > k, tip, np.where(np.sign(y) * a2 * y2 < k, base, side))


def sd_chain(points, balls):
    """The distance to round cones between consecutive balls (x, y, z, radius): a tapering tube."""
    return np.minimum.reduce([sd_round_cone(points, a[:3], b[:3], a[3], b[3]) for a, b in zip(balls, balls[1:])])


def smooth_union(a, b, k):
    """The union of two distances with a soft seam where they are within `k` of each other."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def unit_rows(vectors):
    return vectors / np.linalg.norm(vectors, axis=-1, keepdims=True)


def sdf_gradient(sdf, points, eps=1e-4):
    offsets = np.eye(3) * eps
    return np.stack([sdf(points + o) - sdf(points - o) for o in offsets], -1) / (2 * eps)


def onto_surface(sdf, points, steps=5):
    """Moves points that lie close to the surface onto it, in Newton steps along the gradient."""
    for _ in range(steps):
        g = sdf_gradient(sdf, points)
        points = points - (sdf(points) / np.maximum((g * g).sum(-1), 1e-12))[..., None] * g
    return points


def ray_onto(sdf, starts, direction, reach, steps=30):
    """Where rays from `starts`, outside, along `direction` cross into the surface within `reach`."""
    starts, direction = np.asarray(starts, float), np.asarray(direction, float)
    near, far = np.zeros(len(starts)), np.full(len(starts), float(reach))
    for _ in range(steps):
        mid = (near + far) / 2
        inside = sdf(starts + mid[:, None] * direction) < 0
        far, near = np.where(inside, mid, far), np.where(inside, near, mid)
    return starts + far[:, None] * direction


def surface_nets(sdf, low, high, step):
    """The surface where `sdf` is zero inside the box `low`–`high` as quads: one vertex per grid cell
    the surface passes, moved onto it, and one quad per grid edge it crosses. Faces point out."""
    low = np.asarray(low, float)
    counts = np.ceil((np.asarray(high, float) - low) / step).astype(int) + 1
    grid = np.stack(np.meshgrid(*[low[i] + step * np.arange(counts[i]) for i in range(3)], indexing="ij"), -1)
    values = sdf(grid.reshape(-1, 3)).reshape(counts)
    inside = values < 0
    corners = list(itertools.product((0, 1), repeat=3))
    cells = np.stack([values[i : counts[0] - 1 + i, j : counts[1] - 1 + j, k : counts[2] - 1 + k] for i, j, k in corners], -1)
    signs = cells < 0
    active = signs.any(-1) & ~signs.all(-1)
    found, cell, sign = np.argwhere(active), cells[active], signs[active]
    total, hits = np.zeros((len(found), 3)), np.zeros(len(found))
    for a, b in itertools.combinations(range(8), 2):
        offset_a, offset_b = np.array(corners[a], float), np.array(corners[b], float)
        if np.abs(offset_a - offset_b).sum() != 1:
            continue
        crossing = sign[:, a] != sign[:, b]
        t = cell[crossing, a] / (cell[crossing, a] - cell[crossing, b])
        total[crossing] += offset_a + t[:, None] * (offset_b - offset_a)
        hits[crossing] += 1
    verts = onto_surface(sdf, low + step * (found + total / hits[:, None]))
    number = np.full(counts - 1, -1)
    number[tuple(found.T)] = np.arange(len(found))
    faces = []
    for axis in range(3):
        u, w = (axis + 1) % 3, (axis + 2) % 3
        lower, upper = [slice(None)] * 3, [slice(None)] * 3
        lower[axis], upper[axis] = slice(0, -1), slice(1, None)
        edges = np.argwhere(inside[tuple(lower)] != inside[tuple(upper)])
        edges = edges[(edges[:, u] >= 1) & (edges[:, u] <= counts[u] - 2) & (edges[:, w] >= 1) & (edges[:, w] <= counts[w] - 2)]
        quad = []
        for du, dw in ((-1, -1), (0, -1), (0, 0), (-1, 0)):
            around = edges.copy()
            around[:, u] += du
            around[:, w] += dw
            quad.append(number[tuple(around.T)])
        quad = np.stack(quad, 1)
        # (u, w, axis) is right-handed: the quad faces along the axis, from inside to outside.
        backwards = ~inside[tuple(edges.T)]
        quad[backwards] = quad[backwards, ::-1]
        faces.append(quad)
    return verts.tolist(), np.concatenate(faces).tolist()


def polygon_sd(x, y, corners):
    """Signed 2D distance to a closed polygon (negative inside)."""
    v = np.asarray(corners, float)
    dist = (x - v[0, 0]) ** 2 + (y - v[0, 1]) ** 2
    sign = np.ones_like(x)
    for i in range(len(v)):
        a, e = v[i], v[i - 1] - v[i]
        wx, wy = x - a[0], y - a[1]
        t = np.clip((wx * e[0] + wy * e[1]) / (e @ e), 0, 1)
        dist = np.minimum(dist, (wx - e[0] * t) ** 2 + (wy - e[1] * t) ** 2)
        above, below, left = y >= a[1], y < v[i - 1, 1], e[0] * wy > e[1] * wx
        sign = np.where((above & below & left) | (~above & ~below & ~left), -sign, sign)
    return sign * np.sqrt(dist)


def ray_outline(sd2, centre, count, reach=1.0, samples=300, rays=720):
    """`count` evenly spaced points round `centre` where rays from it leave the region `sd2` < 0.
    Every ray must leave it once: `centre` sees all of the outline."""
    angles = np.linspace(0, 2 * math.pi, rays, endpoint=False)
    ways = np.stack([np.cos(angles), np.sin(angles), np.zeros(rays)], 1)

    def outside(t):
        points = np.array([*centre, 0.0]) + t[..., None] * (ways if t.ndim == 1 else ways[:, None])
        return sd2(points.reshape(-1, 3)).reshape(t.shape) >= 0

    steps = np.linspace(0, reach, samples)
    found = outside(np.tile(steps, (rays, 1)))
    assert not found[:, 0].any() and (np.diff(found.astype(int), axis=1) != 0).sum(1).max() == 1, "centre must see the whole outline"
    first = np.argmax(found, axis=1)
    near, far = steps[first - 1], steps[first]
    for _ in range(24):
        mid = (near + far) / 2
        out = outside(mid)
        far, near = np.where(out, mid, far), np.where(out, near, mid)
    return resample([(t * math.cos(a), t * math.sin(a)) for t, a in zip(far, angles)], count, 1)


def dome(stacks):
    """A cushion's profile for `sdf_decal`: (scale of the outline, height in halves), back to front."""
    return [(math.cos(i / stacks * math.pi / 2), math.sin(i / stacks * math.pi / 2)) for i in range(-stacks + 1, stacks)]


# A felt patch: a narrow rounded edge, then flat. A dome's rings would crease at every notch.
PATCH = [(1.0, -1.0), (1.0, 0.0), (0.985, 0.55), (0.96, 0.85), (0.93, 1.0), (0.82, 1.0), (0.68, 1.0), (0.52, 1.0), (0.36, 1.0), (0.2, 1.0)]


def sdf_decal(sdf, centre, normal, outline, lift, half, profile=None, up=(0, 1, 0), reach=0.2):
    """A cushion from a closed 2D `outline` round (0, 0), laid onto the implicit surface at `centre`
    facing `normal`: every point goes onto the surface along -`normal`, then `lift` plus the
    cushion's height out along the surface's own normal. `profile` defaults to `dome(4)`."""
    n = np.asarray(normal, float) / np.linalg.norm(normal)
    across = np.cross(up, n)
    across /= np.linalg.norm(across)
    rise = np.cross(n, across)
    flat, centre = np.asarray(outline, float), np.asarray(centre, float)
    rings = []
    for scale, height in profile or dome(4):
        points = centre + scale * (flat[:, :1] * across + flat[:, 1:] * rise)
        on = ray_onto(sdf, points + n * reach, -n, 2 * reach)
        rings.append([Vector(p) for p in on + unit_rows(sdf_gradient(sdf, on)) * (lift + half * height)])
    middle = ray_onto(sdf, centre[None] + n * reach, -n, 2 * reach)
    out = unit_rows(sdf_gradient(sdf, middle))[0]
    back, front = middle[0] + out * (lift - half), middle[0] + out * (lift + half)
    return outward(skin(rings, len(flat), Vector(back), Vector(front)))
