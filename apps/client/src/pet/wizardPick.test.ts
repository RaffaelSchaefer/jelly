/**
 * Prüft, wie der Zauberer aussucht, was er sagt: ohne Wiederholung, nach Startwert, passend zur
 * Lage, und worauf er achtet.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { Me } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems, type ShopItem } from "./shop";
import { lineVariants, type LineTopic } from "./wizardLines";
import {
  ATTENTION,
  attentionAt,
  attentionDue,
  contextChange,
  createScriptKit,
  EMPTY_HISTORY,
  greetTopic,
  itemSlots,
  leaveAttention,
  pickLine,
  seededRandom,
  selectionPattern,
  selectPlan,
  slotsFor,
  suggestionFor,
  wornAfter,
  type Attention,
  type LineHistory,
} from "./wizardPick";
import { UNKNOWN_CONTEXT, type WizardContext } from "./wizardScripts";

/** Die Waren für ein Jelly mit `coins` Münzen, das `owned` schon hat. */
function wares(coins = 3, owned = PREVIEW_ME.cosmetics): ShopItem[] {
  const me: Me = { ...PREVIEW_ME, coins, cosmetics: owned };
  return shopItems(PREVIEW_CATALOG, me);
}

/** Eine Ware aus {@link wares}. */
function ware(id: string, coins = 3, owned = PREVIEW_ME.cosmetics) {
  const found = wares(coins, owned).find((item) => item.cosmetic.id === id);
  if (!found) throw new Error(`Keine Ware ${id}`);
  return found;
}

/** Ein Laden mit `coins` Münzen, mitten am Tag. */
function context(patch: Partial<WizardContext> = {}, coins = 3): WizardContext {
  return {
    ...UNKNOWN_CONTEXT,
    name: "Pixel",
    coins,
    perLevel: 1,
    open: true,
    items: wares(coins),
    worn: [],
    regular: true,
    hour: 14,
    modelKeys: ["beanie", "headset", "headset-neutral", "pixel-glasses"],
    ...patch,
  };
}

/** `count` Sätze zu `topic` nacheinander, mit fortgeschriebenem Gedächtnis. */
function pickMany(topic: LineTopic, count: number, seed = 7) {
  const random = seededRandom(seed);
  let history: LineHistory = EMPTY_HISTORY;
  return Array.from({ length: count }, () => {
    const picked = pickLine(topic, { name: "Pixel", item: "Krone" }, history, random.next);
    history = picked.history;
    return picked.text;
  });
}

describe("pickLine", () => {
  it("never repeats a line back to back, and not within three picks when it can", () => {
    const topics: LineTopic[] = ["greet.hello", "select.offer", "buy.incantation", "wake", "poke"];
    for (const topic of topics) {
      const count = lineVariants(topic).length;
      const window = Math.min(count - 1, 3);
      const picks = pickMany(topic, 200);
      for (const [index, text] of picks.entries()) {
        const before = picks.slice(Math.max(0, index - window), index);
        expect(before, `${topic} #${index}`).not.toContain(text);
      }
    }
  });

  it("gives the same lines for the same seed and others for another", () => {
    expect(pickMany("greet.hello", 20, 1)).toEqual(pickMany("greet.hello", 20, 1));
    expect(pickMany("greet.hello", 20, 1)).not.toEqual(pickMany("greet.hello", 20, 2));
  });

  it("skips lines that would grow too long and falls back to a line without slots", () => {
    const name = "N".repeat(60);
    for (let seed = 0; seed < 30; seed += 1) {
      const { text } = pickLine("greet.regular", { name }, EMPTY_HISTORY, seededRandom(seed).next);
      expect(text).not.toContain(name);
      expect(text.length).toBeLessThanOrEqual(60);
    }
    const { text } = pickLine("select.revisit", {}, EMPTY_HISTORY, () => 0);
    expect(text).not.toContain("{");
  });

  it("prefers the own lines of a ware", () => {
    const slots = itemSlots(context(), ware("crown"), "crown");
    const random = seededRandom(3);
    const texts = Array.from(
      { length: 40 },
      () => pickLine("hover.quip", slots, EMPTY_HISTORY, random.next).text,
    );
    expect(texts.filter((text) => text.includes("Verantwortung")).length).toBeGreaterThan(10);
  });
});

describe("script kit", () => {
  it("carries seed and memory forward", () => {
    const memory = { seed: 5, lines: EMPTY_HISTORY, ctx: context() };
    const kit = createScriptKit(memory);
    const first = kit.line("wake");
    expect(memory.seed).not.toBe(5);
    expect(memory.lines.ring).toEqual([first]);
    expect(kit.lineAt("poke", 4)).toBe("Genug gestupst!");
  });
});

describe("greetTopic", () => {
  it("knows the closed shop, the collector and the first visit", () => {
    expect(greetTopic(context({ open: false }))).toBe("greet.closed");
    const everything = wares(
      0,
      PREVIEW_CATALOG.cosmetics.map((entry) => entry.key),
    );
    expect(greetTopic(context({ items: everything }))).toBe("greet.collector");
    expect(greetTopic(context({ regular: false }))).toBe("greet.first");
  });

  it("knows the hour, then the purse", () => {
    expect(greetTopic(context({ hour: 23 }))).toBe("greet.night");
    expect(greetTopic(context({ hour: 3 }))).toBe("greet.night");
    expect(greetTopic(context({ hour: 7 }))).toBe("greet.morning");
    expect(greetTopic(context({ items: wares(12), coins: 12 }))).toBe("greet.rich");
    expect(greetTopic(context({ items: wares(0), coins: 0 }))).toBe("greet.broke");
    expect(greetTopic(context())).toBe("greet.regular");
    expect(greetTopic(UNKNOWN_CONTEXT)).toBe("greet.hello");
  });
});

