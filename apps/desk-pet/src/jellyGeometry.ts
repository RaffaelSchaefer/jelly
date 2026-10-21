import { CatmullRomCurve3, LatheGeometry, SphereGeometry, Vector2, Vector3 } from 'three';

/** Head: a slightly squashed glossy sphere that sits on top of the body. */
export const HEAD = { x: 0, y: 0.66, z: 0.2, radius: 0.62, depth: 0.9 } as const;

/** Lower edge of the body; the ground shadow sits right under it. */
export const BODY_BOTTOM = -1.05;
const BODY_DEPTH = 0.8;

// Side profile of the body (radius, height), from the base up to the neck.
// Wide, round-shouldered bell shape with a soft, flat-ish base.
const BODY_PROFILE: [number, number][] = [
  [0.0, BODY_BOTTOM],
  [0.5, BODY_BOTTOM],
  [0.7, BODY_BOTTOM + 0.025],
  [0.81, BODY_BOTTOM + 0.1],
  [0.86, BODY_BOTTOM + 0.26],
  [0.86, -0.55],
  [0.83, -0.33],
  [0.75, -0.14],
  [0.6, 0.02],
  [0.4, 0.11],
  [0.18, 0.15],
  [0.0, 0.16],
];

export function createHeadGeometry() {
  const geometry = new SphereGeometry(HEAD.radius, 64, 48);
  geometry.scale(1, 1, HEAD.depth);
  geometry.translate(HEAD.x, HEAD.y, HEAD.z);
  return geometry;
}

export function createBodyGeometry() {
  const curve = new CatmullRomCurve3(BODY_PROFILE.map(([r, y]) => new Vector3(r, y, 0)), false, 'centripetal');
  const points = curve.getPoints(96).map((p) => new Vector2(Math.max(p.x, 0), p.y));
  points[0].x = 0;
  points[points.length - 1].x = 0;
  const geometry = new LatheGeometry(points, 72);
  geometry.scale(1, 1, BODY_DEPTH);
  return geometry;
}

/** Point on the front of the head for a face feature at (x, y) relative to the head centre. */
export function headSurface(x: number, y: number, inset = 0) {
  const r = HEAD.radius;
  const z = Math.sqrt(Math.max(0, 1 - (x / r) ** 2 - (y / r) ** 2)) * r * HEAD.depth;
  return [HEAD.x + x, HEAD.y + y, HEAD.z + z - inset] as [number, number, number];
}

/** Hand: a small floating orb beside the body (no arm attached). */
export const HAND = { x: 1.1, y: -0.4, z: 0.18, radius: 0.16 } as const;

export function createHandGeometry() {
  return new SphereGeometry(HAND.radius, 40, 28);
}
