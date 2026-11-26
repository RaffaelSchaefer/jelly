import assert from "node:assert/strict";
import { test } from "node:test";

import { PerspectiveCamera } from "three";

import type { JellySpot } from "./jellies.ts";
import type { NewsCameraFrame, NewsCameraMode } from "./newsCameraRig.ts";
import type { StagePlayer } from "./types.ts";

import { createViewCamera, type CameraFrame } from "./cameraControls.ts";
import { findMoment, planShow } from "./news.ts";

const ROOM = { width: 40, depth: 30 };
const CANVAS = { clientWidth: 800, clientHeight: 600 } as HTMLCanvasElement;

function createSource(newsCamera: NewsCameraMode = "auto") {
  const camera = new PerspectiveCamera(30, 800 / 600, 1, 300);
  camera.position.set(0, 60, 50);
  camera.lookAt(0, 0, 0);
  camera.setViewOffset(800, 600, 0, -21, 800, 600);
  camera.updateMatrixWorld();
  const fitted = {
    fov: camera.fov,
    quaternion: camera.quaternion.clone(),
    view: camera.view && { ...camera.view },
    target: { x: 0, y: 0, z: 0 },
  };
  return {
    stage: { camera, home: camera.position.clone(), fitted },
    hall: { size: ROOM },
    canvas: CANVAS,
    lens: { strength: 0.55 },
    readInsets: () => ({ top: 0, bottom: 60 }),
    newsCamera,
  };
}

function spotAt(id: number, x: number, z: number): JellySpot {
  const player = { id, name: `Jelly ${id}`, color: "mint" } as StagePlayer;
  const head = { x, y: 2.3, z };
  return { player, feet: { x, y: 0, z }, head, crown: head };
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

const NEWS_LIVE = {
  show: planShow({
    kind: "news",
    winner_id: null,
    ends_at: 90_000,
    starts_at: 0,
    presenter_id: null,
    news: { top_xp: null, achievements: [], tallest_stack: [], next_item: null },
  })!,
  card: {
    rubric: "",
    glyph: "",
    headline: "",
    sub: "",
    figure: "",
    isUrgent: false,
    playerIds: [],
    isLive: false,
    picture: null,
  },
  ticker: "",
};
const EMPTY_CAST = { actors: new Map(), towers: [], set: { stage: null, screens: [] }, blocks: [] };

/** The news at a server time, or none once the show is over. */
function newsAt(serverTime: number): NewsCameraFrame {
  const moment = findMoment(NEWS_LIVE.show, serverTime);
  const live = moment ? { ...NEWS_LIVE, moment } : null;
  return { live, readCast: () => EMPTY_CAST, reducedMotion: false };
}

test("the news camera films on its own until a hand takes the camera, then for good", () => {
  const source = createSource();
  const { camera } = source.stage;
  const viewCamera = createViewCamera(source);
  assert.ok(viewCamera.film(newsAt(30_000)));
  assert.equal(viewCamera.isFilming(), true);
  const filmed = camera.position.clone();
  viewCamera.update(frame(1 / 30));
  assert.ok(camera.position.equals(filmed));
  viewCamera.controls.zoomBy(2);
  assert.equal(viewCamera.isFilming(), false);
  assert.equal(camera.fov, source.stage.fitted.fov);
  assert.deepEqual({ ...camera.view }, source.stage.fitted.view);
  assert.equal(viewCamera.film(newsAt(31_000)), null);
  assert.deepEqual(viewCamera.controls.readNews(), { onAir: true, watching: false });
  viewCamera.controls.watchNews(true);
  assert.ok(viewCamera.film(newsAt(32_000)));
  viewCamera.controls.watchNews(false);
  assert.equal(viewCamera.isFilming(), false);
});

test("the map films only on request, and a show that ends leaves the whole room", () => {
  const source = createSource("manual");
  const viewCamera = createViewCamera(source);
  viewCamera.controls.zoomBy(3);
  for (let step = 0; step < 60; step++) viewCamera.update(frame(1 / 30));
  assert.equal(viewCamera.film(newsAt(85_000)), null);
  viewCamera.controls.watchNews(true);
  assert.ok(viewCamera.film(newsAt(89_000)));
  assert.equal(viewCamera.film(newsAt(91_000)), null);
  viewCamera.update(frame(1 / 30));
  assert.equal(source.stage.camera.zoom, 1);
  assert.ok(source.stage.camera.position.distanceTo(source.stage.home) < 1e-9);
  assert.deepEqual(viewCamera.controls.readNews(), { onAir: false, watching: false });
});
