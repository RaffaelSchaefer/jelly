/**
 * Prüft die Lage von Gehaltenem und welche Cosmetics an jeder Hand sitzen.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { BOARD_HOLD, boardPose, handsOf, holdOf, holdRest, isWornOnHands } from "./held.ts";

describe("boardPose", () => {
  it("rests between the hands", () => {
    const pose = boardPose({ x: -1.1, y: -0.4 }, { x: 1.1, y: -0.4 });
    expect(pose).toEqual({ x: 0, y: -0.4, tilt: 0 });
  });
  it("stays below the face and only leans when a hand waves or cheers", () => {
    const waving = boardPose({ x: -1.1, y: -0.4 }, { x: 1.05, y: 0.8 });
    expect(waving.y).toBe(-0.15);
    expect(waving.tilt).toBe(0.22);
    expect(boardPose({ x: -0.85, y: 1 }, { x: 0.85, y: 1 }).y).toBe(-0.15);
  });
});

describe("holdOf", () => {
  it("holds everything like a board, the BFG with its right hand at the front", () => {
    expect(holdOf("goose")).toBe(BOARD_HOLD);
    expect(holdOf()).toBe(BOARD_HOLD);
    expect(holdOf("constructor")).toBe(BOARD_HOLD);
    expect(holdOf("bfg").hands[0]).toEqual(BOARD_HOLD.hands[0]);
    expect(holdOf("bfg").hands[1].z).toBeGreaterThan(BOARD_HOLD.hands[1].z);
  });

  it("keeps the BFG nearly still and never lifts it towards the face", () => {
    const bfg = holdOf("bfg");
    const rest = holdRest(bfg);
    const [left, right] = bfg.hands;
    expect(boardPose(left, right, bfg).y).toBeCloseTo(rest.y);
    for (const hands of [
      [left, { x: 1.05, y: 0.8 }],
      [
        { x: -0.85, y: 1 },
        { x: 0.85, y: 1 },
      ],
      [
        { x: -1.2, y: -1 },
        { x: 0.6, y: -1 },
      ],
    ] as const) {
      const pose = boardPose(hands[0], hands[1], bfg);
      expect(pose.y).toBeLessThanOrEqual(rest.y);
      expect(Math.abs(pose.x - rest.x)).toBeLessThanOrEqual(0.03 + 1e-9);
      expect(Math.abs(pose.tilt - rest.tilt)).toBeLessThanOrEqual(0.03 + 1e-9);
    }
  });
});

describe("isWornOnHands", () => {
  it("puts paws on each hand, shield and sword on the left and plushies between them", () => {
    expect(isWornOnHands("cat-paws")).toBe(true);
    expect(isWornOnHands("kite-shield")).toBe(true);
    expect(isWornOnHands("nail-sword")).toBe(true);
    expect(isWornOnHands("goose")).toBe(false);
    expect(handsOf("cat-paws")).toEqual([0, 1]);
    expect(handsOf("kite-shield")).toEqual([0]);
    expect(handsOf("nail-sword")).toEqual([0]);
    expect(handsOf("goose")).toEqual([]);
    expect(handsOf("constructor")).toEqual([]);
  });
});
