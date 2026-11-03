import assert from "node:assert/strict";
import { test } from "node:test";

import type { FloorRect } from "./world.ts";

import { createDemoRoom } from "./demoRoom.fixture.ts";
import { createNavGrid, isWalkable } from "./navigation.ts";
import { JELLY_RADIUS, ROOM, toFloorRect } from "./world.ts";
import {
  findFloorHeight,
  findSnackBar,
  findSnackSpot,
  listObstacleRects,
  listScreenRects,
  listStageRects,
  STAGE_HEIGHT,
} from "./zones.ts";

const room = createDemoRoom();
const grid = createNavGrid(ROOM, listObstacleRects(room), JELLY_RADIUS);
const stage = listStageRects(room)[0];
const lounge = room.find((area) => area.kind === "lounge");
const middleOf = (rect: FloorRect) => ({
  x: (rect.minX + rect.maxX) / 2,
  z: (rect.minZ + rect.maxZ) / 2,
});

test("desks, the counter and the beamers block the way, stage and lounge do not", () => {
  assert.ok(stage && lounge);
  const desks = room.filter((area) => area.kind === "desk").length;
  assert.equal(listObstacleRects(room).length, desks + 1 + 2);
  assert.ok(isWalkable(grid, middleOf(toFloorRect(lounge))));
  assert.ok(isWalkable(grid, { x: middleOf(stage).x, z: stage.maxZ - 1 }));
  for (const screen of listScreenRects(stage)) {
    assert.equal(isWalkable(grid, middleOf(screen)), false);
  }
});

test("the beamers stand on the back of the stage, left and right of the middle", () => {
  assert.ok(stage);
  const [left, right] = listScreenRects(stage);
  assert.ok(left && right);
  assert.ok(left.maxX < 0 && right.minX > 0);
  assert.ok(left.minZ > stage.minZ && left.maxZ < middleOf(stage).z);
});

test("the floor is raised on the stage only", () => {
  assert.ok(stage);
  const stages = listStageRects(room);
  assert.equal(findFloorHeight(middleOf(stage), stages), STAGE_HEIGHT);
  assert.equal(findFloorHeight({ x: 0, z: stage.maxZ + 1 }, stages), 0);
});

test("snack visitors wait behind the counter at a spot of their own", () => {
  const bar = findSnackBar(room);
  assert.ok(bar);
  const spots = [1, 2, 3].map((playerId) => findSnackSpot(bar, playerId));
  for (const spot of spots) {
    assert.ok(spot.z < bar.minZ && spot.x > bar.minX && spot.x < bar.maxX);
    assert.ok(isWalkable(grid, spot), "the spot keeps clear of the counter");
  }
  assert.notDeepEqual(spots[0], spots[1]);
  assert.deepEqual(findSnackSpot(bar, 1), spots[0]);
  assert.equal(findSnackBar([]), null);
});
