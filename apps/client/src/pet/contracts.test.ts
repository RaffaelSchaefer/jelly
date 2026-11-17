/**
 * Hält die Verträge zwischen den Teilen des Zauberladens fest, die an verschiedenen Orten stehen:
 * Gesten und Schnarchen im Paket und im Verstand, die Kugel auf der Bühne und in den Händen des
 * Zauberers, Stimme und Sprechtempo, das Stereobild und die Kamera, die Sätze zu jedem Anlass und
 * der Takt des Kaufs aus Spec §11.
 *
 * @module
 */

import { ORB_REST } from "@jelly/scene/wizard";
import {
  countTapTimes,
  SNORE_PERIOD_SECONDS,
  WIZARD_GESTURE_KEYS,
  WIZARD_GESTURE_SECONDS,
} from "@jelly/scene/wizard-timing";
import { describe, expect, it } from "vitest";

import { SEAL_TIMING } from "./sealCeremony";
import { SOUND_PANS } from "./shopMix";
import { CANDLE, ORB, OWN_AT, TRAY, WIZARD_AT, toWizardLocal, type Vec3 } from "./shopStage";
import { CHARGE, purchaseTimeline } from "./shopTimeline";
import { COUNT_TAP } from "./wizard";
import { WIZARD_CLIP_NOTES } from "./wizardClips";
import { DOZE } from "./wizardIdle";
import {
  fallbackLine,
  lineVariants,
  MAX_LINE_CHARS,
  WIZARD_LINES,
  type LineTopic,
} from "./wizardLines";
import { CLIP_MS, GESTURE_SECONDS, WIZARD_GESTURES, WIZARD_TEMPO } from "./wizardScripts";
import { wizardTempo } from "./wizardVoice";

describe("gestures", () => {
  it("knows exactly the package's wizard gestures, with the same lengths, plus the shared point", () => {
    expect([...WIZARD_GESTURES].sort()).toEqual([...WIZARD_GESTURE_KEYS, "point"].sort());
    for (const key of WIZARD_GESTURE_KEYS) {
      expect(GESTURE_SECONDS[key], key).toBe(WIZARD_GESTURE_SECONDS[key]);
    }
  });

  it("counts coins with the same taps as the package's count gesture", () => {
    const taps = Array.from(
      { length: COUNT_TAP.most },
      (_, index) => (COUNT_TAP.firstMs + index * COUNT_TAP.stepMs) / 1000,
    );
    expect(countTapTimes(GESTURE_SECONDS.count)).toEqual(taps.map((tap) => expect.closeTo(tap, 9)));
  });
});

describe("snoring", () => {
  it("breathes once per snore period, in the gesture, the clip, the brain and the scripts", () => {
    const period = SNORE_PERIOD_SECONDS * 1000;
    expect(GESTURE_SECONDS.snore).toBe(SNORE_PERIOD_SECONDS);
    expect(CLIP_MS.snore).toBe(period);
    expect(DOZE.snoreMs).toBe(period);
    const end = Math.max(...WIZARD_CLIP_NOTES.snore.map((note) => note.at + note.duration));
    expect(end * 1000).toBeLessThanOrEqual(period);
  });
});

describe("stage", () => {
  it("puts the orb where the wizard's stand holds it", () => {
    const local = toWizardLocal(ORB.at);
    ORB_REST.forEach((value, axis) => expect(local[axis]).toBeCloseTo(value, 9));
  });

  it("pans every sound in the order its source stands on the stage", () => {
    const places: [keyof typeof SOUND_PANS, Vec3][] = [
      ["wizard", WIZARD_AT],
      ["tray", TRAY.at],
      ["orb", ORB.at],
      ["candle", CANDLE.at],
      ["customer", OWN_AT],
    ];
    const byX = [...places].sort((a, b) => a[1][0] - b[1][0]).map(([place]) => place);
    const byPan = [...places]
      .sort((a, b) => SOUND_PANS[a[0]] - SOUND_PANS[b[0]])
      .map(([place]) => place);
    expect(byPan).toEqual(byX);
    for (const [place, at] of places) expect(Math.sign(SOUND_PANS[place])).toBe(Math.sign(at[0]));
  });
});

describe("voice and lines", () => {
  it("speaks at the tempo the scripts plan with", () => {
    expect(wizardTempo("speech")).toBe(WIZARD_TEMPO);
  });

  it("has a line for every topic the brain can raise, and one that needs no slot", () => {
    for (const topic of Object.keys(WIZARD_LINES) as LineTopic[]) {
      expect(lineVariants(topic).length, topic).toBeGreaterThan(0);
      const plain = fallbackLine(topic);
      expect(plain, topic).not.toBe("…");
      expect(plain.length, topic).toBeLessThanOrEqual(MAX_LINE_CHARS);
    }
  });
});

describe("purchase timing", () => {
  it("runs the purchase ritual on the numbers of spec §11", () => {
    const plan = purchaseTimeline(3);
    expect(plan.coins.map((coin) => coin.land)).toEqual([480, 550, 620]);
    expect([plan.till, plan.burst, plan.impact, plan.congrats, plan.settled]).toEqual([
      740, 840, 1440, 1640, 3140,
    ]);
    expect(purchaseTimeline(1).coins).toHaveLength(1);
    expect(purchaseTimeline(40).coins).toHaveLength(6);
  });

  it("charges the spell while the seal is held and confirms no earlier than the stamp's end", () => {
    expect(CHARGE.lateHold).toBe(SEAL_TIMING.lateHoldMs);
    expect(SEAL_TIMING.lateHoldMs).toBeLessThan(SEAL_TIMING.holdMs);
    expect(SEAL_TIMING.impactMs).toBe(160);
    expect(SEAL_TIMING.stampMs).toBe(420);
  });
});
