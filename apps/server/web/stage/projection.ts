/**
 * Turns stage percent into screen pixels. The stage is a floor seen from the front: jellies at the
 * top are further away and smaller.
 *
 * @module
 */

import type { StagePoint } from "./types.ts";

const STAGE_SIZE = 100;
const BACK_SCALE = 0.55;
const FRONT_SCALE = 1;
/** Share of the screen above the floor and below its front edge, so names stay visible. */
const FLOOR_TOP_SHARE = 0.16;
const FLOOR_BOTTOM_SHARE = 0.08;
/** Floor width at the front edge. Below 1 so jellies at the sides stay fully visible. */
const FLOOR_WIDTH_SHARE = 0.92;
/** Time a shown jelly needs for half of the way to its target. */
const HALF_DISTANCE_MS = 400;

/** The canvas size in CSS pixels. */
export interface ScreenSize {
  width: number;
  height: number;
}

/** A position in pixels and how large things at this depth are drawn. */
export interface ScreenPoint {
  x: number;
  y: number;
  scale: number;
}

/** Projects a stage point onto the screen. */
export function projectToScreen(point: StagePoint, size: ScreenSize): ScreenPoint {
  const depth = point.y / STAGE_SIZE;
  const scale = BACK_SCALE + depth * (FRONT_SCALE - BACK_SCALE);
  const floorHeight = 1 - FLOOR_TOP_SHARE - FLOOR_BOTTOM_SHARE;
  const fromCenter = (point.x - STAGE_SIZE / 2) / STAGE_SIZE;
  return {
    x: size.width / 2 + fromCenter * size.width * FLOOR_WIDTH_SHARE * scale,
    y: size.height * (FLOOR_TOP_SHARE + depth * floorHeight),
    scale,
  };
}

/** Moves a shown position toward its target, so a changed area becomes a walk instead of a jump. */
export function moveToward(current: StagePoint, target: StagePoint, elapsedMs: number): StagePoint {
  const share = 1 - 2 ** (-elapsedMs / HALF_DISTANCE_MS);
  return {
    x: current.x + (target.x - current.x) * share,
    y: current.y + (target.y - current.y) * share,
  };
}
