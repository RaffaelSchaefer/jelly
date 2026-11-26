/**
 * Sucht aus, was der Zauberer sagt: den Anlass zu einer Lage (Begrüßung, Wahl, Vorschlag,
 * Weissagung), die Fassung und was in ihre Platzhalter kommt. Er wiederholt sich nicht: Die letzten
 * Fassungen eines Anlasses und die letzten zwölf Sätze überhaupt sind gesperrt. Der Zufall kommt
 * aus einem Startwert, derselbe Startwert gibt dieselben Sätze.
 *
 * Dazu, worauf er achtet: wo der Zeiger verweilt, welche Muster die Wahlen bilden und was neues
 * Wissen ändert.
 *
 * @module
 */

import type { ShopItem } from "./shop";
import type { ScriptKit, WizardContext, WizardGesture, WizardLook } from "./wizardScripts";

import { coinLabel, COSMETICS } from "./cosmetics";
import {
  fallbackLine,
  fillLine,
  lineVariants,
  MAX_LINE_CHARS,
  type LineSlots,
  type LineTopic,
} from "./wizardLines";

/** So viele Sätze merkt er sich insgesamt. */
const RING_SIZE = 12;

/** So viele der letzten Fassungen eines Anlasses sind höchstens gesperrt. */
const MAX_EXCLUDED = 3;

/** Was er zuletzt gesagt hat. */
export interface LineHistory {
  /** Die letzten Fassungen je Anlass, ungefüllt, die jüngste zuletzt. */
  recent: Readonly<Record<string, readonly string[]>>;
  /** Die letzten Sätze, gefüllt, der jüngste zuletzt. */
  ring: readonly string[];
}

/** Noch nichts gesagt. */
export const EMPTY_HISTORY: LineHistory = { recent: {}, ring: [] };

/** Ein ausgesuchter Satz und das Gedächtnis danach. */
export interface PickedLine {
  text: string;
  history: LineHistory;
}

/** Eine Folge von Zufallszahlen aus einem Startwert (mulberry32). */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return {
    /** Die nächste Zahl, von 0 bis unter 1. */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), state | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    },
    /** Der Zustand, um später genau hier weiterzumachen. */
    state: () => state,
  };
}

/** Wählt nach Gewicht. */
function weighted<T extends { weight: number }>(pool: T[], random: () => number): T | undefined {
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let left = random() * total;
  for (const entry of pool) {
    left -= entry.weight;
    if (left < 0) return entry;
  }
  return pool.at(-1);
}

/** Die zuletzt genutzten Fassungen von `topic`, die bei `count` Fassungen gesperrt sind. */
function blockedFor(history: LineHistory, topic: string, count: number) {
  const excluded = Math.min(count - 1, MAX_EXCLUDED);
  return excluded > 0 ? (history.recent[topic] ?? []).slice(-excluded) : [];
}

/** Merkt sich `template` als jüngste Fassung von `topic` und `text` als jüngsten Satz. */
function remember(history: LineHistory, topic: string, template: string, text: string) {
  const recent = [...(history.recent[topic] ?? []), template].slice(-MAX_EXCLUDED);
  return {
    recent: { ...history.recent, [topic]: recent },
    ring: [...history.ring, text].slice(-RING_SIZE),
  };
}

/**
 * Sucht einen Satz zu `topic` aus. Gesperrt sind die letzten min(n − 1, 3) Fassungen des Anlasses
 * und alles aus den letzten zwölf Sätzen. Fassungen, denen ein Platzhalter fehlt oder die zu lang
 * würden, fallen weg. Bleibt nichts übrig, nimmt er die Fassung ohne Platzhalter.
 *
 * @param random - Zahlen von 0 bis unter 1, etwa aus {@link seededRandom}.
 */
export function pickLine(
  topic: LineTopic,
  slots: LineSlots,
  history: LineHistory,
  random: () => number,
): PickedLine {
  const variants = lineVariants(topic, slots.itemKey);
  const blocked = blockedFor(history, topic, variants.length);
  const fitting = variants.flatMap((variant) => {
    const text = fillLine(variant.template, slots);
    return text === null || text.length > MAX_LINE_CHARS ? [] : [{ ...variant, text }];
  });
  const allowed = fitting.filter(({ template }) => !blocked.includes(template));
  const fresh = allowed.filter(({ text }) => !history.ring.includes(text));
  const pool = [fresh, allowed, fitting].find((entries) => entries.length > 0) ?? [];
  const chosen = weighted(pool, random);
  const template = chosen?.template ?? fallbackLine(topic);
  const text = chosen?.text ?? template;
  return { text, history: remember(history, topic, template, text) };
}

