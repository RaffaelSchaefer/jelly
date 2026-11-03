import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateCameraDistance,
  remapIntoRect,
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

test("remapping keeps the relative spot and never leaves the target", () => {
  const from = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };
  const to = { minX: 1, minZ: 1, maxX: 9, maxZ: 9 };
  assert.deepEqual(remapIntoRect({ x: 5, z: 0 }, from, to), { x: 5, z: 1 });
  assert.deepEqual(remapIntoRect({ x: -3, z: 20 }, from, to), { x: 1, z: 9 });
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
