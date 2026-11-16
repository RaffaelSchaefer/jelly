import assert from "node:assert/strict";
import { test } from "node:test";

import type { RoomMeters } from "./world.ts";

import {
  calculateCameraDistance,
  calculateCanvasDensity,
  DEFAULT_ROOM,
  fromFloorPoint,
  isOnStage,
  JELLY_WIDTH,
  measureRoom,
  measureServerDistance,
  shrinkRect,
  toFloorPoint,
  toFloorRect,
  toRoomRect,
} from "./world.ts";

/** A hall wider than deep, like the lecture hall. */
const room = { width: 80, depth: 50 };

test("the lecture hall fits 44 jellies side by side, whatever a jelly measures", () => {
  const hall = measureRoom({ width_m: 22, depth_m: 16.1, jelly_m: 0.5 });
  assert.equal((hall.width / JELLY_WIDTH).toFixed(3), "44.000");
  assert.equal((hall.depth / JELLY_WIDTH).toFixed(3), "32.200");
  const twice = measureRoom({ width_m: 44, depth_m: 32.2, jelly_m: 1 });
  assert.equal(twice.width.toFixed(3), hall.width.toFixed(3));
  assert.equal(twice.depth.toFixed(3), hall.depth.toFixed(3));
});

test("a server without meters shows the lecture hall", () => {
  assert.deepEqual(measureRoom({} as RoomMeters), DEFAULT_ROOM);
  assert.deepEqual(measureRoom({ width_m: 22, depth_m: 16.1, jelly_m: 0 }), DEFAULT_ROOM);
  assert.equal(DEFAULT_ROOM.width.toFixed(3), "74.800");
});

test("the stage corners become the room corners, the back is far from the camera", () => {
  const rect = toRoomRect(room);
  assert.deepEqual(toFloorPoint({ x: 0, y: 0 }, room), { x: rect.minX, z: rect.minZ });
  assert.deepEqual(toFloorPoint({ x: 100, y: 100 }, room), { x: rect.maxX, z: rect.maxZ });
  assert.deepEqual(toFloorPoint({ x: 50, y: 50 }, room), { x: 0, z: 0 });
  assert.deepEqual(rect, { minX: -40, minZ: -25, maxX: 40, maxZ: 25 });
});

test("a floor point goes back to its stage position", () => {
  for (const position of [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 25, y: 75 },
  ]) {
    assert.deepEqual(fromFloorPoint(toFloorPoint(position, room), room), position);
  }
});

test("distances count as the server measures them, in its room of 21 by 40", () => {
  const twiceServer = { width: 42, depth: 80 };
  assert.equal(measureServerDistance({ x: 0, z: 0 }, { x: 6, z: 8 }, twiceServer), 5);
});

test("the stage ends at 0 and 100 percent", () => {
  assert.ok(isOnStage({ x: 0, y: 100 }));
  assert.ok(!isOnStage({ x: -0.1, y: 50 }));
  assert.ok(!isOnStage({ x: 50, y: 100.1 }));
});

test("an area becomes a rectangle on the floor", () => {
  const rect = toFloorRect({ x: 0, y: 50, width: 50, height: 50 }, room);
  assert.deepEqual(rect, { minX: -40, minZ: 0, maxX: 0, maxZ: 25 });
});

test("shrinking keeps a margin and collapses short sides to their middle", () => {
  const rect = { minX: 0, minZ: 0, maxX: 10, maxZ: 1 };
  assert.deepEqual(shrinkRect(rect, 0.8), { minX: 0.8, minZ: 0.5, maxX: 9.2, maxZ: 0.5 });
});

test("the camera stands far enough away to see every point", () => {
  const view = { fov: Math.PI / 6, pitch: Math.PI / 4, aspect: 16 / 9, margin: 1 };
  const target = { x: 0, y: 0, z: 0 };
  const points = [
    { x: -20, y: 0, z: -15 },
    { x: 20, y: 0, z: 15 },
    { x: 20, y: 3, z: -15 },
  ];
  const distance = calculateCameraDistance(points, target, view);
  const sin = Math.sin(view.pitch);
  const cos = Math.cos(view.pitch);
  const tanVertical = Math.tan(view.fov / 2);
  let touchesEdge = false;
  for (const point of points) {
    const depth = distance - point.y * sin - point.z * cos;
    const up = point.y * cos - point.z * sin;
    assert.ok(Math.abs(point.x) <= tanVertical * view.aspect * depth + 1e-9);
    assert.ok(Math.abs(up) <= tanVertical * depth + 1e-9);
    touchesEdge ||= Math.abs(Math.abs(up) - tanVertical * depth) < 1e-6;
    touchesEdge ||= Math.abs(Math.abs(point.x) - tanVertical * view.aspect * depth) < 1e-6;
  }
  assert.ok(touchesEdge, "the fit is tight");
});

test("the canvas doubles the screen pixels up to about 4K, never below the screen", () => {
  assert.equal(calculateCanvasDensity({ width: 1920, height: 1080 }, 1), 2);
  assert.equal(calculateCanvasDensity({ width: 2560, height: 1440 }, 1), 1.5);
  assert.equal(calculateCanvasDensity({ width: 3840, height: 2160 }, 1), 1);
  assert.equal(calculateCanvasDensity({ width: 1920, height: 1080 }, 2), 2);
  assert.equal(calculateCanvasDensity({ width: 0, height: 0 }, 1), 2);
});

test("without supersampling the canvas has exactly the pixels of the screen", () => {
  assert.equal(calculateCanvasDensity({ width: 1920, height: 1080 }, 1, 1), 1);
  assert.equal(calculateCanvasDensity({ width: 960, height: 800 }, 2, 1), 2);
});
