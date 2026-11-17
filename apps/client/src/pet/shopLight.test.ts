import { describe, expect, it } from "vitest";

import {
  circleWhite,
  flicker,
  FLICKER,
  gustDip,
  IDLE_LIGHTING,
  SHOP_LIGHT_RIG,
  shopGlows,
  shopLighting,
  type LightInput,
} from "./shopLight";
import { purchaseTimeline } from "./shopTimeline";

/** Ein Bild ohne Moment, zur Sekunde `time` und ms `now`. */
function frame(patch: Partial<LightInput> = {}): LightInput {
  return { time: 3.2, now: 10_000, calm: false, dozing: false, ...patch };
}

describe("light rig", () => {
  it("puts the lights where spec §6 says", () => {
    expect(SHOP_LIGHT_RIG.candle.at).toEqual([-0.12, 0, 0.85]);
    expect(SHOP_LIGHT_RIG.taper.at[1]).toBeCloseTo(0.26, 10);
    expect(SHOP_LIGHT_RIG.orb.at).toEqual([-0.62, -0.12, 0.75]);
    expect(SHOP_LIGHT_RIG.circle.at[1]).toBeCloseTo(-0.92, 10);
    expect(SHOP_LIGHT_RIG.circle.at[2]).toBeCloseTo(0.35, 10);
  });
});

describe("flicker", () => {
  it("stays within 0.78 and 1.12 and really moves", () => {
    const values = Array.from({ length: 4000 }, (_, index) => flicker(index * 0.013, 2));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(FLICKER.min);
    expect(Math.max(...values)).toBeLessThanOrEqual(FLICKER.max);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.15);
  });

  it("ducks in a gust every 5.5 to 8.5 seconds, for 350 ms", () => {
    const starts: number[] = [];
    let previous = 0;
    for (let step = 0; step < 120_000; step++) {
      const dip = gustDip(step * 0.001, 2);
      if (dip > 0 && previous === 0) starts.push(step * 0.001);
      expect(dip).toBeLessThanOrEqual(0.12);
      previous = dip;
    }
    expect(starts.length).toBeGreaterThan(12);
    for (let index = 1; index < starts.length; index++) {
      const gap = starts[index]! - starts[index - 1]!;
      expect(gap).toBeGreaterThanOrEqual(5.5 - 0.002);
      expect(gap).toBeLessThanOrEqual(8.5 + 0.002);
    }
  });

  it("gives the two candles their own rhythm", () => {
    expect(flicker(1.3, 0)).not.toBeCloseTo(flicker(1.3, 2), 3);
  });
});

describe("shopLighting at rest", () => {
  it("holds still when calm, at any time", () => {
    const first = shopLighting(frame({ calm: true, time: 0.4 }));
    expect(shopLighting(frame({ calm: true, time: 7.9 }))).toEqual(first);
    expect(first).toEqual(IDLE_LIGHTING);
  });

  it("ignores every moment when calm", () => {
    const cue = { kind: "spell", at: 9_500 } as const;
    expect(shopLighting(frame({ calm: true, cue }))).toEqual(IDLE_LIGHTING);
  });

  it("keeps flicker and breath still in optimized mode, but plays moments", () => {
    expect(shopLighting(frame({ steady: true, time: 1 }))).toEqual(
      shopLighting(frame({ steady: true, time: 5 })),
    );
    const charged = shopLighting(frame({ steady: true, cue: { kind: "charge", at: 9_000 } }));
    expect(charged.orb).toBeCloseTo(1.4, 6);
  });

  it("breathes the orb at 0.45 ± 0.08", () => {
    const orbs = Array.from(
      { length: 300 },
      (_, index) => shopLighting(frame({ time: index * 0.01 })).orb,
    );
    expect(Math.min(...orbs)).toBeGreaterThanOrEqual(0.37 - 1e-9);
    expect(Math.max(...orbs)).toBeLessThanOrEqual(0.53 + 1e-9);
  });

  it("dims room and orb while he dozes, eased over two seconds", () => {
    const start = shopLighting(frame({ calm: true, dozing: true, dozeSince: 10_000 }));
    expect(start.shade).toBeCloseTo(0.74, 6);
    expect(start.orb).toBeCloseTo(0.2, 6);
    const halfway = shopLighting(frame({ steady: true, dozing: true, dozeSince: 9_000 }));
    expect(halfway.shade).toBeGreaterThan(0.74);
    expect(halfway.shade).toBeLessThan(0.82);
    const asleep = shopLighting(frame({ steady: true, dozing: true, dozeSince: 7_000 }));
    expect(asleep.shade).toBeCloseTo(0.74, 6);
  });

  it("flares the orb to about 1.4 when he wakes and is calm again after 700 ms", () => {
    const peak = shopLighting(frame({ steady: true, dozeSince: 9_650 }));
    expect(peak.orb).toBeGreaterThan(1.2);
    expect(shopLighting(frame({ steady: true, dozeSince: 9_200 })).orb).toBeCloseTo(0.45, 6);
  });
});

