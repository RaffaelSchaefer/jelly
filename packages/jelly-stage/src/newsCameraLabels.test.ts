import assert from "node:assert/strict";
import { test } from "node:test";

import type { LabelAnchor } from "./labels.ts";
import type { StagePlayer } from "./types.ts";

import { frameAnchors } from "./newsCameraLabels.ts";

const SIZE = { width: 1000, height: 600 };

function anchorAt(id: number, x: number, y: number, height: number): LabelAnchor {
  const player = { id, name: `Jelly ${id}`, level: 1, color: "mint" } as StagePlayer;
  return { player, x, y, headX: x, height };
}

test("jellies outside the picture lose their texts, close ones get capped texts", () => {
  const far = anchorAt(1, 300, 200, 40);
  const outside = anchorAt(2, -200, 300, 80);
  const close = anchorAt(3, 700, 900, 700);
  const framed = frameAnchors([far, outside, close], SIZE);
  assert.deepEqual(
    framed.map((anchor) => anchor.player.id),
    [1, 3],
  );
  assert.equal(framed[0]?.textHeight, 40);
  assert.equal(framed[1]?.textHeight, 90);
});

test("a jelly whose name a nearer one covers is muted, the nearer one is not", () => {
  const behind = anchorAt(1, 500, 300, 60);
  const front = anchorAt(2, 505, 420, 200);
  const aside = anchorAt(3, 850, 300, 60);
  const framed = frameAnchors([behind, aside, front], SIZE);
  assert.deepEqual(
    framed.map((anchor) => anchor.muted),
    [true, false, false],
  );
});
