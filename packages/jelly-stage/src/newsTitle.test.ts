import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { NewsMoment } from "./news.ts";

import { findShowPhase, measureBumper, measureSweeps } from "./newsBarTiming.ts";
import {
  fitTitle,
  listTitlePoints,
  placePlates,
  TITLE_AIM,
  TITLE_FIELD,
  TITLE_LAYOUT,
  TITLE_MODEL,
  type TitlePoint,
} from "./newsTitleLayout.ts";
import { findLanded, poseTitle, type TitlePose } from "./newsTitleMotion.ts";

/** The shortest opening a show can have, the usual ones and the longest. */
const OPENINGS = [3600, 5000, 7500, 10_000];

function makeIntro(length: number): NewsMoment {
  return {
    beat: { kind: "intro" },
    index: 0,
    run: 1,
    progress: 0,
    startedAt: 50_000,
    endsAt: 50_000 + length,
  };
}

/**
 * Every number of a pose in one list, to watch them move. The light round a ring runs in circles,
 * its place counts in turns and wraps from 1 to 0 without a jump on screen.
 */
function flatten(pose: TitlePose): number[] {
  const part = ({ at, turn, scale }: { at: TitlePoint; turn: TitlePoint; scale: number }) => [
    at.x,
    at.y,
    at.z,
    turn.x,
    turn.y,
    turn.z,
    scale,
  ];
  const turns = (share: number) => [Math.cos(2 * Math.PI * share), Math.sin(2 * Math.PI * share)];
  return [
    ...part(pose.globe),
    pose.globe.spin,
    ...pose.rings.flatMap((ring) => [...part(ring), ...turns(ring.streak)]),
    ...pose.plates.flatMap(part),
    ...pose.sparkles,
    pose.dolly,
    pose.halo.strength,
    pose.halo.turn,
    pose.tagline,
  ];
}

