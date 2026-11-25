/**
 * The opening title of the Jelly-News as numbers: the sizes of the model `newsTitle.glb`, where
 * its parts stand once the logo has landed, and how far the title camera stands so all of it fits
 * the picture at any aspect. Without three, so it can be tested by itself.
 *
 * @module
 */

/** A point or direction in the space of the title, one unit is the radius of the globe. */
export interface TitlePoint {
  x: number;
  y: number;
  z: number;
}

/** A turn in radians around x, then y, then z, like the Euler angles of three.js. */
export interface TitleTurn {
  x: number;
  y: number;
  z: number;
}

/**
 * The sizes of the parts as `apps/client/blender/build_news_title.py` builds them, each around its
 * own middle. Its `--check` prints them, `newsTitle.test.ts` compares them with the file.
 */
export const TITLE_MODEL = {
  globe: { radius: 1 },
  rings: { inner: 1.332, outer: 1.484 },
  plates: { jelly: 1.55, news: 1.49, height: 0.66, depth: 0.2 },
  /** The front of the letters, which stand out of the plates. */
  letters: { front: 0.16 },
  /** The sparkle is one unit from its middle to a tip. */
  sparkle: { reach: 0.975 },
} as const;

/** Where a sparkle sits and how large it is. */
export interface SparkleSpot extends TitlePoint {
  size: number;
}

/** Where the parts stand once the logo has landed. */
export const TITLE_LAYOUT = {
  globe: {
    middle: { x: 0, y: 0.24, z: 0 },
    /** The north pole leans toward the camera and to the right, like a globe on a desk. */
    tilt: { x: 0.42, y: 0, z: -0.32 },
    /** The longitude that faces the camera once the globe has stopped: Europe and Africa. */
    facing: 0.21,
  },
  /** The orbit rings around the globe, crossing in front of it. */
  rings: [{ tilt: { x: 0.38, y: 0, z: 0.42 } }, { tilt: { x: 0.3, y: 0, z: -0.5 } }],
  /** The row of both plates, in front of the lower half of the globe. The plates touch. */
  row: { y: -0.78, z: 1.18, gap: 0.02 },
  sparkles: [
    { x: 1.48, y: 1.16, z: 0.5, size: 0.15 },
    { x: -1.62, y: 0.86, z: 0.3, size: 0.12 },
    { x: 1.84, y: 0.06, z: 0.2, size: 0.1 },
    { x: -1.3, y: 1.42, z: -0.2, size: 0.08 },
    { x: -1.92, y: -0.2, z: 0.4, size: 0.09 },
    { x: 0.98, y: 1.52, z: -0.3, size: 0.07 },
  ] satisfies SparkleSpot[],
} as const;

/** The vertical field of view over the free height of the picture, in radians. */
export const TITLE_FIELD = (30 * Math.PI) / 180;
/** The title camera looks at this point, straight along -z. */
export const TITLE_AIM: TitlePoint = { x: 0, y: -0.12, z: 0.4 };
/** The title fills at most these shares of the free width and height. */
const FILL = { width: 0.86, height: 0.7 };
/** Room for the line under the logo, below the plates, in units of the title. */
const TAGLINE_ROOM = 0.42;
/** The line under the logo: its gap to the plates and its size, as shares of the plate height. */
const TAGLINE = { gap: 0.28, size: 0.3 };
const RING_SAMPLES = 24;

/** Where the camera stands and where the line under the logo goes, for one aspect. */
export interface TitleFit {
  /** How far the camera stands in front of {@link TITLE_AIM}. */
  distance: number;
  /** Middle of the line under the logo, as a share of the free height from its top. */
  taglineY: number;
  /** Height of its letters, as a share of the free height. */
  taglineSize: number;
}

/** Turns a point around the origin like a three.js object with `turn` as its rotation. */
export function rotatePoint(point: TitlePoint, turn: TitleTurn): TitlePoint {
  const [sx, cx] = [Math.sin(turn.x), Math.cos(turn.x)];
  const [sy, cy] = [Math.sin(turn.y), Math.cos(turn.y)];
  const [sz, cz] = [Math.sin(turn.z), Math.cos(turn.z)];
  // Euler XYZ of three.js: the matrix is Rx · Ry · Rz, so z turns first.
  const a = { x: point.x * cz - point.y * sz, y: point.x * sz + point.y * cz, z: point.z };
  const b = { x: a.x * cy + a.z * sy, y: a.y, z: -a.x * sy + a.z * cy };
  return { x: b.x, y: b.y * cx - b.z * sx, z: b.y * sx + b.z * cx };
}

