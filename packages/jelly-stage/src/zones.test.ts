import assert from "node:assert/strict";
import { test } from "node:test";

import type { FloorRect } from "./world.ts";

import { createDemoRoom, DEMO_HALL } from "./demoRoom.fixture.ts";
import { JELLY_WIDTH, measureRoom } from "./world.ts";
import {
  containsPoint,
  findFloorHeight,
  findPedestalRect,
  listPlatforms,
  listScreenRects,
  listSpeakerRects,
  placeArea,
  STAGE_HEIGHT,
  toLocalPoint,
  toLocalRect,
  toRoomPoint,
} from "./zones.ts";

/** The room the server measures in, so the desk below is 2 by 1 jelly units. */
const hall = { width: 21, depth: 40 };
const room = createDemoRoom();
const demoHall = measureRoom(DEMO_HALL);
const platform = listPlatforms(room, hall)[0];
const stage = platform && toLocalRect(platform);
const middleOf = (rect: FloorRect) => ({
  x: (rect.minX + rect.maxX) / 2,
  z: (rect.minZ + rect.maxZ) / 2,
});
/** A desk of 2 by 1 units in the middle of the room, turned by a quarter clockwise. */
const turnedDesk = placeArea(
  {
    id: 1,
    x: 45,
    y: 48.75,
    width: 10,
    height: 2.5,
    rotation: 90,
    kind: "none",
    blocks: true,
    prop: "desk",
    name: null,
  },
  hall,
);

test("every desk of the demo hall is two jellies wide and one jelly deep", () => {
  const desks = room.filter((area) => area.prop === "desk");
  assert.ok(desks.length > 0);
  for (const desk of desks.map((area) => placeArea(area, demoHall))) {
    assert.equal((desk.width / JELLY_WIDTH).toFixed(3), "2.000");
    assert.equal((desk.depth / JELLY_WIDTH).toFixed(3), "1.000");
  }
});

test("two rows of gaming desks leave the floor of three desks between them", () => {
  const seats = room.filter((area) => area.kind === "seats");
  assert.ok(seats.length > 0);
  // A desk is one jelly deep, and the seats of both rows make up the aisle.
  for (const seat of seats.map((area) => placeArea(area, demoHall))) {
    assert.equal(((2 * seat.depth) / JELLY_WIDTH).toFixed(3), "3.000");
  }
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
  assert.ok(platform && stage);
  const platforms = listPlatforms(room, hall);
  assert.equal(findFloorHeight(platform.middle, platforms), STAGE_HEIGHT);
  assert.equal(findFloorHeight({ x: 0, z: platform.middle.z + stage.maxZ + 1 }, platforms), 0);
});

test("a zone turns clockwise around its middle, in jelly units", () => {
  assert.deepEqual(turnedDesk.middle, { x: 0, z: 0 });
  assert.equal(turnedDesk.width.toFixed(3), "2.100");
  assert.equal(turnedDesk.depth.toFixed(3), "1.000");
  // At 90 degrees the front of the desk points left: its front edge, +z before the turn, lands at -x.
  const front = toRoomPoint({ x: 0, z: 0.5 }, turnedDesk);
  assert.equal(front.x.toFixed(3), "-0.500");
  assert.equal(Math.abs(front.z).toFixed(3), "0.000");
  const back = toLocalPoint(front, turnedDesk);
  assert.equal(back.x.toFixed(3), "0.000");
  assert.equal(back.z.toFixed(3), "0.500");
});

test("a turned zone contains the points under its turned shape", () => {
  // The long side now runs along z, so a point 0.9 along z is inside and 0.9 along x is not.
  assert.ok(containsPoint(turnedDesk, { x: 0, z: 0.9 }));
  assert.ok(!containsPoint(turnedDesk, { x: 0.9, z: 0 }));
  assert.ok(containsPoint(turnedDesk, { x: 0.49, z: 1.04 }));
  assert.ok(!containsPoint(turnedDesk, { x: 0.51, z: 0 }));
});
