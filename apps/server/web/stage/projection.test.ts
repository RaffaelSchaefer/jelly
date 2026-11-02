import assert from "node:assert/strict";
import { test } from "node:test";

import { moveToward, projectToScreen } from "./projection.ts";

const size = { width: 1000, height: 500 };

test("the center line stays centered at every depth", () => {
  assert.equal(projectToScreen({ x: 50, y: 0 }, size).x, 500);
  assert.equal(projectToScreen({ x: 50, y: 100 }, size).x, 500);
});

test("jellies in front are lower and larger than those in back", () => {
  const back = projectToScreen({ x: 50, y: 0 }, size);
  const front = projectToScreen({ x: 50, y: 100 }, size);
  assert.ok(front.y > back.y);
  assert.ok(front.scale > back.scale);
});

test("every stage point stays on the screen", () => {
  for (const point of [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
  ]) {
    const screen = projectToScreen(point, size);
    assert.ok(screen.x >= 0 && screen.x <= size.width, `x ${screen.x}`);
    assert.ok(screen.y >= 0 && screen.y <= size.height, `y ${screen.y}`);
  }
});

test("moving covers half the distance per step and arrives after a long pause", () => {
  assert.deepEqual(moveToward({ x: 0, y: 0 }, { x: 10, y: 20 }, 400), { x: 5, y: 10 });
  const late = moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 60_000);
  assert.ok(Math.abs(late.x - 10) < 0.001);
});
