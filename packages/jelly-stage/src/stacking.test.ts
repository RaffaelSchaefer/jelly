import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageMove, StageStack } from "./types.ts";

import { measureThrow } from "./fling.ts";
import { measureJump } from "./leaping.ts";
import {
  beginStacking,
  createStacking,
  STACK_STEP,
  stepPerch,
  type PerchPose,
} from "./stacking.ts";

const HEIGHT = 2;
const STEP = STACK_STEP * HEIGHT;
const FRAME = 1 / 60;
const START = 100_000;
const SPOT = { x: 0, z: 0 };

/** A stack move: it walks for `walkMs` and then sits on `level`. */
function stackMove(playerId: number, level: number, startAt: number, walkMs = 0): StageMove {
  return {
    player_id: playerId,
    kind: level > 0 || walkMs === 0 ? "stack" : "wander",
    start_at: startAt,
    stack_level: level,
    points: [
      { x: 50, y: 50, t: 0 },
      { x: 50, y: 50, t: walkMs },
    ],
  };
}

function stackOf(members: number[], endsAt = START + 120_000): StageStack {
  return { id: 7, x: 50, y: 50, ends_at: endsAt, member_ids: members };
}

/** A stage with a clock, playing frames of 1/60 s. */
function createStage(reducedMotion = false) {
  const stacking = createStacking(HEIGHT);
  const moves = new Map<number, StageMove>();
  let stacks: StageStack[] = [];
  let frame = 0;
  const poses = new Map<number, PerchPose | null>();
  const stage = {
    stacking,
    moves,
    poses,
    setStacks: (next: StageStack[]) => {
      stacks = next;
    },
    now: () => START + frame * FRAME * 1000,
    step: (ids: number[], positions = new Map<number, typeof SPOT>()) => {
      frame += 1;
      beginStacking(stacking, stacks, {
        time: frame * FRAME,
        serverTime: stage.now(),
        seconds: FRAME,
        reducedMotion,
      });
      for (const id of ids) {
        const pose = stepPerch(stacking, id, moves.get(id), positions.get(id) ?? SPOT);
        // Copied: the pose object is reused frame after frame.
        poses.set(id, pose && { ...pose });
      }
    },
  };
  return stage;
}

/** Builds a seated tower of `size` jellies with IDs from 1 on. */
function buildTower(size: number, reducedMotion = false) {
  const stage = createStage(reducedMotion);
  const ids = Array.from({ length: size }, (_, index) => index + 1);
  ids.forEach((id, level) => stage.moves.set(id, stackMove(id, level, START - 1000)));
  stage.setStacks([stackOf(ids)]);
  for (let frame = 0; frame < 60; frame++) stage.step(ids);
  return { stage, ids };
}

function riseOf(stage: { poses: Map<number, PerchPose | null> }, id: number): number {
  return stage.poses.get(id)?.rise ?? 0;
}

test("a jelly already sitting on a tower appears there without jumping", () => {
  const stage = createStage();
  stage.moves.set(1, stackMove(1, 0, START - 1000));
  stage.moves.set(2, stackMove(2, 1, START - 1000));
  stage.setStacks([stackOf([1, 2])]);
  stage.step([1, 2]);
  assert.ok(Math.abs(riseOf(stage, 2) - STEP) < 1e-9);
  assert.equal(stage.poses.get(2)?.tier, undefined, "a tower stands from the next frame on");
  stage.step([1, 2]);
  assert.equal(stage.poses.get(1)?.tier, 0);
  assert.equal(stage.poses.get(2)?.tier, 1);
});

test("jellies sit on each other, the lower ones squashed by the weight above", () => {
  const { stage } = buildTower(4);
  const stretches = [1, 2, 3, 4].map((id) => stage.poses.get(id)?.stretch ?? 1);
  assert.ok(stretches[0]! < stretches[1]! && stretches[1]! < stretches[2]!);
  assert.ok(Math.abs(stretches[3]! - 1) < 0.01, "nothing weighs on the top one");
  const seat = STEP * (stretches[0]! + stretches[1]!);
  assert.ok(Math.abs(riseOf(stage, 3) - seat) < 0.05, "each sits on the squashed ones below");
});

