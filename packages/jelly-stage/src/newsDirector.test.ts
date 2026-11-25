import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageCatalog, StageEvent, StageGathering, StagePlayer } from "./types.ts";

import { planShow } from "./news.ts";
import {
  createNewsDirector,
  noteNewsStart,
  flashNews,
  stepNews,
  type NewsFrame,
} from "./newsDirector.ts";

const ENDS_AT = 1_795_000_090_000;
const catalog: StageCatalog = {
  signs: [],
  achievements: [{ key: "hatched", title: "Geschlüpft" }],
};

function makePlayer(id: number): StagePlayer {
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
    home_x: 10,
    home_y: 20,
  };
}

const gathering: StageGathering = {
  kind: "news",
  winner_id: null,
  ends_at: ENDS_AT,
  presenter_id: 1,
  news: {
    top_xp: { player_id: 2, xp: 300 },
    achievements: [{ player_id: 3, key: "hatched" }],
    tallest_stack: [],
    next_item: null,
  },
};

/** The show of the gathering, as a director plans it without a known start. */
const SHOW = planShow(gathering)!;
const RUN = SHOW.marks.at(-1)!;

/** Returns how many milliseconds before the end `share` of a beat of the last run lies. */
function leftAt(kind: string, share: number): number {
  const index = SHOW.beats.findIndex((beat) => beat.kind === kind);
  const from = SHOW.marks[index]!;
  return RUN - (from + share * (SHOW.marks[index + 1]! - from));
}

/** A frame `left` milliseconds before the end. The clock of the effects runs 5000 behind. */
function makeFrame(left: number, more: Partial<NewsFrame> = {}): NewsFrame {
  const serverTime = ENDS_AT - left;
  return {
    gathering,
    players: [1, 2, 3, 4].map(makePlayer),
    catalog,
    serverTime,
    now: serverTime - 5000,
    ...more,
  };
}

test("a report starts its effects once, also after the state was read again", () => {
  const director = createNewsDirector();
  // Five beats: opening, XP, achievement, color, closing.
  const first = stepNews(director, makeFrame(leftAt("top_xp", 0.2)));
  assert.equal(director.live?.moment.beat.kind, "top_xp");
  assert.deepEqual(
    first.map((effect) => [effect.kind, effect.playerId]),
    [
      ["spotlight", 2],
      ["motion", 2],
      ["emote", 1],
    ],
  );
  assert.deepEqual(stepNews(director, makeFrame(leftAt("top_xp", 0.3))), []);
  // A reload brings an equal gathering as a new object.
  const reloaded = makeFrame(leftAt("top_xp", 0.4), { gathering: { ...gathering } });
  assert.deepEqual(stepNews(director, reloaded), []);
  assert.ok(stepNews(director, makeFrame(leftAt("achievement", 0.2))).length > 0);
  assert.equal(director.live?.moment.beat.kind, "achievement");
});

test("the effects run on the clock of the view and end with their report", () => {
  const director = createNewsDirector();
  const frame = makeFrame(leftAt("top_xp", 0.5));
  const [light] = stepNews(director, frame);
  const moment = director.live?.moment;
  assert.ok(light && moment);
  assert.equal(light.startedAt, moment.startedAt - 5000);
  assert.equal(light.endsAt, moment.endsAt - 5000);
  // A screen that loads in the middle of a report joins it there.
  assert.ok(light.startedAt < frame.now && light.endsAt > frame.now);
});

test("nothing is on air without news, before the catalog or after the end", () => {
  const director = createNewsDirector();
  assert.deepEqual(stepNews(director, makeFrame(70_000, { catalog: null })), []);
  assert.equal(director.live, null);
  assert.ok(stepNews(director, makeFrame(70_000)).length > 0);
  assert.deepEqual(stepNews(director, makeFrame(-1)), []);
  assert.equal(director.live, null);
  stepNews(director, makeFrame(70_000, { gathering: null }));
  assert.equal(director.live, null);
  const food = { ...gathering, kind: "food" };
  stepNews(director, makeFrame(70_000, { gathering: food }));
  assert.equal(director.live, null);
});

test("the ticker runs through all reports but opening and closing", () => {
  const director = createNewsDirector();
  stepNews(director, makeFrame(89_000));
  const ticker = director.live?.ticker ?? "";
  assert.match(ticker, /300 XP/);
  assert.match(ticker, /Geschlüpft/);
  assert.doesNotMatch(ticker, /Jelly-News/);
  assert.equal(ticker.split("+++").length, 3);
});