describe("shopLighting in moments", () => {
  it("ducks the candles and lifts the orb on a try-on, for 500 ms", () => {
    const rest = shopLighting(frame({ steady: true }));
    const mid = shopLighting(frame({ steady: true, cue: { kind: "tryOn", at: 9_925 } }));
    expect(mid.candle).toBeCloseTo(rest.candle - 0.18, 6);
    expect(mid.orb).toBeCloseTo(rest.orb + 0.3, 6);
    expect(shopLighting(frame({ steady: true, cue: { kind: "tryOn", at: 9_400 } }))).toEqual(rest);
  });

  it("charges the orb to 1.4 and lets it fall back from where it stood on release", () => {
    const charge = { kind: "charge", at: 9_800 } as const;
    const half = shopLighting(frame({ steady: true, cue: charge })).orb;
    expect(half).toBeGreaterThan(0.45);
    expect(half).toBeLessThan(1.4);
    const release = { kind: "release", at: 10_000 } as const;
    const letGo = shopLighting(frame({ steady: true, cue: release, previous: charge }));
    expect(letGo.orb).toBeCloseTo(half, 6);
    const later = { ...release, at: 9_600 };
    expect(shopLighting(frame({ steady: true, cue: later, previous: charge })).orb).toBeCloseTo(
      0.45,
      6,
    );
  });

  it("peaks the spell at the burst, darkens the flight and lights the circle at impact", () => {
    const timeline = purchaseTimeline(3);
    const at = (ms: number) =>
      shopLighting(frame({ steady: true, cue: { kind: "spell", at: 10_000 - ms, timeline } }));
    expect(at(timeline.burst).orb).toBeCloseTo(2.6, 6);
    expect(at(timeline.burst).orbTint).toBeCloseTo(1, 6);
    expect(at((timeline.burst + timeline.impact) / 2).shade).toBeCloseTo(0.62, 6);
    expect(at(timeline.impact).circle).toBeCloseTo(1.2, 6);
    expect(at(timeline.impact + 750).circle).toBeLessThan(1.2);
    expect(at(timeline.impact + 750).circle).toBeGreaterThan(0.12);
    expect(at(timeline.settled + 1)).toEqual(shopLighting(frame({ steady: true })));
  });

  it("starts the spell from the charged orb", () => {
    const charge = { kind: "charge", at: 9_000 } as const;
    const spell = { kind: "spell", at: 10_000 } as const;
    expect(shopLighting(frame({ steady: true, cue: spell, previous: charge })).orb).toBeCloseTo(
      1.4,
      6,
    );
  });

  it("lets a fizzle sputter and settle within 700 ms", () => {
    const during = shopLighting(frame({ steady: true, cue: { kind: "fizzle", at: 9_650 } }));
    expect(during.orb).not.toBeCloseTo(0.45, 2);
    const after = shopLighting(frame({ steady: true, cue: { kind: "fizzle", at: 9_200 } }));
    expect(after.orb).toBeCloseTo(0.45, 6);
  });
});

describe("rune circle", () => {
  it("glows by state: rest, try-on, a decaying spell and a swelling adorn", () => {
    const level = (circle: LightInput["circle"], since: number) =>
      shopLighting(frame({ steady: true, circle, circleSince: 10_000 - since })).circle;
    expect(level("ruhe", 0)).toBeCloseTo(0.12, 6);
    expect(level("anprobe", 0)).toBeCloseTo(0.55, 6);
    expect(level("zauber", 0)).toBeCloseTo(1.2, 6);
    expect(level("zauber", 1500)).toBeCloseTo(0.55, 6);
    expect(level("anlegen", 450)).toBeCloseTo(1.4, 6);
    expect(level("anlegen", 1100)).toBeCloseTo(0.55, 6);
  });

  it("holds a static level when calm", () => {
    const calm = shopLighting(frame({ calm: true, circle: "zauber", circleSince: 0 }));
    expect(calm.circle).toBeCloseTo(1.2, 6);
  });

  it("stays gold at rest and turns white-gold as it brightens", () => {
    expect(circleWhite(0.12)).toBe(0);
    expect(circleWhite(0.55)).toBeGreaterThan(0);
    expect(circleWhite(0.55)).toBeLessThan(0.5);
    expect(circleWhite(1.2)).toBe(1);
  });
});

describe("shopGlows", () => {
  it("grows the orb bloom from 0.8 to 1.8 units with the charge", () => {
    expect(shopGlows(IDLE_LIGHTING).orbSize).toBeCloseTo(0.8, 6);
    expect(shopGlows(IDLE_LIGHTING).orbStrength).toBeCloseTo(0.35, 6);
    expect(shopGlows({ ...IDLE_LIGHTING, orb: 1.4 }).orbSize).toBeCloseTo(1.8, 6);
    expect(shopGlows({ ...IDLE_LIGHTING, orb: 1.4 }).orbStrength).toBeCloseTo(0.9, 6);
  });

  it("lets the candle halos follow the flicker", () => {
    expect(shopGlows({ ...IDLE_LIGHTING, candle: 1.1 }).candle).toBeCloseTo(0.352, 6);
  });
});
