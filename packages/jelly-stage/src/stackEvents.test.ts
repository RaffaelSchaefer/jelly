import assert from "node:assert/strict";
import { test } from "node:test";

import { applyStackChange } from "./stackEvents.ts";

const tower = { id: 4, x: 10, y: 20, ends_at: 5000, member_ids: [1, 2] };
const other = { id: 7, x: 50, y: 50, ends_at: 9000, member_ids: [3] };

test("a changed stack replaces its older self", () => {
  const grown = { ...tower, member_ids: [1, 2, 5] };
  assert.deepEqual(applyStackChange([tower, other], grown), [other, grown]);
});

test("a new stack is added", () => {
  assert.deepEqual(applyStackChange([other], tower), [other, tower]);
});

test("a payload with only an ID removes the stack", () => {
  assert.deepEqual(applyStackChange([tower, other], { id: 4 }), [other]);
});
