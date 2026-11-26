import type { StageEvent, StageMove, StagePlayer, StagePoint } from "@jelly/stage";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCongaPreview,
  findFollowSpot,
  keepsSpace,
  measureUnits,
  PERSONAL_SPACE,
} from "./previewConga";

/** Sechzehn Jellies in vier Reihen, weit auseinander. Der Kopf der Polonaise hat die ID 15. */
function listPlayers(): StagePlayer[] {
  return Array.from({ length: 16 }, (_, index) => ({
    id: index + 1,
    name: `Jelly ${index}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: 1,
    is_visitor: false,
    home_x: 15 + (index % 4) * 23,
    home_y: 20 + Math.floor(index / 4) * 20,
  }));
}

/** Baut die Polonaise und hält fest, was sie schickt. */
function setUp() {
  const players = listPlayers();
  const moves: StageMove[] = [];
  const events: StageEvent[] = [];
  const send = {
    move: (move: StageMove) => moves.push(move),
    event: (e: StageEvent) => events.push(e),
  };
  const conga = createCongaPreview(players, [], send);
  return { conga, players, moves, events };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("findFollowSpot", () => {
  const target = { x: 50, y: 50 };

  it("puts even IDs to the left and odd ones to the right, one personal space away", () => {
    const left = findFollowSpot(2, target, () => true);
    const right = findFollowSpot(3, target, () => true);
    expect(left.x).toBeLessThan(target.x);
    expect(right.x).toBeGreaterThan(target.x);
    expect([left.y, right.y]).toEqual([target.y, target.y]);
    expect(measureUnits(left, target)).toBeCloseTo(PERSONAL_SPACE);
    expect(measureUnits(right, target)).toBeCloseTo(PERSONAL_SPACE);
  });

  it("takes the next free spot when its side is taken, as in a chain", () => {
    // 3 folgt 2, das links neben 1 steht: Der Platz rechts von 2 ist der von 1.
    const second = findFollowSpot(2, target, () => true);
    const taken = [target, second];
    const third = findFollowSpot(3, second, (spot) => keepsSpace(spot, taken));
    expect(keepsSpace(third, taken)).toBe(true);
    // Näher am Kopf als an seinem Ziel, aber unter den 4 Einheiten, ab denen die Bühne verbindet.
    expect(measureUnits(third, target)).toBeLessThan(measureUnits(third, second));
    expect(measureUnits(third, second)).toBeLessThan(4);
  });
});

describe("createCongaPreview", () => {
  it("lets two jellies follow a third one from the start, for a while", () => {
    const { players } = setUp();
    const follows = players.flatMap((player) =>
      player.follow ? [[player.id, player.follow.player_id]] : [],
    );
    expect(follows).toEqual([
      [11, 15],
      [16, 15],
    ]);
    expect(players[10]?.follow?.ends_at).toBeGreaterThan(Date.now() + 60_000);
  });

  it("stands them beside the head, which stays at home", () => {
    const { conga, moves } = setUp();
    const head = { x: 61, y: 80 };
    expect(conga.spotOf(15)).toEqual(head);
    expect(conga.spotOf(1)).toBeUndefined();
    const [right, left] = [conga.spotOf(11), conga.spotOf(16)] as StagePoint[];
    expect(right.x).toBeGreaterThan(head.x);
    expect(left.x).toBeLessThan(head.x);
    expect(measureUnits(right, head)).toBeCloseTo(PERSONAL_SPACE);
    expect(measureUnits(left, head)).toBeCloseTo(PERSONAL_SPACE);
    expect(conga.moves()).toEqual(moves);
    expect(moves.map((move) => [move.player_id, move.kind, move.points])).toEqual([
      [11, "follow", [{ ...right, t: 0 }]],
      [16, "follow", [{ ...left, t: 0 }]],
    ]);
  });

  it("finds a free spot for a jelly that joins one of them", () => {
    const { conga } = setUp();
    const line = [15, 11, 16].map((id) => conga.spotOf(id)!);
    const [, , left] = line;
    // Links von 16 ist frei, rechts steht der Kopf: Dann gilt der nächste freie Platz.
    const beside = conga.joinSpot(2, 16)!;
    expect(beside.x).toBeLessThan(left!.x);
    expect(measureUnits(beside, left!)).toBeCloseTo(PERSONAL_SPACE);
    const squeezed = conga.joinSpot(1, 16)!;
    expect(keepsSpace(squeezed, line)).toBe(true);
    expect(measureUnits(squeezed, left!)).toBeLessThan(2 * PERSONAL_SPACE);
    expect(conga.joinSpot(1, 2)).toBeUndefined();
  });

  it("ends after its time: the followers stop following and walk home", () => {
    const { conga, players, moves, events } = setUp();
    moves.length = 0;
    vi.advanceTimersByTime(90_000);
    expect(players.every((player) => player.follow === null)).toBe(true);
    expect(events.map((event) => [event.type, event.player_id])).toEqual([
      ["follow.changed", 11],
      ["follow.changed", 16],
    ]);
    expect(moves.map((move) => [move.player_id, move.kind, move.points.at(-1)])).toEqual([
      [11, "wander", { x: 61, y: 60, t: 2000 }],
      [16, "wander", { x: 84, y: 80, t: 2000 }],
    ]);
    expect(conga.moves()).toEqual([]);
    expect(conga.spotOf(15)).toBeUndefined();
  });
});
