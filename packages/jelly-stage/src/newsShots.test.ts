import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsMoment, NewsShow } from "./news.ts";
import type { NewsActor, NewsTower } from "./newsCameraCast.ts";
import type { NewsBlock } from "./newsCameraProps.ts";
import type { StageCatalog } from "./types.ts";
import type { ScenePoint } from "./world.ts";

import { bendToLens, LENS_RANGE } from "./lens.ts";
import { planShow } from "./news.ts";
import { projectNews, type NewsPose } from "./newsCamera.ts";
import { writeCard } from "./newsLines.ts";
import { planNewsShot, WEATHER_RUBRIC, type NewsShotScene } from "./newsShots.ts";

const HEIGHT = 2.33;
const PRESENTER = 1;
const TOWER_IDS = [30, 31, 32];
const STEP = 0.92 * HEIGHT;
const STAGE = { middle: { x: 0, z: -14 }, front: -11, width: 24, floor: 0.35 };
const HOME: NewsPose = {
  position: { x: 0, y: 45, z: 40 },
  target: { x: 0, y: 0, z: 0 },
  fov: 32,
  lift: -0.02,
};
const SCREENS = [
  { x: 16 / 9, width: 1920, height: 1080 },
  { x: 1.2, width: 720, height: 600 },
];

function actor(id: number, spot: { x: number; z: number }, floor = 0, scale = 1): NewsActor {
  return {
    id,
    now: spot,
    goal: spot,
    walk: () => spot,
    arrival: Number.NEGATIVE_INFINITY,
    floor,
    height: HEIGHT * scale,
    half: 0.85 * scale,
    reach: 1.65 * scale,
  };
}

/** The presenter on the stage, three staggered rows of six in front of it and a tower aside. */
function createActors(): Map<number, NewsActor> {
  const actors = [actor(PRESENTER, { x: 0, z: -12.5 }, STAGE.floor, 1.8)];
  for (let row = 0; row < 3; row++) {
    for (let place = 0; place < 6; place++) {
      const x = -6 + place * 2.4 + (row % 2) * 1.2;
      actors.push(actor(2 + row * 6 + place, { x, z: -7 + row * 3 }));
    }
  }
  TOWER_IDS.forEach((id, level) => actors.push(actor(id, { x: 10, z: -3 }, level * STEP)));
  return new Map(actors.map((entry) => [entry.id, entry]));
}

const TOWER: NewsTower = { memberIds: TOWER_IDS, foot: { x: 10, z: -3 }, floor: 0, step: STEP };

const SHOW = planShow({
  kind: "news",
  winner_id: null,
  ends_at: 90_000,
  starts_at: 0,
  presenter_id: PRESENTER,
  news: {
    top_xp: { player_id: 9, xp: 420 },
    achievements: [
      { player_id: 3, key: "hydrated" },
      { player_id: 14, key: "conga" },
    ],
    tallest_stack: TOWER_IDS,
    next_item: { starts_at: 0, ends_at: null, title: "Turnier", detail: null, kind: "orga" },
  },
}) as NewsShow;

type Card = NewsShotScene["live"]["card"];
const STUDIO_CARD: Card = { playerIds: [], isLive: false, rubric: "JELLY NEWS" };

/** Returns the card each beat of the show gets, as `newsLines.ts` would write it. */
function cardOf(index: number, extra: Card): Card {
  const beat = SHOW.beats[index];
  if (beat?.kind === "top_xp" || beat?.kind === "achievement") {
    return { ...STUDIO_CARD, playerIds: [beat.playerId] };
  }
  if (beat?.kind === "stack") return { ...STUDIO_CARD, playerIds: beat.memberIds };
  return beat?.kind === "extra" ? extra : STUDIO_CARD;
}

