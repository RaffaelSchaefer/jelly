import assert from "node:assert/strict";
import { test } from "node:test";

import type { StageGathering, StageMove, StagePlayer } from "./types.ts";

import {
  findPresenter,
  findWinner,
  findPositions,
  listHighlighted,
  playMoves,
  pruneMoves,
  stepRingPresence,
} from "./moves.ts";
import { findArrival, keepNewerMove } from "./walking.ts";
import { toFloorPoint } from "./world.ts";

/** The room the server measures in, so the numbers below are its jelly units. */
const room = { width: 21, depth: 40 };

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

const move: StageMove = {
  player_id: 1,
  kind: "stack",
  stack_level: 2,
  start_at: 1000,
  points: [
    { x: 30, y: 30, t: 0 },
    { x: 40, y: 30, t: 1000 },
  ],
};

test("a jelly with a move plays it, one without stands at home", () => {
  const positions = findPositions([makePlayer(1), makePlayer(2)], new Map([[1, move]]), 3000, room);
  assert.deepEqual(positions.get(1), toFloorPoint({ x: 40, y: 30 }, room));
  assert.deepEqual(positions.get(2), toFloorPoint({ x: 10, y: 20 }, room));
});

test("moves of jellies that left are forgotten", () => {
  const moves = new Map([
    [1, move],
    [9, { ...move, player_id: 9 }],
  ]);
  pruneMoves(moves, [makePlayer(1)]);
  assert.deepEqual([...moves.keys()], [1]);
});

test("all others light up, or only those near the own jelly, never the own", () => {
  const positions = new Map([
    [1, { x: 0, z: 0 }],
    [2, { x: 3, z: 4 }],
    [3, { x: 6, z: 8 }],
  ]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "others" }, room)], [2, 3]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "near", reach: 5 }, room)], [2]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "near", reach: 1 }, room)], []);
});

test("a ring grows in, fades out and is forgotten once it is gone", () => {
  const shown = new Map<number, number>();
  stepRingPresence(shown, new Set([2]), 0.5);
  assert.deepEqual([...shown], [[2, 0.5]]);
  stepRingPresence(shown, new Set([2]), 1);
  assert.deepEqual([...shown], [[2, 1]]);
  stepRingPresence(shown, new Set(), 0.5);
  assert.deepEqual([...shown], [[2, 0.5]]);
  stepRingPresence(shown, new Set(), 1);
  assert.equal(shown.size, 0);
});

test("without the own jelly on the stage nobody counts as near", () => {
  const positions = new Map([[2, { x: 0, z: 0 }]]);
  assert.deepEqual([...listHighlighted(positions, 1, { kind: "near", reach: 5 }, room)], []);
  assert.deepEqual([...listHighlighted(positions, null, { kind: "others" }, room)], [2]);
});

test("the winner grows while the ceremony runs", () => {
  const ceremony = { kind: "ceremony", winner_id: 4, ends_at: 5000 };
  assert.equal(findWinner(ceremony, 4999), 4);
  assert.equal(findWinner(ceremony, 5000), null);
  assert.equal(findWinner({ ...ceremony, kind: "food" }, 100), null);
  assert.equal(findWinner(null, 100), null);
});

test("the presenter grows while the news run", () => {
  const news = { kind: "news", winner_id: null, ends_at: 5000, presenter_id: 7, news: null };
  assert.equal(findWinner(news, 4999), 7);
  assert.equal(findWinner(news, 5000), null);
  assert.equal(findWinner({ ...news, presenter_id: null }, 100), null);
  // A server before the Jelly-News names no presenter.
  assert.equal(findWinner({ kind: "news", winner_id: null, ends_at: 5000 }, 100), null);
});

test("only the presenter of running news keeps its hands free, a ceremony winner does not", () => {
  const news = { kind: "news", winner_id: null, ends_at: 5000, presenter_id: 7, news: null };
  assert.equal(findPresenter(news, 4999), 7);
  assert.equal(findPresenter(news, 5000), null);
  assert.equal(findPresenter({ kind: "ceremony", winner_id: 4, ends_at: 5000 }, 100), null);
  assert.equal(findPresenter(null, 100), null);
});

/**
 * News as the server starts them: the gathering at `SHOW_AT` without `starts_at`, the move of the
 * presenter planned up to a second later and starting a second after that, a long walk from a desk
 * in the hall up to the stage.
 */
const SHOW_AT = 100_000;
const NEWS: StageGathering = {
  kind: "news",
  winner_id: null,
  ends_at: SHOW_AT + 90_000,
  presenter_id: 1,
  news: null,
};
const HALL_SPOT = { x: 10, y: 80 };
const STAGE_SPOT = { x: 50, y: 8.5 };
const TO_STAGE: StageMove = {
  player_id: 1,
  kind: "news",
  stack_level: 0,
  start_at: SHOW_AT + 1500,
  points: [
    { ...HALL_SPOT, t: 0 },
    { x: 10, y: 30, t: 30_000 },
    { ...STAGE_SPOT, t: 45_000 },
  ],
};
/** Where the presenter stood before: its last walk ended at its desk. */
const AT_DESK: StageMove = {
  ...TO_STAGE,
  kind: "wander",
  start_at: 0,
  points: [{ ...HALL_SPOT, t: 0 }],
};
/** A jelly of the audience on its way to the band in front of the stage. */
const TO_BAND: StageMove = {
  ...TO_STAGE,
  player_id: 2,
  points: [
    { x: 80, y: 80, t: 0 },
    { x: 80, y: 13, t: 40_000 },
  ],
};
const players = [makePlayer(1), makePlayer(2)];

