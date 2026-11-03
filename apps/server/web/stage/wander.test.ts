import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageArea, StagePlayer } from "./types.ts";

import {
  calculateFollowPoint,
  calculateRandomValue,
  calculateStagePoint,
  calculateWanderPoint,
} from "./wander.ts";

const area: StageArea = { id: 7, x: 20, y: 40, width: 30, height: 50 };

function makePlayer(id: number, changes: Partial<StagePlayer> = {}): StagePlayer {
  return {
    id,
    name: "Glibber",
    color: "mint",
    cosmetic: null,
    level: 1,
    sign: null,
    follow_player_id: null,
    area_id: area.id,
    home_x: area.x + area.width * 0.1,
    home_y: area.y + area.height * 0.9,
    ...changes,
  };
}

test("two screens with the same server time agree", () => {
  const player = makePlayer(12);
  assert.deepEqual(
    calculateWanderPoint(player, area, 5000),
    calculateWanderPoint(player, area, 5000),
  );
});

test("a jelly on the edge of its home range never leaves its area", () => {
  const player = makePlayer(3);
  for (let time = 0; time < 600_000; time += 1000) {
    const point = calculateWanderPoint(player, area, time);
    assert.ok(point.x >= area.x && point.x <= area.x + area.width, `x ${point.x} at ${time}`);
    assert.ok(point.y >= area.y && point.y <= area.y + area.height, `y ${point.y} at ${time}`);
  }
});

test("a jelly actually moves and jellies move differently", () => {
  const first = makePlayer(1);
  const second = makePlayer(2);
  assert.notDeepEqual(
    calculateWanderPoint(first, area, 0),
    calculateWanderPoint(first, area, 8000),
  );
  assert.notDeepEqual(calculateWanderPoint(first, area, 0), calculateWanderPoint(second, area, 0));
});

test("random values stay in range and differ between neighboring IDs", () => {
  const values = new Set<number>();
  for (let id = 1; id <= 200; id += 1) {
    const value = calculateRandomValue(id, 1);
    assert.ok(value >= 0 && value < 1);
    values.add(value);
  }
  assert.equal(values.size, 200);
});

test("a follower stands beside its target and inside the stage", () => {
  assert.deepEqual(calculateFollowPoint(2, { x: 50, y: 30 }), { x: 45, y: 30 });
  assert.deepEqual(calculateFollowPoint(3, { x: 50, y: 30 }), { x: 55, y: 30 });
  assert.deepEqual(calculateFollowPoint(3, { x: 99, y: 30 }), { x: 100, y: 30 });
});

test("two jellies following each other still get a position", () => {
  const first = makePlayer(1, { follow_player_id: 2 });
  const second = makePlayer(2, { follow_player_id: 1 });
  const lookup = {
    players: new Map([
      [1, first],
      [2, second],
    ]),
    areas: new Map([[area.id, area]]),
  };
  assert.ok(Number.isFinite(calculateStagePoint(first, lookup, 1000).x));
  assert.ok(Number.isFinite(calculateStagePoint(second, lookup, 1000).x));
});

test("a jelly following someone gone wanders by itself", () => {
  const player = makePlayer(1, { follow_player_id: 99 });
  const lookup = { players: new Map([[1, player]]), areas: new Map([[area.id, area]]) };
  assert.deepEqual(
    calculateStagePoint(player, lookup, 1000),
    calculateWanderPoint(player, area, 1000),
  );
});
