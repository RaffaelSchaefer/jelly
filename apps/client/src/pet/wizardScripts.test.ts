/**
 * Prüft die Sprache der Auftritte: Zeitrechnung der Sätze, Gesten auf dem Wort und die Skripte zu
 * Begrüßung, Wahl, Siegel und Kauf als Zauber.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { Me } from "./types";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems, type ShopItem } from "./shop";
import { purchaseTimeline } from "./shopTimeline";
import { speechSyllables } from "./voice";
import {
  boughtScript,
  commitScript,
  failedScript,
  greetScript,
  holdScript,
  releaseScript,
  selectScript,
} from "./wizard";
import { createScriptKit, EMPTY_HISTORY } from "./wizardPick";
import {
  beats,
  BEAT_GAP_MS,
  cueAtSlot,
  flattenCues,
  holdFor,
  lingerMs,
  say,
  sayEnd,
  scriptLength,
  speechMs,
  UNKNOWN_CONTEXT,
  WIZARD_GESTURES,
  WIZARD_TEMPO,
  type CustomerStep,
  type ScriptDraft,
  type WizardContext,
  type WizardCue,
} from "./wizardScripts";

/** Die Waren für ein Jelly mit `coins` Münzen. */
function ware(id: string, coins = 3): ShopItem {
  const me: Me = { ...PREVIEW_ME, coins };
  const found = shopItems(PREVIEW_CATALOG, me).find((item) => item.cosmetic.id === id);
  if (!found) throw new Error(`Keine Ware ${id}`);
  return found;
}

/** Das Werkzeug mit einem Laden zu drei Münzen. */
function kitFor(patch: Partial<WizardContext> = {}, seed = 11) {
  const ctx: WizardContext = {
    ...UNKNOWN_CONTEXT,
    name: "Pixel",
    coins: 3,
    perLevel: 1,
    open: true,
    items: shopItems(PREVIEW_CATALOG, PREVIEW_ME),
    worn: [],
    regular: true,
    hour: 14,
    ...patch,
  };
  return createScriptKit({ seed, lines: EMPTY_HISTORY, ctx });
}

/** Die Einsätze einer Art. */
function cuesOf<K extends WizardCue["kind"]>(script: ScriptDraft, kind: K) {
  return script.cues.filter((cue): cue is Extract<WizardCue, { kind: K }> => cue.kind === kind);
}

/** Prüft, dass sich die Gesten der Kundschaft nicht überlappen und keine länger als 2 s ist. */
function expectCalmCustomer(script: ScriptDraft) {
  const steps: CustomerStep[] = cuesOf(script, "customer");
  for (const [index, step] of steps.entries()) {
    expect(step.seconds).toBeLessThanOrEqual(2);
    const next = steps[index + 1];
    if (next) expect(next.at).toBeGreaterThanOrEqual(step.at + step.seconds * 1000);
  }
}

describe("timing of speech", () => {
  it("speaks at tempo 0.9 and keeps the bubble 2.6 to 5.2 s after the voice", () => {
    expect(WIZARD_TEMPO).toBe(0.9);
    expect(speechMs("Hallo", 0.9)).toBeCloseTo(speechMs("Hallo", 1) / 0.9);
    expect(lingerMs("Kurz.")).toBe(2600);
    expect(lingerMs("x".repeat(60))).toBe(4200);
    expect(lingerMs("x".repeat(200))).toBe(5200);
    const line = say(100, "Ein feines Stück.");
    expect(line.untilMs).toBeCloseTo(speechMs(line.text) + lingerMs(line.text));
    expect(say(0, "Zzz …", "snore").untilMs).toBeNull();
    expect(holdFor("x".repeat(20))).toBe(2100);
  });

  it("lands a cue on the syllable of a word", () => {
    const text = "Ah, die Pixel-Brille! Acht Bit voller Stil.";
    const syllables = speechSyllables(text);
    const index = syllables.findIndex((syllable) => syllable.text.startsWith("Pi"));
    const expected = (syllables[index]!.at / WIZARD_TEMPO) * 1000;
    const at = cueAtSlot(text, text.indexOf("Pixel"));
    expect(Math.abs(at - expected)).toBeLessThanOrEqual(130);
    expect(at).toBeGreaterThan(cueAtSlot(text, text.indexOf("die")));
    expect(at).toBeLessThan(cueAtSlot(text, text.indexOf("Brille")));
  });
});

describe("lines and gestures", () => {
  it("never lets two lines of one script overlap", () => {
    const lines = beats(300, ["Ein neues Gesicht!", "Ich bin Funkelbart.", "Probier nur!"]);
    expect(lines[0]!.at).toBe(300);
    for (const [index, line] of lines.entries()) {
      const before = lines[index - 1];
      if (before) expect(line.at).toBeCloseTo(sayEnd(before) + BEAT_GAP_MS);
    }
  });

  it("knows the wizard's gestures, pointing included", () => {
    expect([...WIZARD_GESTURES].sort()).toEqual(
      [
        "hail",
        "rejoice",
        "shrug",
        "offer",
        "tip",
        "cast",
        "count",
        "stroke",
        "nod",
        "yawn",
        "startle",
        "snore",
        "peek",
        "chuckle",
        "huff",
        "guard",
        "unhat",
        "rehat",
        "yank",
        "point",
      ].sort(),
    );
  });

  it("repeats a looping clip until it ends", () => {
    const loop: WizardCue = {
      at: 100,
      kind: "clip",
      clip: "snore",
      everyMs: 4200,
      untilMs: 12_600,
    };
    expect(flattenCues([loop]).map((cue) => cue.at)).toEqual([100, 4300, 8500]);
  });
});

