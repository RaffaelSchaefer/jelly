/**
 * Prüft das Gehirn des Zauberers mit gespielter Zeit: Vorrang, Blättern, Muster, Verweilen, Dösen,
 * Stupsen und dass der nächste Termin immer stimmt.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { Me } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems, type ShopItem } from "./shop";
import { createWizardMind, wizardStep, type WizardMind } from "./wizardBrain";
import { WIZARD_LINES } from "./wizardLines";
import { seededRandom } from "./wizardPick";
import {
  type WizardContext,
  type WizardEvent,
  type WizardLook,
  type WizardScript,
} from "./wizardScripts";

/** Die Waren eines Jellys mit drei Münzen. */
const ITEMS = shopItems(PREVIEW_CATALOG, { ...PREVIEW_ME, coins: 3 } satisfies Me);

/** Eine Ware aus {@link ITEMS}. */
function ware(id: string): ShopItem {
  const found = ITEMS.find((item) => item.cosmetic.id === id);
  if (!found) throw new Error(`Keine Ware ${id}`);
  return found;
}

/** Was der Laden weiß, ohne Leerlauf, wenn nicht anders gewünscht. */
function shopContext(patch: Partial<WizardContext> = {}): WizardEvent {
  const base = { name: "Pixel", coins: 3, perLevel: 1, open: true, items: ITEMS, worn: [] };
  return { kind: "context", patch: { ...base, regular: true, hour: 14, calm: true, ...patch } };
}

/** Ein Ereignis zu seiner Zeit. */
type Timed = [number, WizardEvent];

/** Ein gespieltes Skript. */
interface Played {
  at: number;
  script: WizardScript;
  interrupt: boolean;
}

/**
 * Spielt Ereignisse und fällige Termine bis `until` und merkt sich Skripte und Blicke.
 *
 * @param seed - Startwert des Zufalls.
 */
function simulate(events: Timed[], until = 0, seed = 1) {
  let mind: WizardMind = createWizardMind(seed, 0);
  const played: Played[] = [];
  const looks: { at: number; look: WizardLook }[] = [];
  let next = Infinity;
  const step = (event: WizardEvent, now: number) => {
    const result = wizardStep(mind, event, now);
    mind = result.mind;
    if (result.script) played.push({ at: now, script: result.script, interrupt: result.interrupt });
    if (result.look) looks.push({ at: now, look: result.look });
    expect(result.nextTickAt).toBeGreaterThan(now - 1);
    return result.nextTickAt;
  };
  const tickUntil = (time: number) => {
    for (let guard = 0; next <= time; guard += 1) {
      expect(guard).toBeLessThan(5000);
      next = step({ kind: "tick" }, next);
    }
  };
  for (const [at, event] of [...events].sort((a, b) => a[0] - b[0])) {
    tickUntil(at);
    next = step(event, at);
  }
  tickUntil(Math.max(until, events.at(-1)?.[0] ?? 0));
  return { played, looks, mind };
}

/** Die Sätze, die wirklich erklingen: bis das nächste Skript beginnt. */
function heard(played: Played[]) {
  return played.flatMap(({ at, script }, index) => {
    const end = played[index + 1]?.at ?? Infinity;
    return script.cues.flatMap((cue) =>
      cue.kind === "say" && at + cue.at < end ? [{ at: at + cue.at, text: cue.text, script }] : [],
    );
  });
}

/** Die Skripte zu `topic`. */
function topics(played: Played[], topic: string) {
  return played.filter((entry) => entry.script.topic === topic);
}

/** Bereit ab 0, mit bekanntem Laden. */
const OPENING: Timed[] = [
  [0, shopContext()],
  [0, { kind: "ready" }],
];

