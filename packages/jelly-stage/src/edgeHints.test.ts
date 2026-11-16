import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageEffect } from "./effects.ts";
import type { LabelAnchor } from "./labels.ts";
import type { StagePlayer } from "./types.ts";

import { findEdgeHints, pickEdgeHint, type HintScene } from "./edgeHints.ts";

const SIZE = { width: 800, height: 600 };
const INSETS = { top: 40, bottom: 80 };
const NOW = 10_000;

/** A jelly whose body is around `x`, `y`. */
function anchorAt(id: number, x: number, y: number): LabelAnchor {
  const player: StagePlayer = {
    id,
    name: `Jelly ${id}`,
    color: "lilac",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: null,
    is_visitor: false,
    home_x: 0,
    home_y: 0,
  };
  return { player, x, y: y + 20, headX: x, height: 40 };
}

function emote(playerId: number, startedAt = NOW - 1000): StageEffect {
  return { playerId, startedAt, endsAt: NOW + 2000, kind: "bubble", glyph: "👋" };
}

function sceneWith(anchors: LabelAnchor[], effects: StageEffect[] = []): HintScene {
  return { anchors, effects, ownId: 1, size: SIZE, insets: INSETS, now: NOW };
}

test("only jellies outside the free view get a hint, the own one first", () => {
  const anchors = [anchorAt(1, -300, 280), anchorAt(2, 400, 300), anchorAt(3, 1200, 280)];
  const hints = findEdgeHints(sceneWith(anchors, [emote(2), emote(3)]));
  assert.deepEqual(
    hints.map((hint) => [hint.playerId, hint.glyph]),
    [
      [1, ""],
      [3, "👋"],
    ],
  );
  const [own, other] = hints;
  assert.ok(own && own.x < 40 && Math.abs(own.angle) > 3);
  assert.ok(other && other.x > 760 && Math.abs(other.angle) < 0.2);
});

test("a jelly behind the bar at the bottom counts as outside, hints stay above it", () => {
  const hints = findEdgeHints(sceneWith([anchorAt(1, 400, 560)]));
  assert.equal(hints.length, 1);
  assert.ok(hints[0] && hints[0].y <= SIZE.height - INSETS.bottom);
});

test("xp gets no hint, a new level does, and a click finds the hint", () => {
  const xp: StageEffect = {
    playerId: 4,
    startedAt: NOW - 100,
    endsAt: NOW + 1000,
    kind: "toast",
    text: "+5 XP",
    isReward: false,
  };
  const level: StageEffect = { ...xp, playerId: 5, text: "Level 3!", isReward: true };
  const anchors = [anchorAt(1, 400, 300), anchorAt(4, 400, -400), anchorAt(5, 1400, 300)];
  const hints = findEdgeHints(sceneWith(anchors, [xp, level]));
  assert.deepEqual(
    hints.map((hint) => hint.playerId),
    [5],
  );
  const [hint] = hints;
  assert.equal(pickEdgeHint(hints, { x: hint!.x + 3, y: hint!.y }), 5);
  assert.equal(pickEdgeHint(hints, { x: 400, y: 300 }), null);
});
