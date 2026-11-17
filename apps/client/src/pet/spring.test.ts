import { describe, expect, it } from "vitest";

import { TRY_ON } from "./shopTimeline";
import { springIn, springScale } from "./spring";

describe("springIn", () => {
  it("grows from 0 past its size to 1.12 at 60 % and settles on 1", () => {
    expect(springIn(0)).toBe(0);
    expect(springIn(0.6)).toBeCloseTo(1.12, 10);
    expect(springIn(1)).toBe(1);
  });

  it("holds before the start and after the end", () => {
    expect(springIn(-1)).toBe(0);
    expect(springIn(Number.NaN)).toBe(0);
    expect(springIn(2)).toBe(1);
  });

  it("rises without a dip up to the peak and never goes past it", () => {
    let previous = 0;
    for (let step = 1; step <= 60; step++) {
      const value = springIn(step / 100);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
    for (let step = 0; step <= 100; step++) expect(springIn(step / 100)).toBeLessThanOrEqual(1.12);
  });

  it("falls back to 1 without a jump after the peak", () => {
    let previous = springIn(0.6);
    for (let step = 61; step <= 100; step++) {
      const value = springIn(step / 100);
      expect(value).toBeLessThanOrEqual(previous);
      expect(previous - value).toBeLessThan(0.01);
      previous = value;
    }
  });
});

describe("springScale", () => {
  const timing = { delayMs: TRY_ON.pop, durationMs: 360 };

  it("stays hidden until the pop of the try-on", () => {
    expect(springScale(0, timing)).toBe(0);
    expect(springScale(TRY_ON.pop, timing)).toBe(0);
  });

  it("peaks 60 % into the spring and rests once it is over", () => {
    expect(springScale(TRY_ON.pop + 216, timing)).toBeCloseTo(1.12, 10);
    expect(springScale(TRY_ON.pop + 360, timing)).toBe(1);
    expect(springScale(5000, timing)).toBe(1);
  });

  it("appears at once without a duration", () => {
    expect(springScale(0, { delayMs: 0, durationMs: 0 })).toBe(1);
    expect(springScale(10, { delayMs: 20, durationMs: 0 })).toBe(0);
  });
});
