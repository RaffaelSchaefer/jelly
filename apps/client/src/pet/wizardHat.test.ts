/**
 * Prüft Funkelbarts Hut beim Server: den Stand auf der Uhr des Fensters, Zeit in Worten und auf dem
 * Schild, und wie sein Gehirn Diebstahl, schnellere Diebe, fremde Träger und die Rückkehr spielt.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { PREVIEW_ME } from "./preview";
import { TEASE } from "./shopTimeline";
import { createWizardMind, wizardStep, type WizardMind, type WizardStep } from "./wizardBrain";
import { hatClock, hatSignText, hatTimeWords, serverHat, type ServerHat } from "./wizardHat";
import { fillLine, WIZARD_LINES } from "./wizardLines";
import { type WizardEvent, type WizardScript } from "./wizardScripts";
import { TEASE_RULES } from "./wizardTease";

/** Fünf Minuten, wie `wizard_hat_seconds` ab Werk. */
const HELD_MS = 300_000;

/** Ein Griff nach dem Hut, ein Zug am Bart. */
const HAT: WizardEvent = { kind: "tease", target: "hat" };
const BEARD: WizardEvent = { kind: "tease", target: "beard" };

/** Der Hut beim eigenen Jelly und bei Mo. */
const MINE: ServerHat = { mine: true, name: "Pixel", remainingMs: HELD_MS };
const MO: ServerHat = { mine: false, name: "Mo", remainingMs: HELD_MS };

/** Ein Gehirn, das Schritt für Schritt spielt und fällige Termine selbst nachholt. */
function brain() {
  let mind: WizardMind = createWizardMind(1, 0);
  let next = Infinity;
  const steps: { at: number; step: WizardStep }[] = [];
  const step = (event: WizardEvent, now: number) => {
    const result = wizardStep(mind, event, now);
    mind = result.mind;
    next = result.nextTickAt;
    steps.push({ at: now, step: result });
    return result;
  };
  /** Holt alle Termine bis `time` nach und spielt dann `event`. */
  const at = (time: number, event?: WizardEvent) => {
    for (let guard = 0; next <= time; guard += 1) {
      expect(guard).toBeLessThan(5000);
      step({ kind: "tick" }, next);
    }
    return event ? step(event, time) : undefined;
  };
  step({ kind: "context", patch: { calm: true } }, 0);
  return { at, steps, mind: () => mind };
}

/** Grüßt ihn, dann klaut ihm jemand ab 1 s den Hut: drei Abwehren und der vierte Griff. */
function snatched() {
  const play = brain();
  play.at(0, { kind: "ready" });
  let last: WizardStep | undefined;
  for (let grab = 0; grab <= TEASE_RULES.guards; grab += 1) last = play.at(4000 + grab * 3000, HAT);
  return { ...play, snatch: last!, snatchAt: 4000 + TEASE_RULES.guards * 3000 };
}

/** Die Gesten eines Skripts. */
function gestures({ cues }: WizardScript) {
  return cues.flatMap((cue) => (cue.kind === "gesture" && cue.gesture ? [cue.gesture] : []));
}

/** Die Sätze eines Skripts. */
function lines({ cues }: WizardScript) {
  return cues.flatMap((cue) => (cue.kind === "say" ? [cue.text] : []));
}

/** Was er sagen darf, wenn Mo den Hut noch `remaining` trägt. */
function takenLines(remaining: string) {
  return WIZARD_LINES["tease.taken"].map((line) => fillLine(line, { holder: "Mo", remaining }));
}

/** Wann er sich den Hut zurückzauberte, nach `from`. */
function rehatAt(steps: { at: number; step: WizardStep }[], from = 0) {
  return steps
    .filter(({ at, step }) => at >= from && step.script && gestures(step.script).includes("rehat"))
    .map(({ at }) => at);
}

