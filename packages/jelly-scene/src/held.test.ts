/**
 * Prüft die Lage von Gehaltenem und welche Cosmetics an jeder Hand sitzen.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { boardPose, isWornOnHands } from "./held.ts";

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

describe("isWornOnHands", () => {
  it("puts paws on each hand and plushies between them", () => {
    expect(isWornOnHands("cat-paws")).toBe(true);
    expect(isWornOnHands("goose")).toBe(false);
  });
});
