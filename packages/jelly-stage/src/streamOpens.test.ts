import assert from "node:assert/strict";
import { test } from "node:test";

import { createStreamOpenings } from "./streamOpens.ts";

test("the first opening does not read the state again", () => {
  const streamOpens = createStreamOpenings();
  assert.equal(streamOpens.record(), false);
});

test("every later opening reads the state again", () => {
  const streamOpens = createStreamOpenings();
  streamOpens.record();
  assert.equal(streamOpens.record(), true);
  assert.equal(streamOpens.record(), true);
});
