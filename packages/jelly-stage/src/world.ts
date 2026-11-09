/**
 * The room in 3D. The server speaks in percent of the stage and tells the real size of the hall in
 * meters, the scene builds in jelly units on the floor: x runs to the right, z toward the camera, y
 * up. A jelly is about 1.7 units wide and 2.3 units tall, so the room is as many jelly widths wide
 * as a jelly fits into the real hall.
 *
 * @module
 */

import type { StageArea, StagePoint, StageRoom } from "./types.ts";

/** The server gives positions in percent of the stage. */
export const STAGE_SIZE = 100;
/** One turn in radians. */
export const FULL_CIRCLE = 2 * Math.PI;
/** Turning by this angle again and again spreads things evenly around a circle. */
export const GOLDEN_ANGLE = 2.399963;
/** Width of a jelly body in jelly units, the width `jelly_m` of the room gives in meters. */
export const JELLY_WIDTH = 1.7;
/** The lecture hall of the LAN, for a server that does not tell the size of its room yet. */
const LECTURE_HALL = { width_m: 22, depth_m: 16.1, jelly_m: 0.5 };
/**
 * The room the server measures `near_distance` and the spot of a trip in: its percentages stretched
 * over 21 by 40 jelly units, whatever the size of the hall. It goes away once the server measures in
 * meters, then a distance only scales with `jelly_m`.
 */
const SERVER_ROOM: RoomSize = { width: 21, depth: 40 };
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

/** Size of the room on the floor in jelly units. The stage percentages stretch over it. */
export interface RoomSize {
  width: number;
  depth: number;
}

/** The real size of a room, as `GET /v1/stage` reports it. */
export type RoomMeters = Pick<StageRoom, "width_m" | "depth_m" | "jelly_m">;

/**
 * Returns the size of the room in jelly units: a jelly stays {@link JELLY_WIDTH} wide, so the room
 * is as many jelly widths wide and deep as jellies fit into the real hall. A server before API
 * 1.17.0 sends no meters, and a size of 0 is no size: then the room is the lecture hall.
 */
export function measureRoom(room: RoomMeters): RoomSize {
  const isMeasured = [room.width_m, room.depth_m, room.jelly_m].every((meters) => meters > 0);
  const meters = isMeasured ? room : LECTURE_HALL;
  const unitsPerMeter = JELLY_WIDTH / meters.jelly_m;
  return { width: meters.width_m * unitsPerMeter, depth: meters.depth_m * unitsPerMeter };
}

/** The room until the server tells its size: the lecture hall. */
export const DEFAULT_ROOM = measureRoom(LECTURE_HALL);

/** Returns the whole room on the floor, around the origin. */
export function toRoomRect(room: RoomSize): FloorRect {
  return {
    minX: -room.width / 2,
    minZ: -room.depth / 2,
    maxX: room.width / 2,
    maxZ: room.depth / 2,
  };
}

/** Converts a stage position in percent to the floor of a room. */
export function toFloorPoint(point: StagePoint, room: RoomSize): FloorPoint {
  return {
    x: (point.x / STAGE_SIZE - 0.5) * room.width,
    z: (point.y / STAGE_SIZE - 0.5) * room.depth,
  };
}

/** Converts a point on the floor to a stage position in percent. Undoes {@link toFloorPoint}. */
export function fromFloorPoint(point: FloorPoint, room: RoomSize): StagePoint {
  return {
    x: (point.x / room.width + 0.5) * STAGE_SIZE,
    y: (point.z / room.depth + 0.5) * STAGE_SIZE,
  };
}

/** Reports whether a position lies on the stage. Anything else the server refuses. */
export function isOnStage(point: StagePoint): boolean {
  return point.x >= 0 && point.x <= STAGE_SIZE && point.y >= 0 && point.y <= STAGE_SIZE;
}

/** A rectangle on the stage in percent, such as an area before its rotation. */
export type StageRect = Pick<StageArea, "x" | "y" | "width" | "height">;

/** Converts a rectangle in percent to its rectangle on the floor, without any rotation. */
export function toFloorRect(area: StageRect, room: RoomSize): FloorRect {
  const start = toFloorPoint({ x: area.x, y: area.y }, room);
  const end = toFloorPoint({ x: area.x + area.width, y: area.y + area.height }, room);
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

/** Returns the distance between two floor points of a room as the server measures it. */
export function measureServerDistance(from: FloorPoint, to: FloorPoint, room: RoomSize): number {
  const scaleX = SERVER_ROOM.width / room.width;
  const scaleZ = SERVER_ROOM.depth / room.depth;
  return Math.hypot((to.x - from.x) * scaleX, (to.z - from.z) * scaleZ);
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
