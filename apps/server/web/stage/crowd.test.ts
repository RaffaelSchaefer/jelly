import assert from "node:assert/strict";
import { test } from "node:test";

import { spreadGoals } from "./crowd.ts";
import { createNavGrid, isWalkable } from "./navigation.ts";
import { JELLY_RADIUS, measureDistance, ROOM } from "./world.ts";

const openFloor = createNavGrid(ROOM, [], JELLY_RADIUS);

test("jellies on one spot spread out until each keeps its distance", () => {
  const crowd = Array.from({ length: 6 }, () => ({ x: 0, z: 0 }));
  const spread = spreadGoals(crowd, openFloor);
  for (let first = 0; first < spread.length; first++) {
    for (let second = first + 1; second < spread.length; second++) {
      assert.ok(measureDistance(spread[first]!, spread[second]!) > 1, `${first} and ${second}`);
    }
  }
});

test("spreading is the same on every screen and leaves lonely jellies alone", () => {
  const goals = [
    { x: 0, z: 0 },
    { x: 0.4, z: 0.1 },
    { x: 10, z: 5 },
  ];
  assert.deepEqual(spreadGoals(goals, openFloor), spreadGoals(goals, openFloor));
  const lonely = spreadGoals(goals, openFloor)[2];
  assert.ok(lonely && measureDistance(lonely, { x: 10, z: 5 }) < 0.01);
});

test("nobody is pushed into a desk", () => {
  const desk = { minX: -5, minZ: 0.5, maxX: 5, maxZ: 2 };
  const grid = createNavGrid(ROOM, [desk], JELLY_RADIUS);
  const spread = spreadGoals(
    [
      { x: 0, z: -0.4 },
      { x: 0, z: -0.5 },
    ],
    grid,
  );
  for (const goal of spread) assert.ok(isWalkable(grid, goal));
});

test("a push into a desk slides along the desk instead", () => {
  const desk = { minX: -5, minZ: 0.5, maxX: 5, maxZ: 2 };
  const grid = createNavGrid(ROOM, [desk], JELLY_RADIUS);
  const spread = spreadGoals(
    [
      { x: 0, z: -0.4 },
      { x: 0.1, z: -0.5 },
    ],
    grid,
  );
  const [one, other] = spread;
  assert.ok(one && other && measureDistance(one, other) > 1.5);
  for (const goal of spread) assert.ok(isWalkable(grid, goal));
});
