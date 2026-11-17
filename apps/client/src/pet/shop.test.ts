/**
 * Prüft, was der Shop zeigt: Zustände, Reihenfolge und die Güte nach dem Rang des Preises.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { SHOP_TIERS, shopItems, shopTier, TIER_LABELS, type ShopItem } from "./shop";

/** Die Güte je Ware. */
function tiers(items: ShopItem[]) {
  return Object.fromEntries(items.map((item) => [item.cosmetic.id, item.tier]));
}

describe("shopTier", () => {
  it("verteilt die Preise {1, 1, 2, 3, 4, 6} auf die vier Güten", () => {
    const prices = [1, 1, 2, 3, 4, 6];
    expect(prices.map((price) => shopTier(price, prices))).toEqual([
      "schlicht",
      "schlicht",
      "fein",
      "edel",
      "edel",
      "sagenhaft",
    ]);
  });

  it("macht bei nur einem Preis alles schlicht", () => {
    expect(shopTier(5, [5, 5, 5])).toBe("schlicht");
  });

  it("bleibt ohne Katalog oder bei einem fremden Preis schlicht", () => {
    expect(shopTier(3, [])).toBe("schlicht");
    expect(shopTier(7, [1, 2])).toBe("schlicht");
  });

  it("reicht schon bei zwei Preisen von schlicht bis sagenhaft", () => {
    expect(shopTier(1, [9, 1])).toBe("schlicht");
    expect(shopTier(9, [9, 1])).toBe("sagenhaft");
  });

  it("hat ein Wort für jede Güte", () => {
    expect(SHOP_TIERS.map((tier) => TIER_LABELS[tier])).toEqual([
      "Schlicht",
      "Fein",
      "Edel",
      "Sagenhaft",
    ]);
  });
});

describe("shopItems", () => {
  it("stuft die Waren der Vorschau nach ihrem Preis ein", () => {
    expect(tiers(shopItems(PREVIEW_CATALOG, PREVIEW_ME))).toEqual({
      headset: "schlicht",
      "headset-neutral": "schlicht",
      beanie: "fein",
      sprout: "fein",
      "pixel-glasses": "edel",
      hood: "edel",
      crown: "sagenhaft",
      "schnoerbi-mask": "sagenhaft",
    });
  });

  it("behält die Güte nach einem Kauf", () => {
    const rich = { ...PREVIEW_ME, coins: 12, cosmetics: [] };
    const bought = { ...rich, coins: 9, cosmetics: ["pixel-glasses"] };
    expect(tiers(shopItems(PREVIEW_CATALOG, bought))).toEqual(
      tiers(shopItems(PREVIEW_CATALOG, rich)),
    );
  });

  it("sortiert nach Preis und kennt Besitz, Kaufbares und Fehlendes", () => {
    const items = shopItems(PREVIEW_CATALOG, PREVIEW_ME);
    expect(items.map((item) => item.price)).toEqual([1, 1, 2, 2, 3, 4, 6, 6]);
    const states = Object.fromEntries(
      items.map((item) => [item.cosmetic.id, [item.state, item.missing]]),
    );
    expect(states).toMatchObject({
      headset: ["owned", 0],
      "pixel-glasses": ["affordable", 0],
      hood: ["short", 1],
      crown: ["short", 3],
    });
  });

  it("lässt weg, was es nicht zu kaufen gibt, und kennt Waren nur für eine LAN", () => {
    const items = shopItems(PREVIEW_CATALOG, PREVIEW_ME);
    const ids = items.map((item) => item.cosmetic.id);
    expect(ids).not.toContain("party-hat");
    expect(ids).not.toContain("golden-cup");
    expect(items.filter((item) => item.perLan).map((item) => item.cosmetic.id)).toEqual(["crown"]);
  });
});
