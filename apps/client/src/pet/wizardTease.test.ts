/**
 * Prüft das Nerven des Zauberers mit gespielter Zeit: drei Abwehren, Hut weg, genug genervt, Hut
 * zurück, neue Zählung und der Vorrang des Kaufs.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { PREVIEW_CATALOG, PREVIEW_ME } from "./preview";
import { shopItems } from "./shop";
import { TEASE } from "./shopTimeline";
import { createWizardMind, wizardStep } from "./wizardBrain";
import { WIZARD_LINES } from "./wizardLines";
import { type WizardEvent, type WizardLook, type WizardScript } from "./wizardScripts";
import { freshTease, TEASE_RULES } from "./wizardTease";

/** Ein Ereignis zu seiner Zeit. */
type Timed = [number, WizardEvent];

/** Ein Griff nach dem Hut und ein Zug am Bart. */
const HAT: WizardEvent = { kind: "tease", target: "hat" };
const BEARD: WizardEvent = { kind: "tease", target: "beard" };

/** Griffe im Abstand von 3 s ab `from`: Dazwischen spricht er aus. */
function every3s(from: number, ...events: WizardEvent[]): Timed[] {
  return events.map((event, index) => [from + index * 3000, event]);
}

/** Hut geklaut: drei Abwehren und der vierte Griff, ab `from`. */
function snatch(from = 0): Timed[] {
  return every3s(from, ...Array.from({ length: TEASE_RULES.guards + 1 }, () => HAT));
}

/** Spielt Ereignisse und fällige Termine bis `until`. Ohne Leerlauf, damit nur das Nerven spielt. */
function play(events: Timed[], until = 0) {
  let mind = createWizardMind(1, 0);
  const played: { at: number; script: WizardScript }[] = [];
  const looks: { at: number; look: WizardLook }[] = [];
  let next = Infinity;
  const step = (event: WizardEvent, now: number) => {
    const result = wizardStep(mind, event, now);
    mind = result.mind;
    if (result.script?.topic === "tease") played.push({ at: now, script: result.script });
    if (result.look?.hatOff !== undefined) looks.push({ at: now, look: result.look });
    next = result.nextTickAt;
  };
  const tickUntil = (time: number) => {
    for (let guard = 0; next <= time; guard += 1) {
      expect(guard).toBeLessThan(5000);
      step({ kind: "tick" }, next);
    }
  };
  step({ kind: "context", patch: { calm: true } }, 0);
  for (const [at, event] of events) {
    tickUntil(at);
    step(event, at);
  }
  tickUntil(Math.max(until, events.at(-1)?.[0] ?? 0));
  return { played, looks, mind };
}

/** Die Gesten eines Skripts. */
function gestures({ cues }: WizardScript) {
  return cues.flatMap((cue) => (cue.kind === "gesture" && cue.gesture ? [cue.gesture] : []));
}

/** Die Sätze eines Skripts. */
function lines({ cues }: WizardScript) {
  return cues.flatMap((cue) => (cue.kind === "say" ? [cue.text] : []));
}

describe("Hut", () => {
  it("wehrt drei Griffe mit wechselnden Sätzen ab und verliert ihn beim vierten", () => {
    const { played, looks, mind } = play(snatch());
    expect(played.flatMap(({ script }) => gestures(script))).toEqual([
      "guard",
      "guard",
      "guard",
      "unhat",
    ]);
    const scolded = played.slice(0, 3).flatMap(({ script }) => lines(script));
    expect(scolded).toEqual([...WIZARD_LINES["tease.guard"]]);
    expect(looks).toEqual([{ at: 9000, look: { hatOff: true } }]);
    expect(mind.tease).toMatchObject({ hatOff: true, fedUp: false, backAt: 9000 + TEASE.hatBack });
  });

  it("zaubert ihn nach einer Weile zurück und zählt von vorn", () => {
    const back = 9000 + TEASE.hatBack;
    const { played, looks, mind } = play([...snatch(), [back + 5000, HAT]]);
    const [conjured, again] = played.slice(-2);
    expect(conjured?.at).toBe(back);
    expect(gestures(conjured!.script)).toEqual(["rehat"]);
    expect(conjured!.script.cues).toContainEqual({ at: 0, kind: "effect", effect: "hatConjure" });
    expect(looks.at(-1)).toEqual({ at: back, look: { hatOff: false } });
    expect(gestures(again!.script)).toEqual(["guard"]);
    expect(mind.tease).toEqual({ ...freshTease(), grabs: 1 });
  });
});

describe("Bart", () => {
  it("lässt sich jederzeit ziehen, zählt aber erst ohne Hut", () => {
    const { played, mind } = play(every3s(0, BEARD, BEARD, BEARD, BEARD));
    expect(played.map(({ script }) => gestures(script))).toEqual(Array(4).fill(["yank"]));
    expect(mind.tease).toEqual(freshTease());
  });

  it("ist nach Hut und drei Zügen genug genervt, genau einmal, und holt den Hut bald zurück", () => {
    const { played, mind } = play([...snatch(), ...every3s(12_000, BEARD, BEARD, BEARD, BEARD)]);
    const [, , third, fourth] = played.slice(-4);
    expect(third!.script.cues).toContainEqual(expect.objectContaining({ mood: "hurt" }));
    expect(WIZARD_LINES["tease.fedUp"]).toContain(lines(third!.script)[0]);
    expect(WIZARD_LINES["tease.beard"]).toContain(lines(fourth!.script)[0]);
    expect(mind.tease).toMatchObject({ hatOff: true, fedUp: true, pulls: 4 });
    expect(mind.tease.backAt).toBeLessThan(9000 + TEASE.hatBack);
  });
});

describe("Vorrang", () => {
  const item = shopItems(PREVIEW_CATALOG, PREVIEW_ME)[0]!;

  it("stört den Kaufzauber nicht: Der Griff zählt nicht und wartet nicht", () => {
    const grabs = every3s(1000, HAT, HAT, HAT, HAT, BEARD);
    const { played, mind } = play([[0, { kind: "commit", item }], ...grabs]);
    expect(played).toEqual([]);
    expect(mind.tease).toEqual(freshTease());
    expect(mind.queued).toBeNull();
    expect(mind.running?.topic).toBe("commit");
  });

  it("zaubert den Hut erst zurück, wenn der Kaufzauber sein Wort gehalten hat", () => {
    const back = 9000 + TEASE.hatBack;
    const events: Timed[] = [...snatch(), [back - 1000, { kind: "commit", item }]];
    const during = play(events, back + 10_000);
    expect(during.mind.tease.hatOff).toBe(true);
    expect(during.mind.running?.topic).toBe("commit");
    const after = play([...events, [back + 10_000, { kind: "buyFailed", item }]], back + 20_000);
    expect(gestures(after.played.at(-1)!.script)).toEqual(["rehat"]);
    expect(after.mind.tease).toEqual(freshTease());
  });
});
