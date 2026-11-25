import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsShow } from "./news.ts";
import type { NewsActor } from "./newsCameraCast.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import { bendToLens, LENS_RANGE } from "./lens.ts";
import { findMoment, planShow } from "./news.ts";
import { projectNews, type NewsPose } from "./newsCamera.ts";
import { planNewsShot, type NewsShotScene } from "./newsShots.ts";

const HEIGHT = 2.33;
const GROWN = 1.8;
const PRESENTER = 1;
const STAGE = { middle: { x: 0, z: -14 }, front: -11, width: 24, floor: 0.35 };
const HOME: NewsPose = {
  position: { x: 0, y: 45, z: 40 },
  target: { x: 0, y: 0, z: 0 },
  fov: 32,
  lift: -0.02,
};
const SCREENS = [
  { aspect: 16 / 9, width: 1920, height: 1080 },
  { aspect: 1.2, width: 720, height: 600 },
];
/** From a desk in the hall up past the crowd to its spot on the stage, away from every camera. */
const WAY = [
  { x: -12, z: 12 },
  { x: -6, z: -6 },
  { x: 0, z: -12.5 },
];
/** A jelly turns around within half a second after it stops (`TURN_RATE` in `walking.ts`). */
const TURNED_MS = 500;
/** A studio shot shows the presenter at least this tall, a share of the height of the picture. */
const STUDIO_SIZE = 0.4;

/** Returns where the presenter is at a server time: on its way until `arrival`, then on its spot. */
function walkPresenter(arrival: number): (serverTime: number) => FloorPoint {
  return (serverTime) => {
    const share = Math.max(0, Math.min(1, serverTime / arrival)) * (WAY.length - 1);
    const leg = Math.min(WAY.length - 2, Math.floor(share));
    const [from, to] = [WAY[leg]!, WAY[leg + 1]!];
    const along = share - leg;
    return { x: from.x + (to.x - from.x) * along, z: from.z + (to.z - from.z) * along };
  };
}

function actor(id: number, walk: (serverTime: number) => FloorPoint, now: number): NewsActor {
  const spot = walk(now);
  const scale = id === PRESENTER ? GROWN : 1;
  return {
    id,
    now: spot,
    goal: walk(Number.POSITIVE_INFINITY),
    walk,
    arrival: Number.NEGATIVE_INFINITY,
    floor: spot.z < STAGE.front ? STAGE.floor : 0,
    height: HEIGHT * scale,
    half: 0.85 * scale,
    reach: 1.65 * scale,
  };
}

/** The presenter on its way, three staggered rows of six right of its way. */
function createActors(now: number, arrival: number): Map<number, NewsActor> {
  const actors = [{ ...actor(PRESENTER, walkPresenter(arrival), now), arrival }];
  for (let row = 0; row < 3; row++) {
    for (let place = 0; place < 6; place++) {
      const spot = { x: place * 2.4 + (row % 2) * 1.2, z: -7 + row * 3 };
      actors.push(actor(2 + row * 6 + place, () => spot, now));
    }
  }
  return new Map(actors.map((entry) => [entry.id, entry]));
}

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
    tallest_stack: [],
    next_item: { starts_at: 0, ends_at: null, title: "Turnier", detail: null, kind: "orga" },
  },
}) as NewsShow;
/** The first run of the show starts with the gathering, the last one ends with it. */
const LAST_RUN = SHOW.endsAt - SHOW.marks.at(-1)!;

/** Returns the server time `share` through the `nth` beat of a kind in the first run. */
function beatAt(kind: string, share: number, nth = 0): number {
  const index = SHOW.beats.flatMap((beat, at) => (beat.kind === kind ? [at] : []))[nth]!;
  const from = SHOW.marks[index]!;
  return from + share * (SHOW.marks[index + 1]! - from);
}

/** It arrives during a report, or just after or well into the color report the studio shows. */
const ARRIVALS = [beatAt("achievement", 0.5, 1), beatAt("extra", 0.02), beatAt("extra", 0.45)];