/** Die Fassung an Stelle `index` von `topic`, für Leitern wie das Stupsen. */
export function pickLineAt(
  topic: LineTopic,
  index: number,
  slots: LineSlots,
  history: LineHistory,
): PickedLine {
  const variants = lineVariants(topic);
  const template = variants[Math.min(index, variants.length - 1)]?.template ?? "";
  const filled = fillLine(template, slots);
  const text = filled !== null && filled.length <= MAX_LINE_CHARS ? filled : fallbackLine(topic);
  return { text, history: remember(history, topic, template, text) };
}

/** „1 Aufstieg“, „3 Aufstiege“. */
function levelUpLabel(count: number) {
  return count === 1 ? "1 Aufstieg" : `${count} Aufstiege`;
}

/** Die Platzhalter, die aus dem Wissen und einem Teil folgen. Unbekanntes bleibt leer. */
export function slotsFor(ctx: WizardContext, item?: ShopItem | null): LineSlots {
  const slots: LineSlots = {};
  if (ctx.name !== null) slots.name = ctx.name;
  if (ctx.coins !== null) slots.coins = coinLabel(ctx.coins);
  if (ctx.perLevel !== null) slots.perLevel = coinLabel(ctx.perLevel);
  if (!item) return slots;
  slots.item = item.cosmetic.name;
  slots.itemKey = item.cosmetic.id;
  slots.missing = coinLabel(item.missing);
  if (ctx.perLevel) slots.levelUps = levelUpLabel(Math.ceil(item.missing / ctx.perLevel));
  return slots;
}

/** Bei diesen Anlässen grüßt er manchmal auch ganz allgemein. */
export const MIXED_GREETINGS: readonly LineTopic[] = [
  "greet.regular",
  "greet.rich",
  "greet.broke",
  "greet.night",
  "greet.morning",
];

/** Ob die Börse für alles Ungekaufte reicht (`rich`) oder leer ist (`broke`). */
function purseTopic(ctx: WizardContext): LineTopic | null {
  const unowned = ctx.items?.filter((item) => item.state !== "owned") ?? [];
  if (ctx.coins === null || unowned.length === 0) return null;
  if (unowned.every((item) => item.price <= (ctx.coins ?? 0))) return "greet.rich";
  return ctx.coins === 0 ? "greet.broke" : null;
}

/**
 * Der Anlass der Begrüßung, in dieser Reihenfolge: geschlossen, alles gekauft, zum ersten Mal da,
 * Nacht (22 bis 5 Uhr), Morgen (5 bis 9 Uhr), volle oder leere Börse, Stammkundschaft. Ohne Wissen
 * grüßt er allgemein.
 */
export function greetTopic(ctx: WizardContext): LineTopic {
  if (ctx.open === false) return "greet.closed";
  if (ctx.items?.length && ctx.items.every((item) => item.state === "owned")) {
    return "greet.collector";
  }
  if (ctx.regular === false) return "greet.first";
  const hour = ctx.hour ?? 12;
  if (hour >= 22 || hour < 5) return "greet.night";
  if (hour < 9) return "greet.morning";
  return purseTopic(ctx) ?? (ctx.regular ? "greet.regular" : "greet.hello");
}

/** Was er zu einer Wahl sagt und tut. */
export interface SelectPlan {
  topic: LineTopic;
  gesture: WizardGesture;
  /** Der zweite Satz. */
  beat?: LineTopic;
  /** Das Jelly grübelt beim zweiten Satz. */
  think?: true;
  /** Das Jelly wird verlegen beim Lob. */
  shy?: true;
}

/** Der Plan zu einer Wahl: schon da, angelegt, geschlossen, zu teuer, genau passend oder Angebot. */
export function selectPlan(ctx: WizardContext, item: ShopItem): SelectPlan {
  if (item.state === "owned") {
    return ctx.worn?.includes(item.cosmetic.id)
      ? { topic: "select.worn", gesture: "nod", shy: true }
      : { topic: "select.owned", gesture: "offer" };
  }
  if (ctx.open === false) return { topic: "select.closed", gesture: "offer" };
  if (item.state === "short") {
    const beat = ctx.perLevel === 0 ? "select.hintOrga" : "select.hint";
    return { topic: "select.short", gesture: "shrug", beat, think: true };
  }
  if (ctx.coins === item.price) return { topic: "select.exact", gesture: "offer" };
  if (ctx.modelKeys && !ctx.modelKeys.includes(item.cosmetic.id)) {
    return { topic: "select.offer", gesture: "offer", beat: "select.noModel" };
  }
  return {
    topic: "select.offer",
    gesture: "offer",
    beat: item.perLan ? "select.perLan" : undefined,
  };
}

