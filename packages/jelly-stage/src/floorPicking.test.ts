import assert from "node:assert/strict";
import { test } from "node:test";
import { PerspectiveCamera, Vector3 } from "three";

import type { StagePoint } from "./types.ts";

import { pickFloor } from "./floorPicking.ts";
import { bendToLens, LENS_RANGE } from "./lens.ts";
import { toFloorPoint } from "./world.ts";

const size = { width: 1280, height: 720 };
const strength = LENS_RANGE.usual;
const view = { size, lensStrength: strength };
const room = { width: 21, depth: 40 };

/** A camera like the one of the stage: in front of the room and above it, its picture shifted. */
function createCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(30, size.width / size.height, 1, 300);
  camera.position.set(0, 60, 50);
  camera.lookAt(0, 0, 0);
  camera.setViewOffset(size.width, size.height, 0, 40, size.width, size.height);
  camera.updateMatrixWorld();
  return camera;
}

/** Where the camera shows a stage position, seen through the lens. */
function showOnScreen(camera: PerspectiveCamera, position: StagePoint) {
  const floor = toFloorPoint(position, room);
  const projected = new Vector3(floor.x, 0, floor.z).project(camera);
  const flat = {
    x: ((projected.x + 1) / 2) * size.width,
    y: ((1 - projected.y) / 2) * size.height,
  };
  return bendToLens(flat, size, strength);
}

test("a stage position on the screen picks itself again", () => {
  const camera = createCamera();
  for (const position of [
    { x: 50, y: 50 },
    { x: 12, y: 80 },
    { x: 90, y: 5 },
  ]) {
    const picked = pickFloor(camera, showOnScreen(camera, position), view, room);
    assert.ok(picked, JSON.stringify(position));
    assert.ok(Math.abs(picked.x - position.x) < 1e-6, JSON.stringify(picked));
    assert.ok(Math.abs(picked.y - position.y) < 1e-6, JSON.stringify(picked));
  }
});

test("the floor beyond the stage is no stage position", () => {
  const camera = createCamera();
  const beyond = showOnScreen(camera, { x: 130, y: 50 });
  assert.equal(pickFloor(camera, beyond, view, room), null);
});

test("above the horizon there is no floor to pick", () => {
  const camera = new PerspectiveCamera(30, size.width / size.height, 1, 300);
  camera.position.set(0, 5, 30);
  camera.lookAt(0, 5, 0);
  camera.updateMatrixWorld();
  assert.equal(pickFloor(camera, { x: 640, y: 10 }, { size, lensStrength: 0 }, room), null);
});
