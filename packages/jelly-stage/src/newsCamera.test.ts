import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aimFrom,
  blendPoses,
  easeInOut,
  projectNews,
  shakePose,
  standOff,
  type NewsPose,
} from "./newsCamera.ts";

const VIEW = { aspect: 16 / 9, top: 0.05, bottom: 0.9 };

function isNear(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not near ${expected}`);
}

test("a composed pose shows its aim where the look wants it", () => {
  const cases = [
    { position: { x: 3, y: 4, z: 9 }, aim: { x: -1, y: 1.2, z: -2 }, across: -0.3, down: 0.36 },
    { position: { x: -8, y: 12, z: 20 }, aim: { x: 2, y: 0, z: -5 }, across: 0.45, down: 0.5 },
    { position: { x: 0, y: 1, z: 6 }, aim: { x: 0, y: 3, z: 0 }, across: 0, down: 0.2 },
  ];
  for (const { position, aim, across, down } of cases) {
    const pose = aimFrom(position, aim, { fov: 24, across, down }, VIEW);
    const seen = projectNews(pose, aim, VIEW.aspect);
    const share = VIEW.top + down * (VIEW.bottom - VIEW.top);
    isNear(seen.x, across);
    isNear(seen.y, 1 - 2 * share);
    assert.ok(seen.depth > 0);
  }
});

test("a frame of a height fills the picture from top to bottom at its distance", () => {
  const distance = standOff(3, 30);
  const pose = aimFrom(
    { x: 0, y: 1, z: distance },
    { x: 0, y: 1, z: 0 },
    {
      fov: 30,
      across: 0,
      down: 0.5,
    },
    { aspect: 1, top: 0, bottom: 1 },
  );
  isNear(projectNews(pose, { x: 0, y: 2.5, z: 0 }, 1).y, 1);
  isNear(projectNews(pose, { x: 0, y: -0.5, z: 0 }, 1).y, -1);
});

test("a blend starts and ends exactly in its poses and eases without a jolt", () => {
  const from: NewsPose = {
    position: { x: 0, y: 40, z: 30 },
    target: { x: 0, y: 0, z: 0 },
    fov: 32,
    lift: -0.03,
  };
  const to: NewsPose = {
    position: { x: 1, y: 3, z: -5 },
    target: { x: 0, y: 2, z: -12 },
    fov: 24,
    lift: 0.14,
  };
  assert.equal(blendPoses(from, to, 0), from);
  assert.equal(blendPoses(from, to, 1), to);
  isNear(blendPoses(from, to, 0.5).fov, 28);
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
  isNear(easeInOut(0.5), 0.5);
  assert.ok(easeInOut(0.01) < 0.001 && easeInOut(0.99) > 0.999);
});

test("a shaken pose wanders a little, the same at the same time", () => {
  const pose: NewsPose = {
    position: { x: 1, y: 3, z: 5 },
    target: { x: 0, y: 1, z: 0 },
    fov: 20,
    lift: 0.1,
  };
  const reach = { position: 0.05, target: 0.07 };
  assert.deepEqual(shakePose(pose, 2.5, reach), shakePose(pose, 2.5, reach));
  for (let seconds = 0; seconds < 10; seconds += 0.37) {
    const shaken = shakePose(pose, seconds, reach);
    assert.ok(Math.abs(shaken.position.x - pose.position.x) <= reach.position);
    assert.ok(Math.abs(shaken.target.y - pose.target.y) <= reach.target);
  }
});
