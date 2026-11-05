import assert from "node:assert/strict";
import { test } from "node:test";

import { bendToLens, LENS_RANGE, unbendFromLens } from "./lens.ts";

const size = { width: 1600, height: 900 };
const strength = LENS_RANGE.usual;
const near = (first: number, second: number) => Math.abs(first - second) < 1e-6;

test("middle and corners stay where they are", () => {
  for (const point of [
    { x: 800, y: 450 },
    { x: 0, y: 0 },
    { x: 1600, y: 900 },
    { x: 0, y: 900 },
  ]) {
    const bent = bendToLens(point, size, strength);
    assert.ok(near(bent.x, point.x) && near(bent.y, point.y), JSON.stringify(point));
  }
});

test("everything in between moves outward, more so near the middle", () => {
  const inner = bendToLens({ x: 900, y: 450 }, size, strength);
  const outer = bendToLens({ x: 1500, y: 450 }, size, strength);
  assert.ok(inner.x - 800 > 100, "the middle grows");
  assert.ok(outer.x > 1500 && outer.x < 1600, "the edge moves out, but less");
  assert.equal(inner.y, 450);
});

test("without strength the picture stays flat", () => {
  assert.deepEqual(bendToLens({ x: 123, y: 45 }, size, 0), { x: 123, y: 45 });
});

test("unbending undoes the bend, also in the middle and the corners", () => {
  for (const point of [
    { x: 300, y: 700 },
    { x: 800, y: 450 },
    { x: 1600, y: 0 },
  ]) {
    const back = unbendFromLens(bendToLens(point, size, strength), size, strength);
    assert.ok(near(back.x, point.x) && near(back.y, point.y), JSON.stringify(point));
  }
  assert.deepEqual(unbendFromLens({ x: 123, y: 45 }, size, 0), { x: 123, y: 45 });
});

test("the shader formula undoes the bend, so texts sit on their jellies", () => {
  const halfDiagonal = Math.hypot(size.width, size.height) / 2;
  const point = { x: 300, y: 700 };
  const bent = bendToLens(point, size, strength);
  // Same as shaders/lens.frag.glsl: from a point on screen back to the flat picture.
  const bentRadius = Math.hypot(bent.x - 800, bent.y - 450) / halfDiagonal;
  const flatRadius = Math.tan(strength * bentRadius) / Math.tan(strength);
  assert.ok(near(flatRadius, Math.hypot(point.x - 800, point.y - 450) / halfDiagonal));
});
