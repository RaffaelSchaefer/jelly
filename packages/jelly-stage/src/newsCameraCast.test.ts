import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsShow } from "./news.ts";
import type { NewsPose } from "./newsCamera.ts";
import type { StageGathering, StageMove, StagePlayer } from "./types.ts";

import { createDemoRoom, DEMO_HALL } from "./demoRoom.fixture.ts";
import { findPositions, playMoves } from "./moves.ts";
import { findMoment, planShow } from "./news.ts";
import { castNews, type NewsCastInput } from "./newsCameraCast.ts";
import { planNewsShot, type NewsShotScene } from "./newsShots.ts";
import { findReady } from "./newsShotsStudio.ts";
import { measureRoom, toFloorPoint } from "./world.ts";
import { listPlatforms } from "./zones.ts";

const ROOM = measureRoom(DEMO_HALL);
const AREAS = createDemoRoom();
const SIZES = { jellyHeight: 2.33, presenterScale: 1.8 };

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

function move(playerId: number, kind: string, points: [number, number, number][], level = 0) {
  return {
    player_id: playerId,
    kind,
    start_at: 1000,
    stack_level: level,
    points: points.map(([x, y, t]) => ({ x, y, t })),
  } satisfies StageMove;
}

function createInput(): NewsCastInput {
  const players = [player(1, 50, 8.5), player(2, 30, 20), player(3, 80, 25), player(4, 80, 25)];
  const moves = new Map<number, StageMove>([
    [
      2,
      move(2, "news", [
        [30, 40, 0],
        [30, 20, 4000],
      ]),
    ],
    [3, move(3, "stack", [[86, 22, 0]], 0)],
    [4, move(4, "stack", [[86, 22, 0]], 1)],
  ]);
  return {
    players,
    moves,
    stacks: [{ id: 5, x: 86, y: 22, ends_at: 99_000, member_ids: [3, 4] }],
    areas: AREAS,
    platforms: listPlatforms(AREAS, ROOM),
    room: ROOM,
    positions: new Map([[2, toFloorPoint({ x: 30, y: 30 }, ROOM)]]),
    presenterId: 1,
    sizes: SIZES,
  };
}

test("the cast stands where the moves end, the presenter large on the stage, a tower stacked", () => {
  const { actors, towers } = castNews(createInput());
  const presenter = actors.get(1)!;
  assert.equal(presenter.floor, 0.35);
  assert.ok(Math.abs(presenter.height - 2.33 * 1.8) < 1e-9);
  const walker = actors.get(2)!;
  assert.deepEqual(walker.goal, toFloorPoint({ x: 30, y: 20 }, ROOM));
  assert.deepEqual(walker.now, toFloorPoint({ x: 30, y: 30 }, ROOM));
  assert.equal(actors.get(3)!.floor, 0);
  assert.ok(Math.abs(actors.get(4)!.floor - 0.92 * 2.33) < 1e-9);
  assert.deepEqual(towers[0]?.memberIds, [3, 4]);
  assert.deepEqual(towers[0]?.foot, toFloorPoint({ x: 86, y: 22 }, ROOM));
});

test("the set of the demo hall has its stage at the back and two screens on it", () => {
  const { set } = castNews(createInput());
  assert.ok(set.stage);
  assert.ok(set.stage.front < 0 && set.stage.front > set.stage.middle.z);
  assert.ok(Math.abs(set.stage.width - ROOM.width * 0.9) < 1e-9);
  assert.equal(set.screens.length, 2);
  for (const screen of set.screens) {
    assert.ok(Math.abs(screen.y - (0.35 + 0.55 + 1.15)) < 1e-9);
    assert.ok(screen.z < set.stage.middle.z);
  }
  assert.ok((set.screens[0]?.x ?? 0) < 0 && (set.screens[1]?.x ?? 0) > 0);
});

test("a room without a stage has no set", () => {
  const input = { ...createInput(), areas: [], platforms: [] };
  assert.deepEqual(castNews(input).set, { stage: null, screens: [] });
});

/**
 * News as the server starts them in the demo hall: the gathering at `SHOW_AT` without `starts_at`,
 * the presenter sent from a desk at the back over the aisle at the wall to the stage, its move
 * starting 1.5 seconds into the show and arriving after 47 seconds.
 */
const SHOW_AT = 100_000;
const NEWS: StageGathering = {
  kind: "news",
  winner_id: null,
  ends_at: SHOW_AT + 90_000,
  presenter_id: 1,
  news: {
    top_xp: { player_id: 2, xp: 420 },
    achievements: [{ player_id: 3, key: "hydrated" }],
    tallest_stack: [],
    next_item: null,
  },
};
const TO_STAGE = move(1, "news", [
  [19.6, 82.7, 0],
  [2.6, 79.1, 5000],
  [2.6, 28.2, 30_000],
  [50, 8.5, 47_000],
]);
const SHOW = planShow(NEWS) as NewsShow;
const HOME: NewsPose = {
  position: { x: 0, y: 60, z: 60 },
  target: { x: 0, y: 0, z: 0 },
  fov: 32,
  lift: 0,
};

/** The scene the news camera films at a server time, with the moves as the stage plays them. */
function filmAt(serverTime: number, isPlayed = true): NewsShotScene {
  const players = [player(1, 19.6, 82.7), player(2, 30, 20), player(3, 70, 20)];
  const raw = new Map([[1, { ...TO_STAGE, start_at: SHOW_AT + 1500 }]]);
  const moves = isPlayed ? playMoves(raw, NEWS, serverTime) : raw;
  const cast = castNews({
    ...createInput(),
    players,
    moves,
    stacks: [],
    positions: findPositions(players, moves, serverTime, ROOM),
  });
  const moment = findMoment(SHOW, serverTime);
  assert.ok(moment);
  const card = { playerIds: [], isLive: false, rubric: "JELLY NEWS" };
  return {
    ...cast,
    presenterId: 1,
    home: HOME,
    view: { aspect: 16 / 9, top: 0, bottom: 1 },
    live: { show: SHOW, moment, card },
    reducedMotion: false,
  };
}

test("the presenter put on the stage counts as arrived there from the first frame of the show", () => {
  const presenter = filmAt(SHOW_AT + 600).actors.get(1)!;
  const onStage = toFloorPoint({ x: 50, y: 8.5 }, ROOM);
  assert.deepEqual(presenter.now, onStage);
  assert.deepEqual(presenter.goal, onStage);
  assert.deepEqual(presenter.walk(SHOW_AT), onStage);
  assert.equal(presenter.arrival, Number.NEGATIVE_INFINITY);
  assert.equal(presenter.floor, 0.35);
});

test("the studio films the presenter from the first report: the intro cranes down to its desk", () => {
  const intro = SHOW.marks[1]!;
  for (let at = SHOW_AT + 600; at < SHOW.endsAt; at += 2000) {
    assert.ok(findReady(filmAt(at)) <= 0, `ready for the studio at ${at - SHOW_AT}`);
  }
  // At the end of the intro the camera stands low in front of the presenter, not high over the hall.
  const { pose } = planNewsShot(filmAt(SHOW_AT + 0.95 * intro));
  const presenter = filmAt(SHOW_AT).actors.get(1)!;
  assert.ok(pose.position.y < presenter.floor + presenter.height, `camera at ${pose.position.y}`);
  // Played as the server sends it, the presenter would still be in the hall: the stand-in films.
  assert.ok(findReady(filmAt(SHOW_AT + 600, false)) > 1);
  const standIn = planNewsShot(filmAt(SHOW_AT + 0.95 * intro, false)).pose;
  assert.ok(standIn.position.y > presenter.floor + presenter.height);
});