test("a climber jumps before its move arrives, peaks above the top and lands on it", () => {
  const { stage, ids } = buildTower(3);
  const arrival = stage.now() + 1500;
  stage.moves.set(4, stackMove(4, 3, stage.now(), 1500));
  stage.setStacks([stackOf([...ids, 4])]);
  let launchedAt = Infinity;
  let peak = 0;
  for (let frame = 0; frame < 150; frame++) {
    stage.step([...ids, 4]);
    if (riseOf(stage, 4) > 0 && launchedAt === Infinity) launchedAt = stage.now();
    peak = Math.max(peak, riseOf(stage, 4));
  }
  const seat = riseOf(stage, 3) + STEP * (stage.poses.get(3)?.stretch ?? 1);
  assert.ok(launchedAt < arrival - 300, "takes off on the way");
  assert.ok(peak > seat + 0.1 * HEIGHT, "jumps over the top");
  assert.ok(Math.abs(riseOf(stage, 4) - seat) < 0.05, "sits on top");
  assert.equal(stage.poses.get(4)?.tier, 3);
});

test("a landing squashes the tower from the top down", () => {
  const { stage, ids } = buildTower(3);
  stage.moves.set(4, stackMove(4, 3, stage.now(), 300));
  stage.setStacks([stackOf([...ids, 4])]);
  const firstSquash = new Map<number, number>();
  const rest = new Map(ids.map((id) => [id, stage.poses.get(id)?.stretch ?? 1]));
  for (let frame = 0; frame < 120; frame++) {
    stage.step([...ids, 4]);
    for (const id of ids) {
      const dent = (rest.get(id) ?? 1) - (stage.poses.get(id)?.stretch ?? 1);
      if (dent > 0.02 && !firstSquash.has(id)) firstSquash.set(id, frame);
    }
  }
  assert.ok(firstSquash.get(3)! < firstSquash.get(2)!, "first the one right below");
  assert.ok(firstSquash.get(2)! < firstSquash.get(1)!, "the bottom one last");
});

test("when one below leaves, the jellies above drop and bounce, it hops off", () => {
  const { stage } = buildTower(4);
  const before = riseOf(stage, 3);
  stage.moves.set(2, stackMove(2, 0, stage.now(), 2000));
  stage.moves.set(3, stackMove(3, 1, stage.now()));
  stage.moves.set(4, stackMove(4, 2, stage.now()));
  stage.setStacks([stackOf([1, 3, 4])]);
  const heights: number[] = [];
  let hop = 0;
  for (let frame = 0; frame < 90; frame++) {
    stage.step([1, 2, 3, 4]);
    heights.push(riseOf(stage, 3));
    hop = Math.max(hop, riseOf(stage, 2));
  }
  const lowest = Math.min(...heights);
  const after = heights.at(-1)!;
  assert.ok(after < before - 0.8 * STEP, "drops by a level");
  assert.ok(heights[3]! > after + 0.5 * STEP, "falls, does not snap");
  assert.ok(
    heights.some(
      (height, index) => index > 0 && height > heights[index - 1]! && height > lowest + 0.01,
    ),
    "bounces",
  );
  assert.ok(hop > STEP + 0.05, "the one that leaves hops up first");
  assert.ok(riseOf(stage, 2) < 0.01, "and lands on the floor");
});

test("a falling tower throws its upper jellies with a spin, the bottom one pops back", () => {
  const { stage, ids } = buildTower(4);
  ids.forEach((id) => stage.moves.set(id, stackMove(id, 0, stage.now(), 3000)));
  stage.setStacks([]);
  let spun = 0;
  let stretched = 1;
  let bottomThrown = 0;
  for (let frame = 0; frame < 180; frame++) {
    stage.step(ids, new Map(ids.map((id) => [id, { x: id * frame * 0.01, z: 0 }])));
    spun = Math.max(spun, Math.abs(stage.poses.get(3)?.spin ?? 0));
    stretched = Math.max(stretched, stage.poses.get(1)?.stretch ?? 1);
    bottomThrown = Math.max(bottomThrown, Math.abs(stage.poses.get(1)?.offsetX ?? 0));
  }
  assert.ok(spun > 1, "spins");
  assert.ok(stretched > 1.01, "the bottom one stretches past its shape");
  assert.equal(bottomThrown, 0);
  for (const id of ids) assert.equal(stage.poses.get(id), null, "back to plain jellies");
});

