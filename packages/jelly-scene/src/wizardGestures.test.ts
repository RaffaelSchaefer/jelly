/**
 * Die Gesten des Zauberers bleiben zeitlich begrenzt, sammeln nichts an, stehen bei reduzierter
 * Bewegung still und zeigen seine Hände nur dort, wo kein Sticker sie verdeckt. Dazu seine
 * Stimmungen, sein Schlaf und die Zahlen ohne Three.js.
 *
 * @module
 */

import { MeshBasicMaterial } from "three";
import { describe, expect, it, test, vi } from "vitest";

import { animateJelly, createJelly, createMotion, JELLY_COLORS, type Jelly } from "./index.ts";
import { animateWizard, type WizardFrame, type WizardGestureFrame } from "./wizardGestures.ts";
import {
  CAST_TIMING,
  countTapTimes,
  isWizardGestureKey,
  SNORE_PERIOD_SECONDS,
  TEASE_TIMING,
  WIZARD_GESTURE_KEYS,
  WIZARD_GESTURE_SECONDS,
  type WizardGestureKey,
} from "./wizardTiming.ts";

/** Die Grundanimation, still zur Zeit 1 ohne Blinzeln. */
const BASE = { time: 1, rawDelta: 0.016, pulse: 0, holding: false, reducedMotion: false };

/** Wach, ohne Geste und ohne Worte. */
const AWAKE: WizardFrame = { time: 1, mood: "neutral", speaking: false };

/** Wann eine Geste sicher läuft: bei 0,9 s, kurze Gesten in ihrer Mitte. */
function shownAt(key: WizardGestureKey) {
  return Math.min(0.9, WIZARD_GESTURE_SECONDS[key] / 2);
}

/** Die Geste `key` nach `elapsed` Sekunden in ihrer üblichen Dauer. */
function gesture(key: WizardGestureKey, elapsed: number, extra: Partial<WizardGestureFrame> = {}) {
  return { key, elapsed, seconds: WIZARD_GESTURE_SECONDS[key], ...extra };
}

/** Alles, was Geste und Stimmung verändern, samt der Zahlen für Hut und Kugel. */
function pose(jelly: Jelly, extras: object) {
  const { eyes, brows, mouth, cheeks } = jelly.face;
  const parts = [jelly.root, jelly.head, ...jelly.hands, ...eyes, ...brows, mouth];
  return {
    extras,
    shapes: [...eyes, mouth].map((part) => part.geometry.uuid),
    parts: parts.map((part) => [
      part.visible,
      ...part.position,
      ...part.scale,
      ...part.rotation.toArray(),
    ]),
    curls: jelly.curls.map((curl) => curl.toArray()),
    cheeks: cheeks.map((cheek) => [cheek.visible, (cheek.material as MeshBasicMaterial).opacity]),
  };
}

/** Ein Zauberer, der Bild für Bild bewegt wird. */
function wizard(reducedMotion = false) {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  return (frame: Partial<WizardFrame> = {}) => {
    animateJelly(jelly, motion, { ...BASE, reducedMotion });
    const extras = animateWizard(jelly, { ...AWAKE, ...frame }, reducedMotion);
    return { jelly, extras, pose: pose(jelly, extras) };
  };
}

/** Die Ruhepose ohne Geste. */
function resting(reducedMotion = false) {
  return wizard(reducedMotion)().pose;
}

/**
 * Wo eine Hand zu sehen ist: seitlich neben Robe und Bart oder knapp daneben in Brusthöhe. Alles
 * andere verdecken Sticker oder die Theke.
 */
function visibleZone(x: number, y: number) {
  const side = Math.abs(x);
  const outside = side >= 1.05 && y >= -0.2 && y <= 1.3;
  const chest = side >= 0.72 && side <= 1.05 && y >= 0.25 && y <= 0.72;
  return outside || chest;
}

/** Die Hände, die man sieht: halb oder ganz ausgefahren. */
function shownHands(jelly: Jelly) {
  return jelly.hands.filter((hand) => hand.visible && hand.scale.x >= 0.5);
}

