import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageEffect } from "./effects.ts";
import type { StageStack } from "./types.ts";

import {
  calculatePulse,
  calculateRingScale,
  calculateSweepAngle,
  calculateUrgency,
  findLighthouses,
  measureReach,
  stepStackClocks,
  type StackClock,
} from "./stackMarks.ts";

const rect = { minX: -10, minZ: -20, maxX: 10, maxZ: 20 };

function makeStack(id: number, endsAt: number, memberIds = [1, 2]): StageStack {
  return { id, x: 50, y: 50, ends_at: endsAt, member_ids: memberIds };
}

function makeLight(playerId: number, startedAt = 0): StageEffect {
  return { kind: "spotlight", playerId, startedAt, endsAt: startedAt + 10_000, hue: 0.3 };
}

function step(clocks: Map<number, StackClock>, stacks: StageStack[], serverTime: number) {
  stepStackClocks(clocks, { stacks, serverTime, seconds: 0.1, reducedMotion: false });
}

test("a ring shows the share of the longest time seen", () => {
  const clocks = new Map<number, StackClock>();
  step(clocks, [makeStack(7, 120_000)], 0);
  assert.equal(clocks.get(7)?.share, 1);
  step(clocks, [makeStack(7, 120_000)], 90_000);
  assert.equal(clocks.get(7)?.share, 0.25);
});

test("a ring opened mid-stack starts full and a longer time fills it again", () => {
  const clocks = new Map<number, StackClock>();
  step(clocks, [makeStack(7, 60_000)], 30_000);
  assert.equal(clocks.get(7)?.share, 1);
  step(clocks, [makeStack(7, 60_000)], 45_000);
  assert.equal(clocks.get(7)?.share, 0.5);
  step(clocks, [makeStack(7, 165_000)], 45_000);
  assert.equal(clocks.get(7)?.share, 1);
});

test("a ring grows in, and fades with its share kept once the stack is gone", () => {
  const clocks = new Map<number, StackClock>();
  step(clocks, [makeStack(7, 100_000)], 0);
  const first = clocks.get(7)?.presence ?? 0;
  assert.ok(first > 0 && first < 1);
  step(clocks, [makeStack(7, 100_000)], 50_000);
  step(clocks, [], 51_000);
  const clock = clocks.get(7);
  assert.equal(clock?.isOver, true);
  assert.equal(clock?.share, 0.5);
  for (let frame = 0; frame < 100; frame += 1) step(clocks, [], 52_000);
  assert.equal(clocks.has(7), false);
});

test("a stack past its end counts as over even while it is still listed", () => {
  const clocks = new Map<number, StackClock>();
  step(clocks, [makeStack(7, 10_000)], 0);
  step(clocks, [makeStack(7, 10_000)], 10_000);
  assert.equal(clocks.get(7)?.isOver, true);
  step(clocks, [makeStack(8, 5_000)], 6_000);
  assert.equal(clocks.has(8), false);
});

test("reduced motion shows and hides rings at once and never pulses", () => {
  const clocks = new Map<number, StackClock>();
  const still = { seconds: 0.5, reducedMotion: true };
  stepStackClocks(clocks, { stacks: [makeStack(7, 5_000)], serverTime: 0, ...still });
  stepStackClocks(clocks, { stacks: [makeStack(7, 5_000)], serverTime: 1_000, ...still });
  const clock = clocks.get(7);
  assert.equal(clock?.presence, 1);
  assert.equal(clock?.pulsePhase, 0);
  stepStackClocks(clocks, { stacks: [], serverTime: 2_000, ...still });
  assert.equal(clocks.has(7), false);
});

test("urgency rises over the last ten seconds and only then the ring pulses", () => {
  assert.equal(calculateUrgency(30_000), 0);
  assert.equal(calculateUrgency(10_000), 0);
  assert.equal(calculateUrgency(5_000), 0.5);
  assert.equal(calculateUrgency(0), 1);
  const clocks = new Map<number, StackClock>();
  step(clocks, [makeStack(7, 60_000)], 0);
  step(clocks, [makeStack(7, 60_000)], 1_000);
  assert.equal(calculatePulse(clocks.get(7) as StackClock), 0);
  step(clocks, [makeStack(7, 60_000)], 55_000);
  step(clocks, [makeStack(7, 60_000)], 55_100);
  assert.ok(calculatePulse(clocks.get(7) as StackClock) > 0);
});

test("a ring starts small, ends at full size and bursts outward while it fades", () => {
  assert.equal(calculateRingScale({ presence: 0, isOver: false }), 0.55);
  assert.equal(calculateRingScale({ presence: 1, isOver: false }), 1);
  assert.ok(calculateRingScale({ presence: 0.5, isOver: false }) > 0.775);
  assert.equal(calculateRingScale({ presence: 1, isOver: true }), 1);
  assert.ok(calculateRingScale({ presence: 0.2, isOver: true }) > 1.2);
});

test("only a highlight on the top of a stack of two or more becomes a lighthouse", () => {
  const stacks = [makeStack(1, 9e9, [1, 2, 3]), makeStack(2, 9e9, [4])];
  const effects = [makeLight(3), makeLight(2), makeLight(4), makeLight(9)];
  assert.deepEqual(
    findLighthouses(effects, stacks).map((light) => light.playerId),
    [3],
  );
});

test("a lighthouse turns once in four seconds from where its highlight began", () => {
  const [light] = findLighthouses([makeLight(2, 1_000)], [makeStack(1, 9e9)]);
  assert.ok(light);
  assert.equal(calculateSweepAngle(light, 1_000), 0);
  assert.equal(calculateSweepAngle(light, 3_000), Math.PI);
});

test("the light falls its full way in the open and stops before a wall", () => {
  assert.equal(measureReach({ x: 0, z: 0 }, Math.PI / 2, rect, 9), 9);
  assert.equal(measureReach({ x: 0, z: 0 }, -Math.PI / 2, rect, 9), 9);
  assert.equal(measureReach({ x: 0, z: 0 }, 0, rect, 9), 7.5);
  assert.ok(Math.abs(measureReach({ x: 0, z: 0 }, Math.PI, rect, 9) - 7.5) < 1e-9);
  assert.equal(measureReach({ x: 5, z: 0 }, 0, rect, 9), 2.5);
  assert.equal(measureReach({ x: 0, z: 15 }, Math.PI / 2, rect, 9), 2.5);
  assert.equal(measureReach({ x: 9.5, z: 0 }, 0, rect, 9), 2);
});
