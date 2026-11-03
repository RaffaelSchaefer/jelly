/**
 * Plays the moves of the server. Where a jelly is depends only on its move and the server time, so
 * all screens show the same. This file adds how walking looks: turning, hopping and leaning.
 *
 * @module
 */

import type { StageMove } from "./types.ts";
import type { FloorPoint } from "./world.ts";

import { FULL_CIRCLE, measureDistance, toFloorPoint } from "./world.ts";

/** Closer than this, a jelly counts as standing. */
const ARRIVE_DISTANCE = 0.0005;
/** A jelly closer than this to its look target keeps its direction. */
const LOOK_DISTANCE = 0.02;
/** Distance of one hop while walking. */
const STRIDE_LENGTH = 0.45;
const HOP_HEIGHT = 0.12;
const WALK_LEAN = 0.08;
/** How fast a jelly turns and how fast hopping starts and stops, per second. */
const TURN_RATE = 8;
const GAIT_RATE = 10;
/** Why a jelly walks when it goes to the snack bar. It carries its snack with both hands. */
const SNACK_KIND = "snack";

/** Where a jelly stands and how it moves, kept between frames. */
export interface Walker {
  position: FloorPoint;
  /** Rotation around the vertical axis. 0 looks toward the camera side of the room (+z). */
  yaw: number;
  /** Progress of the hops, counted in strides. */
  stride: number;
  /** 0 when standing, 1 when walking, in between while starting or stopping. */
  gait: number;
}

/** How a walking jelly bounces and leans this frame. */
export interface WalkPose {
  lift: number;
  lean: number;
}

/** What {@link stepWalker} needs besides the walker. */
export interface WalkStep {
  /** Where the move puts the jelly in this frame. */
  target: FloorPoint;
  /** Where the camera stands, projected on the floor. Standing jellies look there. */
  viewer: FloorPoint;
  seconds: number;
}

/** A jelly that stands at `position`, looking toward the camera. */
export function createWalker(position: FloorPoint): Walker {
  return { position, yaw: 0, stride: 0, gait: 0 };
}

/** Returns where a move puts a jelly at this server time. */
export function findMovePosition(move: StageMove, serverTime: number): FloorPoint {
  const elapsed = serverTime - move.start_at;
  let last = move.points[0];
  if (!last) {
    return { x: 0, z: 0 };
  }
  for (const next of move.points.slice(1)) {
    if (elapsed < next.t) {
      const share = Math.max(0, (elapsed - last.t) / (next.t - last.t));
      return toFloorPoint({
        x: last.x + (next.x - last.x) * share,
        y: last.y + (next.y - last.y) * share,
      });
    }
    last = next;
  }
  return toFloorPoint(last);
}

/** Keeps the newer of two moves of a jelly, so a slower answer cannot undo a newer move. */
export function keepNewerMove(moves: Map<number, StageMove>, move: StageMove): void {
  const known = moves.get(move.player_id);
  if (!known || known.start_at <= move.start_at) {
    moves.set(move.player_id, move);
  }
}

/** Returns how many jellies stand below this one right now. On the way it stays on the floor. */
export function findStackLevel(move: StageMove, serverTime: number): number {
  const arrival = move.points.at(-1)?.t ?? 0;
  return serverTime - move.start_at >= arrival ? move.level : 0;
}

/** Returns the jellies on a snack run. */
export function findSnackRunners(moves: Map<number, StageMove>): Set<number> {
  const runners = [...moves.values()].filter((move) => move.kind === SNACK_KIND);
  return new Set(runners.map((move) => move.player_id));
}

/** Returns the rotation toward a point, or `fallback` when it is right here. */
function calculateYawToward(from: FloorPoint, to: FloorPoint, fallback: number): number {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  return Math.hypot(deltaX, deltaZ) < LOOK_DISTANCE ? fallback : Math.atan2(deltaX, deltaZ);
}

/** Turns smoothly toward `wanted`, the short way around. */
function turnToward(current: number, wanted: number, seconds: number): number {
  const difference = ((((wanted - current) % FULL_CIRCLE) + 3 * Math.PI) % FULL_CIRCLE) - Math.PI;
  return current + difference * (1 - Math.exp(-TURN_RATE * seconds));
}

/** Moves a jelly for one frame: goes to the target, turns and hops. */
export function stepWalker(walker: Walker, step: WalkStep): void {
  const before = walker.position;
  const moved = measureDistance(before, step.target);
  walker.position = step.target;
  walker.stride += moved / STRIDE_LENGTH;
  const isMoving = moved > ARRIVE_DISTANCE;
  const wantedYaw = isMoving
    ? Math.atan2(step.target.x - before.x, step.target.z - before.z)
    : calculateYawToward(walker.position, step.viewer, walker.yaw);
  walker.yaw = turnToward(walker.yaw, wantedYaw, step.seconds);
  const wantedGait = isMoving ? 1 : 0;
  walker.gait += (wantedGait - walker.gait) * (1 - Math.exp(-GAIT_RATE * step.seconds));
}

/** Returns the hop and lean of a walking jelly. */
export function calculateWalkPose(walker: Walker): WalkPose {
  return {
    lift: HOP_HEIGHT * Math.abs(Math.sin(Math.PI * walker.stride)) * walker.gait,
    lean: WALK_LEAN * walker.gait,
  };
}