describe("jede Geste", () => {
  test.each(WIZARD_GESTURE_KEYS)("%s ist erkennbar, beginnt weich und endet in der Ruhe", (key) => {
    const step = wizard();
    const rest = resting();
    expect(step({ gesture: gesture(key, 0) }).pose).toEqual(rest);
    expect(step({ gesture: gesture(key, shownAt(key)) }).pose).not.toEqual(rest);
    expect(step({ gesture: gesture(key, WIZARD_GESTURE_SECONDS[key]) }).pose).toEqual(rest);
  });

  test.each(WIZARD_GESTURE_KEYS)("%s sammelt nichts an und lässt sich erneut spielen", (key) => {
    const step = wizard();
    const frame = { gesture: gesture(key, shownAt(key)) };
    const first = step(frame).pose;
    for (let index = 0; index < 10; index++) step(frame);
    expect(step(frame).pose).toEqual(first);
    step();
    expect(step(frame).pose).toEqual(first);
  });

  test.each(WIZARD_GESTURE_KEYS)("%s steht bei reduzierter Bewegung still", (key) => {
    const step = wizard(true);
    const rest = resting(true);
    const seconds = WIZARD_GESTURE_SECONDS[key];
    const first = step({ gesture: gesture(key, 0) }).pose;
    expect(first).not.toEqual(rest);
    expect(step({ gesture: gesture(key, seconds * 0.9) }).pose).toEqual(first);
    expect(step({ gesture: gesture(key, seconds) }).pose).toEqual(rest);
  });
});

describe("seine Hände", () => {
  test.each(WIZARD_GESTURE_KEYS.filter((key) => key !== "stroke"))(
    "%s zeigt die Hände nur, wo kein Sticker liegt",
    (key) => {
      for (const reducedMotion of [false, true]) {
        const { jelly } = wizard(reducedMotion)({ gesture: gesture(key, shownAt(key)) });
        for (const hand of shownHands(jelly)) {
          expect(visibleZone(hand.position.x, hand.position.y), `${key}`).toBe(true);
        }
      }
    },
  );

  it("streicht den Bart am Rand, mit den Fingern im Bart", () => {
    const step = wizard();
    const heights = [0.3, 0.9, 1.65].map((elapsed) => {
      const [hand] = shownHands(step({ gesture: gesture("stroke", elapsed) }).jelly);
      expect(hand!.position.x).toBeCloseTo(0.76);
      return hand!.position.y;
    });
    expect(heights[1]).toBeLessThan(heights[0]!);
    expect(heights[2]).toBeGreaterThan(heights[1]!);
  });

  test.each(WIZARD_GESTURE_KEYS)(
    "%s bleibt im Kasten, in dem der Körper gezeichnet wird",
    (key) => {
      for (const elapsed of [shownAt(key), WIZARD_GESTURE_SECONDS[key] * 0.75]) {
        const frame = {
          gesture: gesture(key, elapsed, { releaseAt: key === "cast" ? 1 : undefined }),
        };
        for (const hand of shownHands(wizard()(frame).jelly)) {
          expect(Math.abs(hand.position.x) + 0.2).toBeLessThanOrEqual(1.65);
          expect(hand.position.y + 0.3).toBeLessThanOrEqual(1.51);
          expect(hand.position.z + 0.2).toBeLessThanOrEqual(1.08);
        }
      }
    },
  );

  it("überspringt fremde Schlüssel und ungültige Zeiten", () => {
    const rest = resting();
    const step = wizard();
    const unknown = { key: "wave", elapsed: 0.9, seconds: 2 } as unknown as WizardGestureFrame;
    expect(step({ gesture: unknown }).pose).toEqual(rest);
    for (const elapsed of [-1, NaN, Infinity, 5]) {
      expect(step({ gesture: gesture("hail", elapsed) }).pose).toEqual(rest);
    }
  });
});

describe("Hut und Kugel", () => {
  it("lüpft den Hut beim Gruß an der Krempe", () => {
    const { jelly, extras } = wizard()({ gesture: gesture("tip", 0.9) });
    expect(extras.hatLift).toBeCloseTo(0.07);
    expect(extras.hatTilt).toBeCloseTo(-0.12);
    expect(jelly.hands[1]!.position.toArray()).toEqual(
      [1.3, 0.92, 0.55].map((v) => expect.closeTo(v)),
    );
  });

  it("lässt den Hut beim Schreck springen und ihn hochfahren", () => {
    const rest = wizard()();
    const { jelly, extras } = wizard()({ gesture: gesture("startle", 0.35) });
    expect(extras.hatLift).toBeCloseTo(0.09);
    expect(jelly.root.position.y - rest.jelly.root.position.y).toBeCloseTo(0.12);
  });

  it("hebt die Kugel beim Laden, lädt sie auf und stößt nach dem Lösen vor", () => {
    const step = wizard();
    const early = step({ gesture: gesture("cast", 0.05) }).extras;
    expect(early.orbLift).toBeLessThan(0.05);
    const charged = step({ gesture: gesture("cast", CAST_TIMING.windUp + 0.3) });
    expect(charged.extras.orbLift).toBeCloseTo(0.22);
    expect(charged.extras.orbGlow).toBeCloseTo(1);
    expect(charged.jelly.hands[0]!.position.x).toBeCloseTo(-1.15);
    expect(charged.jelly.hands[1]!.position.toArray()).toEqual(
      [1.42, 0.58, 0.78].map((v) => expect.closeTo(v)),
    );
    const pushed = step({ gesture: gesture("cast", 1.8, { releaseAt: 1.2 }) });
    expect(pushed.jelly.hands[1]!.position.toArray()).toEqual(
      [1.45, 0.5, 0.86].map((v) => expect.closeTo(v)),
    );
    expect(pushed.extras.lean).toBeCloseTo(0.05);
  });

  it("zappelt mit den Fingern über der Kugel, bis der Zauber losbricht", () => {
    const step = wizard();
    const curls = [1, 1.04, 1.08].map(
      (elapsed) => step({ gesture: gesture("cast", elapsed) }).jelly.curls[1]!.x,
    );
    expect(new Set(curls).size).toBe(3);
    const released = [1.9, 1.94].map(
      (elapsed) =>
        step({ gesture: gesture("cast", elapsed, { releaseAt: 1.2 }) }).jelly.curls[1]!.x,
    );
    expect(released[0]).toBeCloseTo(released[1]!);
  });

  it("tippt beim Zählen auf den Takt über der Schale", () => {
    const step = wizard();
    const [first] = countTapTimes(WIZARD_GESTURE_SECONDS.count);
    const down = step({ gesture: gesture("count", first! + 0.06) }).jelly.hands[1]!.position.y;
    const up = step({ gesture: gesture("count", first! + 0.2) }).jelly.hands[1]!.position.y;
    expect(down).toBeLessThan(up);
    expect(up).toBeCloseTo(-0.15);
  });
});