describe("greeting", () => {
  it("greets once, even when ready arrives twice", () => {
    const { played } = simulate([...OPENING, [500, { kind: "ready" }]], 5000);
    expect(topics(played, "greet")).toHaveLength(1);
  });

  it("turns the greeting into a short beat when a ware is chosen first", () => {
    const { played } = simulate([
      [0, shopContext()],
      [100, { kind: "select", item: ware("hood") }],
    ]);
    const [first] = heard(played);
    expect(WIZARD_LINES["greet.early"].map((line) => line.replace("{name}", "Pixel"))).toContain(
      first!.text,
    );
    expect(
      topics(
        simulate([
          ...OPENING.slice(0, 1),
          [100, { kind: "select", item: ware("hood") }],
          [200, { kind: "ready" }],
        ]).played,
        "greet",
      ),
    ).toHaveLength(0);
  });
});

describe("choosing", () => {
  it("comments once, on the last ware, when five are clicked 300 ms apart", () => {
    const ids = ["headset", "beanie", "pixel-glasses", "hood", "crown"];
    const clicks = ids.map((id, index): Timed => [
      10_000 + index * 300,
      { kind: "select", item: ware(id) },
    ]);
    const { played } = simulate([...OPENING, ...clicks], 20_000);
    const lines = heard(played).filter((line) => line.at >= 10_000);
    const comments = new Set(lines.map((line) => line.script));
    expect(comments.size).toBe(1);
    expect([...comments][0]!.topic).toBe("select");
    expect(lines[0]!.at).toBe(11_900);
    expect(lines[0]!.text).toMatch(/Krone|3 Münzen|Börse|Kleingeld/);
    expect(topics(played, "browse").length).toBeGreaterThan(0);
  });

  it("reads a line aloud only for a ware chosen after a pause, not while browsing", () => {
    const steps = ["pixel-glasses", "hood", "crown", "headset", "beanie"];
    const arrows = steps.map((id, index): Timed => [
      10_000 + index * 700,
      { kind: "select", item: ware(id) },
    ]);
    const { played } = simulate(
      [...OPENING, ...arrows, [20_000, { kind: "select", item: ware("hood") }]],
      30_000,
    );
    const lines = heard(played).filter((line) => line.at >= 10_000);
    const cueOf = (line: (typeof lines)[number]) =>
      line.script.cues.find((cue) => cue.kind === "say" && cue.text === line.text);
    const announced = lines.filter((line) => {
      const cue = cueOf(line);
      return cue?.kind === "say" && cue.announce;
    });
    // Vorgelesen wird nur die erste Wahl nach der Pause und die nach zehn Sekunden Ruhe.
    expect(announced.map((line) => line.at < 10_700 || line.at >= 20_000)).toEqual([true, true]);
    expect(lines.some((line) => line.at > 10_700 && line.at < 20_000)).toBe(true);
  });

  it("compares and repeats once each", () => {
    const pick = (at: number, id: string): Timed => [at, { kind: "select", item: ware(id) }];
    const events = [
      ...OPENING,
      pick(10_000, "hood"),
      pick(14_000, "crown"),
      pick(18_000, "pixel-glasses"),
      pick(22_000, "beanie"),
      pick(26_000, "hood"),
      pick(30_000, "hood"),
      pick(34_000, "hood"),
    ];
    const texts = heard(simulate(events, 40_000).played).map((line) => line.text);
    const compare = texts.filter((text) => WIZARD_LINES["select.compare"].includes(text as never));
    const repeat = texts.filter((text) => WIZARD_LINES["select.repeat"].includes(text as never));
    expect(compare).toHaveLength(1);
    expect(repeat).toHaveLength(1);
  });

  it("haggles at a blocked seal as a direct answer", () => {
    const { played } = simulate([...OPENING, [10_000, { kind: "blocked", itemId: "crown" }]]);
    expect(topics(played, "haggle")[0]?.script.priority).toBe(1);
  });
});

