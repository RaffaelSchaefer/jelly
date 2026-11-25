import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsActor } from "./newsCameraCast.ts";
import type { NewsBlock } from "./newsCameraProps.ts";
import type { StageGathering, StagePlayer } from "./types.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import { calculateMotionPose } from "./effects.ts";
import { bendToLens, LENS_RANGE } from "./lens.ts";
import { planShow, type NewsShow } from "./news.ts";
import { projectNews, type NewsPose } from "./newsCamera.ts";
import { createNewsDirector, stepNews } from "./newsDirector.ts";
import { planNewsShot, type NewsShotScene } from "./newsShots.ts";
import { CLOSE } from "./newsShotsLooks.ts";
import { toLocalPoint } from "./zones.ts";

const HEIGHT = 2.33;
const PRESENTER = 1;
const SUBJECT = 2;
const STAGE = { middle: { x: 0, z: -14 }, front: -11, width: 24, floor: 0.35 };
/** The back of a lounge and a snack bar between the stage and the hall, as `listBlocks` builds them. */
const LOUNGE_BACK: NewsBlock = {
  place: { middle: { x: -7, z: -9 }, width: 10, depth: 1.1, turn: 0 },
  top: 1.85,
};
const SNACK_BAR: NewsBlock = {
  place: { middle: { x: 12, z: -8 }, width: 6.8, depth: 2.6, turn: 0 },
  top: 1.9,
};
const BLOCKS = [LOUNGE_BACK, SNACK_BAR];
const HOME: NewsPose = {
  position: { x: 0, y: 45, z: 40 },
  target: { x: 0, y: 0, z: 0 },
  fov: 32,
  lift: 0,
};
const NEWS = {
  top_xp: { player_id: SUBJECT, xp: 9 },
  achievements: [],
  tallest_stack: [],
  next_item: null,
};
const SHOW = planShow({
  kind: "news",
  winner_id: null,
  ends_at: 90_000,
  starts_at: 0,
  presenter_id: PRESENTER,
  news: NEWS,
}) as NewsShow;
const BEAT = SHOW.beats.findIndex((beat) => beat.kind === "top_xp");

function actor(
  id: number,
  walk: (serverTime: number) => FloorPoint,
  floor = 0,
  scale = 1,
): NewsActor {
  const now = walk(5000);
  return {
    id,
    now,
    goal: walk(Number.POSITIVE_INFINITY),
    walk,
    arrival: Number.NEGATIVE_INFINITY,
    floor,
    height: HEIGHT * scale,
    half: 0.85 * scale,
    reach: 1.65 * scale,
  };
}

/** The presenter on the stage, the subject where a case puts it, a crowd in rows like desk rows. */
function createScene(subject: (serverTime: number) => FloorPoint, progress: number): NewsShotScene {
  const actors = [
    actor(PRESENTER, () => ({ x: 0, z: -12.5 }), STAGE.floor, 1.8),
    actor(SUBJECT, subject),
  ];
  for (let row = 0; row < 3; row++) {
    for (let place = 0; place < 5; place++) {
      const spot = { x: -5 + place * 2.5 + (row % 2) * 1.25, z: 2 + row * 3.4 };
      actors.push(actor(10 + row * 5 + place, () => spot));
    }
  }
  return {
    actors: new Map(actors.map((entry) => [entry.id, entry])),
    towers: [],
    blocks: BLOCKS,
    set: { stage: STAGE, screens: [] },
    presenterId: PRESENTER,
    home: HOME,
    view: { aspect: 16 / 9, top: 0, bottom: 1 },
    live: {
      show: SHOW,
      moment: {
        beat: SHOW.beats[BEAT]!,
        index: BEAT,
        run: 1,
        progress,
        startedAt: 0,
        endsAt: 10_000,
      },
      card: { playerIds: [SUBJECT], isLive: false, rubric: "FLEISS-REKORD" },
    },
    reducedMotion: false,
  };
}

