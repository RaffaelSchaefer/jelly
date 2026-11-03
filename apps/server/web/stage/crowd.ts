/**
 * Keeps jellies from standing inside each other. All goals are pushed apart a little, in the order
 * of the players from the server, so every screen gets the same result.
 *
 * @module
 */

import type { NavGrid } from "./navigation.ts";
import type { StagePlayer } from "./types.ts";
import type { GoalContext } from "./walking.ts";
import type { FloorPoint } from "./world.ts";

import { isWalkable } from "./navigation.ts";
import { calculateGoal } from "./walking.ts";

/** Closest distance between two jelly centers, in jelly units. A jelly is about 1.7 wide. */
const PERSONAL_SPACE = 1.8;
/** More rounds untangle larger crowds but cost more time per frame. Eight settle a full row. */
const SPREAD_ROUNDS = 8;
const SAME_SPOT = 1e-6;
/**
 * Jellies on one spot would all be pushed along one line. A tiny nudge in a different direction
 * for each, turned by the golden angle, lets them fan out instead.
 */
const NUDGE = 0.001;
const GOLDEN_ANGLE = 2.399963;

/** Moves a goal if the spot is free. A push into a desk slides along the desk instead. */
function moveGoal(goals: FloorPoint[], index: number, moved: FloorPoint, grid: NavGrid): void {
  const stay = goals[index];
  if (!stay) {
    return;
  }
  const candidates = [moved, { x: moved.x, z: stay.z }, { x: stay.x, z: moved.z }];
  const free = candidates.find((candidate) => isWalkable(grid, candidate));
  if (free) goals[index] = free;
}

/** Pushes two goals apart until they keep their distance. */
function pushApart(goals: FloorPoint[], first: number, second: number, grid: NavGrid): void {
  const one = goals[first];
  const other = goals[second];
  if (!one || !other) {
    return;
  }
  const distance = Math.hypot(other.x - one.x, other.z - one.z);
  if (distance >= PERSONAL_SPACE) {
    return;
  }
  const isSameSpot = distance < SAME_SPOT;
  const directionX = isSameSpot ? 1 : (other.x - one.x) / distance;
  const directionZ = isSameSpot ? 0 : (other.z - one.z) / distance;
  const push = (PERSONAL_SPACE - distance) / 2;
  moveGoal(goals, first, { x: one.x - directionX * push, z: one.z - directionZ * push }, grid);
  moveGoal(goals, second, { x: other.x + directionX * push, z: other.z + directionZ * push }, grid);
}

/** Returns the goals pushed apart, in the same order. */
export function spreadGoals(goals: FloorPoint[], grid: NavGrid): FloorPoint[] {
  const spread = goals.map((goal, index) => ({
    x: goal.x + NUDGE * Math.cos(index * GOLDEN_ANGLE),
    z: goal.z + NUDGE * Math.sin(index * GOLDEN_ANGLE),
  }));
  for (let round = 0; round < SPREAD_ROUNDS; round++) {
    for (let first = 0; first < spread.length; first++) {
      for (let second = first + 1; second < spread.length; second++) {
        pushApart(spread, first, second, grid);
      }
    }
  }
  return spread;
}

/** Returns where every jelly wants to stand right now, by player ID. */
export function calculateGoals(
  players: StagePlayer[],
  context: GoalContext,
): Map<number, FloorPoint> {
  const goals = players.map((player) => calculateGoal(player, context));
  const spread = spreadGoals(goals, context.grid);
  return new Map(players.map((player, index) => [player.id, spread[index] ?? goals[index]!]));
}