/** Höhe und Form des rechten Auges in einer Stimmung. */
function eyeIn(frame: Partial<WizardFrame>) {
  const { jelly } = wizard()(frame);
  const eye = jelly.face.eyes[1]!;
  return { eye, shapes: jelly.face.eyeShapes, jelly };
}

describe("Nerven", () => {
  it("lässt den geklauten Hut davonfliegen und den gezauberten erst nach den Funken landen", () => {
    const step = wizard();
    const { snatch, conjure, land } = TEASE_TIMING;
    expect(step().extras.hatAway).toBe(0);
    expect(step({ hat: { off: true, since: snatch / 2 } }).extras.hatAway).toBeCloseTo(0.5);
    expect(step({ hat: { off: true, since: 60 } }).extras.hatAway).toBe(1);
    expect(step({ hat: { off: false, since: conjure } }).extras.hatAway).toBe(1);
    expect(step({ hat: { off: false, since: conjure + land } }).extras.hatAway).toBe(0);
    // Auch eine Geste setzt ihm den Hut nicht wieder auf, und ruhig fliegt nichts.
    const tipped = step({ hat: { off: true, since: 60 }, gesture: gesture("tip", 0.9) });
    expect(tipped.extras.hatAway).toBe(1);
    expect(wizard(true)({ hat: { off: true, since: 0 } }).extras.hatAway).toBe(1);
  });

  it("dehnt den Bart beim Ziehen und lässt ihn zurückschnalzen und ausfedern", () => {
    const step = wizard();
    const { stretch } = TEASE_TIMING;
    const pull = (elapsed: number) => step({ gesture: gesture("yank", elapsed) }).extras.beardPull;
    expect(pull(stretch)).toBeCloseTo(1, 1);
    expect(pull(stretch + 0.11)).toBeLessThan(0);
    expect(Math.abs(pull(stretch + 0.8))).toBeLessThan(0.02);
    expect(step().extras.beardPull).toBe(0);
  });
});

describe("Stimmung", () => {
  it("trägt schwere Lider, rechts gespiegelt", () => {
    const { jelly } = wizard()();
    const [left, right] = jelly.face.eyes;
    expect(left!.geometry).toBe(jelly.face.eyeShapes.lidded);
    expect(right!.geometry).toBe(jelly.face.eyeShapes.lidded);
    expect(left!.scale.x).toBeGreaterThan(0);
    expect(right!.scale.x).toBeLessThan(0);
  });

  it.each([
    ["neutral", 1],
    ["attentive", 1.15],
    ["focused", 0.85],
    ["sheepish", 0.8],
    ["startled", 1.3],
  ] as const)("öffnet die Lider %s auf %s", (mood, lid) => {
    expect(eyeIn({ mood }).eye.scale.y).toBeCloseTo(lid);
  });

  it("fallen die Lider schläfrig auf 0,6 und alle 3,5 s schwer zu", () => {
    expect(eyeIn({ mood: "drowsy", time: 1 }).eye.scale.y).toBeCloseTo(0.6);
    const blink = eyeIn({ mood: "drowsy", time: 3.5 + 0.225 }).eye.scale.y;
    expect(blink).toBeLessThan(0.1);
  });

  it("strahlt erfreut mit Bogen-Augen und errötet, verlegen errötet er leiser", () => {
    const delighted = eyeIn({ mood: "delighted" });
    expect(delighted.eye.geometry).toBe(delighted.shapes.happy);
    const glow = (frame: Partial<WizardFrame>) =>
      (eyeIn(frame).jelly.face.cheeks[0]!.material as MeshBasicMaterial).opacity;
    expect(glow({ mood: "delighted" })).toBeGreaterThan(glow({ mood: "sheepish" }));
    expect(glow({ mood: "sheepish" })).toBeGreaterThan(0);
  });
});

