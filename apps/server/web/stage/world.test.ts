import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateCameraDistance,
  calculateCanvasDensity,
  ROOM_DEPTH,
  ROOM_WIDTH,
  shrinkRect,
  toFloorPoint,
  toFloorRect,
} from "./world.ts";

test("the stage corners become the room corners, the back is far from the camera", () => {
  assert.deepEqual(toFloorPoint({ x: 0, y: 0 }), { x: -ROOM_WIDTH / 2, z: -ROOM_DEPTH / 2 });
  assert.deepEqual(toFloorPoint({ x: 100, y: 100 }), { x: ROOM_WIDTH / 2, z: ROOM_DEPTH / 2 });
  assert.deepEqual(toFloorPoint({ x: 50, y: 50 }), { x: 0, z: 0 });
});

test("an area becomes a rectangle on the floor", () => {
  const rect = toFloorRect({ id: 1, x: 0, y: 50, width: 50, height: 50, kind: "desk" });
  assert.deepEqual(rect, { minX: -ROOM_WIDTH / 2, minZ: 0, maxX: 0, maxZ: ROOM_DEPTH / 2 });
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
