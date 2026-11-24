/**
 * Prüft den Katalog der Sätze: Länge auch mit langen Namen, Fassungen ohne Platzhalter, eigene
 * Sätze zu jeder Ware und keine Versprechen über Preise.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { PREVIEW_CATALOG } from "./preview";
import { ITEM_LINES } from "./wizardItemLines";
import {
  FALLBACK_CHARS,
  fallbackLine,
  fillLine,
  lineVariants,
  MAX_LINE_CHARS,
  WIZARD_LINES,
  WIZARD_NAME,
  type LineSlots,
  type LineTopic,
} from "./wizardLines";

/** Ein Name mit 24 Zeichen, so lang, wie der Server ihn erlaubt. */
const LONG_NAME = "Wackelpudding-Großmeiste";

/** Der längste Name einer Ware im Katalog. */
const LONGEST_ITEM = PREVIEW_CATALOG.cosmetics.reduce(
  (longest, entry) => (entry.name.length > longest.length ? entry.name : longest),
  "",
);

/** Eine unbekannte Ware mit 24 Zeichen. */
const UNKNOWN_ITEM = "Unbekanntes Zauberding X";

/** Alle Platzhalter, so lang, wie sie im Laden werden können. */
function longSlots(item: string): LineSlots {
  return {
    name: LONG_NAME,
    item,
    missing: "99 Münzen",
    coins: "999 Münzen",
    gained: "99 Münzen",
    perLevel: "99 Münzen",
    levelUps: "99 Aufstiege",
    level: "999",
    next: "1000",
    // So lang wird die Zeit, bis der Hut zurückkommt, höchstens (`hatTimeWords`).
    remaining: "59 Sekunden",
    holder: LONG_NAME,
  };
}

/** Alle Anlässe. */
const TOPICS = Object.keys(WIZARD_LINES) as LineTopic[];

/** Jede Fassung jedes Anlasses samt der Sätze zu jeder Ware. */
function everyTemplate() {
  const itemKeys = Object.keys(ITEM_LINES);
  return TOPICS.flatMap((topic) => [
    ...lineVariants(topic).map(({ template }) => template),
    ...itemKeys.flatMap((key) => lineVariants(topic, key).map(({ template }) => template)),
  ]);
}

describe("wizard lines", () => {
  it("fit 60 characters, even with the longest names", () => {
    expect(UNKNOWN_ITEM).toHaveLength(24);
    expect(LONG_NAME).toHaveLength(24);
    for (const template of new Set(everyTemplate())) {
      for (const item of [LONGEST_ITEM, UNKNOWN_ITEM]) {
        const text = fillLine(template, longSlots(item));
        expect(text, template).not.toBeNull();
        expect(text!.length, text!).toBeLessThanOrEqual(MAX_LINE_CHARS);
        expect(text).not.toContain("{");
      }
    }
  });

  it("give every topic a short line without slots", () => {
    for (const topic of TOPICS) {
      const fallback = fallbackLine(topic);
      expect(fallback, topic).not.toContain("{");
      expect(fallback.length, topic).toBeLessThanOrEqual(FALLBACK_CHARS);
      expect(lineVariants(topic).map(({ template }) => template)).toContain(fallback);
    }
  });

  it("have own lines for every ware in the shop", () => {
    const shopKeys = PREVIEW_CATALOG.cosmetics
      .filter((entry) => entry.unlock === "shop")
      .map((entry) => entry.key);
    expect(shopKeys.length).toBeGreaterThan(0);
    for (const key of shopKeys) {
      const own = ITEM_LINES[key];
      expect(own, key).toBeDefined();
      expect(own!.offer.length, key).toBeGreaterThanOrEqual(2);
      for (const kind of ["short", "worn", "bought", "hover"] as const) {
        expect(own![kind].length, `${key} ${kind}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("put the lines of a ware before the general ones and weigh them double", () => {
    const [first] = lineVariants("select.offer", "crown");
    expect(ITEM_LINES.crown!.offer).toContain(first!.template);
    expect(first!.weight).toBe(2);
    expect(lineVariants("select.offer", "unbekannt")[0]!.weight).toBe(1);
  });
});

describe("wizard line rules", () => {
  it("never promise a discount", () => {
    for (const template of everyTemplate()) {
      expect(template).not.toMatch(/rabatt|billiger/i);
    }
  });

  it("hold about a hundred lines and name the wizard once", () => {
    const general = TOPICS.reduce((sum, topic) => sum + lineVariants(topic).length, 0);
    const own = Object.values(ITEM_LINES).reduce(
      (sum, kinds) => sum + Object.values(kinds).flat().length,
      0,
    );
    expect(general + own).toBeGreaterThanOrEqual(100);
    expect(WIZARD_NAME).toBe("Funkelbart");
    expect(WIZARD_LINES["greet.intro"].every((line) => line.includes(WIZARD_NAME))).toBe(true);
  });

  it("fills slots and refuses a line whose slot is missing", () => {
    expect(fillLine("Hallo, {name}!", { name: "Pixel" })).toBe("Hallo, Pixel!");
    expect(fillLine("Hallo, {name}!", {})).toBeNull();
    expect(fillLine("{item}", { itemKey: "crown" })).toBeNull();
  });
});
