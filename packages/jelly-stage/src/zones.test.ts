import assert from "node:assert/strict";
import { test } from "node:test";

import type { FloorRect } from "./world.ts";

import { createDemoRoom } from "./demoRoom.fixture.ts";
import {
  findFloorHeight,
  findPedestalRect,
  listScreenRects,
  listSpeakerRects,
  listStageRects,
  STAGE_HEIGHT,
} from "./zones.ts";

const room = createDemoRoom();
const stage = listStageRects(room)[0];
const middleOf = (rect: FloorRect) => ({
  x: (rect.minX + rect.maxX) / 2,
  z: (rect.minZ + rect.maxZ) / 2,
});

test("speakers stand in the back corners and the trophy between the beamers", () => {
  assert.ok(stage);
  const [left, right] = listSpeakerRects(stage);
  const [leftScreen, rightScreen] = listScreenRects(stage);
  const pedestal = findPedestalRect(stage);
  assert.ok(left && right && leftScreen && rightScreen);
  assert.ok(left.minX > stage.minX && left.maxX < leftScreen.minX);
  assert.ok(right.maxX < stage.maxX && right.minX > rightScreen.maxX);
  assert.ok(pedestal.minX > leftScreen.maxX && pedestal.maxX < rightScreen.minX);
  for (const prop of [left, right, pedestal]) {
    assert.ok(prop.minZ > stage.minZ && prop.maxZ < middleOf(stage).z);
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
