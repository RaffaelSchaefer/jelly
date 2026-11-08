/**
 * Where the zones of the hall stand: a zone turns around its middle, so everything built for it is
 * built around the origin and then placed. Says where the floor is raised, because jellies and
 * lights stand higher on a stage platform. Knows no three.js.
 *
 * @module
 */

import type { StageArea } from "./types.ts";
import type { FloorPoint, FloorRect, RoomSize } from "./world.ts";

import { isPlatformProp } from "./propNames.ts";
import { toFloorPoint, toFloorRect } from "./world.ts";

/** Height of the stage platform, in jelly units. */
export const STAGE_HEIGHT = 0.35;
/** Height of the snack bar counter, see {@link STAGE_HEIGHT}. */
export const COUNTER_HEIGHT = 1.1;
/** The two beamer screens stand at these shares of the stage width, like in the hall plan. */
const SCREEN_CENTERS = [0.3, 0.7];
/** A screen is as wide as two places and stands this far inside the back edge. */
export const SCREEN_WIDTH = 4.2;
const SCREEN_DEPTH = 0.2;
const SCREEN_INSET = 0.3;
/** Speaker stacks stand in the back corners of the stage, next to the 32A sockets. */
const SPEAKER = { width: 1, depth: 0.8, sideInset: 0.6, backInset: 0.2 };
/** The tournament trophy stands on a pedestal in the middle, between the two screens. */
const PEDESTAL = { size: 0.7, backInset: 0.25 };
const HALF_TURN_DEGREES = 180;

/**
 * A zone on the floor: its middle, its size before the turn and the turn itself. The server counts
 * degrees clockwise seen from above, three.js counts the other way, so `turn` is already negated:
 * it goes straight into `rotation.y`.
 */
export interface Placement {
  middle: FloorPoint;
  width: number;
  depth: number;
  /** Rotation around the vertical axis in radians, as three.js wants it. */
  turn: number;
}

/**
 * Returns where a zone stands in a room. The turn happens on the floor: percent is longer on one
 * axis.
 */
export function placeArea(area: StageArea, room: RoomSize): Placement {
  const rect = toFloorRect(area, room);
  const middle = toFloorPoint({ x: area.x + area.width / 2, y: area.y + area.height / 2 }, room);
  return {
    middle,
    width: rect.maxX - rect.minX,
    depth: rect.maxZ - rect.minZ,
    turn: (-area.rotation * Math.PI) / HALF_TURN_DEGREES,
  };
}

/** Returns the rectangle a zone covers before it is placed: around the origin, front toward +z. */
export function toLocalRect(placement: Placement): FloorRect {
  return {
    minX: -placement.width / 2,
    maxX: placement.width / 2,
    minZ: -placement.depth / 2,
    maxZ: placement.depth / 2,
  };
}

/** Moves a point of the room into the coordinates of a placed zone, undoing its turn. */
export function toLocalPoint(point: FloorPoint, placement: Placement): FloorPoint {
  const deltaX = point.x - placement.middle.x;
  const deltaZ = point.z - placement.middle.z;
  const sine = Math.sin(placement.turn);
  const cosine = Math.cos(placement.turn);
  return { x: deltaX * cosine - deltaZ * sine, z: deltaX * sine + deltaZ * cosine };
}

/** Moves a point from the coordinates of a placed zone into the room, applying its turn. */
export function toRoomPoint(point: FloorPoint, placement: Placement): FloorPoint {
  const sine = Math.sin(placement.turn);
  const cosine = Math.cos(placement.turn);
  return {
    x: placement.middle.x + point.x * cosine + point.z * sine,
    z: placement.middle.z - point.x * sine + point.z * cosine,
  };
}

/** Reports whether a point of the room lies in a placed zone, edges included. */
export function containsPoint(placement: Placement, point: FloorPoint): boolean {
  const local = toLocalPoint(point, placement);
  return Math.abs(local.x) <= placement.width / 2 && Math.abs(local.z) <= placement.depth / 2;
}

/** Returns the two beamer screens along the back edge of a stage. */
export function listScreenRects(stage: FloorRect): FloorRect[] {
  const width = stage.maxX - stage.minX;
  return SCREEN_CENTERS.map((share) => {
    const centerX = stage.minX + share * width;
    return {
      minX: centerX - SCREEN_WIDTH / 2,
      maxX: centerX + SCREEN_WIDTH / 2,
      minZ: stage.minZ + SCREEN_INSET,
      maxZ: stage.minZ + SCREEN_INSET + SCREEN_DEPTH,
    };
  });
}

/** Returns the two speaker stacks in the back corners of a stage. */
export function listSpeakerRects(stage: FloorRect): FloorRect[] {
  const minZ = stage.minZ + SPEAKER.backInset;
  const maxZ = minZ + SPEAKER.depth;
  const leftX = stage.minX + SPEAKER.sideInset;
  const rightX = stage.maxX - SPEAKER.sideInset;
  return [
    { minX: leftX, maxX: leftX + SPEAKER.width, minZ, maxZ },
    { minX: rightX - SPEAKER.width, maxX: rightX, minZ, maxZ },
  ];
}

/** Returns the pedestal of the trophy, in the middle of the back of a stage. */
export function findPedestalRect(stage: FloorRect): FloorRect {
  const centerX = (stage.minX + stage.maxX) / 2;
  const minZ = stage.minZ + PEDESTAL.backInset;
  return {
    minX: centerX - PEDESTAL.size / 2,
    maxX: centerX + PEDESTAL.size / 2,
    minZ,
    maxZ: minZ + PEDESTAL.size,
  };
}

/** Returns the placements of all stage platforms, the zones with a raised floor. */
export function listPlatforms(areas: StageArea[], room: RoomSize): Placement[] {
  return areas.filter((area) => isPlatformProp(area.prop)).map((area) => placeArea(area, room));
}

/** Returns how high the floor is at a point: on a stage platform it is raised. */
export function findFloorHeight(point: FloorPoint, platforms: Placement[]): number {
  return platforms.some((platform) => containsPoint(platform, point)) ? STAGE_HEIGHT : 0;
}
