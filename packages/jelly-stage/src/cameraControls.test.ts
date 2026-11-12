import assert from "node:assert/strict";
import { test } from "node:test";

import { PerspectiveCamera } from "three";

import type { JellySpot } from "./jellies.ts";
import type { StagePlayer } from "./types.ts";

import { createViewCamera, type CameraFrame } from "./cameraControls.ts";

const ROOM = { width: 40, depth: 30 };
const CANVAS = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;

function createSource() {
  const camera = new PerspectiveCamera(30, 800 / 600, 1, 300);
  camera.position.set(0, 60, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return {
    stage: { camera, home: camera.position.clone() },
    hall: { size: ROOM },
    canvas: CANVAS,
    lens: { strength: 0.55 },
    readInsets: () => ({ top: 0, bottom: 60 }),
  };
}

function spotAt(id: number, x: number, z: number): JellySpot {
  const player = { id, name: `Jelly ${id}`, color: "mint" } as StagePlayer;
  return { player, feet: { x, y: 0, z }, head: { x, y: 2.3, z } };
}

const SPOTS = [spotAt(1, -8, 4), spotAt(2, 9, -6)];

function frame(seconds: number, reducedMotion = false): CameraFrame {
  return { seconds, spots: SPOTS, ownId: 1, reducedMotion };
}

test("the intro starts at the own jelly and flies out to the whole room", () => {
  const source = createSource();
  const { controls, update } = createViewCamera(source);
  controls.playIntro();
  update(frame(0.01));
  assert.equal(source.stage.camera.zoom, 3);
  for (let step = 0; step < 120; step++) update(frame(1 / 30));
  assert.equal(source.stage.camera.zoom, 1);
  assert.ok(source.stage.camera.position.distanceTo(source.stage.home) < 1e-6);
  assert.deepEqual(controls.readCamera(), { factor: 1, followsOwn: true });
});

test("reduced motion skips the intro and lands flights at once", () => {
  const source = createSource();
  const { controls, update } = createViewCamera(source);
  controls.playIntro();
  update(frame(0.01, true));
  assert.equal(source.stage.camera.zoom, 1);
  controls.flyTo(2);
  assert.deepEqual(controls.readCamera(), { factor: 1, followsOwn: false });
  update(frame(0.01, true));
  assert.deepEqual(controls.readCamera(), { factor: 2.5, followsOwn: false });
});

test("a drag ends a flight, the own jelly is followed again after flying to it", () => {
  const source = createSource();
  const { controls, update } = createViewCamera(source);
  controls.followOwn();
  update(frame(1 / 30));
  assert.equal(controls.readCamera().followsOwn, true);
  controls.pan({ x: 400, y: 300 }, { x: 420, y: 300 });
  assert.equal(controls.readCamera().followsOwn, false);
  controls.followOwn();
  for (let step = 0; step < 60; step++) update(frame(1 / 30));
  assert.deepEqual(controls.readCamera(), { factor: 2.5, followsOwn: true });
});