/** Reports whether the straight line from the camera to a point runs through a block. */
function isBlocked(from: ScenePoint, to: ScenePoint): boolean {
  for (let step = 1; step < 400; step++) {
    const share = step / 400;
    const point = {
      x: from.x + (to.x - from.x) * share,
      y: from.y + (to.y - from.y) * share,
      z: from.z + (to.z - from.z) * share,
    };
    const inside = BLOCKS.some((block) => {
      const local = toLocalPoint(point, block.place);
      const isOver = Math.abs(local.x) <= block.place.width / 2;
      return isOver && Math.abs(local.z) <= block.place.depth / 2 && point.y <= block.top;
    });
    if (inside) return true;
  }
  return false;
}

/** Either the report stays with the presenter, or the subject's chest is in view and unblocked. */
function assertVisibleOrStudio(scene: NewsShotScene, label: string) {
  const { pose } = planNewsShot(scene);
  // Only the close-up uses the long lens.
  if (pose.fov !== CLOSE.fov) return "studio";
  const subject = scene.actors.get(SUBJECT)!;
  const chest = { x: subject.now.x, y: subject.floor + 0.6 * subject.height, z: subject.now.z };
  const seen = projectNews(pose, chest, scene.view.aspect);
  assert.ok(
    seen.depth > 0 && Math.abs(seen.x) < 0.9 && Math.abs(seen.y) < 0.9,
    `${label}: not framed`,
  );
  assert.equal(isBlocked(pose.position, chest), false, `${label}: filmed through a prop`);
  return "filmed";
}

const still = (spot: FloorPoint) => () => spot;

test("a jelly behind the back of the lounge is filmed over or past it, or not at all", () => {
  for (const progress of [0.4, 0.7, 0.95]) {
    assertVisibleOrStudio(createScene(still({ x: -7, z: -10.2 }), progress), `lounge ${progress}`);
  }
});

test("a jelly behind the end of the lounge is filmed from the side, past the sign", () => {
  for (const progress of [0.4, 0.7, 0.95]) {
    const scene = createScene(still({ x: -1.4, z: -10.2 }), progress);
    assert.equal(assertVisibleOrStudio(scene, `end ${progress}`), "filmed");
  }
});

test("a jelly right behind the snack bar is filmed only where the machines hide nothing", () => {
  for (const progress of [0.4, 0.7, 0.95]) {
    assertVisibleOrStudio(createScene(still({ x: 12, z: -9.6 }), progress), `snack ${progress}`);
  }
});

test("a jelly in front of the snack bar and one between the desk rows are filmed", () => {
  for (const spot of [
    { x: 12, z: -5.5 },
    { x: 1.25, z: 5.4 },
  ]) {
    const kind = assertVisibleOrStudio(createScene(still(spot), 0.6), `${spot.x},${spot.z}`);
    assert.equal(kind, "filmed", `${spot.x},${spot.z}`);
  }
});

test("a jelly walking through the back of the lounge during its report is never filmed through it", () => {
  // Walks from the rows toward the stage and right through the couch and the sign meanwhile.
  const walk = (serverTime: number) => ({ x: -7, z: -4 - Math.min(1, serverTime / 10_000) * 7 });
  for (let progress = 0.32; progress < 1; progress += 0.08) {
    assertVisibleOrStudio(createScene(walk, progress), `walking ${progress.toFixed(2)}`);
  }
});

test("the camera never stands inside a prop", () => {
  for (const spot of [
    { x: -7, z: -10.2 },
    { x: 12, z: -9.6 },
    { x: 12, z: -5.5 },
  ]) {
    for (let progress = 0; progress < 1; progress += 0.05) {
      const { position } = planNewsShot(createScene(still(spot), progress)).pose;
      for (const block of BLOCKS) {
        const local = toLocalPoint(position, block.place);
        const isInside =
          Math.abs(local.x) <= block.place.width / 2 + 0.5 &&
          Math.abs(local.z) <= block.place.depth / 2 + 0.5 &&
          position.y <= block.top + 0.5;
        assert.equal(isInside, false, `${spot.x},${spot.z} ${progress.toFixed(2)}`);
      }
    }
  }
});

