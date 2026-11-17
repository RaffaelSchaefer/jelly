/**
 * Prüft, wie die Börse zählt: einzeln bis zwölf Münzen, darüber in Sprüngen.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { coinSteps, PURSE_MAX_STEPS, PURSE_STEP_MS, purseTrend } from "./purse";

describe("coinSteps", () => {
  it("zählt einen Kauf Münze für Münze herunter", () => {
    expect(coinSteps(3, 0)).toEqual([2, 1, 0]);
  });

  it("zählt eine einzelne Münze herauf und bleibt ohne Änderung still", () => {
    expect(coinSteps(0, 1)).toEqual([1]);
    expect(coinSteps(5, 5)).toEqual([]);
  });

  it("zählt bis zu zwölf Münzen einzeln", () => {
    expect(coinSteps(3, 15)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("springt bei großen Änderungen in zwölf Schritten genau ans Ziel", () => {
    const up = coinSteps(0, 40);
    expect(up).toHaveLength(PURSE_MAX_STEPS);
    expect(up.at(-1)).toBe(40);
    expect(up.every((value, index) => index === 0 || value > up[index - 1])).toBe(true);
    const down = coinSteps(40, 1);
    expect(down).toHaveLength(PURSE_MAX_STEPS);
    expect(down.at(-1)).toBe(1);
    expect(down.every((value, index) => index === 0 || value < down[index - 1])).toBe(true);
  });
});

describe("purseTrend", () => {
  it("kennt die Richtung und zählt abwärts schneller", () => {
    expect(purseTrend(3, 0)).toBe("down");
    expect(purseTrend(3, 4)).toBe("up");
    expect(purseTrend(3, 3)).toBeNull();
    expect(PURSE_STEP_MS.down).toBeLessThan(PURSE_STEP_MS.up);
  });
});
