import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageMove, StagePlayer } from "./types.ts";

import { findLevels, findPositions, listHighlighted, pruneMoves } from "./moves.ts";
import { toFloorPoint } from "./world.ts";

function makePlayer(id: number): StagePlayer {
  return {
    id,
    name: `Jelly ${id}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow_player_id: null,
    follow_until: null,
    area_id: null,
    is_visitor: false,
    trip: null,
    home_x: 10,
    home_y: 20,
  };
}

const move: StageMove = {
  player_id: 1,
  kind: "stack",
  level: 2,
  start_at: 1000,
  points: [
    { x: 30, y: 30, t: 0 },
    { x: 40, y: 30, t: 1000 },
  ],
};

test("a jelly with a move plays it, one without stands at home", () => {
  const positions = findPositions([makePlayer(1), makePlayer(2)], new Map([[1, move]]), 3000);
  assert.deepEqual(positions.get(1), toFloorPoint({ x: 40, y: 30 }));
  assert.deepEqual(positions.get(2), toFloorPoint({ x: 10, y: 20 }));
});

test("a jelly reaches its height on a stack only when it arrives", () => {
  const moves = new Map([[1, move]]);
  assert.equal(findLevels(moves, 1500).get(1), 0);
  assert.equal(findLevels(moves, 2000).get(1), 2);
});

test("moves of jellies that left are forgotten", () => {
  const moves = new Map([
    [1, move],
    [9, { ...move, player_id: 9 }],
  ]);
  pruneMoves(moves, [makePlayer(1)]);
  assert.deepEqual([...moves.keys()], [1]);
});

test("all others light up, or only those near the own jelly, never the own", () => {
  const positions = new Map([
    [1, { x: 0, z: 0 }],
    [2, { x: 3, z: 4 }],
    [3, { x: 6, z: 8 }],
  ]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "others" })], [2, 3]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "near", reach: 5 })], [2]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "near", reach: 1 })], []);
});

test("without the own jelly on the stage nobody counts as near", () => {
  const positions = new Map([[2, { x: 0, z: 0 }]]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "near", reach: 5 })], []);
  assert.deepEqual([...listHighlighted(positions, null, { kind: "others" })], [2]);
});
