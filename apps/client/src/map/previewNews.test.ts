import type { StageEvent, StageMove, StagePlayer, StagePoint } from "@jelly/stage";

import { createDemoRoom } from "@jelly/stage/demo-room";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_CATALOG } from "../pet";
import {
  castShow,
  createNewsGathering,
  createNewsPreview,
  NEWS_HASH,
  type NewsPreviewInput,
} from "./previewNews";
import { findPresenterSpot, listCrowdSpots } from "./previewNewsWalks";

const AREAS = createDemoRoom();
const SEATS = AREAS.filter((area) => area.kind === "seats");
const OWN_ID = 1;
const TOWER = [4, 3, 6];

/** Zwei Jellies je Sitzreihe wie in der Vorschau, das erste ist das eigene. */
function listPlayers(): StagePlayer[] {
  return SEATS.flatMap((seat) => [0.25, 0.75].map((share) => ({ seat, share }))).map(
    ({ seat, share }, index) => ({
      id: OWN_ID + index,
      name: `Jelly ${index}`,
      color: "mint",
      equipped: {},
      level: 1,
      sign: null,
      follow: null,
      area_id: seat.id,
      is_visitor: false,
      home_x: seat.x + seat.width * share,
      home_y: seat.y + seat.height / 2,
    }),
  );
}

/** Baut die Sendung und hält fest, was sie schickt. Der Turm steht, solange `tower.stands`. */
function setUp(hash = NEWS_HASH) {
  const moves: StageMove[] = [];
  const events: StageEvent[] = [];
  const last = new Map<number, StageMove>();
  const tower = { stands: true };
  const input: NewsPreviewInput = {
    players: listPlayers(),
    areas: AREAS,
    ownId: OWN_ID,
    tallestStack: TOWER,
    isFree: (player) => !(tower.stands && TOWER.includes(player.id)),
    lastMove: (playerId) => last.get(playerId),
    send: {
      move: (move) => {
        last.set(move.player_id, move);
        moves.push(move);
      },
      event: (event) => events.push(event),
    },
  };
  return { input, moves, events, last, tower, news: createNewsPreview(hash, input) };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createNewsGathering", () => {
  it("reports news as the server does, with achievements the catalog knows", () => {
    const { input } = setUp();
    const gathering = createNewsGathering(input, 1_000_000);
    expect(gathering).toMatchObject({ kind: "news", winner_id: null, ends_at: 1_090_000 });
    expect(gathering.starts_at).toBeUndefined();
    expect(gathering.presenter_id).toBe(2);
    expect(gathering.news?.top_xp).toEqual({ player_id: OWN_ID, xp: 420 });
    expect(gathering.news?.tallest_stack).toEqual(TOWER);
    expect(gathering.news?.next_item?.starts_at).toBeGreaterThan(1_000_000);
    const known = new Set(PREVIEW_CATALOG.achievements.map((entry) => entry.key));
    expect(gathering.news?.achievements).toHaveLength(3);
    for (const { key } of gathering.news?.achievements ?? []) expect(known.has(key)).toBe(true);
  });

  it("names nobody else as the presenter", () => {
    const { input } = setUp();
    const { news, presenter_id } = createNewsGathering(input, 0);
    const named = [news?.top_xp?.player_id, ...(news?.achievements ?? []).map((a) => a.player_id)];
    expect(named).not.toContain(presenter_id);
    expect(TOWER).not.toContain(presenter_id);
  });
});

describe("castShow", () => {
  it("sends the presenter onto the stage and the named jellies into the crowd", () => {
    const { input } = setUp();
    const gathering = createNewsGathering(input, 0);
    const cast = castShow(input, gathering);
    expect(cast.get(2)).toEqual(findPresenterSpot(AREAS));
    const named = [OWN_ID, ...(gathering.news?.achievements ?? []).map((a) => a.player_id)];
    for (const id of named) expect(listCrowdSpots(AREAS)).toContainEqual(cast.get(id));
  });

  it("gives every jelly its own spot and leaves those on the tower alone", () => {
    const { input } = setUp();
    const cast = castShow(input, createNewsGathering(input, 0));
    const spots = [...cast.values()].map((spot) => `${spot.x}:${spot.y}`);
    expect(new Set(spots).size).toBe(cast.size);
    for (const id of TOWER) expect(cast.has(id)).toBe(false);
    expect(cast.size).toBe(listCrowdSpots(AREAS).length + 1);
  });
});