/** Where the moves a screen holds put the jellies at a server time, as the stage plays them. */
function placeAt(moves: Map<number, StageMove>, gathering: StageGathering | null, at: number) {
  return findPositions(players, playMoves(moves, gathering, at), at, room);
}

test("the presenter stands where its news move ends from the first frame, whichever came first", () => {
  const first = SHOW_AT + 600;
  const onStage = toFloorPoint(STAGE_SPOT, room);
  // The move comes first and plays as the server planned it, until the gathering comes.
  const moveFirst = new Map([[1, AT_DESK]]);
  keepNewerMove(moveFirst, TO_STAGE);
  assert.deepEqual(placeAt(moveFirst, null, first).get(1), toFloorPoint(HALL_SPOT, room));
  assert.deepEqual(placeAt(moveFirst, NEWS, first).get(1), onStage);
  // The gathering comes first: the presenter stands where it was until its move comes.
  const gatheringFirst = new Map([[1, AT_DESK]]);
  assert.deepEqual(placeAt(gatheringFirst, NEWS, first).get(1), toFloorPoint(HALL_SPOT, room));
  keepNewerMove(gatheringFirst, TO_STAGE);
  for (const at of [first, TO_STAGE.start_at, SHOW_AT + 20_000, NEWS.ends_at - 1]) {
    assert.deepEqual(placeAt(gatheringFirst, NEWS, at).get(1), onStage, `at ${at}`);
    assert.deepEqual(placeAt(gatheringFirst, NEWS, at), placeAt(moveFirst, NEWS, at));
  }
  // It counts as having stood there all along, and the moves of the server stay as they came.
  const played = playMoves(moveFirst, NEWS, first).get(1);
  assert.equal(played && findArrival(played), Number.NEGATIVE_INFINITY);
  assert.equal(played?.kind, "news");
  assert.equal(moveFirst.get(1), TO_STAGE);
});

test("everybody else walks as the server says, also the winner of a ceremony", () => {
  const moves = new Map([
    [1, TO_STAGE],
    [2, TO_BAND],
  ]);
  const at = SHOW_AT + 21_500;
  const asServer = findPositions(players, moves, at, room);
  assert.equal(playMoves(moves, NEWS, at).get(2), TO_BAND);
  assert.deepEqual(placeAt(moves, NEWS, at).get(2), asServer.get(2));
  assert.notDeepEqual(asServer.get(2), toFloorPoint({ x: 80, y: 13 }, room));
  const ceremony = { kind: "ceremony", winner_id: 1, ends_at: NEWS.ends_at };
  const toWinnerZone = new Map([[1, { ...TO_STAGE, kind: "ceremony" }]]);
  assert.equal(playMoves(toWinnerZone, ceremony, at), toWinnerZone);
  assert.deepEqual(placeAt(toWinnerZone, ceremony, at).get(1), asServer.get(1));
  assert.notDeepEqual(asServer.get(1), toFloorPoint(STAGE_SPOT, room));
});

test("without a presenter or without its news move nothing changes", () => {
  const moves = new Map([
    [1, TO_STAGE],
    [2, TO_BAND],
  ]);
  const at = SHOW_AT + 600;
  assert.equal(playMoves(moves, { ...NEWS, presenter_id: null }, at), moves);
  assert.equal(playMoves(moves, null, at), moves);
  assert.equal(playMoves(moves, { ...NEWS, presenter_id: 7 }, at), moves);
  // A room without a zone for the presenter: the server sends it nowhere, it stays where it is.
  const atDesk = new Map([[1, AT_DESK]]);
  assert.equal(playMoves(atDesk, NEWS, at), atDesk);
  const none = new Map<number, StageMove>();
  assert.equal(playMoves(none, NEWS, at), none);
  assert.deepEqual(placeAt(none, NEWS, at).get(1), toFloorPoint({ x: 10, y: 20 }, room));
});

test("after the show the presenter follows the moves of the server again, from the stage back", () => {
  const moves = new Map([[1, TO_STAGE]]);
  const end = NEWS.ends_at;
  const onStage = toFloorPoint(STAGE_SPOT, room);
  // Its walk of the server ended long before, so the end of the show changes nothing.
  assert.deepEqual(placeAt(moves, NEWS, end - 1).get(1), onStage);
  assert.deepEqual(placeAt(moves, NEWS, end).get(1), onStage);
  const back: StageMove = {
    ...TO_STAGE,
    kind: "wander",
    start_at: end + 1500,
    points: [
      { ...STAGE_SPOT, t: 0 },
      { ...HALL_SPOT, t: 20_000 },
    ],
  };
  keepNewerMove(moves, back);
  assert.deepEqual(placeAt(moves, NEWS, end + 1500).get(1), onStage);
  assert.deepEqual(
    placeAt(moves, NEWS, end + 11_500).get(1),
    toFloorPoint({ x: 30, y: 44.25 }, room),
  );
});

test("a show shorter than the walk hands the presenter back where the server sees it", () => {
  const short = { ...NEWS, ends_at: SHOW_AT + 20_000 };
  const moves = new Map([[1, TO_STAGE]]);
  assert.deepEqual(placeAt(moves, short, short.ends_at - 1).get(1), toFloorPoint(STAGE_SPOT, room));
  const onTheWay = findPositions(players, moves, short.ends_at, room).get(1);
  assert.deepEqual(placeAt(moves, short, short.ends_at).get(1), onTheWay);
  assert.notDeepEqual(onTheWay, toFloorPoint(STAGE_SPOT, room));
});
