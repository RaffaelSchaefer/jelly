/**
 * Tests für die Art des Zeigers, die Reichweite und die Schwelle des Ziehens je Art.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { canHover, dragThreshold, isSideways, pointerTypeOf, reachOf } from "./pointerKinds";

/** Ein Klick, wie Chromium ihn als `PointerEvent` schickt, oder ein schlichter `MouseEvent`. */
function clickOf(pointerType?: string): MouseEvent {
  return (pointerType === undefined ? {} : { pointerType }) as unknown as MouseEvent;
}

describe("pointerTypeOf", () => {
  it("liest die Art aus dem Klick, ohne sie zählt die Maus", () => {
    expect(pointerTypeOf(clickOf("touch"))).toBe("touch");
    expect(pointerTypeOf(clickOf("pen"))).toBe("pen");
    expect(pointerTypeOf(clickOf(""))).toBe("mouse");
    expect(pointerTypeOf(clickOf())).toBe("mouse");
  });
});

describe("reachOf", () => {
  it("gibt dem Finger mehr Reichweite als dem Stift, der Maus keine", () => {
    expect(reachOf("mouse")).toBe(0);
    expect(reachOf("pen")).toBeGreaterThan(0);
    expect(reachOf("touch")).toBeGreaterThan(reachOf("pen"));
  });
});

describe("dragThreshold", () => {
  it("lässt Finger und Stift mehr zittern als die Maus", () => {
    expect(dragThreshold("mouse")).toBe(4);
    expect(dragThreshold("pen")).toBeGreaterThan(4);
    expect(dragThreshold("touch")).toBeGreaterThan(dragThreshold("pen"));
    expect(dragThreshold("")).toBe(4);
  });
});

describe("canHover", () => {
  it("lässt Maus und Stift schweben, den Finger nicht", () => {
    expect(canHover("mouse")).toBe(true);
    expect(canHover("pen")).toBe(true);
    expect(canHover("touch")).toBe(false);
  });
});

describe("isSideways", () => {
  it("erkennt einen waagerechten Zug erst nach dem Zittern", () => {
    expect(isSideways(6, 1, "touch")).toBe(false);
    expect(isSideways(14, 3, "touch")).toBe(true);
    expect(isSideways(-14, 3, "touch")).toBe(true);
  });

  it("lässt einen senkrechten Zug dem Scrollen", () => {
    expect(isSideways(8, 20, "touch")).toBe(false);
    expect(isSideways(10, 10, "pen")).toBe(false);
  });
});