describe("createNewsPreview", () => {
  it("runs no show without its hash", () => {
    const { news, moves, events } = setUp("#join");
    news.start();
    vi.advanceTimersByTime(200_000);
    expect([news.gathering(), moves, events]).toEqual([null, [], []]);
  });

  it("starts a show after a moment and sends everyone on their way a second ahead", () => {
    const { news, moves, events } = setUp();
    news.start();
    vi.advanceTimersByTime(4999);
    expect(news.gathering()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(events).toEqual([
      expect.objectContaining({ type: "gathering.changed", payload: news.gathering() }),
    ]);
    expect(moves.length).toBeGreaterThan(10);
    for (const move of moves) {
      expect(move).toMatchObject({ kind: "news", start_at: Date.now() + 1000 });
    }
    expect(news.moves()).toEqual(moves);
    expect(news.isBusy(OWN_ID)).toBe(true);
    expect(news.isBusy(TOWER[0]!)).toBe(false);
  });

  it("starts each walk where the jelly stands", () => {
    const { news, moves, last } = setUp();
    const away = { x: 30, y: 60 };
    last.set(OWN_ID, {
      player_id: OWN_ID,
      kind: "trip",
      start_at: 0,
      stack_level: 0,
      points: [{ ...away, t: 0 }],
    });
    news.start();
    vi.advanceTimersByTime(5000);
    expect(moves.find((move) => move.player_id === OWN_ID)?.points[0]).toMatchObject(away);
  });
});

describe("createNewsPreview after a show", () => {
  /** Lässt eine Sendung laufen. Das eigene Jelly macht dabei einen Ausflug. */
  function runOneShow() {
    const run = setUp();
    run.news.start();
    vi.advanceTimersByTime(5000);
    const there = new Map(run.moves.map((move) => [move.player_id, move]));
    run.moves.length = 0;
    run.last.set(OWN_ID, { ...there.get(OWN_ID)!, kind: "trip", start_at: Date.now() });
    vi.advanceTimersByTime(90_000);
    return { ...run, there };
  }

  it("ends without an event and leaves a jelly the user sent elsewhere", () => {
    const { news, moves, events, there } = runOneShow();
    expect(news.gathering()).toBeNull();
    expect(events).toHaveLength(1);
    expect(moves.map((move) => move.player_id)).not.toContain(OWN_ID);
    expect(moves).toHaveLength(there.size - 1);
  });

  it("walks everyone else back the way they came and lets them wander once they are home", () => {
    const { news, moves, there } = runOneShow();
    const place = (point?: StagePoint) => ({ x: point?.x, y: point?.y });
    for (const move of moves) {
      const way = there.get(move.player_id)!.points;
      expect(move.kind).toBe("wander");
      expect(place(move.points[0])).toEqual(place(way.at(-1)));
      expect(place(move.points.at(-1))).toEqual(place(way[0]));
    }
    const busy = moves[0]!.player_id;
    expect(news.isBusy(busy)).toBe(true);
    vi.advanceTimersByTime(19_000);
    expect(news.isBusy(busy)).toBe(false);
  });

  it("repeats the show after a pause", () => {
    const { news, events, tower } = setUp();
    news.start();
    vi.advanceTimersByTime(5000 + 90_000);
    tower.stands = false;
    vi.advanceTimersByTime(19_999);
    expect(news.gathering()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(events).toHaveLength(2);
    expect(news.gathering()?.ends_at).toBe(Date.now() + 90_000);
  });
});
