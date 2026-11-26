import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addCongaPose,
  calculateCongaBeat,
  calculateCongaPose,
  calculateCongaPulse,
  calculateLinkPresence,
  calculateSag,
  CONGA_BAR,
  CONGA_BEAT_MS,
  findCongaLines,
  gatherCongas,
  type CongaPlayer,
} from "./congaLines.ts";

const LATER = 60_000;

function makePlayer(id: number, targetId: number | null, endsAt = LATER): CongaPlayer {
  return { id, follow: targetId === null ? null : { player_id: targetId, ends_at: endsAt } };
}

test("two followers of one jelly make a line, one follower does not", () => {
  const pair = [makePlayer(1, null), makePlayer(2, 1)];
  assert.deepEqual(findCongaLines(pair, 0), []);
  const [line] = findCongaLines([...pair, makePlayer(3, 1)], 0);
  assert.deepEqual(line, {
    headId: 1,
    memberIds: [1, 2, 3],
    follows: [
      { followerId: 2, targetId: 1 },
      { followerId: 3, targetId: 1 },
    ],
  });
});

test("following a follower makes a line from front to back", () => {
  const [line] = findCongaLines([makePlayer(5, 9), makePlayer(9, 2), makePlayer(2, null)], 0);
  assert.equal(line?.headId, 2);
  assert.deepEqual(line?.memberIds, [2, 9, 5]);
});

test("a follow that ran out or points at a missing jelly does not count", () => {
  const players = [makePlayer(1, null), makePlayer(2, 1), makePlayer(3, 1, 1000)];
  assert.equal(findCongaLines(players, 999).length, 1);
  assert.deepEqual(findCongaLines(players, 1000), []);
  assert.deepEqual(findCongaLines([makePlayer(2, 1), makePlayer(3, 1)], 0), []);
});

test("a circle in a broken state ends instead of looping", () => {
  const players = [makePlayer(1, 2), makePlayer(2, 1), makePlayer(3, 1), makePlayer(4, null)];
  assert.deepEqual(findCongaLines(players, 0), []);
});

test("a link shows near its target and is gone across the hall", () => {
  assert.equal(calculateLinkPresence(1.8), 1);
  assert.equal(calculateLinkPresence(20), 0);
  const halfway = calculateLinkPresence(5.5);
  assert.ok(halfway > 0 && halfway < 1);
});

test("a follower still on its way has no link and nobody dances alone", () => {
  const lines = findCongaLines([makePlayer(1, null), makePlayer(2, 1), makePlayer(3, 1)], 0);
  const near = { x: 1.8, z: 0 };
  const positions = new Map([
    [1, { x: 0, z: 0 }],
    [2, near],
    [3, { x: 30, z: 0 }],
  ]);
  const frame = gatherCongas(lines, positions);
  assert.deepEqual(
    frame.links.map((link) => [link.followerId, link.rank, link.targetRank]),
    [[2, 1, 0]],
  );
  assert.deepEqual([...frame.dancers.keys()].sort(), [1, 2]);
  assert.equal(frame.dancers.get(1)?.rank, 0);
  const apart = gatherCongas(lines, new Map([...positions, [2, { x: -30, z: 0 }]]));
  assert.equal(apart.links.length, 0);
  assert.equal(apart.dancers.size, 0);
});

test("the dance rests on the beat, kicks on the last one and repeats every bar", () => {
  const head = { headId: 1, rank: 0, presence: 1 };
  assert.deepEqual(calculateCongaPose(head, 0), { lift: 0, turn: 0, tilt: 0 });
  const step = calculateCongaPose(head, 0.5 * CONGA_BEAT_MS);
  const kick = calculateCongaPose(head, (CONGA_BAR - 0.5) * CONGA_BEAT_MS);
  assert.ok(step.lift > 0 && step.turn === 0);
  assert.ok(kick.lift > 2 * step.lift && kick.turn !== 0);
  const nextBar = calculateCongaPose(head, (2 * CONGA_BAR - 0.5) * CONGA_BEAT_MS);
  assert.ok(Math.abs(nextBar.lift - kick.lift) < 1e-9);
});

test("the dance fades with the presence and waves down the line", () => {
  const time = 0.5 * CONGA_BEAT_MS;
  const gone = calculateCongaPose({ headId: 1, rank: 0, presence: 0 }, time);
  assert.equal(gone.lift, 0);
  const head = calculateCongaPose({ headId: 1, rank: 0, presence: 1 }, time);
  const second = calculateCongaPose({ headId: 1, rank: 1, presence: 1 }, time);
  assert.notEqual(head.lift, second.lift);
});

test("the dance comes on top of a pose and leaves it alone without a dancer", () => {
  const pose = { lift: 0.5, turn: 1, tilt: 0 };
  const time = (CONGA_BAR - 0.5) * CONGA_BEAT_MS;
  assert.equal(addCongaPose(pose, undefined, time), pose);
  const head = { headId: 1, rank: 0, presence: 1 };
  const step = calculateCongaPose(head, time);
  assert.deepEqual(addCongaPose(pose, head, time), {
    lift: 0.5 + step.lift,
    turn: 1 + step.turn,
    tilt: step.tilt,
  });
  assert.deepEqual(pose, { lift: 0.5, turn: 1, tilt: 0 });
});

test("the beat stays small and never runs backward into the negative", () => {
  const beat = calculateCongaBeat(1_800_000_000_000);
  assert.ok(beat >= 0 && beat < CONGA_BAR * 256);
  assert.ok(calculateCongaBeat(-250) >= 0);
});

test("the pulse flashes every other beat and runs toward the head of the line", () => {
  assert.equal(calculateCongaPulse(0, 0), 1);
  assert.ok(calculateCongaPulse(0, 1) < 0.5);
  assert.equal(calculateCongaPulse(0, 2), 1);
  // The jelly behind the head flashes half a beat before it.
  assert.equal(calculateCongaPulse(1, 1.5), 1);
  assert.ok(calculateCongaPulse(0, 1.5) < 0.5);
});

test("a garland sags with its length, up to a deepest point", () => {
  assert.ok(Math.abs(calculateSag(2) - 0.2) < 1e-9);
  assert.equal(calculateSag(40), 0.5);
});