/** An award the server gave `age` milliseconds before `serverTime`. */
function makeAward(serverTime: number, age: number, more: Partial<StageEvent> = {}): StageEvent {
  return {
    id: 41,
    type: "award.given",
    player_id: 2,
    payload: { title: "Goldener Stupser" },
    created_at: serverTime - age,
    ...more,
  };
}

test("a fresh award flashes once, for eight seconds from when the server gave it", () => {
  const director = createNewsDirector();
  const players = [1, 2].map(makePlayer);
  const serverTime = ENDS_AT + 60_000;
  flashNews(director, makeAward(serverTime, 1500), { players, serverTime });
  const flash = director.flash;
  assert.ok(flash);
  assert.equal(flash.card.headline, "Jelly 2 erhält „Goldener Stupser“.");
  assert.equal(flash.card.rubric, "EILMELDUNG");
  assert.equal(flash.card.isUrgent, true);
  assert.deepEqual(flash.card.playerIds, [2]);
  assert.equal(flash.startedAt, serverTime - 1500);
  assert.equal(flash.endsAt, serverTime - 1500 + 8000);
  // The same event again, as after a reconnect, changes nothing.
  flashNews(director, makeAward(serverTime, 1500), { players, serverTime: serverTime + 3000 });
  assert.equal(director.flash, flash);
});

test("stale awards, other events and older awards do not flash", () => {
  const director = createNewsDirector();
  // Read through a call: an assertion would otherwise pin the type to its first value.
  const onAir = () => director.flash;
  const players = [makePlayer(2)];
  const serverTime = ENDS_AT + 60_000;
  flashNews(director, makeAward(serverTime, 11_000), { players, serverTime });
  assert.equal(onAir(), null);
  flashNews(director, makeAward(serverTime, 0, { type: "achievement.earned" }), {
    players,
    serverTime,
  });
  flashNews(director, makeAward(serverTime, 0, { payload: {} }), { players, serverTime });
  assert.equal(onAir(), null);
  flashNews(director, makeAward(serverTime, 1000, { id: 50 }), { players, serverTime });
  flashNews(director, makeAward(serverTime, 4000, { id: 49 }), { players, serverTime });
  assert.equal(onAir()?.eventId, 50);
  // A jelly that already left still gets its news, without light.
  flashNews(director, makeAward(serverTime, 0, { id: 51, player_id: 99 }), { players, serverTime });
  assert.match(onAir()?.card.headline ?? "", /^Ein Jelly erhält/);
  assert.deepEqual(onAir()?.card.playerIds, []);
});

test("a breaking news is kept a little past its end, then dropped", () => {
  const director = createNewsDirector();
  const serverTime = ENDS_AT + 60_000;
  flashNews(director, makeAward(serverTime, 0), { players: [], serverTime });
  const frame = (time: number): NewsFrame => ({
    ...makeFrame(0),
    gathering: null,
    serverTime: time,
  });
  stepNews(director, frame(serverTime + 9000));
  assert.ok(director.flash, "the show needs to know when the bar came back");
  stepNews(director, frame(serverTime + 14_000));
  assert.equal(director.flash, null);
});

test("the event that starts the news tells when the show began", () => {
  const director = createNewsDirector();
  // The orga starts news half a run shorter than usual: counted as 90 seconds, the show would be
  // in the middle of a run when it opens.
  const window = 90_000 - RUN / 2;
  const startedAt = ENDS_AT - window;
  const start = { id: 1, type: "gathering.changed", player_id: null, created_at: startedAt };
  noteNewsStart(director, { ...start, payload: { kind: "news", ends_at: ENDS_AT } });
  const opening = makeFrame(window - 1000);
  stepNews(director, opening);
  assert.equal(director.live?.moment.beat.kind, "intro");
  assert.ok(Math.abs((director.live?.moment.startedAt ?? 0) - startedAt) < 1e-6);
  // A screen that never saw the event counts the usual length and is somewhere else.
  const late = createNewsDirector();
  stepNews(late, opening);
  assert.notEqual(late.live?.moment.beat.kind, "intro");
  // Other gatherings, their end and the start of other news leave the show alone.
  const other = createNewsDirector();
  noteNewsStart(other, { ...start, payload: { kind: "food", ends_at: ENDS_AT } });
  noteNewsStart(other, { ...start, payload: {} });
  assert.equal(other.started, null);
  noteNewsStart(other, { ...start, payload: { kind: "news", ends_at: ENDS_AT + 1 } });
  stepNews(other, opening);
  assert.notEqual(other.live?.moment.beat.kind, "intro");
});