describe("priorities", () => {
  it("never lets an ambient quip interrupt a held line", () => {
    const events: Timed[] = [
      ...OPENING,
      [10_000, { kind: "select", item: ware("crown") }],
      [10_100, { kind: "hover", target: "item", itemId: "hood" }],
    ];
    const { played } = simulate(events, 13_000);
    expect(topics(played, "quip")).toHaveLength(0);
  });

  it("lets a choice interrupt an idle routine at once", () => {
    const idle = simulate([...OPENING, [0, shopContext({ calm: false })]], 15_000).played;
    const routine = idle.find((entry) => entry.script.topic.startsWith("idle."))!;
    expect(routine.script.priority).toBe(3);
    const at = routine.at + 300;
    const events: Timed[] = [
      ...OPENING,
      [0, shopContext({ calm: false })],
      [at, { kind: "select", item: ware("hood") }],
    ];
    const chosen = simulate(events).played.find((entry) => entry.at === at)!;
    expect(chosen).toMatchObject({ interrupt: true, script: { topic: "select" } });
  });

  it("holds the spell until the congratulations and keeps the incantation going", () => {
    const item = ware("pixel-glasses");
    const timeline = {
      coins: [],
      till: 700,
      burst: 800,
      impact: 1400,
      congrats: 1600,
      settled: 3100,
    };
    const events: Timed[] = [
      ...OPENING,
      [10_000, { kind: "commit", item }],
      [10_500, { kind: "bought", item, timeline }],
      [11_000, { kind: "select", item: ware("hood") }],
      [11_100, { kind: "poke" }],
    ];
    const { played } = simulate(events, 11_200);
    expect(played.find((entry) => entry.at === 10_500)).toMatchObject({ interrupt: false });
    expect(played.filter((entry) => entry.at >= 11_000)).toEqual([]);
  });

  it("drops a waiting script after 4 s", () => {
    const item = ware("pixel-glasses");
    const events: Timed[] = [
      ...OPENING,
      [10_000, { kind: "commit", item }],
      [10_200, { kind: "poke" }],
    ];
    const { played } = simulate(events, 30_000);
    expect(topics(played, "poke")).toHaveLength(0);
  });
});

describe("attention", () => {
  it("quips once after 1.7 s on the crown, not again on a second visit", () => {
    const events: Timed[] = [
      ...OPENING,
      [10_000, { kind: "hover", target: "item", itemId: "crown" }],
      [11_700, { kind: "unhover" }],
      [30_000, { kind: "hover", target: "item", itemId: "crown" }],
      [32_000, { kind: "unhover" }],
    ];
    const { played, looks } = simulate(events, 34_000);
    expect(topics(played, "quip")).toHaveLength(1);
    expect(topics(played, "quip")[0]!.at).toBe(11_600);
    expect(looks).toContainEqual({ at: 10_250, look: { gaze: "ledger", mood: "attentive" } });
  });

  it("only glances when rows pass by quickly", () => {
    const rows = ["headset", "beanie", "hood"].map((id, index): Timed => [
      10_000 + index * 200,
      { kind: "hover", target: "item", itemId: id },
    ]);
    const { played, looks } = simulate(
      [...OPENING, ...rows, [10_600, { kind: "unhover" }]],
      12_000,
    );
    expect(topics(played, "quip")).toHaveLength(0);
    expect(looks.filter((entry) => entry.look.gaze === "ledger")).toHaveLength(0);
  });
});

