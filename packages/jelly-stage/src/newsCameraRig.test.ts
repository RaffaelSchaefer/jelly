import assert from "node:assert/strict";
import { test } from "node:test";

import { PerspectiveCamera, Vector3 } from "three";

import type { NewsCast } from "./newsCameraCast.ts";
import type { NewsLive } from "./newsDirector.ts";

import { planShow, findMoment } from "./news.ts";
import { projectNews, type NewsPose } from "./newsCamera.ts";
import {
  applyNewsPose,
  createNewsRig,
  filmNews,
  readHomePose,
  readNewsRig,
  returnToFit,
  type RigStage,
} from "./newsCameraRig.ts";

const SIZE = { width: 1280, height: 720 };
const VIEW = { aspect: SIZE.width / SIZE.height, top: 0, bottom: 1 };

/** A camera fitted like `resizeStageScene` leaves it, with its view offset. */
function createStage(): RigStage {
  const camera = new PerspectiveCamera(33, SIZE.width / SIZE.height, 1, 300);
  camera.position.set(0, 52, 44);
  camera.lookAt(0, 0, 0);
  camera.setViewOffset(SIZE.width, SIZE.height, 0, -37.5, SIZE.width, SIZE.height);
  camera.updateMatrixWorld();
  const fitted = {
    fov: camera.fov,
    quaternion: camera.quaternion.clone(),
    view: camera.view && { ...camera.view },
    target: { x: 0, y: 0, z: 0 },
  };
  return { camera, home: camera.position.clone(), fitted };
}

function createLive(): NewsLive {
  const show = planShow({
    kind: "news",
    winner_id: null,
    ends_at: 90_000,
    starts_at: 0,
    presenter_id: null,
    news: { top_xp: null, achievements: [], tallest_stack: [], next_item: null },
  })!;
  const moment = findMoment(show, 30_000)!;
  const card = {
    rubric: "",
    glyph: "",
    headline: "",
    sub: "",
    figure: "",
    isUrgent: false,
    playerIds: [],
    isLive: false,
    picture: null,
  };
  return { show, moment, card, ticker: "" };
}

const EMPTY_CAST: NewsCast = {
  actors: new Map(),
  towers: [],
  set: { stage: null, screens: [] },
  blocks: [],
};

test("the pure projection of a pose agrees with three.js, lifted picture included", () => {
  const stage = createStage();
  const pose: NewsPose = {
    position: { x: 3, y: 4.5, z: -6 },
    target: { x: -1, y: 2.1, z: -18 },
    fov: 24,
    lift: 0.14,
  };
  applyNewsPose(stage.camera, pose);
  for (const point of [
    { x: 0, y: 2, z: -15 },
    { x: -4, y: 0, z: -20 },
    { x: 5, y: 3.5, z: -11 },
  ]) {
    const three = new Vector3(point.x, point.y, point.z).project(stage.camera);
    const pure = projectNews(pose, point, VIEW.aspect);
    assert.ok(Math.abs(three.x - pure.x) < 1e-9, `x ${three.x} ${pure.x}`);
    assert.ok(Math.abs(three.y - pure.y) < 1e-9, `y ${three.y} ${pure.y}`);
  }
});

test("the home pose shows the room as the fitted camera does", () => {
  const stage = createStage();
  const point = new Vector3(7, 1, -9);
  const fitted = point.clone().project(stage.camera);
  applyNewsPose(stage.camera, readHomePose(stage));
  const home = point.clone().project(stage.camera);
  assert.ok(fitted.distanceTo(home) < 1e-9);
});

test("handing back puts the camera exactly where the fit left it", () => {
  const stage = createStage();
  const { camera } = stage;
  const before = {
    projection: camera.projectionMatrix.clone(),
    world: camera.matrixWorld.clone(),
    view: { ...camera.view },
    fov: camera.fov,
    aspect: camera.aspect,
  };
  applyNewsPose(camera, {
    position: { x: 1, y: 3, z: 2 },
    target: { x: 0, y: 2, z: -9 },
    fov: 20,
    lift: 0.12,
  });
  camera.zoom = 2;
  returnToFit(stage);
  assert.deepEqual(camera.projectionMatrix.elements, before.projection.elements);
  assert.deepEqual(camera.matrixWorld.elements, before.world.elements);
  assert.deepEqual({ ...camera.view }, before.view);
  assert.equal(camera.fov, before.fov);
  assert.equal(camera.aspect, before.aspect);
  assert.equal(camera.zoom, 1);
});

test("auto films a show by itself, manual only on request and only for that show", () => {
  const live = createLive();
  const frame = { live, readCast: () => EMPTY_CAST, reducedMotion: false };
  const off = { ...frame, live: null };
  const auto = createNewsRig("auto");
  const stage = createStage();
  assert.ok(filmNews(auto, frame, stage, VIEW));
  assert.deepEqual(readNewsRig(auto), { onAir: true, watching: true });
  assert.equal(filmNews(auto, off, stage, VIEW), null);
  assert.equal(auto.filming, false);
  assert.ok(stage.camera.position.equals(stage.home));
  const manual = createNewsRig("manual");
  assert.equal(filmNews(manual, frame, stage, VIEW), null);
  assert.deepEqual(readNewsRig(manual), { onAir: true, watching: false });
  manual.armed = true;
  assert.ok(filmNews(manual, frame, stage, VIEW));
  filmNews(manual, off, stage, VIEW);
  assert.equal(filmNews(manual, frame, stage, VIEW), null);
});
