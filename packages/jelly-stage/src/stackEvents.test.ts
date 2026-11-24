import assert from "node:assert/strict";
import { test } from "node:test";

import type { EventPayload, StageEvent } from "./types.ts";

import { applyStackChange } from "./stackEvents.ts";

const tower = { id: 4, x: 10, y: 20, ends_at: 5000, member_ids: [1, 2, 5] };
const other = { id: 7, x: 50, y: 50, ends_at: 9000, member_ids: [3] };

function change(playerId: number | null, payload: EventPayload): StageEvent {
  return { id: 1, type: "stack.changed", player_id: playerId, payload, created_at: 0 };
}

test("a stack someone climbed replaces its older self", () => {
  const grown = { ...tower, member_ids: [1, 2, 5, 8] };
  assert.deepEqual(applyStackChange([tower, other], change(8, grown)), [other, grown]);
});

test("a new stack is added", () => {
  assert.deepEqual(applyStackChange([other], change(1, tower)), [other, tower]);
});

test("a jelly that climbs down leaves the rest standing", () => {
  const rest = { ...tower, member_ids: [1, 5] };
  assert.deepEqual(applyStackChange([tower, other], change(2, { id: 4 })), [other, rest]);
});

test("the last jelly climbing down ends the stack", () => {
  assert.deepEqual(applyStackChange([tower, other], change(3, { id: 7 })), [tower]);
});

test("a stack whose time is over is gone, whether the server names no player as null or 0", () => {
  assert.deepEqual(applyStackChange([tower, other], change(null, { id: 4 })), [other]);
  assert.deepEqual(applyStackChange([tower, other], change(0, { id: 4 })), [other]);
});
