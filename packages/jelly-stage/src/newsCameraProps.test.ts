import assert from "node:assert/strict";
import { test } from "node:test";

import { createDemoRoom, DEMO_HALL } from "./demoRoom.fixture.ts";
import { listBlocks } from "./newsCameraProps.ts";
import { measureRoom } from "./world.ts";
import { listPlatforms, placeArea } from "./zones.ts";

const ROOM = measureRoom(DEMO_HALL);
const AREAS = createDemoRoom();
const PLATFORMS = listPlatforms(AREAS, ROOM);

function findZone(prop: string) {
  const area = AREAS.find((candidate) => candidate.prop === prop);
  assert.ok(area, prop);
  return placeArea(area, ROOM);
}

test("desks, the rug and other low props are looked over, tall ones block the view", () => {
  const blocks = listBlocks(AREAS, ROOM, PLATFORMS);
  // Two screens, two speakers, the pedestal, the back of the lounge and the snack bar.
  assert.equal(blocks.length, 7);
  for (const block of blocks) assert.ok(block.top > 1.5, `${block.top}`);
});

test("the back of the lounge stands on the stage side of the lounge, across the rug", () => {
  const lounge = findZone("lounge-set");
  const blocks = listBlocks(AREAS, ROOM, PLATFORMS);
  const back = blocks.find((block) => block.top === 1.03 + 0.82);
  assert.ok(back);
  assert.ok(back.place.middle.z < lounge.middle.z - lounge.depth / 3, "not at the back");
  assert.ok(Math.abs(back.place.middle.x - lounge.middle.x) < 1e-9);
  assert.ok(back.place.width > lounge.width / 2);
  assert.ok(back.place.depth < lounge.depth / 4);
});

test("the snack bar blocks its whole zone, as tall as the machines on its counter", () => {
  const bar = findZone("snack-bar-set");
  const blocks = listBlocks(AREAS, ROOM, PLATFORMS);
  const block = blocks.find((candidate) => candidate.top === 1.1 + 0.8);
  assert.ok(block);
  assert.deepEqual(block.place, bar);
});

test("a turned zone turns its blocks with it", () => {
  const lounge = AREAS.find((area) => area.prop === "lounge-set");
  assert.ok(lounge);
  const turned = { ...lounge, rotation: 90 };
  const [back] = listBlocks([turned], ROOM, []);
  assert.ok(back);
  const zone = placeArea(turned, ROOM);
  assert.equal(back.place.turn, zone.turn);
  // Turned a quarter clockwise seen from above, the back of the lounge faces +x.
  assert.ok(back.place.middle.x > zone.middle.x + 1);
  assert.ok(Math.abs(back.place.middle.z - zone.middle.z) < 1e-9);
});