/** Returns the card of a beat as `newsLines.ts` would write it, a color report without anybody. */
function cardOf(index: number): NewsShotScene["live"]["card"] {
  const beat = SHOW.beats[index];
  const named = beat?.kind === "top_xp" || beat?.kind === "achievement" ? [beat.playerId] : [];
  return { playerIds: named, isLive: false, rubric: "KURZ GEMELDET" };
}

function createScene(serverTime: number, aspect: number, arrival = ARRIVALS[0]!): NewsShotScene {
  const moment = findMoment(SHOW, serverTime);
  assert.ok(moment);
  return {
    actors: createActors(serverTime, arrival),
    towers: [],
    blocks: [],
    set: { stage: STAGE, screens: [{ x: 6, y: 2.05, z: -16.5 }] },
    presenterId: PRESENTER,
    home: HOME,
    view: { aspect, top: 0, bottom: 1 },
    live: { show: SHOW, moment, card: cardOf(moment.index) },
    reducedMotion: false,
  };
}

/** Reports where a point shows in the picture after the lens, as shares of width and height. */
function locate(pose: NewsPose, point: ScenePoint, screen: (typeof SCREENS)[number]) {
  const seen = projectNews(pose, point, screen.aspect);
  const flat = { x: ((seen.x + 1) / 2) * screen.width, y: ((1 - seen.y) / 2) * screen.height };
  const bent = bendToLens(flat, screen, LENS_RANGE.usual);
  return { x: bent.x / screen.width, y: bent.y / screen.height, depth: seen.depth };
}

function isInside(seen: { x: number; y: number; depth: number }): boolean {
  return seen.depth > 0 && seen.x > 0 && seen.x < 1 && seen.y > 0 && seen.y < 1;
}

/** Measures how far a point lies from the upright axis of a jelly, from its floor to its top. */
function measureOff(point: ScenePoint, actor: NewsActor): number {
  const rise = Math.max(actor.floor, Math.min(actor.floor + actor.height, point.y)) - point.y;
  return Math.hypot(point.x - actor.now.x, rise, point.z - actor.now.z);
}

/** Returns how tall a jelly shows, as a share of the picture, 0 when it is not in it. */
function measureSize(pose: NewsPose, actor: NewsActor, screen: (typeof SCREENS)[number]): number {
  const { now, floor, height } = actor;
  const at = (rise: number) =>
    locate(pose, { x: now.x, y: floor + rise * height, z: now.z }, screen);
  return isInside(at(0.5)) ? Math.abs(at(0).y - at(1).y) : 0;
}

/**
 * Returns how tall the presenter shows when the camera aims at it, as a share of the picture: 0
 * when it is not in the picture or the camera aims at somebody else, as at a jelly in front of it.
 */
function measureSubject(scene: NewsShotScene, screen: (typeof SCREENS)[number]): number {
  const { pose } = planNewsShot(scene);
  const actors = [...scene.actors.values()];
  const aimed = actors.reduce((best, actor) =>
    measureOff(pose.target, actor) < measureOff(pose.target, best) ? actor : best,
  );
  return aimed.id === PRESENTER ? measureSize(pose, aimed, screen) : 0;
}

test("a presenter walking away from the camera is never framed as the subject of a studio shot", () => {
  for (const screen of SCREENS) {
    for (const arrival of ARRIVALS) {
      let largest = 0;
      for (let time = 0; time < arrival + TURNED_MS; time += 100) {
        const scene = createScene(time, screen.aspect, arrival);
        largest = Math.max(largest, measureSubject(scene, screen));
      }
      assert.ok(largest < STUDIO_SIZE, `${screen.aspect} ${arrival}: ${largest} tall on its way`);
    }
  }
});

