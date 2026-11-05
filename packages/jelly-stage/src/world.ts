/**
 * The room in 3D. The server speaks in percent of the stage, the scene in jelly units on the floor:
 * x runs to the right, z toward the camera, y up. A jelly is about 2.3 units tall.
 *
 * @module
 */

import type { StageArea, StagePoint } from "./types.ts";

/** The server gives positions in percent of the stage. */
export const STAGE_SIZE = 100;
/** One turn in radians. */
export const FULL_CIRCLE = 2 * Math.PI;
/** Turning by this angle again and again spreads things evenly around a circle. */
export const GOLDEN_ANGLE = 2.399963;
/**
 * Size of the room in jelly units. The stage percentages stretch over it. The hall is deeper than
 * wide: a place at a desk is a tenth of the width, about 2 units, and a desk row 2 % of the depth.
 */
export const ROOM_WIDTH = 21;
/** Depth of the room in jelly units, see {@link ROOM_WIDTH}. */
export const ROOM_DEPTH = 40;
/**
 * The canvas has twice as many pixels per side as the screen, and the browser smooths them down.
 * That also smooths the edges of the raymarched jellies, which the GPU's own anti-aliasing misses.
 */
const SUPERSAMPLING = 2;
/** Above about 4K the canvas stops growing: the raymarched jellies cost a lot per pixel. */
const MAX_CANVAS_PIXELS = 3840 * 2160;

/** A point on the floor. */
export interface FloorPoint {
  x: number;
  z: number;
}

/** A rectangle on the floor. */
export interface FloorRect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** A point in the scene. */
export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

/** How the camera looks at the room. Angles in radians. */
export interface CameraView {
  /** Vertical field of view. */
  fov: number;
  /** How far the camera looks down, 0 is level. */
  pitch: number;
  /** Width divided by height of the screen. */
  aspect: number;
  /** Extra room around the fitted points, 1 fits them exactly. */
  margin: number;
}

/** The whole room on the floor. */
export const ROOM: FloorRect = {
  minX: -ROOM_WIDTH / 2,
  minZ: -ROOM_DEPTH / 2,
  maxX: ROOM_WIDTH / 2,
  maxZ: ROOM_DEPTH / 2,
};

/** Converts a stage position in percent to the floor. */
export function toFloorPoint(point: StagePoint): FloorPoint {
  return {
    x: (point.x / STAGE_SIZE - 0.5) * ROOM_WIDTH,
    z: (point.y / STAGE_SIZE - 0.5) * ROOM_DEPTH,
  };
}

/** Converts an area to its rectangle on the floor. */
export function toFloorRect(area: StageArea): FloorRect {
  const start = toFloorPoint({ x: area.x, y: area.y });
  const end = toFloorPoint({ x: area.x + area.width, y: area.y + area.height });
  return { minX: start.x, minZ: start.z, maxX: end.x, maxZ: end.z };
}

/** Moves every edge inward by `margin`. A side that gets too short shrinks to its middle. */
export function shrinkRect(rect: FloorRect, margin: number): FloorRect {
  const shrinkSpan = (low: number, high: number) =>
    high - low > 2 * margin ? [low + margin, high - margin] : [(low + high) / 2, (low + high) / 2];
  const [minX = 0, maxX = 0] = shrinkSpan(rect.minX, rect.maxX);
  const [minZ = 0, maxZ = 0] = shrinkSpan(rect.minZ, rect.maxZ);
  return { minX, minZ, maxX, maxZ };
}

/** Returns the distance between two floor points. */
export function measureDistance(from: FloorPoint, to: FloorPoint): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/**
 * Returns how far the camera must stand from `target` so every point is on screen. The camera looks
 * at the target from the front (+z) and above, tilted down by `view.pitch`.
 */
export function calculateCameraDistance(
  points: ScenePoint[],
  target: ScenePoint,
  view: CameraView,
): number {
  const tanVertical = Math.tan(view.fov / 2) / view.margin;
  const tanHorizontal = tanVertical * view.aspect;
  const sin = Math.sin(view.pitch);
  const cos = Math.cos(view.pitch);
  let distance = 0;
  for (const point of points) {
    const offsetX = point.x - target.x;
    const offsetY = point.y - target.y;
    const offsetZ = point.z - target.z;
    // Along the view direction, positive means farther away than the target.
    const depth = -offsetY * sin - offsetZ * cos;
    const up = offsetY * cos - offsetZ * sin;
    distance = Math.max(
      distance,
      Math.abs(offsetX) / tanHorizontal - depth,
      Math.abs(up) / tanVertical - depth,
    );
  }
  return distance;
}

/**
 * Returns canvas pixels per CSS pixel: `supersampling` times the screen's own while the canvas stays
 * within the budget, never fewer than the screen has.
 */
export function calculateCanvasDensity(
  size: { width: number; height: number },
  screenDensity: number,
  supersampling = SUPERSAMPLING,
) {
  const budget = Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, size.width * size.height));
  return Math.max(screenDensity, Math.min(screenDensity * supersampling, budget));
}
