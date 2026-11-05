import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageMove } from "./types.ts";

import {
  calculateWalkPose,
  createWalker,
  findMovePosition,
  findSnackRunners,
  findStackLevel,
  isOnTheWay,
  keepNewerMove,
  stepWalker,
} from "./walking.ts";
import { toFloorPoint } from "./world.ts";

const move: StageMove = {
  player_id: 5,
  kind: "wander",
  level: 0,
  start_at: 1000,
  points: [
    { x: 10, y: 10, t: 0 },
    { x: 20, y: 10, t: 1000 },
    { x: 20, y: 30, t: 3000 },
  ],
};
const viewer = { x: 0, z: 40 };

test("a jelly waits at the start of a move and stands at its end afterwards", () => {
  assert.deepEqual(findMovePosition(move, 0), toFloorPoint({ x: 10, y: 10 }));
  assert.deepEqual(findMovePosition(move, 10_000), toFloorPoint({ x: 20, y: 30 }));
});

test("between two waypoints a jelly is on the line between them", () => {
  assert.deepEqual(findMovePosition(move, 1500), toFloorPoint({ x: 15, y: 10 }));
  assert.deepEqual(findMovePosition(move, 3000), toFloorPoint({ x: 20, y: 20 }));
});

test("a move with a single point means standing", () => {
  const standing = { ...move, points: [{ x: 40, y: 40, t: 0 }] };
  assert.deepEqual(findMovePosition(standing, 5000), toFloorPoint({ x: 40, y: 40 }));
});

test("an older move does not replace a newer one", () => {
  const moves = new Map<number, StageMove>();
  keepNewerMove(moves, move);
  keepNewerMove(moves, { ...move, start_at: 500, kind: "trip" });
  assert.equal(moves.get(5)?.kind, "wander");
  keepNewerMove(moves, { ...move, start_at: 2000, kind: "follow" });
  assert.equal(moves.get(5)?.kind, "follow");
});

test("only jellies on a snack run carry a snack", () => {
  const moves = new Map<number, StageMove>([
    [5, move],
    [6, { ...move, player_id: 6, kind: "snack" }],
  ]);
  assert.deepEqual([...findSnackRunners(moves)], [6]);
});

test("a walking jelly looks where it goes and hops, a standing one looks at the camera", () => {
  const walker = createWalker({ x: 0, z: 0 });
  for (let frame = 1; frame <= 60; frame++) {
    stepWalker(walker, { target: { x: frame * 0.05, z: 0 }, viewer, seconds: 1 / 30 });
  }
  assert.ok(Math.abs(walker.yaw - Math.PI / 2) < 0.01, "looks along +x");
  assert.ok(walker.gait > 0.9);
  assert.ok(walker.stride > 1);
  assert.ok(calculateWalkPose(walker).lean > 0);
  const standing = walker.position;
  for (let frame = 0; frame < 120; frame++) {
    stepWalker(walker, { target: standing, viewer, seconds: 1 / 30 });
  }
  assert.ok(walker.gait < 0.01);
  assert.ok(Math.abs(calculateWalkPose(walker).lift) < 0.01);
  const toViewer = Math.atan2(viewer.x - standing.x, viewer.z - standing.z);
  assert.ok(Math.abs(walker.yaw - toViewer) < 0.01, "looks at the camera");
});

test("a jelly climbs its stack only after it has arrived", () => {
  const climbing = { ...move, kind: "stack", level: 2 };
  assert.equal(findStackLevel(climbing, 2000), 0);
  assert.equal(findStackLevel(climbing, 4000), 2);
});

test("a jelly is on its way until its trip to the goal has ended", () => {
  const trip = { ...move, kind: "trip" };
  const goal = toFloorPoint({ x: 20, y: 30 });
  assert.equal(isOnTheWay(trip, goal, 3999), true);
  assert.equal(isOnTheWay(trip, goal, 4000), false);
});

test("a move from before the click does not count as arrival", () => {
  const goal = toFloorPoint({ x: 90, y: 90 });
  assert.equal(isOnTheWay(undefined, goal, 9000), true);
  assert.equal(isOnTheWay(move, toFloorPoint({ x: 20, y: 30 }), 9000), true);
  assert.equal(isOnTheWay({ ...move, kind: "trip" }, goal, 9000), true);
});