interface Setup {
  index: number;
  progress: number;
  aspect?: number;
  reducedMotion?: boolean;
  extra?: Card;
  actors?: Map<number, NewsActor>;
  towers?: NewsTower[];
  presenterId?: number | null;
  stage?: typeof STAGE | null;
  blocks?: NewsBlock[];
}

function createScene(setup: Setup): NewsShotScene {
  const { index, progress } = setup;
  const moment: NewsMoment = {
    beat: SHOW.beats[index] ?? { kind: "intro" },
    index,
    run: 1,
    progress,
    startedAt: 0,
    endsAt: 10_000,
  };
  const extra = setup.extra ?? { playerIds: [], isLive: false, rubric: WEATHER_RUBRIC };
  const stage = setup.stage === undefined ? STAGE : setup.stage;
  return {
    actors: setup.actors ?? createActors(),
    towers: setup.towers ?? [TOWER],
    blocks: setup.blocks ?? [],
    set: { stage, screens: stage ? [{ x: 6, y: 2.05, z: -16.5 }] : [] },
    presenterId: setup.presenterId === undefined ? PRESENTER : setup.presenterId,
    home: HOME,
    view: { aspect: setup.aspect ?? 16 / 9, top: 0, bottom: 1 },
    live: { show: SHOW, moment, card: cardOf(index, extra) },
    reducedMotion: setup.reducedMotion ?? false,
  };
}

function findIndex(kind: string, nth = 0): number {
  return SHOW.beats.flatMap((beat, index) => (beat.kind === kind ? [index] : []))[nth] ?? -1;
}

const LIVE_ONE: Card = { playerIds: [16], isLive: true, rubric: "STIMMEN AUS DER HALLE" };
const LIVE_TWO: Card = { playerIds: [7, 13], isLive: true, rubric: "KLATSCH" };
const QUIET: Card = { playerIds: [], isLive: false, rubric: "KURZ GEMELDET" };
const EXTRAS = [undefined, LIVE_ONE, LIVE_TWO, QUIET];

/** Every beat of the show at many points, with each kind of color report. */
function listSetups(): Setup[] {
  const setups: Setup[] = [];
  for (let index = 0; index < SHOW.beats.length; index++) {
    for (let progress = 0; progress < 1; progress += 0.05) {
      for (const extra of SHOW.beats[index]?.kind === "extra" ? EXTRAS : [undefined]) {
        setups.push({ index, progress, extra });
      }
    }
  }
  return setups;
}

function assertClear(pose: NewsPose, scene: NewsShotScene, label: string) {
  const { position, target } = pose;
  assert.ok(
    [position.x, position.y, position.z, target.x, target.y, pose.fov].every(Number.isFinite),
    label,
  );
  assert.ok(position.y > 0.5, `${label}: under the floor`);
  assert.ok(target.z < position.z, `${label}: looks away from the stage`);
  assert.ok(position.z > STAGE.front, `${label}: behind the stage`);
  for (const other of scene.actors.values()) {
    const apart = Math.hypot(position.x - other.now.x, position.z - other.now.z);
    const above = position.y - (other.floor + other.height);
    assert.ok(apart > other.reach + 0.5 || above > 0.5, `${label}: in jelly ${other.id}`);
  }
}

/** Reports where a point shows in the picture after the lens, as shares of width and height. */
function locate(pose: NewsPose, point: ScenePoint, aspect: number) {
  const screen = SCREENS.find((candidate) => candidate.x === aspect) ?? SCREENS[0]!;
  const seen = projectNews(pose, point, aspect);
  const flat = { x: ((seen.x + 1) / 2) * screen.width, y: ((1 - seen.y) / 2) * screen.height };
  const bent = bendToLens(flat, screen, LENS_RANGE.usual);
  return { x: bent.x / screen.width, y: bent.y / screen.height, depth: seen.depth };
}