test("a subject sliding behind a prop moves the camera smoothly and stays in view", () => {
  let last: NewsPose | null = null;
  for (let step = 0; step <= 40; step++) {
    // The take chose its direction where the walk ends; the jelly itself drifts behind the sign.
    const scene = createScene(still({ x: -1.4, z: -10.2 }), 0.6);
    const subject = scene.actors.get(SUBJECT)!;
    const now = { x: -1.4 - step * 0.05, z: -10.2 };
    scene.actors.set(SUBJECT, { ...subject, now });
    const kind = assertVisibleOrStudio(scene, `step ${step}`);
    assert.equal(kind, "filmed", `step ${step}`);
    const { pose } = planNewsShot(scene);
    if (last) {
      const moved = Math.hypot(
        pose.position.x - last.position.x,
        pose.position.y - last.position.y,
        pose.position.z - last.position.z,
      );
      assert.ok(moved < 1.5, `step ${step} jumped ${moved.toFixed(2)}`);
    }
    last = pose;
  }
});

/** Returns how long the news director lets a named jelly hop, as its effect says. */
function measureHop(): number {
  const gathering: StageGathering = {
    kind: "news",
    winner_id: null,
    ends_at: 90_000,
    presenter_id: PRESENTER,
    news: NEWS,
  };
  const players: StagePlayer[] = [PRESENTER, SUBJECT].map((id) => ({
    id,
    name: `Jelly ${id}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: null,
    is_visitor: false,
    home_x: 10,
    home_y: 20,
  }));
  const catalog = { signs: [], achievements: [] };
  for (let serverTime = 0; serverTime < 90_000; serverTime += 1000) {
    const frame = { gathering, players, catalog, serverTime, now: serverTime };
    const hop = stepNews(createNewsDirector(), frame).find((effect) => effect.kind === "motion");
    if (hop) return hop.endsAt - hop.startedAt;
  }
  return 0;
}

/** Two achievements in a row: the picture cuts straight to the jelly of the second one. */
const ROW = planShow({
  kind: "news",
  winner_id: null,
  ends_at: 90_000,
  starts_at: 0,
  presenter_id: PRESENTER,
  news: {
    ...NEWS,
    achievements: [
      { player_id: 3, key: "hatched" },
      { player_id: SUBJECT, key: "conga" },
    ],
  },
}) as NewsShow;

/** Reports cut to their jelly while it hops: a short one, and the second achievement in a row. */
function listHopScenes(time: number): NewsShotScene[] {
  const short = createScene(still({ x: 1.25, z: 5.4 }), time / 7000);
  short.live.moment.endsAt = 7000;
  const row = createScene(still({ x: 1.25, z: 5.4 }), time / 10_000);
  const second = ROW.beats.map((beat) => beat.kind).lastIndexOf("achievement");
  const moment = { ...row.live.moment, beat: ROW.beats[second]!, index: second };
  return [short, { ...row, live: { ...row.live, show: ROW, moment } }];
}

test("a jelly that hops as its close-up starts keeps its head in the picture", () => {
  const hopMs = measureHop();
  const screen = { width: 1920, height: 1080 };
  let filmed = 0;
  for (let time = 0; time <= hopMs; time += 50) {
    for (const scene of listHopScenes(time)) {
      const { pose } = planNewsShot(scene);
      if (pose.fov !== CLOSE.fov) continue;
      filmed += 1;
      const subject = scene.actors.get(SUBJECT)!;
      const lift = calculateMotionPose("hop", time / hopMs).lift * HEIGHT;
      const top = { x: subject.now.x, y: subject.floor + subject.height + lift, z: subject.now.z };
      const seen = projectNews(pose, top, 16 / 9);
      const flat = { x: ((seen.x + 1) / 2) * screen.width, y: ((1 - seen.y) / 2) * screen.height };
      const bent = bendToLens(flat, screen, LENS_RANGE.usual);
      assert.ok(bent.y > 0, `${scene.live.moment.beat.kind} ${time} ms: head out at ${bent.y}`);
    }
  }
  // The row is a close-up from its first frame on, the short report from its cut at 2.1 s.
  assert.ok(hopMs > 0 && filmed >= hopMs / 50, `${filmed} close-ups`);
});