/** Ein Vorschlag nach einem Kauf: Anlass und das Teil, um das es geht. */
export interface Suggestion {
  topic: LineTopic;
  item: ShopItem | null;
}

/**
 * Was er nach dem Kauf von `bought` vorschlägt: das billigste Teil, das noch reicht, sonst das
 * billigste zum Sparen. Hat das Jelly alles, staunt er. `null` ohne Wissen über den Laden.
 */
export function suggestionFor(ctx: WizardContext, bought: ShopItem): Suggestion | null {
  const { items, coins } = ctx;
  if (!items || coins === null) return null;
  const rest = items.filter(
    (item) => item.state !== "owned" && item.cosmetic.id !== bought.cosmetic.id,
  );
  if (rest.length === 0) return { topic: "buy.suggestAll", item: null };
  // Kommt der neue Stand erst nach dem Kauf an, zählt die Börse noch den Preis mit.
  const stale = items.some(
    (item) => item.cosmetic.id === bought.cosmetic.id && item.state !== "owned",
  );
  const purse = stale ? coins - bought.price : coins;
  const byPrice = rest.sort((first, second) => first.price - second.price);
  const next = byPrice.find((item) => item.price <= purse);
  if (next) return { topic: "buy.suggestNext", item: next };
  return { topic: "buy.suggestSave", item: byPrice[0] ?? null };
}

/** Was die Kugel weissagt: der Anlass und seine Platzhalter. */
export interface Prophecy {
  topic: LineTopic;
  slots: LineSlots;
}

/**
 * Was die Kugel zeigt, aus echten Daten und in dieser Reihenfolge: ein Teil, das nach einem
 * Aufstieg drin ist; das nahe nächste Level (höchstens 30 % fehlen); alles gekauft; der Laden ruht;
 * sonst ein Scherz.
 */
export function prophecy(ctx: WizardContext): Prophecy {
  const short = (ctx.items ?? []).filter((item) => item.state === "short");
  const cheapest = short.sort((first, second) => first.missing - second.missing)[0];
  if (cheapest && ctx.perLevel && cheapest.missing <= ctx.perLevel) {
    return { topic: "prophecy.reach", slots: slotsFor(ctx, cheapest) };
  }
  if (ctx.progress && ctx.progress.cost > 0) {
    const { level, remaining, cost } = ctx.progress;
    if (remaining <= 0.3 * cost) {
      return {
        topic: "prophecy.xp",
        slots: { remaining: String(remaining), next: String(level + 1) },
      };
    }
  }
  if (ctx.items?.length && ctx.items.every((item) => item.state === "owned")) {
    return { topic: "prophecy.all", slots: {} };
  }
  return { topic: ctx.open === false ? "prophecy.closed" : "prophecy.joke", slots: {} };
}

/** Was das Werkzeug der Skripte liest und fortschreibt. */
export interface KitMemory {
  seed: number;
  lines: LineHistory;
  ctx: WizardContext;
}

/**
 * Das Werkzeug für die Skripte: Sätze ohne Wiederholung und Zufall aus dem Startwert. Es schreibt
 * Startwert und Gedächtnis in `memory` fort.
 */
export function createScriptKit(memory: KitMemory): ScriptKit {
  const random = seededRandom(memory.seed);
  const next = () => {
    const value = random.next();
    memory.seed = random.state();
    return value;
  };
  return {
    get ctx() {
      return memory.ctx;
    },
    random: next,
    chance: (p) => next() < p,
    line(topic, slots = {}) {
      const picked = pickLine(topic, slots, memory.lines, next);
      memory.lines = picked.history;
      return picked.text;
    },
    lineAt(topic, index, slots = {}) {
      const picked = pickLineAt(topic, index, slots, memory.lines);
      memory.lines = picked.history;
      return picked.text;
    },
  };
}

/** Eine Wahl im Protokoll. `quick` folgte keine 1,2 s auf die vorige: Blättern. */
export interface Selection {
  item: ShopItem;
  at: number;
  quick: boolean;
}

/** Wie lange drei bedachte Teile zusammen als Vergleich zählen. */
const COMPARE_WINDOW_MS = 20_000;

/**
 * Welches Muster die letzte Wahl vollendet: dasselbe Teil zum dritten Mal (`repeat`) oder drei
 * verschiedene bedachte Teile in 20 s (`compare`). Schnelles Blättern zählt nicht als Vergleich.
 */
