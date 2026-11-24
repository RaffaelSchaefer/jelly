import type { StageMove, StageStack } from "@jelly/stage";

import { describe, expect, it } from "vitest";

import { chooseStack, findStackOf, readWalk } from "./stacks";

const TOWER: StageStack = { id: 7, x: 40, y: 50, ends_at: 100_000, member_ids: [3, 4, 5] };

/** Ein Weg, der bei `start` beginnt und nach `ms` ankommt. */
function walk(kind: string, start: number, ms: number): StageMove {
  return {
    player_id: 1,
    kind,
    start_at: start,
    stack_level: 0,
    points: [
      { x: 0, y: 0, t: 0 },
      { x: 40, y: 50, t: ms },
    ],
  };
}

describe("chooseStack", () => {
  it("offers to start a stack at a jelly that stands alone", () => {
    expect(chooseStack([TOWER], 1, 2)).toEqual({ kind: "start" });
  });

  it("offers to climb a stack the own jelly is not on", () => {
    expect(chooseStack([TOWER], 1, 4)).toEqual({ kind: "join", stackId: 7 });
  });

  it("offers nothing on the stack the own jelly stands on", () => {
    const shared = { ...TOWER, member_ids: [3, 1, 4] };
    expect(chooseStack([shared], 1, 4)).toBeNull();
  });

  it("finds the stack of a jelly, and none before the own jelly is known", () => {
    expect(findStackOf([TOWER], 5)).toBe(TOWER);
    expect(findStackOf([TOWER], null)).toBeUndefined();
  });
});

describe("readWalk", () => {
  const plan = { moveKind: "trip", since: 1000, clickedAt: 1000 };

  it("waits for the walk that started after the click", () => {
    expect(readWalk(walk("trip", 500, 100), plan, 2000)).toBe("walking");
    expect(readWalk(null, plan, 2000)).toBe("walking");
  });

  it("arrives once the last point of that walk has passed", () => {
    const trip = walk("trip", 2000, 3000);
    expect(readWalk(trip, plan, 4999)).toBe("walking");
    expect(readWalk(trip, plan, 5000)).toBe("arrived");
  });

  it("ignores a walk of another kind, such as the way home", () => {
    expect(readWalk(walk("wander", 2000, 100), plan, 3000)).toBe("walking");
  });

  it("accepts the current walk when the jelly already stands there", () => {
    const there = { moveKind: "follow", since: -Infinity, clickedAt: 9000 };
    expect(readWalk(walk("follow", 100, 100), there, 9000)).toBe("arrived");
  });

  it("gives up without a new walk, and after a very long one", () => {
    expect(readWalk(null, plan, 12_000)).toBe("late");
    expect(readWalk(walk("trip", 2000, 500_000), plan, 200_000)).toBe("late");
  });
});