/** The middle of a jelly shows between the edges and above the lower third. */
function assertInSafeArea(pose: NewsPose, subject: NewsActor, aspect: number, label: string) {
  const middle = { x: subject.now.x, y: subject.floor + subject.height / 2, z: subject.now.z };
  const top = { ...middle, y: subject.floor + subject.height };
  const seen = locate(pose, middle, aspect);
  assert.ok(seen.depth > 0, `${label}: behind the camera`);
  assert.ok(seen.x > 0.1 && seen.x < 0.9, `${label}: x ${seen.x}`);
  assert.ok(seen.y > 0.08 && seen.y < 0.72, `${label}: y ${seen.y}`);
  assert.ok(locate(pose, top, aspect).y > 0, `${label}: head cut off`);
}

test("every shot stays on the hall side, above the floor and out of the jellies", () => {
  for (const aspect of [16 / 9, 1.2]) {
    for (const setup of listSetups()) {
      const scene = createScene({ ...setup, aspect });
      const label = `${SHOW.beats[setup.index]?.kind} ${setup.progress.toFixed(2)} ${aspect}`;
      assertClear(planNewsShot(scene).pose, scene, label);
      assertClear(planNewsShot({ ...scene, reducedMotion: true }).pose, scene, `${label} still`);
    }
  }
});

test("the subject of each shot shows inside the safe area of the picture", () => {
  const actors = createActors();
  const studio = actors.get(PRESENTER)!;
  const cases: [number, number, number][] = [
    [findIndex("intro"), 0.95, PRESENTER],
    [findIndex("top_xp"), 0.1, PRESENTER],
    [findIndex("top_xp"), 0.6, 9],
    [findIndex("achievement"), 0.5, 3],
    [findIndex("achievement", 1), 0.05, 14],
    [findIndex("achievement", 1), 0.95, 14],
    [findIndex("stack"), 0.3, 30],
    [findIndex("next"), 0.5, PRESENTER],
    [findIndex("outro"), 0.1, PRESENTER],
  ];
  for (const aspect of [16 / 9, 1.2]) {
    for (const [index, progress, id] of cases) {
      const { pose } = planNewsShot(createScene({ index, progress, aspect }));
      const label = `${SHOW.beats[index]?.kind} ${progress} ${aspect}`;
      assertInSafeArea(pose, actors.get(id) ?? studio, aspect, label);
    }
    const live = createScene({ index: findIndex("extra"), progress: 0.6, aspect, extra: LIVE_ONE });
    assertInSafeArea(planNewsShot(live).pose, actors.get(16)!, aspect, `live ${aspect}`);
  }
});

test("the show starts and ends in the pose of the normal camera", () => {
  assert.deepEqual(planNewsShot(createScene({ index: 0, progress: 0 })).pose, HOME);
  assert.deepEqual(planNewsShot(createScene({ index: 0, progress: 0.05 })).pose, HOME);
  const outro = findIndex("outro");
  assert.deepEqual(planNewsShot(createScene({ index: outro, progress: 0.999 })).pose, HOME);
  const still = createScene({ index: outro, progress: 0.8, reducedMotion: true });
  assert.deepEqual(planNewsShot(still).pose, HOME);
});

test("the same moment gives the same pose, and a shot moves without jumps", () => {
  for (const setup of listSetups()) {
    const scene = createScene(setup);
    assert.deepEqual(planNewsShot(scene), planNewsShot(createScene(setup)));
    const next = planNewsShot(createScene({ ...setup, progress: setup.progress + 1e-4 })).pose;
    const { pose } = planNewsShot(scene);
    const moved = Math.hypot(
      next.position.x - pose.position.x,
      next.position.y - pose.position.y,
      next.position.z - pose.position.z,
    );
    // Cuts lie at shares like 0.22, 0.25 or 0.3, never at a multiple of 0.05.
    assert.ok(moved < 0.02, `${SHOW.beats[setup.index]?.kind} ${setup.progress} moved ${moved}`);
  }
});

