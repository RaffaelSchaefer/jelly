/**
 * Prüft die Rolle: Reihenfolge, die eben gekaufte Ware, die Pfeiltasten und was der leere Kaufbrief
 * sagt.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { Me } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems, type ShopItem } from "./shop";
import {
  isLedgerKey,
  isWorn,
  ledgerOrder,
  ledgerStep,
  ledgerView,
  replacedItem,
  shopSummary,
} from "./shopLedger";

/** Das Jelly der Vorschau mit anderem Stand. */
function jelly(patch: Partial<Me> = {}): Me {
  return { ...PREVIEW_ME, ...patch };
}

/** Die Rolle als Liste von Schlüsseln. */
function ids(items: ShopItem[]) {
  return items.map((item) => item.cosmetic.id);
}

/** Die Rolle für ein Jelly. */
function view(me: Me, keepId: string | null = null) {
  const { wares, chest } = ledgerView(shopItems(PREVIEW_CATALOG, me), me, keepId);
  return { wares: ids(wares), chest: ids(chest) };
}

/** Eine Ware der Vorschau. */
function ware(id: string, me: Me = PREVIEW_ME) {
  const found = shopItems(PREVIEW_CATALOG, me).find((item) => item.cosmetic.id === id);
  if (!found) throw new Error(`Keine Ware ${id}`);
  return found;
}

/** Die Waren der Vorschau zu 2 Münzen, nach Namen. Die Mütze hat der Spieler schon. */
const FOR_TWO = ["bell-collar", "bandana", "sprout"];

/** Was der Spieler der Vorschau noch nicht hat ab 3 Münzen, nach Preis und dann nach Namen. */
const FROM_THREE = [
  "kamina-glasses",
  "snail-shell",
  "ogre-ears",
  "piercings",
  "pixel-glasses",
  "schnoerbi-mask",
  "knit-scarf",
  "hood",
  "goose",
  "chicken",
  "long-schnoerbi",
  "mini-backpack",
  "fairy-wings",
  "crown",
];

/** Was der Spieler der Vorschau noch nicht hat, nach Preis und dann nach Namen. */
const NOT_OWNED = [...FOR_TWO, ...FROM_THREE];

/** Was er schon hat, in der Truhe. */
const OWNED = ["headset", "headset-neutral", "beanie"];

/** Alle Waren der Vorschau, nach Preis und dann nach Namen. */
const EVERY_WARE = [
  "headset",
  "headset-neutral",
  "bell-collar",
  "bandana",
  "beanie",
  "sprout",
  ...FROM_THREE,
];

describe("ledgerView", () => {
  it("stellt Kaufbares vor zu Teures und beides vor die Truhe", () => {
    expect(view(PREVIEW_ME)).toEqual({
      wares: NOT_OWNED,
      chest: OWNED,
    });
  });

  it("sortiert Kaufbares nach Preis, dann nach Namen", () => {
    expect(view(jelly({ coins: 12, cosmetics: [] })).wares).toEqual(EVERY_WARE);
  });

  it("sortiert zu Teures nach den fehlenden Münzen", () => {
    expect(view(jelly({ coins: 2, cosmetics: [] })).wares).toEqual(EVERY_WARE);
  });

  it("legt in der Truhe das Angelegte nach vorn", () => {
    const equipped = { head: { key: "beanie", color: null } };
    expect(view(jelly({ equipped })).chest).toEqual(["beanie", "headset", "headset-neutral"]);
  });

  it("lässt die eben gekaufte Ware oben stehen, bis eine andere gewählt wird", () => {
    const bought = jelly({ coins: 0, cosmetics: [...PREVIEW_ME.cosmetics, "pixel-glasses"] });
    expect(view(bought, "pixel-glasses").wares).toEqual(NOT_OWNED);
    expect(view(bought).wares).toEqual(NOT_OWNED.filter((id) => id !== "pixel-glasses"));
    expect(view(bought).chest).toContain("pixel-glasses");
  });

  it("lässt auch eine teure Ware an ihrem Platz, wenn das Billigere nun zu teuer ist", () => {
    const before = jelly({ coins: 6 });
    const after = jelly({ coins: 0, cosmetics: [...PREVIEW_ME.cosmetics, "crown"] });
    expect(view(after, "crown").wares).toEqual(view(before).wares);
  });

  it("geht die Rolle von oben nach unten durch", () => {
    const items = shopItems(PREVIEW_CATALOG, PREVIEW_ME);
    expect(ids(ledgerOrder(ledgerView(items, PREVIEW_ME)))).toEqual([...NOT_OWNED, ...OWNED]);
  });
});