export function selectionPattern(log: readonly Selection[], now: number) {
  const id = (entry: Selection | undefined) => entry?.item.cosmetic.id;
  const last = id(log.at(-1));
  const repeat = last !== undefined && log.filter((entry) => id(entry) === last).length >= 3;
  const considered = log.filter((entry) => !entry.quick && now - entry.at <= COMPARE_WINDOW_MS);
  return { repeat, compare: new Set(considered.map(id)).size >= 3 };
}

/** Das erste Teil, für das es vorher nicht reichte und jetzt schon. */
export function newlyAffordable(before: readonly ShopItem[] | null, after?: readonly ShopItem[]) {
  const wasShort = (item: ShopItem) =>
    before?.some((old) => old.cosmetic.id === item.cosmetic.id && old.state === "short");
  return after?.find((item) => item.state === "affordable" && wasShort(item)) ?? null;
}

/**
 * Neues Wissen und worauf er reagiert: `lan`, wenn eine LAN beginnt (`true`) oder endet (`false`),
 * sonst `affordable`, wenn es jetzt für ein Teil reicht.
 */
export function contextChange(before: WizardContext, patch: Partial<WizardContext>) {
  const ctx = { ...before, ...patch };
  const lan =
    before.open !== null && ctx.open !== null && ctx.open !== before.open ? ctx.open : null;
  const after = patch.items ?? undefined;
  return { ctx, lan, affordable: lan === null ? newlyAffordable(before.items, after) : null };
}

/** Was das Jelly trägt, nachdem `item` an- oder abgelegt wurde: je Platz höchstens ein Teil. */
export function wornAfter(worn: readonly string[] | null, item: ShopItem, wearing: boolean) {
  const slotOf = (key: string) => COSMETICS.find((cosmetic) => cosmetic.id === key)?.slot;
  const others = (worn ?? []).filter((key) => slotOf(key) !== item.cosmetic.slot);
  return wearing ? [...others, item.cosmetic.id] : worn && others;
}

/** Die Platzhalter zum Teil `id`. Ohne Eintrag im Laden nur sein Schlüssel und Name. */
export function itemSlots(ctx: WizardContext, item: ShopItem | null, id: string): LineSlots {
  if (item) return slotsFor(ctx, item);
  const name = COSMETICS.find((cosmetic) => cosmetic.id === id)?.name;
  return { ...slotsFor(ctx), itemKey: id, ...(name ? { item: name } : {}) };
}

/** Worauf der Zeiger oder der Fokus zeigt. */
export type HoverTarget = "item" | "seal" | "purse" | "wizard";

/** Wo der Zeiger oder der Fokus verweilt, seit wann, und was davon schon kam. */
export interface Attention {
  target: HoverTarget;
  itemId: string | null;
  since: number;
  gazed: boolean;
  done: boolean;
}

/**
 * Nach 250 ms schaut er hin, nach `dwellMs` sagt er etwas. `gazeAt` ist, wohin er schaut. Im Schlaf
 * weckt ihn ein Verweilen von `wakeMs`. Über seinem Hut oder Bart (`wizard`) schaut er nur wachsam
 * auf und sagt nichts.
 */
export const ATTENTION = {
  gazeMs: 250,
  wakeMs: 1500,
  dwellMs: { item: 1600, seal: 1200, purse: 1200, wizard: Infinity },
  gazeAt: { item: "ledger", seal: "seal", purse: "purse", wizard: "viewer" },
} as const;

/** Wann das Verweilen wieder etwas auslöst. Im Schlaf weckt es ihn nach 1,5 s. */
export function attentionAt(attention: Attention | null, asleep: boolean) {
  if (!attention || attention.done) return Infinity;
  if (asleep) return attention.since + ATTENTION.wakeMs;
  return (
    attention.since + (attention.gazed ? ATTENTION.dwellMs[attention.target] : ATTENTION.gazeMs)
  );
}

/**
 * Was das Verweilen jetzt auslöst: aufwachen, hinschauen oder eine Bemerkung. Merkt sich, dass es
 * dran war.
 */
export function attentionDue(attention: Attention | null, now: number, asleep: boolean) {
  if (!attention || now < attentionAt(attention, asleep)) return null;
  if (!asleep && !attention.gazed) {
    attention.gazed = true;
    return "gaze";
  }
  attention.done = true;
  return asleep ? "wake" : "remark";
}

/** Der Zeiger geht. Hat er hingeschaut, blickt er nach 400 ms nach vorn, nach 1,2 s ist er ruhig. */
export function leaveAttention(attention: Attention | null, now: number) {
  if (!attention?.gazed) return [];
  const back: { at: number; look: WizardLook }[] = [
    { at: now + 400, look: { gaze: "viewer" } },
    { at: now + 1200, look: { mood: "neutral" } },
  ];
  return back;
}
