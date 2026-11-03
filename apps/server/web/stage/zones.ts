/**
 * The special zones of the hall: the stage with its beamers, the chillout lounge and the snack bar.
 * Says what stands on a stage and where the floor is raised. `internal/movement/obstacles.go` keeps
 * jellies away from the same props, so a change here belongs there too.
 *
 * @module
 */

import type { StageArea } from "./types.ts";
import type { FloorPoint, FloorRect } from "./world.ts";

import { toFloorRect } from "./world.ts";

/** Height of the stage platform and of the snack bar counter, in jelly units. */
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

/** Returns what stands on a stage and blocks the way: screens, speakers and the trophy. */
export function listStagePropRects(stage: FloorRect): FloorRect[] {
  return [...listScreenRects(stage), ...listSpeakerRects(stage), findPedestalRect(stage)];
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
