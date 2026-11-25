import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsLive } from "./newsDirector.ts";
import type { NewsCard } from "./newsLines.ts";
import type { StageArea, StageGathering, StageMove, StagePlayer } from "./types.ts";

import { createDemoRoom, DEMO_HALL } from "./demoRoom.fixture.ts";
import { findMoment, planShow, type NewsShow } from "./news.ts";
import {
  DESK,
  describeBroadcast,
  findShowSpan,
  measureDesk,
  measureScreens,
  placeDesk,
  type DeskInput,
  type DeskSpot,
} from "./newsSetPlan.ts";
import { measureRoom, toFloorPoint } from "./world.ts";
import { listPlatforms, STAGE_HEIGHT } from "./zones.ts";

const ROOM = measureRoom(DEMO_HALL);
const AREAS = createDemoRoom();
const PLATFORMS = listPlatforms(AREAS, ROOM);
/** The presenter grows to this size on the stage, `WINNER_SCALE` in `jellies.ts`. */
const PRESENTER_SCALE = 1.8;
/**
 * The side profile of a jelly body as `[radius, height over the feet]`, from `BODY_PROFILE` and
 * `BODY_BOTTOM` in `jellyGeometry.ts` of the scene, and how deep it is for its width.
 */
const BODY_PROFILE: [number, number][] = [
  [0.5, 0],
  [0.7, 0.025],
  [0.81, 0.1],
  [0.86, 0.26],
  [0.86, 0.5],
  [0.83, 0.72],
  [0.75, 0.91],
  [0.6, 1.07],
];
const BODY_DEPTH = 0.8;
/** A cheering jelly jumps this high, see `cheer` in `emoteAnimation.ts` of the scene. */
const CHEER_JUMP = 0.35;
/** Hands stand out this far beside the body, with their size, see `HAND` of the scene. */
const HAND_REACH = 1.1 + 0.2;
const NEWS = {
  top_xp: { player_id: 2, xp: 420 },
  achievements: [{ player_id: 3, key: "hydrated" }],
  tallest_stack: [],
  next_item: null,
};

