/**
 * How a jelly gets to where it wants to be. The goal comes from `wander.ts` and is the same on every
 * screen. The way there is found on each screen, so jellies walk around desks instead of through
 * them, and screens may differ for a moment while jellies walk.
 *
 * @module
 */

import type { NavGrid } from "./navigation.ts";
import type { StagePlayer } from "./types.ts";
import type { StageLookup } from "./wander.ts";
import type { FloorPoint, FloorRect } from "./world.ts";

import { findNearestWalkable, findPath, hasLineOfSight } from "./navigation.ts";
import { calculateStagePoint } from "./wander.ts";
import {
  JELLY_RADIUS,
  measureDistance,
  remapIntoRect,
  shrinkRect,
  toFloorPoint,
  toFloorRect,
} from "./world.ts";
import { findSnackSpot, isStandingKind } from "./zones.ts";

/** A standing jelly starts walking only when its goal is this far away, in jelly units. */
const START_DISTANCE = 0.6;
/** A walking jelly searches a new path when its goal moved this far from the planned one. */
const REPLAN_DISTANCE = 0.75;
/** Closer than this, a waypoint counts as reached. */
const ARRIVE_DISTANCE = 0.02;
/** Usual walking speed in jelly units per second. */
const WALK_SPEED = 1.4;
/** Long ways go faster, so no walk takes much longer than this. */
const LONGEST_WALK_SECONDS = 6;
/** Distance of one hop while walking. */
const STRIDE_LENGTH = 0.45;
const HOP_HEIGHT = 0.12;
const WALK_LEAN = 0.08;
/** How fast a jelly turns and how fast hopping starts and stops, per second. */
const TURN_RATE = 8;
const GAIT_RATE = 10;
const FULL_CIRCLE = 2 * Math.PI;

/** Where a jelly stands, where it goes and how it moves, kept between frames. */
export interface Walker {
  position: FloorPoint;
  /** Rotation around the vertical axis. 0 looks toward the camera side of the room (+z). */
  yaw: number;
  /** Remaining waypoints. The last one is the goal the path was planned for. */
  path: FloorPoint[];
  plannedGoal: FloorPoint | null;
  speed: number;
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
  grid: NavGrid;
  goal: FloorPoint;
  /** Where the camera stands, projected on the floor. Standing jellies look there. */
  viewer: FloorPoint;
  seconds: number;
  /** Path searches left in this frame, shared by all jellies. */
  budget: { searches: number };
}

/** A jelly that stands at `position`, looking toward the camera. */
export function createWalker(position: FloorPoint): Walker {
  return { position, yaw: 0, path: [], plannedGoal: null, speed: WALK_SPEED, stride: 0, gait: 0 };
}

/** Everything that decides where the jellies want to be in this frame. */
export interface GoalContext {
  lookup: StageLookup;
  serverTime: number;
  grid: NavGrid;
  /** Jellies on a snack run, and the counter they go to. */
  visitors: Set<number>;
  snackBar: FloorRect | null;
}

/**
 * Returns where a jelly wants to stand. In its own area it keeps clear of the edges, so the body
 * does not reach into the desks around it. On a snack run it waits at the counter. Elsewhere it
 * takes the nearest spot it may stand on.
 */
export function calculateGoal(player: StagePlayer, context: GoalContext): FloorPoint {
  const { lookup, grid, snackBar } = context;
  if (snackBar && context.visitors.has(player.id)) {
    return findNearestWalkable(grid, findSnackSpot(snackBar, player.id));
  }
  let goal = toFloorPoint(calculateStagePoint(player, lookup, context.serverTime));
  const area = lookup.areas.get(player.area_id ?? 0);
  const isFollowing = lookup.players.has(player.follow_player_id ?? 0);
  if (area && isStandingKind(area.kind) && !isFollowing) {
    const rect = toFloorRect(area);
    goal = remapIntoRect(goal, rect, shrinkRect(rect, JELLY_RADIUS));
  }
  return findNearestWalkable(grid, goal);
}

/** Plans the way to the goal again, if the old one no longer fits. */
function updatePath(walker: Walker, step: WalkStep): void {
  const { grid, goal, budget } = step;
  if (hasLineOfSight(grid, walker.position, goal)) {
    walker.path = [goal];
    walker.plannedGoal = goal;
    return;
  }
  const planned = walker.plannedGoal;
  const isPlanFine = planned && walker.path.length > 0;
  if (isPlanFine && measureDistance(planned, goal) <= REPLAN_DISTANCE) {
    return;
  }
  if (budget.searches <= 0) {
    return;
  }
  budget.searches -= 1;
  walker.path = findPath(grid, walker.position, goal);
  walker.plannedGoal = goal;
  walker.speed = Math.max(WALK_SPEED, measurePathLength(walker) / LONGEST_WALK_SECONDS);
}

/** Returns the length of the remaining way. */
function measurePathLength(walker: Walker): number {
  let length = 0;
  let from = walker.position;
  for (const waypoint of walker.path) {
    length += measureDistance(from, waypoint);
    from = waypoint;
  }
  return length;
}

/** Moves along the path by `distance` and returns how far the jelly really got. */
function moveAlongPath(walker: Walker, distance: number): number {
  let left = distance;
  while (left > 0 && walker.path.length > 0) {
    const waypoint = walker.path[0] ?? walker.position;
    const gap = measureDistance(walker.position, waypoint);
    if (gap <= left || gap < ARRIVE_DISTANCE) {
      walker.position = waypoint;
      walker.path.shift();
      left -= gap;
      continue;
    }
    const share = left / gap;
    walker.position = {
      x: walker.position.x + (waypoint.x - walker.position.x) * share,
      z: walker.position.z + (waypoint.z - walker.position.z) * share,
    };
    left = 0;
  }
  return distance - left;
}

/** Returns the rotation toward a point, or `fallback` when it is right here. */
function calculateYawToward(from: FloorPoint, to: FloorPoint, fallback: number): number {
  const deltaX = to.x - from.x;
  const deltaZ = to.z - from.z;
  return Math.hypot(deltaX, deltaZ) < ARRIVE_DISTANCE ? fallback : Math.atan2(deltaX, deltaZ);
}

/** Turns smoothly toward `wanted`, the short way around. */
function turnToward(current: number, wanted: number, seconds: number): number {
  const difference = ((((wanted - current) % FULL_CIRCLE) + 3 * Math.PI) % FULL_CIRCLE) - Math.PI;
  return current + difference * (1 - Math.exp(-TURN_RATE * seconds));
}

/** Moves a jelly for one frame: stand still, start walking, follow the path, turn and hop. */
export function stepWalker(walker: Walker, step: WalkStep): void {
  const isWalking = walker.path.length > 0;
  if (isWalking || measureDistance(walker.position, step.goal) > START_DISTANCE) {
    updatePath(walker, step);
  }
  const before = walker.position;
  const moved = moveAlongPath(walker, walker.speed * step.seconds);
  walker.stride += moved / STRIDE_LENGTH;
  const isMoving = moved > 0;
  const looksAt = isMoving ? walker.position : step.viewer;
  const wantedYaw = calculateYawToward(isMoving ? before : walker.position, looksAt, walker.yaw);
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