function isNear(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

test("the bands sweep as fast in any opening, and the last one is out when the title ends", () => {
  for (const opening of OPENINGS) {
    const length = measureBumper(makeIntro(opening));
    const sweeps = measureSweeps(length);
    assert.ok(sweeps.in * length <= 420 + 1e-6 && sweeps.out * length <= 520 + 1e-6);
    assert.ok(isNear(sweeps.leave + 2 * sweeps.delay + sweeps.out, 1));
    // The band of the logo is all in before it is the first to leave.
    assert.ok(2 * sweeps.delay + sweeps.in < sweeps.leave, `opening of ${opening} ms`);
  }
});

test("the opening title leaves the greeting time to be read, from the shortest to the longest opening", () => {
  assert.equal(measureBumper(makeIntro(3600)), 1440);
  assert.equal(measureBumper(makeIntro(10_000)), 3200);
  for (const opening of OPENINGS) {
    const intro = makeIntro(opening);
    const settled = findShowPhase(intro, intro.endsAt - Math.max(1500, opening * 0.4), null);
    assert.equal(settled.bumper, null, `opening of ${opening} ms`);
    assert.equal(settled.texts, 1, `opening of ${opening} ms`);
  }
});

test("the title starts with nothing on screen and ends out of the way", () => {
  for (const opening of OPENINGS) {
    const length = measureBumper(makeIntro(opening));
    const start = poseTitle(0, length, false);
    assert.deepEqual(
      start.plates.map((plate) => plate.scale),
      [0, 0],
    );
    assert.ok(start.sparkles.every((size) => size === 0));
    assert.equal(start.halo.strength, 0);
    assert.equal(start.tagline, 0);
    // The globe comes from far behind its place.
    assert.ok(start.globe.at.z < -50);
    const end = poseTitle(1, length, false);
    assert.equal(end.tagline, 0);
    assert.ok(end.dolly < 0.6);
    assert.ok(end.plates.every((plate) => Math.abs(plate.at.x) > 2));
  }
});

test("the logo has locked into place and stands still before its band leaves", () => {
  for (const opening of OPENINGS) {
    const length = measureBumper(makeIntro(opening));
    // It stands complete before the band of the logo starts to leave.
    assert.ok(findLanded(length) < measureSweeps(length).leave);
    const pose = poseTitle(findLanded(length), length, false);
    const rest = placePlates();
    pose.plates.forEach((plate, index) => {
      const target = rest[index];
      assert.ok(target && isNear(plate.at.x, target.x) && isNear(plate.at.y, target.y));
      assert.ok(isNear(plate.at.z, target.z) && isNear(plate.turn.y, 0) && isNear(plate.scale, 1));
    });
    assert.deepEqual(pose.globe.at, TITLE_LAYOUT.globe.middle);
    assert.ok(isNear(pose.globe.spin, -TITLE_LAYOUT.globe.facing));
    assert.ok(pose.rings.every((ring) => isNear(ring.scale, 1)));
    assert.ok(pose.sparkles.every((size) => size > 0.7));
    assert.equal(pose.tagline, 1);
    assert.equal(pose.glint, null);
  }
});

test("the title moves without a jump, and the glint comes and goes beside the logo", () => {
  for (const opening of [3600, 10_000]) {
    const length = measureBumper(makeIntro(opening));
    let last = poseTitle(0, length, false);
    let glints = 0;
    for (let progress = 1e-4; progress <= 1; progress += 1e-4) {
      const pose = poseTitle(progress, length, false);
      const jumps = flatten(pose).map((value, index) =>
        Math.abs(value - (flatten(last)[index] ?? 0)),
      );
      assert.ok(Math.max(...jumps) < 0.12, `a jump at ${progress.toFixed(4)} in ${opening} ms`);
      if ((pose.glint === null) !== (last.glint === null)) {
        glints += 1;
        // It appears left of the logo and goes right of it.
        assert.ok(Math.abs(pose.glint ?? last.glint ?? 0) > 2);
      }
      last = pose;
    }
    assert.equal(glints, 2);
  }
});

test("a screen that joins late sees the same title as one that was there from the start", () => {
  const intro = makeIntro(7500);
  const length = measureBumper(intro);
  const times = Array.from({ length: 30 }, (_, step) => intro.startedAt + step * 100);
  const watch = (time: number) => {
    const progress = findShowPhase(intro, time, null).bumper;
    return progress === null ? null : poseTitle(progress, length, false);
  };
  const fromStart = times.map(watch);
  const late = [...times].reverse().map(watch).reverse();
  assert.deepEqual(late, fromStart);
  assert.ok(fromStart.filter(Boolean).length > 20);
});

test("with less motion the title stands where it lands, without glint or push", () => {
  const length = measureBumper(makeIntro(7500));
  const still = poseTitle(0, length, true);
  for (const progress of [0.1, 0.5, 0.9, 1]) {
    assert.deepEqual(poseTitle(progress, length, true), still);
  }
  const landed = poseTitle(findLanded(length), length, false);
  assert.deepEqual(
    still.plates.map((plate) => plate.at),
    landed.plates.map((plate) => plate.at),
  );
  assert.deepEqual(still.globe.at, landed.globe.at);
  assert.equal(still.globe.spin, -TITLE_LAYOUT.globe.facing);
  assert.equal(still.glint, null);
  assert.equal(still.dolly, 1);
  assert.equal(still.tagline, 1);
});

test("the title fits the free area at any aspect, with its line below it", () => {
  // From a narrow map window to a wide beamer, and past both.
  for (const aspect of [0.9, 520 / 460, 720 / 600, 520 / 346, 1200 / 900, 1920 / 1080, 2.4]) {
    const fit = fitTitle(aspect);
    const tangent = Math.tan(TITLE_FIELD / 2);
    for (const point of listTitlePoints()) {
      const depth = TITLE_AIM.z + fit.distance - point.z;
      assert.ok(depth > 1, "everything stays well in front of the camera");
      assert.ok(Math.abs(point.y - TITLE_AIM.y) / (depth * tangent) <= 0.75);
      assert.ok(Math.abs(point.x - TITLE_AIM.x) / (depth * tangent * aspect) <= 0.87);
    }
    assert.ok(fit.taglineY > 0.6 && fit.taglineY + fit.taglineSize < 1, `aspect ${aspect}`);
    assert.ok(fit.taglineSize > 0.02);
  }
});

test("nothing of the title ever comes near the camera, not even while it pushes in", () => {
  const half = Math.max(TITLE_MODEL.plates.jelly, TITLE_MODEL.plates.news) / 2;
  for (const aspect of [520 / 460, 1920 / 1080, 2.4]) {
    const fit = fitTitle(aspect);
    for (const opening of [3600, 10_000]) {
      const length = measureBumper(makeIntro(opening));
      for (let progress = 0; progress <= 1; progress += 0.005) {
        const pose = poseTitle(progress, length, false);
        const camera = TITLE_AIM.z + fit.distance * pose.dolly;
        // A plate turned like a door reaches toward the camera with one end.
        const nearest = pose.plates.map(({ at, turn, scale }) => {
          return at.z + scale * (TITLE_MODEL.letters.front + Math.abs(Math.sin(turn.y)) * half);
        });
        const clearance = camera - Math.max(...nearest, pose.globe.at.z + 1.1);
        assert.ok(clearance > 0.3, `aspect ${aspect.toFixed(2)} at ${progress.toFixed(3)}`);
      }
    }
  }
});

/** The parts of the model with the bounds of their vertices, read from the JSON chunk of the GLB. */
function readModel(): { bytes: number; parts: Map<string, { min: number[]; max: number[] }> } {
  const file = readFileSync(new URL("newsTitle.glb", import.meta.url));
  const length = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + length).toString("utf8")) as {
    nodes: { mesh?: number; extras?: { part?: string } }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
  };
  const parts = new Map<string, { min: number[]; max: number[] }>();
  for (const node of gltf.nodes) {
    const part = node.extras?.part;
    if (part === undefined || node.mesh === undefined) continue;
    for (const primitive of gltf.meshes[node.mesh]?.primitives ?? []) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      const known = parts.get(part) ?? {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      known.min = known.min.map((value, axis) => Math.min(value, accessor?.min[axis] ?? value));
      known.max = known.max.map((value, axis) => Math.max(value, accessor?.max[axis] ?? value));
      parts.set(part, known);
    }
  }
  return { bytes: file.length, parts };
}