function player(id: number, x: number, y: number): StagePlayer {
  return {
    id,
    name: `Jelly ${id}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: null,
    is_visitor: false,
    home_x: x,
    home_y: y,
  };
}

function gathering(endsAt: number, startsAt?: number, kind = "news"): StageGathering {
  return {
    kind,
    winner_id: null,
    ends_at: endsAt,
    presenter_id: 1,
    news: NEWS,
    ...(startsAt === undefined ? {} : { starts_at: startsAt }),
  };
}

function walk(points: [number, number, number][]): StageMove {
  return {
    player_id: 1,
    kind: "news",
    start_at: 10_000,
    stack_level: 0,
    points: points.map(([x, y, t]) => ({ x, y, t })),
  };
}

function deskInput(
  moves = new Map<number, StageMove>(),
  presenterId: number | null = 1,
): DeskInput {
  return {
    presenterId,
    players: [player(1, 50, 8.5), player(2, 30, 40)],
    moves,
    platforms: PLATFORMS,
    room: ROOM,
  };
}

/** Returns the radius of the body at a height over the feet, between the points of the profile. */
function findRadius(height: number): number {
  const above = BODY_PROFILE.findIndex(([, level]) => level >= height);
  if (above <= 0) return above === 0 ? BODY_PROFILE[0]![0] : 0;
  const [lowRadius, low] = BODY_PROFILE[above - 1]!;
  const [highRadius, high] = BODY_PROFILE[above]!;
  return lowRadius + ((highRadius - lowRadius) * (height - low)) / (high - low);
}

/** Returns how far the farthest point of a body slice reaches from the middle of the desk arcs. */
function measureSlice(radius: number): number {
  let farthest = 0;
  for (let step = -10; step <= 10; step++) {
    const turn = (step / 10) * (Math.PI / 2);
    const x = radius * Math.sin(turn);
    const z = radius * BODY_DEPTH * Math.cos(turn);
    farthest = Math.max(farthest, Math.hypot(x, z - DESK.center));
  }
  return farthest;
}

/** Returns how far the body reaches toward a part of the desk between two heights, jumping or not. */
function measureReach(bottom: number, top: number): number {
  let farthest = 0;
  for (let height = bottom; height <= top; height += 0.01) {
    for (const jump of [0, CHEER_JUMP])
      farthest = Math.max(farthest, measureSlice(findRadius(height - jump)));
  }
  return farthest;
}

test("the show is on air from its start until its end, without a start from the beginning", () => {
  const unknown = Number.NEGATIVE_INFINITY;
  assert.deepEqual(findShowSpan(gathering(200_000, 50_000)), { start: 50_000, end: 200_000 });
  assert.deepEqual(findShowSpan(gathering(200_000)), { start: unknown, end: 200_000 });
  assert.deepEqual(findShowSpan(gathering(200_000, 200_000)), { start: unknown, end: 200_000 });
  assert.equal(findShowSpan(gathering(200_000, 50_000, "food")), null);
  assert.equal(findShowSpan(null), null);
});

test("with a start the studio comes up with the first intro of the show", () => {
  for (const [endsAt, startsAt] of [
    [200_000, 170_000],
    [200_000, 110_000],
    [900_000, 300_000],
  ] as const) {
    const planned = gathering(endsAt, startsAt);
    const span = findShowSpan(planned);
    const moment = findMoment(planShow(planned) as NewsShow, startsAt + 1);
    assert.equal(span?.start, startsAt);
    assert.equal(moment?.beat.kind, "intro");
    assert.ok(Math.abs((moment?.startedAt ?? 0) - startsAt) < 1e-6, `${startsAt}`);
  }
});

test("without a start the studio stands whenever the show is on air, also a longer one", () => {
  // The server sends no start yet, and a gathering may run longer than the usual 90 seconds.
  const planned = gathering(300_000);
  const show = planShow(planned) as NewsShow;
  const span = findShowSpan(planned);
  assert.ok(span);
  const spot: DeskSpot = { x: 0, z: 0, floor: STAGE_HEIGHT, turn: 0, arrival: -Infinity };
  for (const serverTime of [0, 100_000, 205_000, 290_000]) {
    assert.ok(findMoment(show, serverTime), `on air at ${serverTime}`);
    assert.equal(measureScreens(span, serverTime), 1);
    const moment = { serverTime, reducedMotion: false };
    assert.deepEqual(measureDesk(span, spot, moment), { shown: 1, lift: 1 });
  }
  // A presenter that walks in still gets its desk only once it stands, and all of it leaves.
  const late = measureDesk(
    span,
    { ...spot, arrival: 150_000 },
    { serverTime: 140_000, reducedMotion: false },
  );
  assert.equal(late.shown, 0);
  assert.equal(measureScreens(span, 300_000), 0);
});

test("the desk stands where the presenter stands on the stage, turned like the stage", () => {
  const spot = placeDesk(deskInput());
  const home = toFloorPoint({ x: 50, y: 8.5 }, ROOM);
  assert.ok(spot);
  assert.equal(spot.x, home.x);
  assert.equal(spot.z, home.z);
  assert.equal(spot.floor, STAGE_HEIGHT);
  assert.equal(spot.turn, PLATFORMS[0]?.turn);
  assert.equal(spot.arrival, Number.NEGATIVE_INFINITY);
});

test("a walking presenter gets its desk where its walk ends, once it arrives", () => {
  const moves = new Map([
    [
      1,
      walk([
        [50, 40, 0],
        [40, 9, 6000],
      ]),
    ],
  ]);
  const spot = placeDesk(deskInput(moves));
  const end = toFloorPoint({ x: 40, y: 9 }, ROOM);
  assert.deepEqual(spot && { x: spot.x, z: spot.z, arrival: spot.arrival }, {
    ...end,
    arrival: 16_000,
  });
});

test("without a presenter on a stage there is no desk", () => {
  const away = new Map([[1, walk([[50, 40, 0]])]]);
  assert.equal(placeDesk(deskInput(away)), null);
  assert.equal(placeDesk(deskInput(undefined, null)), null);
  assert.equal(placeDesk(deskInput(undefined, 7)), null);
  assert.equal(placeDesk({ ...deskInput(), platforms: [] }), null);
});

test("on a turned stage the desk turns with it", () => {
  const turned: StageArea[] = AREAS.map((area) =>
    area.prop === "stage-platform" ? { ...area, rotation: 90 } : area,
  );
  const platforms = listPlatforms(turned, ROOM);
  const spot = placeDesk({ ...deskInput(), platforms });
  assert.equal(spot?.turn, -Math.PI / 2);
});

test("in the demo hall the desk stands on the stage, between the presenter and the hall", () => {
  const spot = placeDesk(deskInput()) as DeskSpot;
  const platform = PLATFORMS[0];
  assert.ok(platform);
  const front = platform.middle.z + platform.depth / 2;
  const deskFront = spot.z + (DESK.face + DESK.center) * PRESENTER_SCALE;
  assert.ok(deskFront > spot.z && deskFront <= front, `desk front ${deskFront}, stage ${front}`);
});

test("the desk clears the body of the presenter, also when it jumps, and is wider than its hands", () => {
  const top = DESK.top.bottom + DESK.top.height;
  const panel = measureReach(0, DESK.top.bottom);
  assert.ok(panel < DESK.panel.inner, `body reaches ${panel} toward the panel`);
  const slab = measureReach(DESK.top.bottom, top);
  assert.ok(slab < DESK.top.inner, `body reaches ${slab} toward the top`);
  assert.ok(DESK.face * Math.sin(DESK.angle) > HAND_REACH);
  assert.ok(DESK.top.outer > DESK.face && DESK.face > DESK.panel.outer);
});

test("the desk rises once the show is on air and the presenter stands, and sinks before the end", () => {
  const span = { start: 100_000, end: 190_000 };
  const spot: DeskSpot = { x: 0, z: 0, floor: STAGE_HEIGHT, turn: 0, arrival: -Infinity };
  const at = (serverTime: number, arrival = spot.arrival) =>
    measureDesk(span, { ...spot, arrival }, { serverTime, reducedMotion: false });
  assert.deepEqual(at(99_000), { shown: 0, lift: 0 });
  const rising = at(100_500);
  assert.ok(rising.lift > 0 && rising.lift < 1 && rising.shown > 0);
  assert.deepEqual(at(105_000), { shown: 1, lift: 1 });
  // A late screen or the middle of a long show: the desk simply stands.
  assert.deepEqual(at(150_000), { shown: 1, lift: 1 });
  assert.deepEqual(at(110_000, 120_000), { shown: 0, lift: 0 });
  assert.equal(at(125_000, 120_000).lift, 1);
  const sinking = at(189_500);
  assert.ok(sinking.lift > 0 && sinking.lift < 1);
  assert.deepEqual(at(190_000), { shown: 0, lift: 0 });
});

test("a show that repeats keeps its desk between the runs", () => {
  const planned = gathering(900_000, 300_000);
  const show = planShow(planned) as NewsShow;
  const span = findShowSpan(planned);
  const run = show.marks.at(-1) ?? 0;
  assert.ok(span && run < span.end - span.start);
  const spot: DeskSpot = { x: 0, z: 0, floor: STAGE_HEIGHT, turn: 0, arrival: -Infinity };
  for (const serverTime of [span.end - run, span.end - run + 1, span.end - 2 * run]) {
    const moment = { serverTime, reducedMotion: false };
    assert.deepEqual(measureDesk(span, spot, moment), { shown: 1, lift: 1 });
    assert.equal(measureScreens(span, serverTime), 1);
  }
});

test("with reduced motion the desk fades where it stands", () => {
  const span = { start: 100_000, end: 190_000 };
  const spot: DeskSpot = { x: 0, z: 0, floor: STAGE_HEIGHT, turn: 0, arrival: -Infinity };
  for (const serverTime of [99_000, 100_400, 100_700, 150_000, 189_600, 190_000]) {
    const look = measureDesk(span, spot, { serverTime, reducedMotion: true });
    assert.equal(look.lift, 1);
  }
  const fading = measureDesk(span, spot, { serverTime: 100_700, reducedMotion: true });
  assert.ok(fading.shown > 0 && fading.shown < 1);
  assert.equal(measureDesk(span, spot, { serverTime: 99_000, reducedMotion: true }).shown, 0);
});

test("the screens fade to the broadcast at the start and back at the end", () => {
  const span = { start: 100_000, end: 190_000 };
  assert.equal(measureScreens(span, 99_000), 0);
  const coming = measureScreens(span, 100_400);
  assert.ok(coming > 0 && coming < 1);
  assert.equal(measureScreens(span, 150_000), 1);
  assert.equal(measureScreens(span, 190_000), 0);
});

/** A card of a report as `newsLines.ts` writes it. */
function card(changes: Partial<NewsCard> = {}): NewsCard {
  return {
    rubric: "FLEISS-REKORD",
    glyph: "⚡",
    headline: "Jelly 2 sammelt 420 XP.",
    sub: "IM STUDIO",
    figure: "420 XP",
    isUrgent: false,
    playerIds: [2],
    isLive: false,
    picture: null,
    ...changes,
  };
}

/** The report on air at one beat of a show. */
function liveAt(index: number, shown: NewsCard): NewsLive {
  const show = planShow(gathering(200_000, 110_000)) as NewsShow;
  const moment = findMoment(show, 110_000 + (show.marks[index] ?? 0) + 1);
  assert.ok(moment);
  return { show, moment, card: shown, ticker: "" };
}

test("the screens show the logo around the show and the card of every report", () => {
  const intro = describeBroadcast(liveAt(0, card()));
  assert.deepEqual(intro, { key: "channel", card: null });
  const lastBeat = planShow(gathering(200_000, 110_000))?.beats.length ?? 0;
  assert.equal(describeBroadcast(liveAt(lastBeat - 1, card())).card, null);
  const report = describeBroadcast(liveAt(1, card()));
  assert.equal(report.card?.figure, "420 XP");
  // The picture is painted again only when it looks different.
  const reworded = describeBroadcast(liveAt(1, card({ headline: "Anders gesagt." })));
  assert.equal(reworded.key, report.key);
  const urgent = describeBroadcast(liveAt(1, card({ isUrgent: true })));
  assert.notEqual(urgent.key, report.key);
  assert.notEqual(describeBroadcast(liveAt(1, card({ figure: "" }))).key, report.key);
});
