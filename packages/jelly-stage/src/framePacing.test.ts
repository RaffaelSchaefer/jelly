import assert from "node:assert/strict";
import { test } from "node:test";

import { createFramePacer, DEFAULT_FRAME_LIMIT, type FrameLimit } from "./framePacing.ts";

const SECONDS = 20;

/** Counts the frames per second of a limit on a screen with the given refresh rate. */
function measureRate(limit: FrameLimit | undefined, hertz: number): number {
  const pacer = limit === undefined ? createFramePacer() : createFramePacer(limit);
  let frames = 0;
  for (let refresh = 0; refresh < SECONDS * hertz; refresh++) {
    if (pacer.isDue((refresh * 1000) / hertz)) {
      frames++;
    }
  }
  return frames / SECONDS;
}

for (const hertz of [60, 120, 144, 165]) {
  for (const limit of [5, 15, 30, 45, 60, 120, 144].filter((rate) => rate <= hertz)) {
    test(`${limit} FPS hold on a ${hertz} Hz screen`, () => {
      const rate = measureRate(limit, hertz);
      assert.ok(Math.abs(rate - limit) <= limit * 0.02 + 0.1, `measured ${rate}`);
    });
  }

  test(`no limit draws every refresh of a ${hertz} Hz screen`, () => {
    assert.equal(measureRate(null, hertz), hertz);
  });

  test(`a limit above the screen draws every refresh of a ${hertz} Hz screen`, () => {
    assert.equal(measureRate(1000, hertz), hertz);
  });
}

test("without a wish the pacer runs at the default rate", () => {
  assert.equal(measureRate(undefined, 60), DEFAULT_FRAME_LIMIT);
});

test("frames missed by a stall are not made up for", () => {
  const pacer = createFramePacer(60);
  assert.equal(pacer.isDue(0), true);
  assert.equal(pacer.isDue(1000), true);
  assert.equal(pacer.isDue(1000 + 1000 / 120), false);
  assert.equal(pacer.isDue(1000 + 1000 / 60), true);
});

test("a new limit shows at the next refresh and then holds", () => {
  const pacer = createFramePacer(5);
  assert.equal(pacer.isDue(0), true);
  assert.equal(pacer.isDue(16), false);
  pacer.setLimit(60);
  assert.equal(pacer.isDue(17), true);
  pacer.setLimit(null);
  assert.equal(pacer.isDue(18), true);
  assert.equal(pacer.isDue(19), true);
});
