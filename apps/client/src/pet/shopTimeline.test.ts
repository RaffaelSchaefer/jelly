/**
 * Prüft den Takt des Zauberladens: die Zeiten eines Kaufs ab C und welcher Moment auf der Bühne
 * beginnt.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import {
  ADORN,
  CHARGE,
  nextMoment,
  purchaseTimeline,
  TAKE_OFF,
  TRY_ON,
  type StageChoice,
} from "./shopTimeline";

/** Alle Zeiten eines Kaufs in ihrer Reihenfolge. */
function times(price: number) {
  const plan = purchaseTimeline(price);
  return [
    ...plan.coins.flatMap((coin) => [coin.launch, coin.land]).sort((a, b) => a - b),
    plan.till,
    plan.burst,
    plan.impact,
    plan.congrats,
    plan.settled,
  ];
}

describe("purchaseTimeline", () => {
  it("lands three coins, rings the till and casts the spell on time", () => {
    const plan = purchaseTimeline(3);
    expect(plan.coins).toEqual([
      { launch: 0, land: 480 },
      { launch: 70, land: 550 },
      { launch: 140, land: 620 },
    ]);
    expect(plan).toMatchObject({
      till: 740,
      burst: 840,
      impact: 1440,
      congrats: 1640,
      settled: 3140,
    });
  });

  it("flies one to six coins, whatever the price", () => {
    expect(purchaseTimeline(0).coins).toHaveLength(1);
    expect(purchaseTimeline(1).coins).toHaveLength(1);
    expect(purchaseTimeline(6).coins).toHaveLength(6);
    expect(purchaseTimeline(40).coins).toHaveLength(6);
    expect(purchaseTimeline(40).impact).toBe(purchaseTimeline(6).impact);
  });

  it("keeps every step after the one before", () => {
    for (const price of [1, 2, 3, 4, 6, 9]) {
      const plan = purchaseTimeline(price);
      const steps = [plan.coins.at(-1)!.land, plan.till, plan.burst, plan.impact, plan.congrats];
      for (const [index, step] of steps.entries()) {
        if (index > 0) expect(step).toBeGreaterThan(steps[index - 1]!);
      }
      expect(plan.settled).toBeGreaterThan(plan.congrats);
      const all = times(price);
      expect(new Set(all).size).toBe(all.length);
      const lands = plan.coins.map((coin) => coin.land);
      expect(lands).toEqual([...lands].sort((a, b) => a - b));
    }
  });

  it("names the other moments of the stage", () => {
    expect(TRY_ON).toEqual({ pop: 260, settled: 620 });
    expect(ADORN).toEqual({ peak: 450, end: 1100 });
    expect(TAKE_OFF).toEqual({ end: 420 });
    expect(CHARGE).toEqual({ lateHold: 250 });
  });
});

/** Eine Wahl auf der Bühne. */
function choice(patch: Partial<StageChoice> = {}): StageChoice {
  return { chosenId: null, slot: null, equippedKey: null, purchases: 0, ...patch };
}

describe("nextMoment", () => {
  const glasses = choice({ chosenId: "pixel-glasses", slot: "face" });

  it("tries a ware on when it is chosen, and nothing when the choice is cleared", () => {
    expect(nextMoment(choice(), glasses)).toBe("anprobe");
    expect(nextMoment(glasses, choice({ chosenId: "crown", slot: "head" }))).toBe("anprobe");
    expect(nextMoment(glasses, choice())).toBeNull();
    expect(nextMoment(glasses, glasses)).toBeNull();
  });

  it("counts a purchase as a purchase, even though it is worn at once", () => {
    const bought = { ...glasses, equippedKey: "pixel-glasses", purchases: 1 };
    expect(nextMoment(glasses, bought)).toBe("kauf");
  });

  it("puts an owned ware on and takes it off again", () => {
    const worn = { ...glasses, equippedKey: "pixel-glasses" };
    expect(nextMoment(glasses, worn)).toBe("anlegen");
    expect(nextMoment(worn, glasses)).toBe("ablegen");
  });

  it("ignores changes on the slot that are not the chosen ware", () => {
    const other = { ...glasses, equippedKey: "monocle" };
    expect(nextMoment(glasses, other)).toBeNull();
  });
});