describe("dozing and poking", () => {
  it("gets drowsy at 40 s, asleep at 70 s, and a pointer only delays it before sleep", () => {
    const quiet = simulate(OPENING, 80_000).played;
    expect(topics(quiet, "drowsy")[0]?.at).toBe(40_000);
    expect(topics(quiet, "asleep")[0]?.at).toBe(70_000);
    const moved = simulate([...OPENING, [30_000, { kind: "input", strong: false }]], 120_000);
    expect(topics(moved.played, "drowsy")[0]?.at).toBe(70_000);
    expect(topics(moved.played, "asleep")[0]?.at).toBe(100_000);
    expect(moved.mind.rest.activity).toBe("asleep");
  });

  it("wakes with a start, an „Oh!“ and then the comment, when a ware is chosen in his sleep", () => {
    const { played } = simulate([...OPENING, [80_000, { kind: "select", item: ware("hood") }]]);
    const woke = played.at(-1)!;
    expect(woke.script.topic).toBe("wake");
    const kinds = woke.script.cues.map((cue) => (cue.kind === "gesture" ? cue.gesture : cue.kind));
    expect(kinds.indexOf("startle")).toBeLessThan(kinds.indexOf("say"));
    const lines = woke.script.cues.filter((cue) => cue.kind === "say");
    expect(lines[0]).toMatchObject({ text: "Oh! …" });
    expect(lines.length).toBeGreaterThan(1);
  });

  it("is asleep after the window was hidden for 70 s", () => {
    const events: Timed[] = [
      ...OPENING,
      [10_000, { kind: "hidden" }],
      [85_000, { kind: "visible" }],
    ];
    expect(simulate(events).played.at(-1)?.script.topic).toBe("asleep");
  });

  it("takes a poke at a sleeping wizard as the click that wakes him", () => {
    const events: Timed[] = [
      ...OPENING,
      [80_000, { kind: "input", strong: true }],
      [80_100, { kind: "poke" }],
      [90_000, { kind: "poke" }],
    ];
    const { played } = simulate(events, 92_000);
    expect(played.filter((entry) => entry.at >= 80_000).map((entry) => entry.script.topic)).toEqual(
      ["wake", "poke"],
    );
  });

  it("climbs the poke ladder and glares during the cooldown", () => {
    const pokes = [10, 11, 12, 13, 14, 16].map((s): Timed => [s * 1000, { kind: "poke" }]);
    const texts = heard(simulate([...OPENING, ...pokes], 20_000).played)
      .filter((line) => line.script.topic === "poke")
      .map((line) => line.text);
    expect(texts).toEqual([...WIZARD_LINES.poke]);
  });
});

describe("determinism and deadlines", () => {
  /** Eine zufällige, aber feste Folge von Ereignissen über fünf Minuten. */
  function randomEvents(seed: number): Timed[] {
    const random = seededRandom(seed);
    const kinds: (() => WizardEvent)[] = [
      () => ({ kind: "select", item: ITEMS[Math.floor(random.next() * ITEMS.length)]! }),
      () => ({ kind: "hover", target: "item", itemId: "crown" }),
      () => ({ kind: "unhover" }),
      () => ({ kind: "poke" }),
      () => ({ kind: "input", strong: random.next() < 0.5 }),
      () => ({ kind: "hidden" }),
      () => ({ kind: "visible" }),
      () => ({
        kind: "server",
        event: { id: 1, type: "level.up", player_id: 1, payload: { level: 5 }, created_at: 0 },
      }),
    ];
    return Array.from({ length: 80 }, (_, index): Timed => [
      index * 4000 + Math.floor(random.next() * 3000),
      kinds[Math.floor(random.next() * kinds.length)]!(),
    ]);
  }

  it("gives the same scripts for the same seed", () => {
    const events = [...OPENING, [0, shopContext({ calm: false })] as Timed, ...randomEvents(9)];
    const texts = (seed: number) =>
      heard(simulate(events, 330_000, seed).played).map((l) => l.text);
    expect(texts(5)).toEqual(texts(5));
    expect([6, 7, 8].some((seed) => texts(seed).join() !== texts(5).join())).toBe(true);
  });

  it("never has anything due before nextTickAt", () => {
    let mind = createWizardMind(3, 0);
    const events = [...OPENING, [0, shopContext({ calm: false })] as Timed, ...randomEvents(4)];
    for (const [at, event] of events) {
      const result = wizardStep(mind, event, at);
      mind = result.mind;
      const early = Math.min(result.nextTickAt - 1, at + 3999);
      if (early <= at) continue;
      const probe = wizardStep(mind, { kind: "tick" }, early);
      expect(probe.script).toBeUndefined();
      expect(probe.look).toBeUndefined();
      expect(probe.nextTickAt).toBe(result.nextTickAt);
    }
  });
});
