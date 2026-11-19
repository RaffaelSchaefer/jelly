import { describe, expect, it } from "vitest";

import {
  BED_TARGET,
  CUE_TARGETS,
  dbToGain,
  gainToDb,
  HOVER_GATE,
  HOVER_LIMITS,
  levelPlan,
  MIX,
  nextHover,
  nextRustle,
  PEAK_CEILING_DB,
  pointerPan,
  REVERB_SENDS,
  RUSTLE_GATE,
  RUSTLE_LIMITS,
  SOUND_LIFECYCLE,
  SOUND_PANS,
  SOURCE_LIMITS,
  strongestAt,
} from "./shopMix";

describe("MIX", () => {
  it("keeps every bus at or below unity and the wizard's voice in front", () => {
    for (const db of Object.values(MIX)) expect(dbToGain(db)).toBeLessThanOrEqual(1);
    const loudest = Math.max(...Object.values(MIX));
    expect(MIX.voice).toBe(loudest);
    expect(MIX.ambience).toBe(Math.min(...Object.values(MIX)));
    for (const send of Object.values(REVERB_SENDS)) expect(send).toBeGreaterThan(0);
  });

  it("converts decibels both ways", () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(0)).toBe(1);
    expect(gainToDb(dbToGain(-13))).toBeCloseTo(-13, 9);
  });
});

describe("SOUND_PANS", () => {
  it("places everything inside the stereo field", () => {
    for (const pan of Object.values(SOUND_PANS)) {
      expect(pan).toBeGreaterThanOrEqual(-1);
      expect(pan).toBeLessThanOrEqual(1);
    }
  });

  it("follows the stage: wizard left, orb and candle near the middle, customer right", () => {
    const { wizard, orb, candle, tray, customer, room } = SOUND_PANS;
    expect(wizard).toBeLessThan(tray);
    expect(tray).toBeLessThan(orb);
    expect(orb).toBeLessThan(candle);
    expect(candle).toBeLessThan(room);
    expect(customer).toBeGreaterThan(0);
    expect(SOUND_PANS.purse).toBeGreaterThan(customer);
  });
});

describe("CUE_TARGETS", () => {
  it("orders loudness hover < tap < tryOn < stamp", () => {
    expect(CUE_TARGETS.hover).toBeLessThan(CUE_TARGETS.tap);
    expect(CUE_TARGETS.tap).toBeLessThan(CUE_TARGETS.tryOn);
    expect(CUE_TARGETS.tryOn).toBeLessThan(CUE_TARGETS.stamp);
  });

  it("keeps hovers soft and everything below the ceiling", () => {
    expect(CUE_TARGETS.hover).toBeLessThanOrEqual(-34);
    expect(CUE_TARGETS.hoverWax).toBeLessThanOrEqual(-34);
    expect(CUE_TARGETS.hoverCoin).toBeLessThanOrEqual(-34);
    for (const target of Object.values(CUE_TARGETS)) expect(target).toBeLessThan(PEAK_CEILING_DB);
    expect(BED_TARGET.rms).toBe(-46);
  });
});

describe("levelPlan", () => {
  const { duckAttack, duckRelease } = SOUND_LIFECYCLE;

  it("ducks fast and comes back slowly", () => {
    const steps = levelPlan([{ from: 1, to: 2, db: -5 }], 0);
    expect(steps.map((step) => [step.at, step.db])).toEqual([
      [0, 0],
      [1, -5],
      [2, 0],
    ]);
    expect(steps[1]?.tau).toBe(duckAttack);
    expect(steps[2]?.tau).toBe(duckRelease);
    expect(steps[1]?.gain).toBeCloseTo(dbToGain(-5), 9);
  });

  it("lets the strongest of overlapping spans win", () => {
    const spans = [
      { from: 1, to: 3, db: -3 },
      { from: 2, to: 2.5, db: -5 },
    ];
    const steps = levelPlan(spans, 0);
    expect(steps.map((step) => [step.at, step.db])).toEqual([
      [0, 0],
      [1, -3],
      [2, -5],
      [2.5, -3],
      [3, 0],
    ]);
    expect(strongestAt(spans, 2.2)).toBe(-5);
    expect(strongestAt(spans, 3)).toBe(0);
  });

  it("keeps an open span and swells as well as ducks", () => {
    const steps = levelPlan([{ from: 0.5, to: Infinity, db: 6 }], 0.5);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.db).toBe(6);
    expect(steps[0]?.tau).toBe(duckAttack);
  });

  it("releases from the level it was heading to", () => {
    const steps = levelPlan([], 4, -5);
    expect(steps).toEqual([{ at: 4, db: 0, gain: 1, tau: duckRelease }]);
  });
});

describe("nextHover", () => {
  it("waits between hovers and longer for the same note", () => {
    const first = nextHover(HOVER_GATE, "harp:0", 1000);
    expect(first).not.toBeNull();
    if (!first) return;
    expect(nextHover(first, "harp:1", 1000 + HOVER_LIMITS.gapMs - 1)).toBeNull();
    expect(nextHover(first, "harp:1", 1000 + HOVER_LIMITS.gapMs)).not.toBeNull();
    expect(nextHover(first, "harp:0", 1000 + HOVER_LIMITS.sameKeyMs - 1)).toBeNull();
    expect(nextHover(first, "harp:0", 1000 + HOVER_LIMITS.sameKeyMs)).not.toBeNull();
  });

  it("stays silent right after a click", () => {
    const clicked = { ...HOVER_GATE, clickAt: 500 };
    expect(nextHover(clicked, "wax:0", 500 + HOVER_LIMITS.afterClickMs - 1)).toBeNull();
    expect(nextHover(clicked, "wax:0", 500 + HOVER_LIMITS.afterClickMs)).not.toBeNull();
  });
});

describe("nextRustle", () => {
  it("rustles after enough distance, at most every 280 ms, stronger with more", () => {
    const small = nextRustle(RUSTLE_GATE, RUSTLE_LIMITS.minPx - 1, 0);
    expect(small.intensity).toBeNull();
    const enough = nextRustle(small.gate, 1, 10);
    expect(enough.intensity).toBeCloseTo(RUSTLE_LIMITS.minPx / RUSTLE_LIMITS.fullPx, 9);
    const soon = nextRustle(enough.gate, 500, 10 + RUSTLE_LIMITS.gapMs - 1);
    expect(soon.intensity).toBeNull();
    const later = nextRustle(soon.gate, 0, 10 + RUSTLE_LIMITS.gapMs);
    expect(later.intensity).toBe(1);
  });

  it("forgets a little scrolling after a pause and counts both directions", () => {
    const some = nextRustle(RUSTLE_GATE, -20, 0);
    expect(some.gate.sum).toBe(20);
    const after = nextRustle(some.gate, 10, RUSTLE_LIMITS.resetMs + 1);
    expect(after.intensity).toBeNull();
    expect(after.gate.sum).toBe(10);
  });
});

describe("pointerPan and limits", () => {
  it("pans clicks with the pointer, never fully to one side", () => {
    expect(pointerPan(0, 800)).toBe(-0.5);
    expect(pointerPan(400, 800)).toBe(0);
    expect(pointerPan(800, 800)).toBe(0.5);
    expect(pointerPan(2000, 800)).toBe(0.5);
    expect(pointerPan(100, 0)).toBe(0);
  });

  it("drops hovers before anything else", () => {
    expect(SOURCE_LIMITS.dropFirstAt).toBeLessThan(SOURCE_LIMITS.cap);
    expect(SOURCE_LIMITS.cap).toBe(96);
  });
});