test("once the presenter has arrived and turned, the studio frames it again", () => {
  // The announcement of what comes next in the last run, long after the presenter arrived.
  const from = LAST_RUN + beatAt("next", 0);
  const length = beatAt("next", 1) - beatAt("next", 0);
  for (const screen of SCREENS) {
    let smallest = 1;
    for (let share = 0; share < 1; share += 0.05) {
      const scene = createScene(from + share * length, screen.aspect);
      smallest = Math.min(smallest, measureSubject(scene, screen));
    }
    assert.ok(smallest > STUDIO_SIZE, `${screen.aspect}: shows ${smallest} tall in the studio`);
  }
});

test("while the presenter is far away the intro lands on the stage and the hall", () => {
  const length = SHOW.marks[1]!;
  for (const screen of SCREENS) {
    const scene = createScene(0.95 * length, screen.aspect);
    const { pose } = planNewsShot(scene);
    const stage = { x: STAGE.middle.x, y: STAGE.floor + 1.6, z: STAGE.middle.z };
    assert.ok(isInside(locate(pose, stage, screen)), `${screen.aspect}: stage out of the picture`);
    assert.ok(isInside(locate(pose, { x: 6, y: 2.05, z: -16.5 }, screen)), "screen not shown");
    assert.ok(pose.position.z > STAGE.front && pose.target.z < pose.position.z);
  }
});

test("while the presenter walks no take is a flash: cuts lie seconds apart", () => {
  const screen = SCREENS[0]!;
  for (const arrival of ARRIVALS) {
    let last = planNewsShot(createScene(0, screen.aspect, arrival)).pose.position;
    let cutAt = Number.NEGATIVE_INFINITY;
    for (let time = 50; time < SHOW.endsAt; time += 50) {
      const { position } = planNewsShot(createScene(time, screen.aspect, arrival)).pose;
      const moved = Math.hypot(position.x - last.x, position.y - last.y, position.z - last.z);
      last = position;
      if (moved < 1.5) continue;
      assert.ok(time - cutAt >= 1500, `${arrival}: cuts at ${cutAt} and ${time}`);
      cutAt = time;
    }
  }
});

/**
 * Six jellies cross the stage right in front of the presenter, one after the other through a beat
 * from `from` to `to`, and the last one stays there, right in front of the desk.
 */
function addCrossers(scene: NewsShotScene, now: number, [from, to]: [number, number]): void {
  for (let index = 0; index < 6; index++) {
    // Each passes the presenter in its sixth of the beat, at 1.4 units a second.
    const passes = from + ((index + 0.5) * (to - from)) / 6;
    const [z, way] = index === 5 ? [-11.8, 12.6] : [-11.6 - (index % 3) * 0.3, 24];
    const walk = (serverTime: number) => ({
      x: -12 + Math.max(0, Math.min(way, 12 + ((serverTime - passes) / 1000) * 1.4)),
      z,
    });
    scene.actors.set(50 + index, actor(50 + index, walk, now));
  }
}

test("the studio holds still while jellies cross the stage in front of the presenter", () => {
  const next = SHOW.beats.findIndex((beat) => beat.kind === "next");
  const [from, to] = [SHOW.marks[next]!, SHOW.marks[next + 1]!];
  for (const screen of SCREENS) {
    let last: NewsPose | null = null;
    for (let time = from + 50; time < to; time += 50) {
      const scene = createScene(time, screen.aspect, 1);
      addCrossers(scene, time, [from, to]);
      const { pose } = planNewsShot(scene);
      const step = last
        ? Math.hypot(
            pose.position.x - last.position.x,
            pose.position.y - last.position.y,
            pose.position.z - last.position.z,
          )
        : 0;
      assert.ok(step < 0.05, `${screen.aspect} ${time}: stepped ${step}`);
      const size = measureSize(pose, scene.actors.get(PRESENTER)!, screen);
      assert.ok(size > STUDIO_SIZE, `${screen.aspect} ${time}: presenter ${size} tall`);
      last = pose;
    }
  }
});
