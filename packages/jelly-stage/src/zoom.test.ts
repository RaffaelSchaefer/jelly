import assert from "node:assert/strict";
import { test } from "node:test";

import { PerspectiveCamera } from "three";

import { findFloor } from "./floorPicking.ts";
import {
  createZoom,
  limitFocus,
  measureBounds,
  panBetween,
  releasePan,
  stepZoom,
  zoomAt,
  type StageZoom,
  type ZoomStage,
} from "./zoom.ts";

const ROOM = { width: 40, depth: 30 };
const SIZE = { width: 800, height: 600 };
const FRAME = { seconds: 1 / 30, own: undefined, reducedMotion: false };
const JUMP = { ...FRAME, reducedMotion: true };

function createStage(): ZoomStage {
  const camera = new PerspectiveCamera(30, SIZE.width / SIZE.height, 1, 300);
  camera.position.set(0, 60, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return {
    camera,
    home: camera.position.clone(),
    room: ROOM,
    free: { width: 800, top: 0, bottom: 560 },
    findFloor: (point) => findFloor(camera, point, { size: SIZE, lensStrength: 0.55 }),
  };
}

function isNear(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not near ${expected}`);
}

/** Runs frames until the view rests. */
function settle(zoom: StageZoom, stage: ZoomStage, frames = 240) {
  for (let frame = 0; frame < frames; frame++) stepZoom(zoom, stage, FRAME);
}

test("the whole room leaves only its home as focus, a closer view keeps its edges inside", () => {
  const home = { x: 1, z: 2 };
  const wide = { left: 30, right: 30, back: 20, front: 20 };
  assert.deepEqual(limitFocus({ x: 12, z: 9 }, 1, { room: ROOM, home, reach: wide }), home);
  const near = { left: 5, right: 5, back: 3, front: 3 };
  const bounds = { room: ROOM, home: { x: 0, z: 0 }, reach: near };
  assert.deepEqual(limitFocus({ x: 99, z: -99 }, 2, bounds), { x: 10, z: -7.5 });
  const broad = { ...bounds, reach: { ...near, left: 18, right: 18 } };
  assert.deepEqual(limitFocus({ x: 99, z: -99 }, 2, broad), { x: 2, z: -7.5 });
  // Wider than the room: the whole width stays in view.
  const wider = { ...bounds, reach: { ...near, left: 25, right: 25 } };
  assert.deepEqual(limitFocus({ x: 99, z: -99 }, 2, wider), { x: 5, z: -7.5 });
});

test("the zoom eases toward its goal and keeps the floor under the pointer", () => {
  const stage = createStage();
  const zoom: StageZoom = { ...createZoom(), followsOwn: false };
  stepZoom(zoom, stage, FRAME);
  const at = { x: 500, y: 350 };
  const before = stage.findFloor(at)!;
  zoomAt(zoom, stage, 3, at);
  stepZoom(zoom, stage, FRAME);
  assert.ok(zoom.factor > 1 && zoom.factor < 3);
  settle(zoom, stage);
  const after = stage.findFloor(at)!;
  assert.equal(zoom.factor, 3);
  assert.equal(zoom.anchor, null);
  isNear(after.x, before.x, 1e-3);
  isNear(after.z, before.z, 1e-3);
});

test("zoom stays in its range and zooming out ends at the fitted camera", () => {
  const stage = createStage();
  const zoom = createZoom();
  zoomAt(zoom, stage, 100);
  stepZoom(zoom, stage, JUMP);
  assert.equal(zoom.factor, 6);
  zoom.focus = { x: 5, z: 5 };
  zoomAt(zoom, stage, 0.001);
  stepZoom(zoom, stage, JUMP);
  assert.equal(zoom.factor, 1);
  isNear(stage.camera.position.x, stage.home.x);
  isNear(stage.camera.position.z, stage.home.z);
});

test("a followed own jelly sits under the middle of the free view", () => {
  const stage = createStage();
  const zoom = createZoom();
  zoomAt(zoom, stage, 3);
  stepZoom(zoom, stage, { ...JUMP, own: { x: 4, z: -3 } });
  const middle = stage.findFloor({ x: 400, y: 280 })!;
  isNear(middle.x, 4, 1e-3);
  isNear(middle.z, -3, 1e-3);
});

test("a drag moves the grabbed floor, gives at the edge and springs back after the release", () => {
  const stage = createStage();
  const zoom = createZoom();
  zoomAt(zoom, stage, 3);
  stepZoom(zoom, stage, JUMP);
  const grabbed = stage.findFloor({ x: 400, y: 300 })!;
  panBetween(zoom, stage, { from: { x: 400, y: 300 }, to: { x: 380, y: 310 }, at: 0 });
  const moved = stage.findFloor({ x: 380, y: 310 })!;
  assert.equal(zoom.followsOwn, false);
  isNear(moved.x, grabbed.x, 1e-3);
  isNear(moved.z, grabbed.z, 1e-3);
  for (let step = 1; step <= 40; step++) {
    panBetween(zoom, stage, { from: { x: 380, y: 310 }, to: { x: 780, y: 310 }, at: step * 16 });
  }
  const bounds = measureBounds(stage, 3);
  const edge = limitFocus({ x: -999, z: zoom.focus.z }, 3, bounds).x;
  assert.ok(zoom.focus.x < edge, "the view goes a little beyond the edge");
  assert.ok(zoom.focus.x > edge - ROOM.width / 3, "but not far");
  releasePan(zoom, ROOM, 40 * 16, false);
  settle(zoom, stage);
  isNear(zoom.focus.x, limitFocus(zoom.focus, 3, measureBounds(stage, 3)).x, 0.02);
});

test("a fast release keeps swinging, a resting one stops", () => {
  const stage = createStage();
  const zoom = createZoom();
  zoomAt(zoom, stage, 4);
  stepZoom(zoom, stage, JUMP);
  panBetween(zoom, stage, { from: { x: 400, y: 300 }, to: { x: 390, y: 300 }, at: 0 });
  panBetween(zoom, stage, { from: { x: 390, y: 300 }, to: { x: 380, y: 300 }, at: 16 });
  releasePan(zoom, ROOM, 20, false);
  const released = zoom.focus.x;
  stepZoom(zoom, stage, FRAME);
  assert.ok(zoom.focus.x > released, "the view slides on");
  panBetween(zoom, stage, { from: { x: 400, y: 300 }, to: { x: 390, y: 300 }, at: 1000 });
  releasePan(zoom, ROOM, 1500, false);
  assert.deepEqual(zoom.glide, { x: 0, z: 0 });
});