/** Returns where the plates stand once they have landed: JELLY left, NEWS right, centred together. */
export function placePlates(): [TitlePoint, TitlePoint] {
  const { jelly, news } = TITLE_MODEL.plates;
  const { y, z, gap } = TITLE_LAYOUT.row;
  const left = -(jelly + news + gap) / 2;
  return [
    { x: left + jelly / 2, y, z },
    { x: left + jelly + gap + news / 2, y, z },
  ];
}

/** Lists points around everything the title shows once the logo has landed. */
export function listTitlePoints(): TitlePoint[] {
  const { middle } = TITLE_LAYOUT.globe;
  const reach = TITLE_MODEL.globe.radius * 1.04;
  const points: TitlePoint[] = [
    { x: middle.x, y: middle.y + reach, z: middle.z },
    { x: middle.x - reach, y: middle.y, z: middle.z },
    { x: middle.x + reach, y: middle.y, z: middle.z },
  ];
  const radii = [TITLE_MODEL.rings.inner, TITLE_MODEL.rings.outer];
  TITLE_LAYOUT.rings.forEach(({ tilt }, index) => {
    for (let step = 0; step < RING_SAMPLES; step++) {
      const angle = (2 * Math.PI * step) / RING_SAMPLES;
      const radius = radii[index] ?? 0;
      const around = { x: radius * Math.cos(angle), y: 0, z: radius * Math.sin(angle) };
      const turned = rotatePoint(around, tilt);
      points.push({ x: middle.x + turned.x, y: middle.y + turned.y, z: middle.z + turned.z });
    }
  });
  const { height } = TITLE_MODEL.plates;
  const widths = [TITLE_MODEL.plates.jelly, TITLE_MODEL.plates.news];
  placePlates().forEach((plate, index) => {
    const half = (widths[index] ?? 0) / 2;
    for (const [dx, dy] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ] as const) {
      const z = plate.z + TITLE_MODEL.letters.front;
      points.push({ x: plate.x + dx * half, y: plate.y + (dy * height) / 2, z });
    }
  });
  // The line under the logo needs room as well.
  points.push({ x: 0, y: TITLE_LAYOUT.row.y - height / 2 - TAGLINE_ROOM, z: TITLE_LAYOUT.row.z });
  return points;
}

/** Returns how far a point lies from the axis of the camera, as a share of the half picture. */
function project(point: TitlePoint, distance: number, aspect: number): { x: number; y: number } {
  const depth = TITLE_AIM.z + distance - point.z;
  const tangent = Math.tan(TITLE_FIELD / 2) * depth;
  return { x: (point.x - TITLE_AIM.x) / (tangent * aspect), y: (point.y - TITLE_AIM.y) / tangent };
}

/**
 * Fits the title into the free part of the picture, `aspect` its width over its height: the
 * camera stands just far enough that every point stays inside the shares of {@link FILL}.
 */
export function fitTitle(aspect: number): TitleFit {
  const tangent = Math.tan(TITLE_FIELD / 2);
  let distance = 0;
  for (const point of listTitlePoints()) {
    const nearer = point.z - TITLE_AIM.z;
    const high = Math.abs(point.y - TITLE_AIM.y) / (FILL.height * tangent);
    const wide = Math.abs(point.x - TITLE_AIM.x) / (FILL.width * tangent * aspect);
    distance = Math.max(distance, high + nearer, wide + nearer);
  }
  const { height } = TITLE_MODEL.plates;
  const { y, z } = TITLE_LAYOUT.row;
  const bottom = project({ x: 0, y: y - height / 2, z }, distance, aspect).y;
  const top = project({ x: 0, y: y + height / 2, z }, distance, aspect).y;
  // Shares of the half picture, up positive, become shares of the whole height from its top.
  const plate = (top - bottom) / 2;
  return {
    distance,
    taglineY: (1 - bottom) / 2 + plate * (TAGLINE.gap + TAGLINE.size / 2),
    taglineSize: plate * TAGLINE.size,
  };
}