describe("Hut beim Server", () => {
  it("liest den Träger auf der Uhr des Servers und lässt einen fast fertigen Hut los", () => {
    const me = { ...PREVIEW_ME, wizard_hat: { holder_id: 7, holder_name: "Mo", ends_at: 10_000 } };
    expect(serverHat(me, 4000)).toEqual({ mine: false, name: "Mo", remainingMs: 6000 });
    expect(serverHat({ ...me, id: 7 }, 4000)?.mine).toBe(true);
    expect(serverHat(me, 10_000 - TEASE.ending + 1)).toBeNull();
    expect(serverHat(PREVIEW_ME, 0)).toBeNull();
    expect(serverHat(null, 0)).toBeNull();
  });

  it("nennt die Zeit in Worten und auf dem Schild", () => {
    expect(hatTimeWords(500)).toBe("1 Sekunde");
    expect(hatTimeWords(42_000)).toBe("42 Sekunden");
    expect(hatTimeWords(270_000)).toBe("5 Minuten");
    expect(hatTimeWords(2_592_000_000)).toBe("720 Stunden");
    // Länger als die Probe in `wizardLines.test.ts` wird die Zeit nie.
    for (const ms of [1000, 59_000, 119 * 60_000, 2_592_000_000]) {
      expect(hatTimeWords(ms).length).toBeLessThanOrEqual("59 Sekunden".length);
    }
    expect(hatClock(272_000)).toBe("4:32");
    expect(hatClock(3_725_000)).toBe("1:02:05");
    expect(hatSignText(MO)).toBe("bei Mo · 5:00");
    expect(hatSignText(MINE)).toBe("bei dir · 5:00");
  });
});

describe("Diebstahl", () => {
  it("fragt den Server genau beim vierten Griff", () => {
    const play = snatched();
    expect(play.snatch.steal).toBe(true);
    expect(play.steps.filter(({ step }) => step.steal)).toHaveLength(1);
  });

  it("gibt den Hut erst zurück, wenn der Server es sagt, auch nach dem Kränken", () => {
    const play = snatched();
    const from = play.snatchAt + 500;
    play.at(from, { kind: "hatServer", hat: MINE });
    expect(play.mind().tease).toMatchObject({ hatOff: true, backAt: from + HELD_MS });
    for (let pull = 1; pull <= TEASE_RULES.pulls; pull += 1) play.at(from + pull * 3000, BEARD);
    expect(play.mind().tease).toMatchObject({ fedUp: true, backAt: from + HELD_MS });
    // Ein Stand ohne Änderung rückt nur die Zeit zurecht.
    const later = { ...MINE, remainingMs: HELD_MS - 20_000 };
    expect(play.at(from + 20_000, { kind: "hatServer", hat: later })?.script).toBeUndefined();
    play.at(from + HELD_MS + 1000);
    expect(rehatAt(play.steps)).toEqual([from + HELD_MS]);
  });

  it("schweigt zu den Ereignissen des Diebstahls und lässt sein „Mein Hut!“ ausreden", () => {
    const play = snatched();
    const said = play.snatch.script!;
    const server = (type: string, payload: Record<string, unknown>): WizardEvent => ({
      kind: "server",
      event: { id: 1, type, player_id: 0, payload, created_at: 0 },
    });
    const earned = play.at(play.snatchAt + 300, server("achievement.earned", { key: "hat-thief" }));
    const changed = play.at(
      play.snatchAt + 320,
      server("wizard_hat.changed", { holder_id: 0, ends_at: 1, worn: true }),
    );
    expect([earned?.script, changed?.script]).toEqual([undefined, undefined]);
    expect(play.mind().running?.id).toBe(said.id);
    expect(play.mind().tease.hatOff).toBe(true);
  });

  it("lässt den Hut während der Frage beim Server und ohne Server fort", () => {
    const play = snatched();
    play.at(play.snatchAt + 300, { kind: "hatServer", hat: null });
    expect(play.mind().tease).toMatchObject({
      hatOff: true,
      backAt: play.snatchAt + TEASE.hatBack,
    });
    play.at(play.snatchAt + TEASE.hatBack + 1000);
    expect(rehatAt(play.steps)).toEqual([play.snatchAt + TEASE.hatBack]);
  });

  it("zaubert ihn nur einmal zurück, egal ob zuerst die Zeit oder der Server endet", () => {
    for (const lag of [-200, 0, 200]) {
      const play = snatched();
      const from = play.snatchAt + 500;
      play.at(from, { kind: "hatServer", hat: MINE });
      play.at(from + HELD_MS + lag, { kind: "hatServer", hat: null });
      play.at(from + HELD_MS + 5000);
      expect(rehatAt(play.steps), String(lag)).toHaveLength(1);
      expect(play.mind().tease.holder).toBeNull();
    }
  });
});

