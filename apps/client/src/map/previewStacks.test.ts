import type { StageEvent, StageMove, StagePlayer } from "@jelly/stage";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStackPreview } from "./previewStacks";

/** Sechs Jellies in einer Reihe, 10 % auseinander, das erste ist das eigene. */
function listPlayers(): StagePlayer[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    name: `Jelly ${index}`,
    color: "mint",
    equipped: {},
    level: 1,
    sign: null,
    follow: null,
    area_id: 1,
    is_visitor: false,
    home_x: 10 + index * 10,
    home_y: 50,
  }));
}

/** Baut die Vorschau mit einem eigenen Jelly an `spot` und hält fest, was sie schickt. */
function setUp(spot = { x: 10, y: 50 }) {
  const moves: StageMove[] = [];
  const events: StageEvent[] = [];
  const own = { id: 1, spot: () => spot, endWalks: vi.fn() };
  const send = {
    move: (move: StageMove) => moves.push(move),
    event: (e: StageEvent) => events.push(e),
  };
  const stacks = createStackPreview(listPlayers(), own, send);
  return { stacks, moves, events, own };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createStackPreview", () => {
  it("starts with a tower of three, from level 0 at the bottom", () => {
    const { stacks } = setUp();
    expect(stacks.list()).toEqual([expect.objectContaining({ id: 1, member_ids: [4, 3, 6] })]);
    expect(stacks.moves().map((move) => [move.player_id, move.kind, move.stack_level])).toEqual([
      [4, "stack", 0],
      [3, "stack", 1],
      [6, "stack", 2],
    ]);
  });

  it("lets those above a leaver slide one level down and names only the stack", () => {
    const { stacks, moves, events } = setUp();
    moves.length = 0;
    stacks.drop(3);
    expect(stacks.list()[0]?.member_ids).toEqual([4, 6]);
    expect(moves).toEqual([
      expect.objectContaining({ player_id: 6, kind: "stack", stack_level: 1 }),
    ]);
    expect(events.map((event) => event.payload)).toEqual([{ id: 1 }]);
  });

  it("falls apart after its time and sends everyone home on the floor", () => {
    const { stacks, moves, events } = setUp();
    moves.length = 0;
    vi.advanceTimersByTime(60_000);
    expect(stacks.list()).toEqual([]);
    expect(events.map((event) => [event.type, event.payload])).toEqual([
      ["stack.changed", { id: 1 }],
    ]);
    expect(moves.map((move) => [move.player_id, move.kind, move.stack_level])).toEqual([
      [3, "wander", 0],
      [4, "wander", 0],
      [6, "wander", 0],
    ]);
  });

  it("lets the own jelly climb only from near the tower, on top", async () => {
    const far = setUp({ x: 40, y: 0 });
    await expect(far.stacks.joinStack(1)).resolves.toBe(false);
    const near = setUp({ x: 38, y: 50 });
    await expect(near.stacks.joinStack(1)).resolves.toBe(true);
    expect(near.own.endWalks).toHaveBeenCalled();
    expect(near.stacks.list()[0]?.member_ids).toEqual([4, 3, 6, 1]);
    expect(near.moves.at(-1)).toEqual(expect.objectContaining({ player_id: 1, stack_level: 3 }));
  });

  it("rejects a stack that is gone with the finished text", async () => {
    const { stacks } = setUp();
    await expect(stacks.joinStack(99)).rejects.toBe("Diesen Stapel gibt es nicht mehr.");
  });

  it("starts a stack where the own jelly stands and takes it down again", async () => {
    const { stacks, moves } = setUp({ x: 12, y: 50 });
    await stacks.startStack();
    expect(stacks.list()[1]).toEqual(expect.objectContaining({ x: 12, y: 50, member_ids: [1] }));
    await stacks.leaveStack();
    expect(stacks.list()).toHaveLength(1);
    expect(moves.at(-1)).toEqual(expect.objectContaining({ player_id: 1, kind: "wander" }));
  });
});