describe("selectPlan", () => {
  it("talks about owned and worn wares", () => {
    expect(selectPlan(context(), ware("beanie")).topic).toBe("select.owned");
    const worn = selectPlan(context({ worn: ["beanie"] }), ware("beanie"));
    expect(worn).toMatchObject({ topic: "select.worn", shy: true });
  });

  it("offers, names the exact price, the missing model and the LAN-only crown", () => {
    expect(selectPlan(context(), ware("pixel-glasses")).topic).toBe("select.exact");
    expect(selectPlan(context({ coins: 5 }, 5), ware("pixel-glasses", 5))).toMatchObject({
      topic: "select.offer",
      gesture: "offer",
    });
    expect(selectPlan(context({}, 5), ware("hood", 5)).beat).toBe("select.noModel");
    const crown = selectPlan(
      context({ modelKeys: null }, 9),
      ware("crown", 9, PREVIEW_ME.cosmetics),
    );
    expect(crown.beat).toBe("select.perLan");
  });

  it("tells what is missing with a hint, or that only the Orga hands out coins", () => {
    expect(selectPlan(context(), ware("crown"))).toMatchObject({
      topic: "select.short",
      beat: "select.hint",
      think: true,
    });
    expect(selectPlan(context({ perLevel: 0 }), ware("crown")).beat).toBe("select.hintOrga");
    expect(selectPlan(context({ open: false }), ware("pixel-glasses")).topic).toBe("select.closed");
  });

  it("fills the slots of a short ware", () => {
    const slots = slotsFor(context(), ware("crown"));
    expect(slots).toMatchObject({ item: "Krone", missing: "3 Münzen", levelUps: "3 Aufstiege" });
  });
});

describe("suggestionFor", () => {
  it("suggests the next affordable ware, or saving for the cheapest", () => {
    const rich = context({}, 10);
    expect(suggestionFor(rich, ware("pixel-glasses", 10))).toMatchObject({
      topic: "buy.suggestNext",
      item: { cosmetic: { id: "sprout" } },
    });
    expect(suggestionFor(context(), ware("pixel-glasses"))).toMatchObject({
      topic: "buy.suggestSave",
      item: { cosmetic: { id: "sprout" } },
    });
  });

  it("is impressed when nothing is left, and silent without a shop", () => {
    const owned = PREVIEW_CATALOG.cosmetics
      .map((entry) => entry.key)
      .filter((key) => key !== "crown");
    const ctx = context({ items: wares(6, owned) }, 6);
    expect(suggestionFor(ctx, ware("crown", 6, owned))?.topic).toBe("buy.suggestAll");
    expect(suggestionFor(UNKNOWN_CONTEXT, ware("crown"))).toBeNull();
  });
});

describe("what he notices", () => {
  /** Eine Wahl im Protokoll. */
  const pick = (id: string, at: number, quick = false) => ({ item: ware(id), at, quick });

  it("sees the third pick of the same ware and three wares compared in 20 s", () => {
    const log = [pick("crown", 0), pick("hood", 2000), pick("crown", 4000)];
    expect(selectionPattern(log, 4000)).toEqual({ repeat: false, compare: false });
    expect(selectionPattern([...log, pick("crown", 6000)], 6000).repeat).toBe(true);
    const compare = [pick("crown", 0), pick("hood", 3000), pick("beanie", 6000)];
    expect(selectionPattern(compare, 6000).compare).toBe(true);
    expect(selectionPattern(compare, 25_000).compare).toBe(false);
    const browsing = [pick("crown", 0), pick("hood", 300, true), pick("beanie", 600, true)];
    expect(selectionPattern(browsing, 600).compare).toBe(false);
  });

  it("looks after 250 ms, remarks after the dwell and wakes in his sleep", () => {
    const attention: Attention = {
      target: "item",
      itemId: "crown",
      since: 0,
      gazed: false,
      done: false,
    };
    expect(attentionAt(attention, false)).toBe(ATTENTION.gazeMs);
    expect(attentionDue(attention, 200, false)).toBeNull();
    expect(attentionDue(attention, 250, false)).toBe("gaze");
    expect(attentionAt(attention, false)).toBe(1600);
    expect(attentionDue(attention, 1600, false)).toBe("remark");
    expect(attentionAt(attention, false)).toBe(Infinity);
    const sleeping = { ...attention, gazed: false, done: false };
    expect(attentionDue(sleeping, 1000, true)).toBeNull();
    expect(attentionDue(sleeping, 1500, true)).toBe("wake");
    expect(leaveAttention({ ...attention, gazed: true }, 2000)).toEqual([
      { at: 2400, look: { gaze: "viewer" } },
      { at: 3200, look: { mood: "neutral" } },
    ]);
  });

  it("sees the LAN begin and end, and a ware that became affordable", () => {
    const closed = context({ open: false });
    expect(contextChange(closed, { open: true }).lan).toBe(true);
    expect(contextChange(context(), { open: false }).lan).toBe(false);
    expect(contextChange(UNKNOWN_CONTEXT, { open: true }).lan).toBeNull();
    const richer = contextChange(context(), { items: wares(4), coins: 4 });
    expect(richer.affordable?.cosmetic.id).toBe("hood");
    expect(contextChange(context(), { items: wares(3) }).affordable).toBeNull();
  });

  it("keeps one ware per slot when one is put on or off", () => {
    expect(wornAfter(["beanie", "pixel-glasses"], ware("crown"), true)).toEqual([
      "pixel-glasses",
      "crown",
    ]);
    expect(wornAfter(["beanie", "pixel-glasses"], ware("beanie"), false)).toEqual([
      "pixel-glasses",
    ]);
  });
});
