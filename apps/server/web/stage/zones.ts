/**
 * The special zones of the hall: the stage with its beamers, the chillout lounge and the snack bar.
 * Says what blocks the way, where the floor is raised and where a jelly waits for its snack.
 *
 * @module
 */

import type { AreaKind, StageArea } from "./types.ts";
import type { FloorPoint, FloorRect } from "./world.ts";

import { calculateRandomValue } from "./wander.ts";
import { toFloorRect } from "./world.ts";

/** Height of the stage platform and of the snack bar counter, in jelly units. */
export const STAGE_HEIGHT = 0.35;
export const COUNTER_HEIGHT = 1.1;
/** The two beamer screens stand at these shares of the stage width, like in the hall plan. */
const SCREEN_CENTERS = [0.3, 0.7];
/** A screen is as wide as two places and stands this far inside the back edge. */
export const SCREEN_WIDTH = 4.2;
const SCREEN_DEPTH = 0.2;
const SCREEN_INSET = 0.3;
/**
 * Where snack visitors wait: behind the counter, seen from the camera, so the counter stays in view
 * and the jellies peek over it. They spread along most of its length.
 */
const SNACK_GAP = 1.1;
const SNACK_SPREAD = 0.8;
const SEED_SNACK_SPOT = 97;

/** Kinds jellies can stand on. */
const STANDING_KINDS: AreaKind[] = ["seats", "stage", "lounge"];
/** Kinds jellies walk around. */
const OBSTACLE_KINDS: AreaKind[] = ["desk", "snackbar"];

/** Says whether jellies stand in an area of this kind. */
export function isStandingKind(kind: AreaKind): boolean {
  return STANDING_KINDS.includes(kind);
}

/** Says whether jellies walk around an area of this kind. */
export function isObstacleKind(kind: AreaKind): boolean {
  return OBSTACLE_KINDS.includes(kind);
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

/** Returns everything jellies walk around: desks, snack bar counters and the beamer screens. */
export function listObstacleRects(areas: StageArea[]): FloorRect[] {
  return areas.flatMap((area) => {
    const rect = toFloorRect(area);
    if (area.kind === "stage") {
      return listScreenRects(rect);
    }
    return isObstacleKind(area.kind) ? [rect] : [];
  });
}

/** Returns the rectangles of all stages. */
export function listStageRects(areas: StageArea[]): FloorRect[] {
  return areas.filter((area) => area.kind === "stage").map(toFloorRect);
}

/** Returns how high the floor is at a point: on a stage it is raised. */
export function findFloorHeight(point: FloorPoint, stages: FloorRect[]): number {
  const isOnStage = stages.some(
    (stage) =>
      point.x >= stage.minX &&
      point.x <= stage.maxX &&
      point.z >= stage.minZ &&
      point.z <= stage.maxZ,
  );
  return isOnStage ? STAGE_HEIGHT : 0;
}

/** Returns the first snack bar counter, or null when the hall has none. */
export function findSnackBar(areas: StageArea[]): FloorRect | null {
  const bar = areas.find((area) => area.kind === "snackbar");
  return bar ? toFloorRect(bar) : null;
}

/** Returns where a jelly waits at the counter. The ID picks the spot, so screens agree. */
export function findSnackSpot(bar: FloorRect, playerId: number): FloorPoint {
  const random = calculateRandomValue(playerId, SEED_SNACK_SPOT);
  const share = (1 - SNACK_SPREAD) / 2 + SNACK_SPREAD * random;
  return { x: bar.minX + share * (bar.maxX - bar.minX), z: bar.minZ - SNACK_GAP };
}