describe("greeting and choice", () => {
  it("greets with the hat or a raised hand, and the jelly waves back", () => {
    const first = greetScript(kitFor({ regular: false }));
    expect(cuesOf(first, "gesture")[0]?.gesture).toBe("hail");
    expect(cuesOf(first, "say")).toHaveLength(2);
    expect(cuesOf(first, "say")[1]!.text).toContain("Funkelbart");
    const regular = greetScript(kitFor());
    expect(cuesOf(regular, "gesture")[0]?.gesture).toBe("tip");
    expect(cuesOf(regular, "customer")[0]).toMatchObject({ emote: "wave", at: 200 });
    expect(regular.priority).toBe(1);
  });

  it("points at the ware as its name is sung", () => {
    let named = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      const script = selectScript(kitFor({ coins: 5 }, seed), ware("pixel-glasses", 5));
      const [line] = cuesOf(script, "say");
      const hand = cuesOf(script, "gesture")[0]!;
      expect(hand.gesture).toBe("offer");
      const index = line!.text.indexOf("Pixel-Brille");
      if (index < 0 || line!.at + cueAtSlot(line!.text, index) < 300) continue;
      named += 1;
      expect(line!.at + cueAtSlot(line!.text, index) - hand.at).toBeCloseTo(300);
    }
    expect(named).toBeGreaterThan(0);
  });

  it("names what is missing and lets the jelly think about it", () => {
    const script = selectScript(kitFor(), ware("crown"));
    const lines = cuesOf(script, "say");
    expect(lines).toHaveLength(2);
    expect(cuesOf(script, "gesture")[0]?.gesture).toBe("shrug");
    expect(cuesOf(script, "customer")[0]).toMatchObject({ emote: "think", at: lines[1]!.at });
    expectCalmCustomer(script);
  });
});

describe("the seal and the spell", () => {
  it("gathers silently while the seal is held and relaxes when it is let go", () => {
    const hold = holdScript();
    expect(cuesOf(hold, "say")).toHaveLength(0);
    expect(cuesOf(hold, "gesture")[0]?.gesture).toBe("cast");
    expect(hold.cues).toContainEqual({ at: 0, kind: "gaze", target: "orb" });
    expect(hold.cues).toContainEqual({ at: 0, kind: "mood", mood: "focused" });
    expect(releaseScript().cues).toContainEqual({ at: 0, kind: "mood", mood: "neutral" });
  });

  it("speaks the incantation at once, as the most important thing", () => {
    const commit = commitScript(kitFor());
    expect(commit.priority).toBe(0);
    expect(cuesOf(commit, "say")[0]).toMatchObject({ at: 0, style: "incantation" });
  });

  it("releases the spell at the burst and lets the jelly hop on impact", () => {
    const timeline = purchaseTimeline(3);
    const script = boughtScript(kitFor(), ware("pixel-glasses"), timeline, false);
    const cast = cuesOf(script, "gesture").find((cue) => cue.gesture === "cast")!;
    expect(cast.releaseMs).toBe(timeline.burst);
    const burst = cuesOf(script, "effect").find((cue) => cue.effect === "spellBurst")!;
    expect(burst).toMatchObject({ at: timeline.burst, itemId: "pixel-glasses" });
    const hop = cuesOf(script, "customer").find((cue) => cue.hop)!;
    expect(hop).toMatchObject({ at: timeline.impact, emote: "cheer", seconds: 2 });
    const [thanks, tip] = cuesOf(script, "say");
    expect(thanks!.at).toBe(timeline.congrats);
    expect(cuesOf(script, "gesture")).toContainEqual(
      expect.objectContaining({ at: timeline.congrats, gesture: "rejoice" }),
    );
    expect(tip!.at).toBeCloseTo(sayEnd(thanks!) + 1500);
    expect(script).toMatchObject({ priority: 0, lockMs: timeline.congrats });
    expect(script.holdMs).toBe(timeline.congrats + holdFor(thanks!.text));
    expectCalmCustomer(script);
  });

  it("signals nothing of success before the burst and adds the incantation when it is missing", () => {
    const timeline = purchaseTimeline(3);
    const script = boughtScript(kitFor(), ware("pixel-glasses"), timeline, true);
    const early = script.cues.filter((cue) => cue.at < timeline.burst);
    expect(early.some((cue) => cue.kind === "customer" || cue.kind === "effect")).toBe(false);
    expect(early.filter((cue) => cue.kind === "say")).toEqual([
      expect.objectContaining({ at: 0, style: "incantation" }),
    ]);
  });

  it("fizzles without coins, impact or hop", () => {
    const script = failedScript(kitFor(), ware("pixel-glasses"));
    expect(script.priority).toBe(0);
    expect(cuesOf(script, "effect")[0]).toMatchObject({ at: 0, effect: "fizzle" });
    expect(cuesOf(script, "gesture")[0]?.gesture).toBe("shrug");
    expect(script.cues).toContainEqual({ at: 0, kind: "mood", mood: "sheepish" });
    expect(cuesOf(script, "say")).toHaveLength(1);
    expect(cuesOf(script, "customer")).toHaveLength(0);
    expect(cuesOf(script, "sfx")).toHaveLength(0);
    expect(scriptLength(script)).toBeGreaterThan(0);
  });
});
