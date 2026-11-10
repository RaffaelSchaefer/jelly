import assert from "node:assert/strict";
import { test } from "node:test";

import { hasLanded, planFlight, poseAt } from "./flight.ts";

const ROOM_WIDTH = 40;
const NEAR = { factor: 3, focus: { x: 0, z: 0 } };

test("a flight starts at its first view, waits and lands at its goal", () => {
  const goal = { factor: 4, focus: { x: 2, z: 1 } };
  const flight = planFlight(NEAR, goal, ROOM_WIDTH, 0.5);
  assert.deepEqual(poseAt(flight), NEAR);
  flight.time = 0.4;
  assert.equal(hasLanded(flight), false);
  flight.time = flight.seconds;
  assert.ok(hasLanded(flight));
  const landed = poseAt(flight);
  assert.ok(Math.abs(landed.factor - 4) < 1e-9);
  assert.deepEqual(landed.focus, goal.focus);
});

test("a long way zooms out halfway and takes longer, a short one does not", () => {
  const short = planFlight(NEAR, { ...NEAR, focus: { x: 1, z: 0 } }, ROOM_WIDTH);
  const long = planFlight(NEAR, { ...NEAR, focus: { x: 30, z: 0 } }, ROOM_WIDTH);
  assert.equal(short.lift, 0);
  assert.ok(long.lift > 0);
  assert.ok(long.seconds > short.seconds);
  long.time = long.seconds / 2;
  assert.ok(poseAt(long).factor < NEAR.factor);
  assert.ok(poseAt(long).factor >= 1);
});