test("in a tall tower a landing on top does not shake the others off their seats", () => {
  const { stage, ids } = buildTower(10);
  stage.moves.set(11, stackMove(11, 10, stage.now(), 600));
  stage.setStacks([stackOf([...ids, 11])]);
  let loose = 0;
  for (let frame = 0; frame < 150; frame++) {
    stage.step([...ids, 11]);
    for (const id of ids) if (stage.stacking.perches.get(id)?.airborne) loose += 1;
  }
  assert.equal(loose, 0);
  assert.equal(stage.poses.get(11)?.tier, 10);
});

test("a stack that lists a jelly not on the stage keeps nothing for it", () => {
  const { stage, ids } = buildTower(3);
  stage.setStacks([stackOf([...ids, 99])]);
  stage.step(ids);
  stage.setStacks([]);
  for (let frame = 0; frame < 5; frame++) stage.step(ids);
  assert.equal(stage.stacking.perches.has(99), false);
});

test("a stack of one does not tumble when it ends", () => {
  const { stage } = buildTower(1);
  stage.moves.set(1, stackMove(1, 0, stage.now(), 3000));
  stage.setStacks([]);
  stage.step([1]);
  stage.step([1]);
  assert.equal(stage.poses.get(1), null);
});

test("a tower sways more at the top and gets nervous before it ends", () => {
  const measure = (endsAt: number) => {
    const stage = createStage();
    const ids = [1, 2, 3, 4];
    ids.forEach((id, level) => stage.moves.set(id, stackMove(id, level, START - 1000)));
    stage.setStacks([stackOf(ids, endsAt)]);
    const reach = new Map<number, number>();
    for (let frame = 0; frame < 600; frame++) {
      stage.step(ids);
      for (const id of ids) {
        reach.set(id, Math.max(reach.get(id) ?? 0, Math.abs(stage.poses.get(id)?.swayX ?? 0)));
      }
    }
    return reach;
  };
  const calm = measure(START + 120_000);
  assert.equal(calm.get(1), 0, "the bottom stands still");
  assert.ok(calm.get(2)! > 0 && calm.get(2)! < calm.get(4)!, "the higher, the further");
  const nervous = measure(START + 6000);
  assert.ok(nervous.get(4)! > 1.5 * calm.get(4)!, "sways wider when it is about to fall");
});

test("jellies up in a tower cast no shadow, the tower casts a larger one", () => {
  const { stage } = buildTower(3);
  assert.equal(stage.poses.get(2)?.shadow, 0);
  assert.ok(stage.poses.get(1)!.shadow > 1);
});

test("a jelly away from towers is left alone", () => {
  const stage = createStage();
  stage.moves.set(1, stackMove(1, 0, START, 2000));
  stage.step([1, 2]);
  assert.equal(stage.poses.get(1), null);
  assert.equal(stage.poses.get(2), null);
  assert.equal(stage.stacking.perches.size, 0);
});

test("with reduced motion a climber glides up after arriving and nothing sways", () => {
  const { stage, ids } = buildTower(3, true);
  stage.moves.set(4, stackMove(4, 3, stage.now(), 500));
  stage.setStacks([stackOf([...ids, 4])]);
  let early = 0;
  for (let frame = 0; frame < 29; frame++) {
    stage.step([...ids, 4]);
    early = Math.max(early, riseOf(stage, 4));
  }
  for (let frame = 0; frame < 120; frame++) stage.step([...ids, 4]);
  assert.equal(early, 0, "no jump on the way");
  assert.ok(Math.abs(riseOf(stage, 4) - 3 * STEP) < 0.01, "unsquashed steps");
  for (const id of [...ids, 4]) {
    const pose = stage.poses.get(id);
    assert.equal(pose?.swayX, 0);
    assert.equal(pose?.stretch, 1);
  }
});

test("a jump is planned to land when the move arrives", () => {
  assert.ok(measureJump(STEP, HEIGHT) > measureJump(0, HEIGHT));
  assert.ok(measureJump(4 * STEP, HEIGHT) < 2, "even onto a tall tower within two seconds");
});

test("a throw goes out fast, holds and comes back to the move", () => {
  assert.equal(measureThrow(0), 0);
  assert.ok(measureThrow(0.2) > 0.8);
  assert.equal(measureThrow(0.5), 1);
  assert.equal(measureThrow(5), 0);
});
