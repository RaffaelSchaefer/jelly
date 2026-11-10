/**
 * From the screen back to the floor: which stage position lies under a point of the picture. This
 * is the way back of `projectToScreen` in `scene.ts`.
 *
 * @module
 */

import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";

import type { ScreenPoint, ScreenSize } from "./lens.ts";
import type { StagePoint } from "./types.ts";
import type { FloorPoint, RoomSize } from "./world.ts";

import { unbendFromLens } from "./lens.ts";
import { fromFloorPoint, isOnStage } from "./world.ts";

/** The picture the floor is picked in: its size in CSS pixels and the fisheye over it. */
export interface PickView {
  size: ScreenSize;
  lensStrength: number;
}

/** Reads the picture a canvas shows through a lens right now. */
export function readPickView(canvas: HTMLCanvasElement, lens: { strength: number }): PickView {
  return {
    size: { width: canvas.clientWidth, height: canvas.clientHeight },
    lensStrength: lens.strength,
  };
}

/** The floor lies at height 0 and faces up. */
const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/** Returns where the ray through a point of the flat picture meets the floor. */
function castToFloor(
  camera: PerspectiveCamera,
  point: ScreenPoint,
  size: ScreenSize,
): FloorPoint | null {
  const raycaster = new Raycaster();
  const coordinates = new Vector2((point.x / size.width) * 2 - 1, 1 - (point.y / size.height) * 2);
  raycaster.setFromCamera(coordinates, camera);
  const hit = raycaster.ray.intersectPlane(FLOOR_PLANE, new Vector3());
  return hit && { x: hit.x, z: hit.z };
}

/** Returns the floor under a point in CSS pixels, also beyond the room. Null when it shows no floor. */
export function findFloor(
  camera: PerspectiveCamera,
  point: ScreenPoint,
  view: PickView,
): FloorPoint | null {
  const { size, lensStrength } = view;
  return castToFloor(camera, unbendFromLens(point, size, lensStrength), size);
}

/**
 * Returns the stage position under a point in CSS pixels, on the floor of a room. Returns null when
 * the point shows no floor or the floor beyond the stage.
 */
export function pickFloor(
  camera: PerspectiveCamera,
  point: ScreenPoint,
  view: PickView,
  room: RoomSize,
): StagePoint | null {
  const hit = findFloor(camera, point, view);
  const position = hit && fromFloorPoint(hit, room);
  return position && isOnStage(position) ? position : null;
}