test("a neighbour walking past moves the camera smoothly and keeps its direction", () => {
  const index = findIndex("achievement");
  let last: NewsPose | null = null;
  for (let step = 0; step <= 100; step++) {
    const actors = createActors();
    // Jelly 8 walks across in front of the subject to where it will stand.
    const walker = actors.get(8)!;
    actors.set(8, { ...walker, now: { x: -8 + step * 0.16, z: -3.5 }, goal: { x: 8, z: -3.5 } });
    const { pose } = planNewsShot(createScene({ index, progress: 0.6, actors }));
    if (last) {
      const moved = Math.hypot(
        pose.position.x - last.position.x,
        pose.position.y - last.position.y,
      );
      assert.ok(moved < 0.3, `step ${step} moved ${moved}`);
      assert.ok(Math.abs(pose.target.x - last.target.x) < 0.3, `step ${step} turned`);
    }
    last = pose;
  }
});

test("reduced motion holds each shot still and still cuts", () => {
  const index = findIndex("top_xp");
  const early = planNewsShot(createScene({ index, progress: 0.4, reducedMotion: true })).pose;
  const late = planNewsShot(createScene({ index, progress: 0.95, reducedMotion: true })).pose;
  assert.deepEqual(early, late);
  const studio = planNewsShot(createScene({ index, progress: 0.1, reducedMotion: true })).pose;
  assert.notDeepEqual(studio, early);
  const live = { index: findIndex("extra"), extra: LIVE_ONE, reducedMotion: true };
  assert.deepEqual(
    planNewsShot(createScene({ ...live, progress: 0.5 })).pose,
    planNewsShot(createScene({ ...live, progress: 0.9 })).pose,
  );
});

test("without presenter, named jelly, stage or screens every shot still has a pose", () => {
  const setups = listSetups();
  const empty = new Map<number, NewsActor>();
  for (const setup of setups) {
    for (const variant of [
      { presenterId: null },
      { actors: empty, towers: [] },
      { stage: null, presenterId: 999 },
    ]) {
      const scene = createScene({ ...setup, ...variant });
      const { pose } = planNewsShot(scene);
      const values = [pose.position.x, pose.position.y, pose.position.z, pose.target.z, pose.lift];
      assert.ok(values.every(Number.isFinite), `${SHOW.beats[setup.index]?.kind}`);
      assert.ok(pose.position.y > 0.5 && pose.target.z < pose.position.z);
    }
  }
});

test("the jellies of a shot look into its lens from the start of the beat, the crowd at the presenter", () => {
  const index = findIndex("top_xp");
  const lead = planNewsShot(createScene({ index, progress: 0.05 }));
  const close = planNewsShot(createScene({ index, progress: 0.6 }));
  assert.deepEqual(lead.gaze, close.gaze);
  const lens = lead.gaze.lookers.get(9);
  assert.ok(lens && Math.hypot(lens.x - close.pose.position.x, lens.z - close.pose.position.z) < 1);
  const presenter = lead.gaze.lookers.get(PRESENTER);
  assert.ok(
    presenter &&
      Math.hypot(presenter.x - lead.pose.position.x, presenter.z - lead.pose.position.z) < 1,
  );
  assert.deepEqual(lead.gaze.crowd, { x: 0, z: -12.5 });
  assert.equal(lead.gaze.lookers.has(4), false);
  // Before a straight cut to the next achievement its jelly already turns to its camera.
  const before = planNewsShot(createScene({ index: findIndex("achievement"), progress: 0.9 }));
  assert.ok(before.gaze.lookers.has(14));
});

test("the weather rubric is the one the news write", () => {
  const catalog: StageCatalog = { signs: [], achievements: [] };
  const card = writeCard(
    { kind: "extra" },
    {
      players: [],
      catalog,
      presenterId: null,
      named: new Set(),
      seed: 7,
      hour: 12,
      formatTime: String,
    },
  );
  assert.equal(card.rubric, WEATHER_RUBRIC);
});
