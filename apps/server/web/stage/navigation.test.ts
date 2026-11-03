import assert from "node:assert/strict";
import { test } from "node:test";

import type { FloorPoint } from "./world.ts";

import { createDemoRoom } from "./demoRoom.fixture.ts";
import {
  createNavGrid,
  findNearestWalkable,
  findPath,
  hasLineOfSight,
  isWalkable,
} from "./navigation.ts";
import { JELLY_RADIUS, measureDistance, ROOM, toFloorRect } from "./world.ts";
import { listObstacleRects } from "./zones.ts";

const room = createDemoRoom();
const desks = room.filter((area) => area.kind === "desk").map(toFloorRect);
// Groups, the lounge and the stage: everywhere jellies can belong.
const seats = room
  .filter((area) => area.kind === "seats" || area.kind === "lounge" || area.kind === "stage")
  .map(toFloorRect);
const grid = createNavGrid(ROOM, listObstacleRects(room), JELLY_RADIUS);
const middleOf = (rect: (typeof seats)[number]): FloorPoint => ({
  x: (rect.minX + rect.maxX) / 2,
  z: (rect.minZ + rect.maxZ) / 2,
});

/** Walks a path and fails when any piece of it crosses a blocked cell. */
function assertWalkable(from: FloorPoint, path: FloorPoint[]): void {
  let current = from;
  for (const waypoint of path) {
    assert.ok(hasLineOfSight(grid, current, waypoint), "a path piece crosses a desk");
    current = waypoint;
  }
}

test("desks block their surroundings, the seats in front of them stay free", () => {
  const firstSeats = seats[0];
  assert.ok(firstSeats);
  assert.ok(isWalkable(grid, middleOf(firstSeats)));
  const firstDesk = desks[0];
  assert.ok(firstDesk);
  assert.equal(isWalkable(grid, middleOf(firstDesk)), false);
  assert.equal(isWalkable(grid, { x: ROOM.maxX + 1, z: 0 }), false);
});

test("every group, the lounge and the stage reach each other around the desks", () => {
  for (const from of seats) {
    for (const to of seats) {
      const start = findNearestWalkable(grid, middleOf(from));
      const goal = findNearestWalkable(grid, middleOf(to));
      const path = findPath(grid, start, goal);
      const end = path.at(-1) ?? start;
      assert.ok(measureDistance(end, goal) < 1e-9, "the path must end at the goal");
      assertWalkable(start, path);
    }
  }
});

test("a straight line through a desk is blocked, the path goes around it", () => {
  // The first seats are behind the first desk rows, the third ones in the next aisle.
  const upper = middleOf(seats[0] ?? ROOM);
  const lower = middleOf(seats[4] ?? ROOM);
  assert.equal(hasLineOfSight(grid, upper, lower), false);
  const path = findPath(grid, upper, lower);
  assert.ok(path.length > 1);
  assertWalkable(upper, path);
});

test("a goal inside a desk moves to the nearest free spot", () => {
  const desk = desks[0];
  assert.ok(desk);
  const inside = middleOf(desk);
  const free = findNearestWalkable(grid, inside);
  assert.ok(isWalkable(grid, free));
  assert.ok(measureDistance(inside, free) < 2 * JELLY_RADIUS);
});

test("an unreachable goal ends the path at the closest reachable spot", () => {
  const box = { minX: -2, minZ: -2, maxX: 2, maxZ: 2 };
  const walls = [
    { minX: -3, minZ: -3, maxX: 3, maxZ: -2.5 },
    { minX: -3, minZ: 2.5, maxX: 3, maxZ: 3 },
    { minX: -3, minZ: -3, maxX: -2.5, maxZ: 3 },
    { minX: 2.5, minZ: -3, maxX: 3, maxZ: 3 },
  ];
  const closed = createNavGrid(ROOM, walls, 0.3);
  const path = findPath(closed, { x: 10, z: 0 }, middleOf(box));
  const end = path.at(-1);
  assert.ok(end && isWalkable(closed, end));
  assert.ok(end.x > 3, "it stops outside the walls");
});
