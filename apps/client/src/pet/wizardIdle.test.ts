/**
 * Prüft das Leben zwischen den Klicks: Beschäftigungen über zehn Minuten, die Weissagung der Kugel,
 * das Dösen mit Schnarchen im Takt und die Rückkehr nach verdecktem Fenster.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { Me } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems } from "./shop";
import {
  asleepScript,
  DOZE,
  dozeDue,
  freshRest,
  hide,
  IDLE_ROUTINES,
  IDLE_TIMING,
  idleDue,
  peekScript,
  prophecy,
  reveal,
  sensePresence,
  stirInSleep,
  type IdleRoutine,
} from "./wizardIdle";
import { createScriptKit, EMPTY_HISTORY } from "./wizardPick";
import { flattenCues, UNKNOWN_CONTEXT, type ScriptKit, type WizardContext } from "./wizardScripts";

/** Ein Laden für ein Jelly mit `coins` Münzen und `xp` XP. */
function shop(coins = 3, xp = 235, patch: Partial<WizardContext> = {}): WizardContext {
  const me: Me = { ...PREVIEW_ME, coins, xp };
  return {
    ...UNKNOWN_CONTEXT,
    name: "Pixel",
    coins,
    xp,
    xpPerLevel: 100,
    perLevel: 1,
    open: true,
    items: shopItems(PREVIEW_CATALOG, me),
    worn: [],
    ...patch,
  };
}

/** Das Werkzeug zu `ctx`. */
function kitFor(ctx: WizardContext, seed = 1): ScriptKit {
  return createScriptKit({ seed, lines: EMPTY_HISTORY, ctx });
}

/** Zehn Minuten Leerlauf ohne Störung: wann welche Beschäftigung begann. */
function idleFor(ctx: WizardContext, seed: number, minutes = 10) {
  const kit = kitFor(ctx, seed);
  const rest = freshRest(0);
  const runs: { routine: IdleRoutine; at: number; spoke: boolean }[] = [];
  while (rest.idleAt < minutes * 60_000) {
    const now = rest.idleAt;
    const script = idleDue(rest, now, kit, null);
    if (!script) continue;
    const routine = script.topic.replace("idle.", "") as IdleRoutine;
    runs.push({ routine, at: now, spoke: script.cues.some((cue) => cue.kind === "say") });
  }
  return runs;
}

describe("idle routines", () => {
  it("never repeat, keep their cooldowns and come every 7 to 13 s", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const runs = idleFor(shop(), seed);
      expect(runs[0]!.at).toBe(IDLE_TIMING.firstMs);
      expect(runs.length).toBeGreaterThan(40);
      for (const [index, run] of runs.entries()) {
        const before = runs[index - 1];
        if (!before) continue;
        expect(run.routine, `seed ${seed} #${index}`).not.toBe(before.routine);
        const gap = run.at - before.at;
        expect(gap).toBeGreaterThanOrEqual(IDLE_TIMING.minGapMs);
        expect(gap, `seed ${seed} #${index}`).toBeLessThanOrEqual(IDLE_TIMING.maxGapMs);
        const last = runs
          .slice(0, index)
          .reverse()
          .find((entry) => entry.routine === run.routine);
        if (last) {
          expect(run.at - last.at).toBeGreaterThanOrEqual(IDLE_ROUTINES[run.routine].cooldownMs);
        }
      }
    }
  });

  it("say at most one line per 30 s and use every routine", () => {
    const runs = idleFor(shop(), 7);
    const lines = runs.filter((run) => run.spoke).map((run) => run.at);
    for (const [index, at] of lines.entries()) {
      if (index > 0) expect(at - lines[index - 1]!).toBeGreaterThanOrEqual(IDLE_TIMING.lineGapMs);
    }
    expect(new Set(runs.map((run) => run.routine))).toEqual(new Set(Object.keys(IDLE_ROUTINES)));
  });

  it("only consult the orb while the shop is closed, and rest under reduced motion", () => {
    const closed = idleFor(shop(0, 235, { open: false }), 3);
    expect(new Set(closed.map((run) => run.routine))).toEqual(new Set(["consult"]));
    expect(idleFor(shop(3, 235, { calm: true }), 3)).toEqual([]);
  });

  it("wait while something else runs or he dozes", () => {
    const kit = kitFor(shop());
    const rest = freshRest(0);
    expect(idleDue(rest, 6000, kit, 9000)).toBeNull();
    expect(rest.idleAt).toBe(13_000);
    rest.activity = "drowsy";
    expect(idleDue(rest, 13_000, kit, null)).toBeNull();
  });
});