describe("ledgerStep", () => {
  it("geht in einer Spalte auf und ab, aber nicht über die Enden", () => {
    expect(ledgerStep(0, "ArrowDown", [5], 1)).toBe(1);
    expect(ledgerStep(0, "ArrowUp", [5], 1)).toBeNull();
    expect(ledgerStep(4, "ArrowDown", [5], 1)).toBeNull();
    expect(ledgerStep(0, "ArrowLeft", [5], 1)).toBeNull();
    expect(ledgerStep(4, "ArrowRight", [5], 1)).toBeNull();
  });

  it("springt mit Pos1 und Ende an die Enden", () => {
    expect(ledgerStep(3, "Home", [5], 2)).toBe(0);
    expect(ledgerStep(1, "End", [5], 2)).toBe(4);
    expect(ledgerStep(4, "End", [3, 2], 2)).toBe(4);
  });

  it("geht bei mehreren Spalten eine Zeile weiter", () => {
    expect(ledgerStep(1, "ArrowDown", [5], 2)).toBe(3);
    expect(ledgerStep(2, "ArrowUp", [5], 2)).toBe(0);
    expect(ledgerStep(1, "ArrowRight", [5], 2)).toBe(2);
    expect(ledgerStep(0, "ArrowDown", [7], 3)).toBe(3);
    expect(ledgerStep(5, "ArrowUp", [8], 4)).toBe(1);
    expect(ledgerStep(4, "ArrowDown", [8], 4)).toBeNull();
  });

  it("führt in eine kürzere Zeile zu ihrer letzten Ware", () => {
    expect(ledgerStep(3, "ArrowDown", [5], 2)).toBe(4);
    expect(ledgerStep(5, "ArrowDown", [7], 3)).toBe(6);
  });

  it("beginnt die Truhe in einer neuen Zeile, auch nach einer ungeraden Zahl Waren", () => {
    // Zwei Spalten: Kaufen [0 1] [2], Truhe [3 4] [5].
    const sections = [3, 3];
    expect(ledgerStep(2, "ArrowDown", sections, 2)).toBe(3);
    expect(ledgerStep(3, "ArrowDown", sections, 2)).toBe(5);
    expect(ledgerStep(1, "ArrowDown", sections, 2)).toBe(2);
    expect(ledgerStep(4, "ArrowUp", sections, 2)).toBe(2);
    expect(ledgerStep(3, "ArrowUp", sections, 2)).toBe(2);
    expect(ledgerStep(2, "ArrowUp", sections, 2)).toBe(0);
    expect(ledgerStep(5, "ArrowDown", sections, 2)).toBeNull();
  });

  it("überspringt leere Abschnitte", () => {
    expect(ledgerStep(0, "ArrowDown", [0, 4], 2)).toBe(2);
    expect(ledgerStep(1, "ArrowDown", [2, 0], 2)).toBeNull();
  });

  it("kennt nur seine Tasten und beginnt ohne Fokus vorn", () => {
    expect(isLedgerKey("ArrowDown")).toBe(true);
    expect(isLedgerKey("a")).toBe(false);
    expect(isLedgerKey("constructor")).toBe(false);
    expect(ledgerStep(2, "PageDown", [5], 1)).toBeNull();
    expect(ledgerStep(-1, "ArrowDown", [5], 1)).toBe(0);
    expect(ledgerStep(0, "ArrowDown", [0], 1)).toBeNull();
    expect(ledgerStep(0, "ArrowDown", [], 1)).toBeNull();
    expect(ledgerStep(0, "ArrowDown", [3], 0)).toBe(1);
  });
});

describe("shopSummary", () => {
  /** Was der leere Kaufbrief für ein Jelly sagt. */
  function summary(me: Me, open = true) {
    return shopSummary(shopItems(PREVIEW_CATALOG, me), me.coins, open);
  }

  it("sagt, wenn der Laden ruht", () => {
    expect(summary(PREVIEW_ME, false)).toBe("Der Laden ruht. Anprobieren kannst du trotzdem.");
  });

  it("zählt, was sich das Jelly leisten kann", () => {
    const twoOwned = [...PREVIEW_ME.cosmetics, "bandana", "bell-collar"];
    expect(summary(jelly({ coins: 2, cosmetics: twoOwned }))).toBe(
      "Mit 2 Münzen kannst du dir eine Ware leisten.",
    );
    expect(summary(PREVIEW_ME)).toBe("Mit 3 Münzen kannst du dir 10 Waren leisten.");
  });

  it("nennt, was zur günstigsten Ware fehlt", () => {
    expect(summary(jelly({ coins: 1 }))).toBe("Für den Spross fehlt dir noch 1 Münze.");
    expect(summary(jelly({ coins: 0 }))).toBe("Für den Spross fehlen dir noch 2 Münzen.");
  });

  it("nennt eine unbekannte Ware ohne Artikel", () => {
    const crown = ware("crown", jelly({ coins: 0 }));
    const strange = { ...crown, cosmetic: { ...crown.cosmetic, id: "zauberstab" } };
    expect(shopSummary([strange], 0, true)).toBe(
      "Für deine nächste Ware fehlen dir noch 6 Münzen.",
    );
  });

  it("freut sich, wenn alles gekauft ist, und kennt leere Regale", () => {
    const keys = shopItems(PREVIEW_CATALOG, PREVIEW_ME).map((item) => item.cosmetic.id);
    expect(summary(jelly({ coins: 2, cosmetics: keys }))).toBe(
      "Du hast alles! Der Zauberer muss nachzaubern.",
    );
    expect(shopSummary([], 3, true)).toBe("Die Regale sind leer.");
  });
});

describe("replacedItem und isWorn", () => {
  const beanie = { head: { key: "beanie", color: "#ffffff" } };

  it("nennt, was auf demselben Platz schon getragen wird", () => {
    const me = jelly({ equipped: beanie });
    expect(replacedItem(me, ware("hood"), PREVIEW_CATALOG)).toBe("Mütze");
    expect(replacedItem(me, ware("beanie"), PREVIEW_CATALOG)).toBeNull();
    expect(replacedItem(me, ware("pixel-glasses"), PREVIEW_CATALOG)).toBeNull();
  });

  it("findet auch Namen außerhalb des Shops", () => {
    const party = jelly({ equipped: { head: { key: "party-hat", color: null } } });
    expect(replacedItem(party, ware("hood"), PREVIEW_CATALOG)).toBe("Party-Hut");
    const strange = jelly({ equipped: { head: { key: "zylinder", color: null } } });
    expect(replacedItem(strange, ware("hood"), PREVIEW_CATALOG)).toBe("zylinder");
  });

  it("weiß, ob eine Ware getragen wird", () => {
    expect(isWorn(jelly({ equipped: beanie }), ware("beanie"))).toBe(true);
    expect(isWorn(PREVIEW_ME, ware("beanie"))).toBe(false);
  });
});