test("the model holds the parts of the title in the sizes the layout counts with", () => {
  const { bytes, parts } = readModel();
  assert.ok(bytes < 200_000, `newsTitle.glb has ${bytes} bytes`);
  const names = [
    "globe",
    "ring-inner",
    "ring-outer",
    "jelly",
    "jelly-letters",
    "news",
    "news-letters",
    "sparkle",
  ];
  assert.deepEqual([...parts.keys()].sort(), [...names].sort());
  // [part, axis, size the layout counts with, measured from the middle or across the whole part]
  const { plates, rings } = TITLE_MODEL;
  const sizes: [string, number, number, "half" | "whole"][] = [
    ["jelly", 0, plates.jelly, "whole"],
    ["news", 0, plates.news, "whole"],
    ["jelly", 1, plates.height, "whole"],
    ["news", 2, plates.depth, "whole"],
    ["jelly-letters", 2, TITLE_MODEL.letters.front, "half"],
    ["ring-inner", 0, rings.inner, "half"],
    ["ring-outer", 0, rings.outer, "half"],
    ["sparkle", 1, TITLE_MODEL.sparkle.reach, "half"],
  ];
  for (const [name, axis, size, measure] of sizes) {
    const bounds = parts.get(name);
    assert.ok(bounds, name);
    const high = bounds.max[axis] ?? 0;
    const found = measure === "half" ? high : high - (bounds.min[axis] ?? 0);
    assert.ok(isNear(found, size, 0.005), `${name}: ${found} instead of ${size}`);
  }
  // The sea is the unit ball, the land rises a little above it.
  assert.ok(parts.get("globe")?.max.every((value) => value > 0.99 && value < 1.06));
});