describe("ein anderes Jelly war schneller", () => {
  it("holt sich den Hut bald zurück, wenn der Stand keinen Träger nennt", () => {
    const play = snatched();
    const refusedAt = play.snatchAt + 400;
    play.at(refusedAt, { kind: "hatTaken" });
    play.at(refusedAt + 100, { kind: "hatServer", hat: null });
    play.at(refusedAt + 10_000);
    // Erst spricht er zu Ende, dann zaubert er: lange vor den 25 s ohne Server.
    const [back] = rehatAt(play.steps);
    expect(back).toBeGreaterThanOrEqual(refusedAt + TEASE.taken);
    expect(back).toBeLessThan(refusedAt + TEASE.taken + 3 * TEASE.retry);
  });

  it("bleibt ohne Hut bis zum Ende des Trägers, in beiden Reihenfolgen", () => {
    for (const order of [
      ["hatTaken", "hatServer"],
      ["hatServer", "hatTaken"],
    ] as const) {
      const play = snatched();
      const from = play.snatchAt + 400;
      const told: WizardStep[] = order.map((kind, index) => {
        const event: WizardEvent = kind === "hatTaken" ? { kind } : { kind: "hatServer", hat: MO };
        return play.at(from + index * 50, event)!;
      });
      const taken = told.flatMap(({ script }) => (script ? lines(script) : []));
      expect(taken, order.join()).toHaveLength(1);
      expect(takenLines("5 Minuten")).toContain(taken[0]);
      expect(play.mind().tease.holder).toEqual({ mine: false, name: "Mo" });
      play.at(from + HELD_MS - 1000);
      expect(rehatAt(play.steps), order.join()).toEqual([]);
    }
  });
});

describe("Hut bei einem anderen Jelly", () => {
  it("steht beim Öffnen ohne Hut da, ohne Flug und ohne Wort", () => {
    const play = brain();
    const opened = play.at(100, { kind: "hatServer", hat: MO })!;
    expect(opened.look).toEqual({ hatOff: true, hatInstant: true });
    expect(opened.script).toBeUndefined();
    expect(play.mind().tease).toMatchObject({ hatOff: true, backAt: 100 + HELD_MS });
  });

  it("sagt beim Griff nach dem Hut, wer ihn hat und wie lange noch, und klaut nichts", () => {
    const play = brain();
    play.at(0, { kind: "hatServer", hat: MO });
    play.at(500, { kind: "ready" });
    const grab = play.at(10_000, HAT)!;
    expect(takenLines("5 Minuten")).toContain(lines(grab.script!)[0]);
    expect(grab.steal).toBe(false);
  });

  it("verliert den Hut mit einem Puff, wenn ihn jemand nimmt, während er ihn trägt", () => {
    const play = brain();
    play.at(0, { kind: "ready" });
    const gone = play.at(8000, { kind: "hatServer", hat: MO })!;
    expect(gone.look).toEqual({ hatOff: true });
    expect(gone.script!.cues).toContainEqual({ at: 0, kind: "effect", effect: "hatPuff" });
    expect(takenLines("5 Minuten")).toContain(lines(gone.script!)[0]);
  });

  it("zaubert ihn zurück, sobald der Server ihn freigibt", () => {
    const play = brain();
    play.at(0, { kind: "hatServer", hat: MO });
    play.at(500, { kind: "ready" });
    play.at(60_000, { kind: "hatServer", hat: null });
    play.at(70_000);
    expect(rehatAt(play.steps)).toEqual([60_000]);
    expect(play.mind().tease).toMatchObject({ hatOff: false, holder: null, grabs: 0 });
  });
});
