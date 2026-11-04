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
    cosmetic: null,
    level: 1,
    sign: null,
    follow_player_id: null,
    area_id: null,
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
