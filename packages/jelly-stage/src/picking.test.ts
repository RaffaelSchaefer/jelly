import assert from "node:assert/strict";
import { test } from "node:test";

import type { LabelAnchor } from "./labels.ts";
import type { StagePlayer } from "./types.ts";

import { pickJelly } from "./picking.ts";

const HEIGHT = 60;

/** A jelly with its feet at `x`, `y`, standing upright unless `headX` says otherwise. */
function anchorAt(id: number, x: number, y: number, headX = x): LabelAnchor {
  const player: StagePlayer = {
    id,
    name: `Jelly ${id}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: null,
    is_visitor: false,
    home_x: 0,
    home_y: 0,
  };
  return { player, x, y, headX, height: HEIGHT };
}

test("finds the jelly around its body from feet to head", () => {
  const anchors = [anchorAt(1, 100, 200)];
  assert.equal(pickJelly(anchors, { x: 100, y: 200 }, null), 1);
  assert.equal(pickJelly(anchors, { x: 100, y: 145 }, null), 1);
  assert.equal(pickJelly(anchors, { x: 125, y: 180 }, null), 1);
});

test("misses next to and above a jelly", () => {
  const anchors = [anchorAt(1, 100, 200)];
  assert.equal(pickJelly(anchors, { x: 140, y: 180 }, null), null);
  assert.equal(pickJelly(anchors, { x: 100, y: 130 }, null), null);
});

test("the nearest jelly wins where two overlap", () => {
  const backToFront = [anchorAt(1, 100, 200), anchorAt(2, 110, 205)];
  assert.equal(pickJelly(backToFront, { x: 105, y: 190 }, null), 2);
  assert.equal(pickJelly([...backToFront].reverse(), { x: 105, y: 190 }, null), 1);
});

test("clicks through the own jelly to the one behind it", () => {
  const backToFront = [anchorAt(1, 100, 200), anchorAt(2, 100, 205)];
  assert.equal(pickJelly(backToFront, { x: 100, y: 190 }, 2), 1);
  assert.equal(pickJelly([anchorAt(2, 100, 205)], { x: 100, y: 190 }, 2), null);
});

test("follows a jelly the lens tilts", () => {
  const tilted = [anchorAt(1, 100, 200, 160)];
  assert.equal(pickJelly(tilted, { x: 150, y: 170 }, null), 1);
  assert.equal(pickJelly([anchorAt(1, 100, 200)], { x: 150, y: 170 }, null), null);
});

test("keeps small jellies hittable", () => {
  const far = { ...anchorAt(1, 100, 200), height: 4 };
  assert.equal(pickJelly([far], { x: 106, y: 200 }, null), 1);
});

/**
 * A tower of five as the stack check page shows it at zoom 4, back to front: feet, head and height
 * in pixels. Each jelly sits on the head of the one below, its belly hangs 0.3 of its height lower.
 */
const TOWER: LabelAnchor[] = [
  [450, 450, 73],
  [451, 383, 75],
  [453, 313, 78],
  [456, 240, 80],
  [461, 164, 82],
].map(([x = 0, y = 0, height = 0], tier) => ({ ...anchorAt(tier + 1, x, y), height, tier }));

test("in a tower the face of a jelly belongs to it, not to the one sitting on its head", () => {
  assert.equal(pickJelly(TOWER, { x: 450, y: 430 }, null), 1);
  assert.equal(pickJelly(TOWER, { x: 450, y: 412 }, null), 1);
  assert.equal(pickJelly(TOWER, { x: 451, y: 340 }, null), 2);
});

test("in a tower the belly of a jelly covers the top of the head below", () => {
  assert.equal(pickJelly(TOWER, { x: 451, y: 395 }, null), 2);
  assert.equal(pickJelly(TOWER, { x: 461, y: 100 }, null), 5);
});

test("a perched jelly reaches no lower than its belly", () => {
  const alone = [{ ...anchorAt(2, 451, 383), height: 75, tier: 1 }];
  assert.equal(pickJelly(alone, { x: 451, y: 400 }, null), 2);
  assert.equal(pickJelly(alone, { x: 451, y: 410 }, null), null);
});

test("the own jelly is found inside a tower and picks go to the others around it", () => {
  // As `isOwnAt` in overlay.ts asks: is the own jelly the frontmost one at the point?
  assert.equal(pickJelly(TOWER, { x: 453, y: 290 }, null), 3);
  assert.equal(pickJelly(TOWER, { x: 451, y: 340 }, null), 2);
  assert.equal(pickJelly(TOWER, { x: 456, y: 220 }, 3), 4);
  assert.equal(pickJelly(TOWER, { x: 453, y: 290 }, 3), null);
});

test("a swaying tower is picked where its jellies are, not on its axis", () => {
  // The top two lean 20 and 34 pixels to the right, feet and head alike.
  const swaying = TOWER.map((anchor, tier) => {
    const shift = [0, 0, 8, 20, 34][tier] ?? 0;
    return { ...anchor, x: anchor.x + shift, headX: anchor.headX + shift };
  });
  assert.equal(pickJelly(swaying, { x: 461 + 34 + 30, y: 120 }, null), 5);
  assert.equal(pickJelly(swaying, { x: 461 - 30, y: 120 }, null), null);
});
