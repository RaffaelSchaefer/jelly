/**
 * Prüft die Geschichten der Waren: jede Ware des Shops hat eine, kurz genug für den Kaufbrief.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems } from "./shop";
import { LORE_MAX, wareAccusative, wareLore } from "./shopLore";

/** Was über unbekannte Waren steht, je Platz. */
const FALLBACKS = {
  head: "Frisch aus dem Hinterzimmer des Zauberers.",
  face: "Für ein Gesicht, das man nicht vergisst.",
  any: "Riecht nach Abenteuer und ein wenig nach Zimt.",
};

describe("wareLore", () => {
  it.each(shopItems(PREVIEW_CATALOG, PREVIEW_ME).map((item) => [item.cosmetic.id, item]))(
    "%s hat eine eigene, kurze Geschichte",
    (_id, item) => {
      const lore = wareLore(item.cosmetic.id, item.cosmetic.slot);
      expect(lore.length).toBeGreaterThan(10);
      expect(lore.length).toBeLessThanOrEqual(LORE_MAX);
      expect(Object.values(FALLBACKS)).not.toContain(lore);
    },
  );

  it("erzählt von unbekannten Waren nach ihrem Platz", () => {
    expect(wareLore("zylinder", "head")).toBe(FALLBACKS.head);
    expect(wareLore("monokel", "face")).toBe(FALLBACKS.face);
    expect(wareLore("umhang", "body")).toBe(FALLBACKS.any);
    expect(wareLore("constructor", "constructor")).toBe(FALLBACKS.any);
  });
});

describe("wareAccusative", () => {
  it("kennt den Artikel der bekannten Waren", () => {
    expect(wareAccusative("hood", "Kapuze")).toBe("die Kapuze");
    expect(wareAccusative("headset", "Headset")).toBe("das Headset");
  });

  it("gibt für Unbekanntes keinen Artikel", () => {
    expect(wareAccusative("zylinder", "Zylinder")).toBeNull();
    expect(wareAccusative("toString", "Ding")).toBeNull();
  });
});
