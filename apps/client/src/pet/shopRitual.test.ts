/**
 * Prüft, was die Momente im Laden auf der Bühne auslösen: Ziele der Funken, Klang der Anprobe,
 * Runenkreis und Raum beim Kauf und beim Anlegen, und die Börse beim Landen der Münzen.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { ShopItem } from "./shop";

import {
  adornStage,
  CALM_STAGE,
  CHARGE_STAGE,
  coinHold,
  hasLook,
  magicSpot,
  purchaseStage,
  RESTING_STAGE,
  SLOT_SPOTS,
  stageAt,
  tryOnSound,
  wareSpot,
} from "./shopRitual";
import { STAGE_SPOTS } from "./shopStage";
import { ADORN, purchaseTimeline, TRY_ON } from "./shopTimeline";

/** Eine Ware im Laden, nur mit dem, was hier zählt. */
function ware(slot: ShopItem["cosmetic"]["slot"], state: ShopItem["state"], price = 3): ShopItem {
  return { cosmetic: { id: "pixel-glasses", slot }, state, price } as ShopItem;
}

describe("wareSpot", () => {
  it("aims every slot at its own spot on the customer", () => {
    for (const [slot, spot] of Object.entries(SLOT_SPOTS)) {
      expect(STAGE_SPOTS[spot]).toBeDefined();
      expect(wareSpot(ware(slot as ShopItem["cosmetic"]["slot"], "affordable"))).toBe(spot);
    }
    expect(new Set(Object.values(SLOT_SPOTS)).size).toBe(5);
  });
});

describe("magicSpot", () => {
  it("aims at the slot only when the customer can show the ware", () => {
    const glasses = ware("face", "affordable");
    expect(hasLook(glasses, ["pixel-glasses"])).toBe(true);
    expect(magicSpot(glasses, ["pixel-glasses"])).toBe("slotFace");
    expect(hasLook(glasses, ["beanie"])).toBe(false);
    expect(magicSpot(glasses, [])).toBe("customerCentre");
    expect(STAGE_SPOTS.customerCentre).toBeDefined();
  });
});

describe("tryOnSound", () => {
  it("lands the poof on the pop and picks the variant from the ware's state", () => {
    expect(tryOnSound(ware("face", "affordable"))).toEqual({
      slot: "face",
      price: 3,
      delayMs: TRY_ON.pop - 80,
    });
    expect(tryOnSound(ware("head", "short", 6)).variant).toBe("short");
    expect(tryOnSound(ware("head", "owned")).variant).toBe("owned");
  });
});

describe("stage changes", () => {
  it("dims for the purchase, flares the runes at impact and calms down when settled", () => {
    const timeline = purchaseTimeline(3);
    const changes = purchaseStage(timeline);
    const charged = stageAt(RESTING_STAGE, CHARGE_STAGE, 0);
    expect(charged).toEqual({ circle: "ruhe", dim: "kauf" });
    const tried = { circle: "anprobe", dim: null } as const;
    expect(stageAt(tried, changes, 0)).toEqual({ circle: "anprobe", dim: "kauf" });
    expect(stageAt(tried, changes, 1439)).toEqual({ circle: "anprobe", dim: "kauf" });
    expect(stageAt(tried, changes, 1440)).toEqual({ circle: "zauber", dim: "kauf" });
    expect(stageAt(tried, changes, 3140)).toEqual({ circle: "anprobe", dim: null });
    expect(stageAt(charged, CALM_STAGE, 0)).toEqual(RESTING_STAGE);
  });

  it("swells the runes for adorning and lets them rest at its end", () => {
    const tried = { circle: "anprobe", dim: null } as const;
    expect(stageAt(tried, adornStage(), ADORN.peak).circle).toBe("anlegen");
    expect(stageAt(tried, adornStage(), ADORN.end).circle).toBe("anprobe");
  });
});

describe("coinHold", () => {
  it("counts the purse down one coin per landing and shows the real coins after the last", () => {
    expect([0, 1, 2].map((index) => coinHold(3, index, 3))).toEqual([2, 1, null]);
    // Bei sieben Münzen fliegen nur sechs: Den Rest zählt die Börse danach selbst.
    expect([0, 4, 5].map((index) => coinHold(9, index, 6))).toEqual([8, 4, null]);
  });
});