describe("prophecy", () => {
  it("sees a ware one level-up away", () => {
    const ctx = shop(3);
    const short = ctx.items!.find((item) => item.cosmetic.id === "hood")!;
    expect(short).toMatchObject({ price: 4, missing: 1 });
    expect(prophecy(ctx)).toMatchObject({ topic: "prophecy.reach", slots: { item: "Kapuze" } });
  });

  it("sees the next level when little XP is missing", () => {
    expect(prophecy(shop(0, 85, { perLevel: 0 }))).toEqual({
      topic: "prophecy.xp",
      slots: { remaining: "15", next: "2" },
    });
    expect(prophecy(shop(0, 50, { perLevel: 0 })).topic).toBe("prophecy.joke");
  });

  it("is puzzled when everything is owned, sees a LAN when the shop is closed", () => {
    const all = PREVIEW_CATALOG.cosmetics.map((entry) => entry.key);
    const items = shopItems(PREVIEW_CATALOG, { ...PREVIEW_ME, cosmetics: all });
    expect(prophecy(shop(0, 50, { items })).topic).toBe("prophecy.all");
    expect(prophecy(shop(0, 50, { open: false, perLevel: 0 })).topic).toBe("prophecy.closed");
  });
});

describe("dozing", () => {
  it("gets drowsy at 40 s and falls asleep 30 s later, unless someone is there", () => {
    const kit = kitFor(shop());
    const rest = freshRest(0);
    expect(dozeDue(rest, 39_999, kit, false)).toBeNull();
    sensePresence(rest, 20_000);
    expect(dozeDue(rest, 40_000, kit, false)).toBeNull();
    expect(dozeDue(rest, 60_000, kit, false)?.topic).toBe("drowsy");
    expect(dozeDue(rest, 89_999, kit, false)).toBeNull();
    expect(dozeDue(rest, 90_000, kit, false)?.topic).toBe("asleep");
    expect(sensePresence(rest, 95_000)).toBe(false);
    expect(rest.activity).toBe("asleep");
  });

  it("opens his lids again when someone stirs while he is drowsy", () => {
    const kit = kitFor(shop());
    const rest = freshRest(0);
    dozeDue(rest, 40_000, kit, false);
    expect(sensePresence(rest, 50_000)).toBe(true);
    expect(rest).toMatchObject({ activity: "attending", drowsyAt: 90_000 });
  });
});

describe("sleeping", () => {
  it("snores every 4.2 s for three minutes and keeps the bubble", () => {
    const script = asleepScript(kitFor(shop()));
    const snores = flattenCues(script.cues).filter((cue) => cue.kind === "clip");
    expect(snores[0]!.at).toBe(0);
    expect(snores[1]!.at - snores[0]!.at).toBe(DOZE.snoreMs);
    expect(snores.at(-1)!.at).toBeLessThan(DOZE.snoreForMs);
    expect(snores.length).toBe(Math.ceil(DOZE.snoreForMs / DOZE.snoreMs));
    expect(script.cues).toContainEqual(expect.objectContaining({ kind: "say", untilMs: null }));
  });

  it("keeps the breath in step after a peek and stops snoring after three minutes", () => {
    const peek = peekScript(kitFor(shop()), false, 10_000);
    const [first] = flattenCues(peek.cues).filter((cue) => cue.kind === "clip");
    expect((first!.at + 10_000) % DOZE.snoreMs).toBe(0);
    const late = peekScript(kitFor(shop()), false, 200_000);
    expect(late.cues.some((cue) => cue.kind === "clip")).toBe(false);
  });

  it("peeks at most every 10 s, with a mumble the first time", () => {
    const kit = kitFor(shop(), 4);
    const rest = freshRest(0);
    rest.activity = "asleep";
    let peeks = 0;
    for (let now = 1000; now < 600_000; now += 500) {
      const script = stirInSleep(rest, now, kit);
      if (!script) continue;
      peeks += 1;
      const mumbles = script.cues.filter((cue) => cue.kind === "say" && cue.style === "thought");
      expect(mumbles.length).toBe(peeks === 1 ? 1 : 0);
    }
    expect(peeks).toBeGreaterThan(5);
    expect(peeks).toBeLessThan(40);
  });

  it("is asleep after 70 s hidden and greets the return after 30 s", () => {
    const kit = kitFor(shop());
    const long = freshRest(0);
    hide(long, 1000);
    expect(reveal(long, 71_000, kit)?.topic).toBe("asleep");
    const medium = freshRest(0);
    hide(medium, 1000);
    expect(reveal(medium, 31_000, kit)?.topic).toBe("return");
    const short = freshRest(0);
    hide(short, 1000);
    expect(reveal(short, 20_000, kit)).toBeNull();
  });
});
