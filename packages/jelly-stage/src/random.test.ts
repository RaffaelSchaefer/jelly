import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateRandomValue } from "./random.ts";

test("random values stay in range, repeat for the same input and differ for others", () => {
  const value = calculateRandomValue(5, 1);
  assert.ok(value >= 0 && value < 1);
  assert.equal(calculateRandomValue(5, 1), value);
  assert.notEqual(calculateRandomValue(6, 1), value);
  assert.notEqual(calculateRandomValue(5, 2), value);
});