describe("Schlaf", () => {
  it("schließt im Schlaf die Augen, der Kopf sinkt über 1,2 s und der Hut rutscht", () => {
    const rest = wizard()();
    const asleep = (asleepFor: number) => wizard()({ mood: "asleep", asleepFor });
    const deep = asleep(2);
    const { eyes, eyeShapes } = deep.jelly.face;
    expect(eyes.every((eye) => eye.geometry === eyeShapes.closed)).toBe(true);
    expect(rest.jelly.head.position.y - deep.jelly.head.position.y).toBeCloseTo(0.12);
    expect(deep.extras.hatTilt).toBeCloseTo(0.1);
    expect(asleep(0.3).jelly.head.position.y).toBeGreaterThan(deep.jelly.head.position.y);
  });

  it("atmet beim Schnarchen im Takt seines Atems, endlos", () => {
    const step = wizard();
    const snore = (asleepFor: number) =>
      step({ mood: "asleep", asleepFor, gesture: gesture("snore", 30, { seconds: Infinity }) })
        .jelly.root.scale.y;
    const full = snore(1.9);
    const empty = snore(3.9);
    expect(full).toBeGreaterThan(empty);
    expect(snore(1.9 + SNORE_PERIOD_SECONDS * 3)).toBeCloseTo(full);
  });

  it("öffnet beim Blinzeln im Schlaf nur ein Auge halb", () => {
    const { jelly } = wizard()({ mood: "asleep", asleepFor: 5, gesture: gesture("peek", 0.6) });
    const [left, right] = jelly.face.eyes;
    expect(left!.geometry).toBe(jelly.face.eyeShapes.closed);
    expect(right!.geometry).toBe(jelly.face.eyeShapes.lidded);
    expect(right!.scale.y).toBeCloseTo(0.45);
    expect(jelly.face.brows[1]!.position.y).toBeGreaterThan(jelly.face.brows[0]!.position.y);
  });

  it("lässt beim Sprechen den Mund der Stimme", () => {
    const quiet = wizard()({ mood: "startled" }).jelly;
    expect(quiet.face.mouth.geometry).toBe(quiet.face.mouthShapes.o);
    const talking = wizard()({ mood: "startled", speaking: true }).jelly;
    expect(talking.face.mouth.geometry).toBe(talking.face.smile);
  });

  it("hebt die Brauen beim Schulterzucken", () => {
    const { jelly } = wizard()({ gesture: gesture("shrug", 0.9) });
    const [, right] = jelly.face.brows;
    expect(right!.visible).toBe(true);
    expect(right!.position.y).toBeGreaterThan(0.02);
  });
});

describe("Zahlen ohne Three.js", () => {
  it("kennt jede Geste mit Dauer und nur diese", () => {
    expect(Object.keys(WIZARD_GESTURE_SECONDS)).toEqual([...WIZARD_GESTURE_KEYS]);
    for (const key of WIZARD_GESTURE_KEYS) expect(isWizardGestureKey(key)).toBe(true);
    for (const key of ["wave", "point", "constructor", "__proto__"]) {
      expect(isWizardGestureKey(key)).toBe(false);
    }
    expect(WIZARD_GESTURE_SECONDS.snore).toBe(SNORE_PERIOD_SECONDS);
  });

  it("tippt bei 0,3 s und dann alle 0,285 s, solange die Geste läuft", () => {
    expect(countTapTimes(2.8)).toEqual(
      [0.3, 0.585, 0.87, 1.155, 1.44].map((at) => expect.closeTo(at, 9)),
    );
    expect(countTapTimes(1.2)).toEqual([0.3, 0.585, 0.87].map((at) => expect.closeTo(at, 9)));
    expect(countTapTimes(0.5)).toEqual([]);
  });

  it("lädt ohne Three.js", async () => {
    vi.resetModules();
    vi.doMock("three", () => {
      throw new Error("wizard-timing darf Three.js nicht laden");
    });
    try {
      const timing = await import("./wizardTiming.ts");
      expect(timing.CAST_TIMING).toEqual({ windUp: 0.6, push: 0.45 });
    } finally {
      vi.doUnmock("three");
    }
  });
});
