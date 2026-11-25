import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageCatalog, StageGathering, StagePlayer } from "./types.ts";

import { NO_INSETS } from "./insets.ts";
import { traceLogoBand } from "./newsBarBumper.ts";
import { planShow } from "./news.ts";
import { measureBumper, measureSweeps } from "./newsBarTiming.ts";
import { createNewsDirector, stepNews } from "./newsDirector.ts";
import { chooseMode, findOpener, WAIT_MS, type OpenerState } from "./newsTitleOpener.ts";

const FREE = { x: 0, y: 0, width: 1920, height: 1080 };

test("the band of the logo shows the title only while it is on screen", () => {
  const calls: string[] = [];
  const context = new Proxy({} as Record<string, unknown>, {
    get: (_, key) => () => calls.push(String(key)),
  }) as unknown as CanvasRenderingContext2D;
  const length = 3000;
  const sweeps = measureSweeps(length);
  const scene = (progress: number, reducedMotion = false) => ({
    free: FREE,
    progress,
    length,
    reducedMotion,
  });
  assert.equal(traceLogoBand(context, scene(0)), false);
  assert.equal(traceLogoBand(context, scene(sweeps.leave)), true);
  assert.equal(traceLogoBand(context, scene(sweeps.leave + sweeps.out + 1e-3)), false);
  // Without motion it is all of the free area, fading in and out.
  assert.equal(traceLogoBand(context, scene(0, true)), false);
  assert.equal(traceLogoBand(context, scene(0.5, true)), true);
  assert.ok(calls.includes("rect") && calls.includes("lineTo"));
});

const ENDS_AT = 1_795_000_090_000;
const catalog: StageCatalog = {
  signs: [],
  achievements: [{ key: "hatched", title: "Geschlüpft" }],
};
const players: StagePlayer[] = [1, 2].map((id) => ({
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
const gathering: StageGathering = {
  kind: "news",
  winner_id: null,
  ends_at: ENDS_AT,
  starts_at: ENDS_AT - 90_000,
  presenter_id: 1,
  news: { top_xp: { player_id: 2, xp: 300 }, achievements: [], tallest_stack: [], next_item: null },
};

/** The news on air at a server time, as a view keeps them. */
function readNews(serverTime: number) {
  const director = createNewsDirector();
  stepNews(director, { gathering, players, catalog, serverTime, now: serverTime });
  return director;
}

test("every run of a show opens with the title, nothing else has one, a breaking news takes it along", () => {
  const start = ENDS_AT - 90_000;
  const frame = (serverTime: number, news = readNews(serverTime)) => ({
    news,
    clockOffset: 0,
    reducedMotion: false,
    size: { width: 1280, height: 720 },
    insets: NO_INSETS,
    now: serverTime,
  });
  // This show runs several times in its 90 seconds, each run opens with its own title.
  const { marks } = planShow(gathering)!;
  const run = marks.at(-1)!;
  const runs = Math.round(90_000 / run);
  const keys = Array.from({ length: runs }, (_, index) =>
    findOpener(frame(start + index * run + 400)),
  );
  assert.ok(runs > 1);
  assert.equal(new Set(keys.map((opener) => opener?.key)).size, runs);
  assert.ok(keys.every((opener) => opener !== null));
  assert.equal(findOpener(frame(start + 400))?.alpha, 1);
  // Late in the opening the title is gone, and no report has one.
  assert.equal(findOpener(frame(start + 0.95 * marks[1]!)), null);
  assert.equal(findOpener(frame(start + (marks[1]! + marks[2]!) / 2)), null);
  assert.equal(findOpener({ ...frame(start + 400), size: { width: 120, height: 90 } }), null);
  const news = readNews(start + 400);
  const card = news.live?.card;
  assert.ok(card && news.live);
  // The breaking news below comes and covers the screen while the title is still on.
  assert.ok(measureBumper(news.live.moment) > 900);
  const flash = { eventId: 1, card, ticker: "", startedAt: start + 200, endsAt: start + 8200 };
  const covered = findOpener(frame(start + 400, { ...news, flash }));
  assert.ok(covered && covered.alpha > 0 && covered.alpha < 1);
  assert.equal(findOpener(frame(start + 900, { ...readNews(start + 900), flash })), null);
});

test("an opening title keeps how it shows from its first frame on, a new run decides again", () => {
  const state: OpenerState = {
    ready: false,
    failed: false,
    bornAt: 0,
    opener: { key: "", mode: null },
  };
  // A screen that has just started waits for the model, then shows the title in 3D.
  assert.equal(chooseMode(state, "show:2", 100), "wait");
  state.ready = true;
  assert.equal(chooseMode(state, "show:2", 300), "3d");
  // An older screen without the model shows the stand-in, and keeps it once the model is there.
  const late: OpenerState = {
    ready: false,
    failed: false,
    bornAt: 0,
    opener: { key: "", mode: null },
  };
  assert.equal(chooseMode(late, "show:1", WAIT_MS + 1), "2d");
  late.ready = true;
  assert.equal(chooseMode(late, "show:1", WAIT_MS + 500), "2d");
  assert.equal(chooseMode(late, "show:2", WAIT_MS + 9000), "3d");
  // A model that failed never comes.
  const failed: OpenerState = {
    ready: false,
    failed: true,
    bornAt: 0,
    opener: { key: "", mode: null },
  };
  assert.equal(chooseMode(failed, "show:1", 10), "2d");
});
