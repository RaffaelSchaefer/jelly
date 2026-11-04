import assert from "node:assert/strict";
import { test } from "node:test";

import type { StagePlayer } from "./types.ts";
import type { GoalContext, Walker, WalkStep } from "./walking.ts";
import type { StageLookup } from "./wander.ts";
import type { FloorPoint } from "./world.ts";

import { createDemoRoom } from "./demoRoom.fixture.ts";
import { createNavGrid, isWalkable } from "./navigation.ts";
import { calculateGoal, calculateWalkPose, createWalker, stepWalker } from "./walking.ts";
import { JELLY_RADIUS, measureDistance, ROOM, toFloorRect } from "./world.ts";
import { findSnackBar, listObstacleRects } from "./zones.ts";

const room = createDemoRoom();
const grid = createNavGrid(ROOM, listObstacleRects(room), JELLY_RADIUS);
const lookup: StageLookup = {
  players: new Map(),
  areas: new Map(room.map((area) => [area.id, area])),
};
/** Where jellies want to be at a server time, without snack runs unless given. */
const contextAt = (serverTime: number, visitors = new Set<number>()): GoalContext => ({
  lookup,
  serverTime,
  grid,
  visitors,
  snackBar: findSnackBar(room),
});
const openFloor = createNavGrid(ROOM, [], JELLY_RADIUS);
const viewer = { x: 0, z: 40 };
const frameSeconds = 1 / 30;

function makePlayer(changes: Partial<StagePlayer>): StagePlayer {
  return {
    id: 5,
    name: "Glibber",
    color: "mint",
    cosmetic: null,
    level: 1,
    sign: null,
    follow_player_id: null,
    area_id: 1,
    home_x: 20,
    home_y: 30,
    ...changes,
  };
}

/** Steps a walker toward a fixed goal and returns every position on the way. */
function walk(walker: Walker, goal: FloorPoint, frames: number, floor = grid): FloorPoint[] {
  const positions: FloorPoint[] = [];
  for (let frame = 0; frame < frames; frame++) {
    const budget = { searches: 8 };
    const step: WalkStep = { grid: floor, goal, viewer, seconds: frameSeconds, budget };
    stepWalker(walker, step);
    positions.push(walker.position);
  }
  return positions;
}

test("a jelly stays in front of its gaming desk without touching it", () => {
  const seats = lookup.areas.get(1);
  assert.ok(seats);
  const rect = toFloorRect(seats);
  for (let time = 0; time < 600_000; time += 7_000) {
    const goal = calculateGoal(makePlayer({ home_x: 5.5, home_y: 28.5 }), contextAt(time));
    assert.ok(isWalkable(grid, goal), "the body keeps clear of the desks");
    assert.ok(
      goal.x >= rect.minX && goal.x <= rect.maxX && goal.z >= rect.minZ && goal.z <= rect.maxZ,
    );
  }
});

test("a jelly without seats never wants to stand in a desk", () => {
  const player = makePlayer({ area_id: null, home_x: 25, home_y: 30 });
  for (let time = 0; time < 600_000; time += 3_000) {
    assert.ok(isWalkable(grid, calculateGoal(player, contextAt(time))));
  }
});

test("a small step of the goal does not start a walk, the jelly looks at the camera", () => {
  const walker = createWalker({ x: 0, z: 0 });
  walker.yaw = 1;
  walk(walker, { x: 0.3, z: 0 }, 60, openFloor);
  assert.deepEqual(walker.position, { x: 0, z: 0 });
  assert.ok(Math.abs(walker.yaw) < 0.01, "it turned toward the camera");
  assert.equal(calculateWalkPose(walker).lift, 0);
});

test("a jelly walks around the desks to another group and stops there", () => {
  const start = calculateGoal(makePlayer({}), contextAt(0));
  const goal = calculateGoal(makePlayer({ area_id: 4, home_x: 75, home_y: 35 }), contextAt(0));
  const walker = createWalker(start);
  const positions = walk(walker, goal, 30 * 8);
  assert.ok(measureDistance(walker.position, goal) < 1e-9, "it arrived");
  for (const position of positions) {
    assert.ok(isWalkable(grid, position), "it never stepped into a desk");
  }
  assert.equal(walker.path.length, 0);
});

test("walking makes the jelly hop and lean, standing lets it settle", () => {
  const walker = createWalker({ x: 0, z: 0 });
  walk(walker, { x: 5, z: 0 }, 10, openFloor);
  const pose = calculateWalkPose(walker);
  assert.ok(pose.lean > 0);
  assert.ok(Math.abs(walker.yaw - Math.PI / 2) < 0.3, "it faces where it walks");
  walk(walker, { x: 5, z: 0 }, 120, openFloor);
  assert.ok(calculateWalkPose(walker).lean < 0.001);
});

test("a jelly on a snack run waits at the counter, then goes back to its desk", () => {
  const player = makePlayer({});
  const bar = findSnackBar(room);
  assert.ok(bar);
  const atBar = calculateGoal(player, contextAt(0, new Set([player.id])));
  assert.ok(atBar.z < bar.minZ && atBar.z > bar.minZ - 2, "it waits at the counter");
  const atDesk = calculateGoal(player, contextAt(0));
  assert.ok(measureDistance(atBar, atDesk) > 5);
});

test("a jelly on the stage stays on it", () => {
  const stage = room.find((area) => area.kind === "stage");
  assert.ok(stage);
  const player = makePlayer({ area_id: stage.id, home_x: 50, home_y: 5 });
  const rect = toFloorRect(stage);
  for (let time = 0; time < 300_000; time += 10_000) {
    const goal = calculateGoal(player, contextAt(time));
    assert.ok(goal.z > rect.minZ && goal.z < rect.maxZ, "it stands on the platform");
  }
});
