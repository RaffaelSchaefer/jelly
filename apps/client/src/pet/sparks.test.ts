import { describe, expect, it } from "vitest";

import { STAGE_SPOTS, unitPx, type StageSpotName } from "./shopStage";
import { purchaseTimeline } from "./shopTimeline";
import {
  bezier,
  burst,
  coinFlip,
  coinPoint,
  FX_LOOKS,
  inward,
  mulberry32,
  coinApex,
  planCoins,
  planSpell,
  spellArc,
  stepSpark,
  type PlanContext,
  type Point,
  type StageBox,
} from "./sparks";

/** Eine Bühne von 692 × 288 px, wie im Fenster von 720 × 600. */
const BOX: StageBox = { left: 14, top: 60, width: 692, height: 288 };

/** Ein Punkt der Bühne in Pixeln. */
function spot(name: StageSpotName): Point {
  const { left, top } = STAGE_SPOTS[name];
  return { x: BOX.left + (left / 100) * BOX.width, y: BOX.top + (top / 100) * BOX.height };
}

/** Ein Plan-Kontext mit Samen. */
function context(seed = 7, density = 1): PlanContext {
  return { u: unitPx(BOX.height), box: BOX, random: mulberry32(seed), density };
}

describe("mulberry32", () => {
  it("repeats the same numbers for the same seed, between 0 and 1", () => {
    const first = Array.from({ length: 50 }, mulberry32(42));
    expect(Array.from({ length: 50 }, mulberry32(42))).toEqual(first);
    expect(Array.from({ length: 50 }, mulberry32(43))).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("arcs", () => {
  it("runs the bezier through both ends", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 0 },
    ] as const;
    expect(bezier(points, 0)).toEqual({ x: 0, y: 0 });
    expect(bezier(points, 1)).toEqual({ x: 4, y: 0 });
    expect(bezier(points, 0.5).y).toBeCloseTo(1.5, 10);
  });

  it("never lifts the spell arc above 30 % of the stage, for every slot", () => {
    const slots = ["slotHead", "slotFace", "slotBody", "slotHands", "slotAura"] as const;
    for (const slot of slots) {
      const arc = spellArc(spot("orb"), spot(slot), BOX);
      for (let step = 0; step <= 100; step++) {
        const { y } = bezier(arc, step / 100);
        expect((y - BOX.top) / BOX.height).toBeGreaterThanOrEqual(0.3 - 1e-9);
      }
    }
  });

  it("lifts the spell arc 18 % above its higher end when there is room", () => {
    const low = { x: 300, y: BOX.top + 0.8 * BOX.height };
    const arc = spellArc(low, { x: 500, y: BOX.top + 0.7 * BOX.height }, BOX);
    expect(arc[1].y).toBeCloseTo(BOX.top + 0.52 * BOX.height, 6);
  });

  it("carries the comet past the night window", () => {
    const arc = spellArc(spot("orb"), spot("slotFace"), BOX);
    const middle = bezier(arc, 0.4);
    const left = (100 * (middle.x - BOX.left)) / BOX.width;
    const top = (100 * (middle.y - BOX.top)) / BOX.height;
    expect(left).toBeGreaterThan(47);
    expect(left).toBeLessThan(59.1);
    expect(top).toBeLessThan(65.6);
  });

  it("flies a coin from start to end with its apex the given height above the start", () => {
    const from = { x: 640, y: 30 };
    const to = spot("tray");
    expect(coinPoint(from, to, 17, 0)).toEqual(from);
    expect(coinPoint(from, to, 17, 1).y).toBeCloseTo(to.y, 9);
    const highest = Math.min(
      ...Array.from({ length: 1001 }, (_, i) => coinPoint(from, to, 17, i / 1000).y),
    );
    expect(highest).toBeCloseTo(from.y - 17, 1);
  });

  it("keeps the coins' hop low and two coins below the window's top edge", () => {
    expect(coinApex({ x: 0, y: 300 }, BOX, 12)).toBeCloseTo(0.03 * BOX.height, 9);
    expect(coinApex({ x: 0, y: 30 }, BOX, 12)).toBe(6);
    expect(coinApex({ x: 0, y: 20 }, BOX, 12)).toBe(0);
  });

  it("flips a coin but never to a hairline", () => {
    expect(coinFlip(0)).toBe(1);
    expect(coinFlip(1 / 18)).toBe(0.15);
  });
});

describe("stepSpark", () => {
  it("slows with drag and falls with gravity", () => {
    const spark = { x: 0, y: 0, vx: 100, vy: 0, gravity: 50, drag: 2 };
    stepSpark(spark, 0.5);
    expect(spark.vx).toBeCloseTo(100 * Math.exp(-1), 6);
    expect(spark.vy).toBeCloseTo(25, 6);
    expect(spark.x).toBeGreaterThan(0);
    expect(spark.y).toBeGreaterThan(0);
  });
});

describe("plans", () => {
  it("give the same sparks for the same seed", () => {
    const at = spot("slotFace");
    const sparks = (seed: number) =>
      burst(context(seed), at, 0, FX_LOOKS.impact).map(({ spark }) => [spark?.vx, spark?.life]);
    expect(sparks(3)).toEqual(sparks(3));
    expect(sparks(3)).not.toEqual(sparks(4));
  });

  it("thin out in the light mode", () => {
    expect(burst(context(1, 0.4), spot("orb"), 0, FX_LOOKS.impact)).toHaveLength(16);
    const look = {
      count: 18,
      every: 0,
      radius: [0.4, 0.5],
      turns: 1,
      size: 0.1,
      tints: ["gold"],
    } as const;
    expect(inward(context(), spot("slotHead"), look)).toHaveLength(18);
  });

  it("lands every coin in the tray and calls each landing on time", () => {
    const timeline = purchaseTimeline(3);
    const launchesMs = timeline.coins.map((coin) => coin.launch);
    const to = spot("tray");
    const plan = planCoins(context(), { from: { x: 640, y: 30 }, to, launchesMs, flightMs: 480 });
    const lands = plan.filter((step) => step.land !== undefined);
    expect(lands.map((step) => [step.land, step.at])).toEqual(
      timeline.coins.map((coin, index) => [index, coin.land]),
    );
    const coins = plan.filter((step) => step.spark?.sprite === "coin");
    expect(coins).toHaveLength(3);
    for (const coin of coins) expect(coin.spark?.path?.(1).x).toBeCloseTo(to.x, 6);
  });

  it("bursts the spell at the orb and lands it at impact with flash, ring, burst and pillar", () => {
    const { burst: burstMs, impact: impactMs } = purchaseTimeline(3);
    const run = { from: spot("orb"), to: spot("slotFace"), feet: spot("feet"), burstMs, impactMs };
    const plan = planSpell(context(), run);
    const comet = plan.filter((step) => step.spark && step.at >= burstMs && step.at < impactMs);
    expect(comet.length).toBeGreaterThanOrEqual(72);
    const shapes = plan.flatMap((step) => (step.shape ? [step.shape.shape] : []));
    expect(shapes).toEqual(expect.arrayContaining(["flash", "ring", "pillar"]));
    const pillar = plan.find((step) => step.shape?.shape === "pillar")?.shape;
    expect(
      pillar && pillar.shape === "pillar" ? (pillar.top - BOX.top) / BOX.height : 0,
    ).toBeCloseTo(0.187, 6);
    const lastStart = Math.max(...plan.map((step) => step.at));
    expect(lastStart).toBeLessThanOrEqual(impactMs + 120);
  });

  it("keeps a spell within the pool of 240 sparks, and of 80 in the light mode", () => {
    const { burst: burstMs, impact: impactMs } = purchaseTimeline(6);
    const run = { from: spot("orb"), to: spot("slotHead"), feet: spot("feet"), burstMs, impactMs };
    expect(planSpell(context(), run).filter((step) => step.spark).length).toBeLessThanOrEqual(240);
    expect(planSpell(context(1, 0.4), run).filter((step) => step.spark).length).toBeLessThanOrEqual(
      80,
    );
  });
});

describe("planCoins", () => {
  it("flies coins as large as the purse's, and never below 14 px", () => {
    const run = { from: { x: 640, y: 30 }, to: spot("tray"), launchesMs: [0], flightMs: 480 };
    const sizeAt = (u: number) =>
      planCoins({ ...context(), u }, run).find((step) => step.spark?.sprite === "coin")?.spark
        ?.size;
    expect(sizeAt(100)).toBeCloseTo(24, 6);
    expect(sizeAt(40)).toBe(14);
  });
});
